import { ObjectId } from 'mongodb'
import { ErrorWithStatus } from '~/models/Errors'
import {
  KitchenAssignmentReqBody,
  KitchenStatusReqBody,
  ShipperAssignmentReqBody
} from '~/models/requests/CartOrder.request'
import { AccountStatus, UserRole } from '~/models/schemas/User.schema'
import { toLocalDate } from '~/models/schemas/common'
import { aggregateOrderStatus } from '~/utils/order-status'
import database from './database.services'

type Operation =
  | { kind: 'kitchen'; payload: KitchenAssignmentReqBody }
  | { kind: 'shipper'; payload: ShipperAssignmentReqBody }
  | { kind: 'status'; payload: KitchenStatusReqBody }

function fail(status: number, message: string): never {
  throw new ErrorWithStatus({ status, message })
}

class OrderOperationsService {
  assignKitchen(actorId: string, orderId: string, deliveryId: string, payload: KitchenAssignmentReqBody) {
    return this.perform(actorId, orderId, deliveryId, { kind: 'kitchen', payload })
  }

  assignShipper(actorId: string, orderId: string, deliveryId: string, payload: ShipperAssignmentReqBody) {
    return this.perform(actorId, orderId, deliveryId, { kind: 'shipper', payload })
  }

  kitchenStatus(actorId: string, orderId: string, deliveryId: string, payload: KitchenStatusReqBody) {
    return this.perform(actorId, orderId, deliveryId, { kind: 'status', payload })
  }

  private async perform(actorId: string, orderId: string, deliveryId: string, operation: Operation) {
    const { payload, kind } = operation
    if (
      ![actorId, orderId, deliveryId].every((id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) ||
      !Number.isSafeInteger(payload.version) ||
      payload.version < 0
    )
      fail(400, 'ID hoặc version không hợp lệ')
    const reason =
      kind === 'status'
        ? `Bếp chuyển sang ${operation.payload.status}`
        : typeof operation.payload.reason === 'string'
          ? operation.payload.reason.trim()
          : ''
    if (!reason || reason.length > 500) fail(400, 'Cần lý do phân công từ 1 đến 500 ký tự')
    const ids =
      kind === 'kitchen'
        ? operation.payload.kitchenStaffIds
        : kind === 'shipper'
          ? [operation.payload.assignedShipperId]
          : []
    if (
      kind !== 'status' &&
      (!Array.isArray(ids) ||
        !ids.length ||
        ids.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) ||
        new Set(ids.map((id) => id.toLowerCase())).size !== ids.length)
    )
      fail(400, 'Danh sách nhân viên không hợp lệ hoặc trùng lặp')
    if (kind === 'status' && !['Cooking', 'Ready'].includes(operation.payload.status))
      fail(400, 'Trạng thái bếp không hợp lệ')

    return database.withTransaction(async (session) => {
      const actorRole = kind === 'status' ? UserRole.KITCHEN : UserRole.MANAGER
      const actor = await database.users.findOne(
        { _id: new ObjectId(actorId), role: actorRole, account_status: AccountStatus.ACTIVE },
        { session }
      )
      if (!actor) fail(403, 'Tài khoản không có quyền thực hiện thao tác này')
      const order = await database.orders.findOne({ _id: new ObjectId(orderId) }, { session })
      if (!order) fail(404, 'Không tìm thấy đơn hàng')
      const day = order.deliveries.find((delivery) => delivery._id.equals(deliveryId))
      if (!day) fail(404, 'Không tìm thấy ngày giao')
      if (kind === 'status' && !day.kitchenStaffIds?.some((id) => id.equals(actorId)))
        fail(403, 'Bạn không được phân công ngày giao này')
      if (order.version !== payload.version) fail(409, 'Đơn đã thay đổi, vui lòng tải lại')
      if (['Completed', 'Cancelled', 'Rejected'].includes(order.status)) fail(409, 'Đơn đã kết thúc')

      const before = {
        deliveryId: day._id,
        status: day.status,
        kitchenStaffIds: day.kitchenStaffIds || [],
        assignedShipperId: day.assignedShipperId,
        version: order.version
      }
      let changed: boolean
      if (kind === 'status') {
        const status = operation.payload.status
        if (
          day.status !== status &&
          !((day.status === 'Confirmed' && status === 'Cooking') || (day.status === 'Cooking' && status === 'Ready'))
        ) {
          fail(409, 'Bếp chỉ được chuyển Confirmed → Cooking → Ready')
        }
        if (day.date > toLocalDate(new Date())) fail(409, 'Chưa tới ngày giao')
        if (order.inventoryHold.status !== 'Committed') fail(409, 'Đơn chưa chốt kho')
        if (order.payment.method !== 'COD') {
          const payment = await database.transactions.findOne(
            {
              orderId: order._id,
              kind: 'Payment',
              status: 'Succeeded',
              source: 'VerifiedIPN',
              method: order.payment.method
            },
            { session }
          )
          if (!payment || !['Paid', 'PartiallyRefunded'].includes(order.payment.status))
            fail(409, 'Đơn online chưa có thanh toán được xác thực')
        }
        changed = day.status !== status
        day.status = status
      } else {
        const expectedStatus = kind === 'kitchen' ? 'Confirmed' : 'Ready'
        if (day.status !== expectedStatus) fail(409, `Chỉ được phân công khi ngày giao ở trạng thái ${expectedStatus}`)
        const role = kind === 'kitchen' ? UserRole.KITCHEN : UserRole.DELIVERY
        const staffIds = ids
          .map((id) => new ObjectId(id))
          .sort((a, b) => a.toHexString().localeCompare(b.toHexString()))
        const staff = await database.users
          .find({ _id: { $in: staffIds }, role, account_status: AccountStatus.ACTIVE }, { session })
          .toArray()
        if (staff.length !== staffIds.length) fail(409, 'Nhân viên phải đang Active và đúng vai trò')
        changed =
          kind === 'kitchen'
            ? staffIds.map(String).join(',') !== (day.kitchenStaffIds || []).map(String).sort().join(',')
            : !day.assignedShipperId?.equals(staffIds[0])
        if (changed) {
          // Shared writes serialize assignment with account locking/role changes.
          for (const id of staffIds) {
            const guard = await database.users.updateOne(
              { _id: id, role, account_status: AccountStatus.ACTIVE },
              { $inc: { assignmentVersion: 1 } },
              { session }
            )
            if (!guard.matchedCount) fail(409, 'Tài khoản nhân viên đã thay đổi')
          }
        }
        if (kind === 'kitchen') day.kitchenStaffIds = staffIds
        else day.assignedShipperId = staffIds[0]
      }
      // Never return a full order (including financials) to kitchen staff.
      const result = () => ({
        orderId: order._id,
        deliveryId: day._id,
        status: day.status,
        version: order.version,
        changed,
        ...(kind !== 'status'
          ? { kitchenStaffIds: day.kitchenStaffIds || [], assignedShipperId: day.assignedShipperId }
          : {})
      })
      if (!changed) return result()
      const actorGuard = await database.users.updateOne(
        { _id: actor._id, role: actorRole, account_status: AccountStatus.ACTIVE },
        { $inc: { assignmentVersion: 1 } },
        { session }
      )
      if (!actorGuard.matchedCount) fail(403, 'Tài khoản người thực hiện đã thay đổi')
      const now = new Date()
      if (kind === 'status') {
        const event = { status: day.status, actorId: actor._id, changedAt: now, reason }
        day.statusHistory.push(event)
        const status = aggregateOrderStatus(order.deliveries)
        if (status !== order.status) order.statusHistory.push({ ...event, status })
        order.status = status
      }
      const saved = await database.orders.updateOne(
        { _id: order._id, version: payload.version },
        {
          $set: {
            deliveries: order.deliveries,
            status: order.status,
            statusHistory: order.statusHistory,
            updatedAt: now
          },
          $inc: { version: 1 }
        },
        { session }
      )
      if (!saved.matchedCount) fail(409, 'Đơn đã thay đổi, vui lòng tải lại')
      order.version++
      await database.auditLogs.insertOne(
        {
          actorId: actor._id,
          actorRole,
          action: kind === 'status' ? 'OrderStatusChanged' : kind === 'kitchen' ? 'KitchenAssigned' : 'ShipperAssigned',
          entityType: 'Order',
          entityId: order._id!,
          before,
          after: {
            deliveryId: day._id,
            status: day.status,
            kitchenStaffIds: day.kitchenStaffIds || [],
            assignedShipperId: day.assignedShipperId,
            version: order.version
          },
          reason,
          createdAt: now
        },
        { session }
      )
      const recipients =
        kind === 'status'
          ? [order.userId]
          : kind === 'shipper'
            ? [order.userId, day.assignedShipperId!]
            : day.kitchenStaffIds!
      for (const userId of recipients) {
        await database.notifications.insertOne(
          {
            userId,
            type: 'Order',
            priority: 'Normal',
            entityType: 'Order',
            entityId: order._id,
            eventKey: `operation:${order._id}:${order.version}`,
            title: kind === 'status' ? 'Cập nhật chế biến' : 'Cập nhật phân công',
            message: `Đơn ${order.orderCode}, ngày ${day.date}: ${reason}`,
            createdAt: now
          },
          { session }
        )
      }
      return result()
    })
  }
}

export default new OrderOperationsService()
