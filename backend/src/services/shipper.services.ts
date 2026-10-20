import { ObjectId } from 'mongodb'
import { ErrorWithStatus } from '~/models/Errors'
import { ShipperStatusReqBody } from '~/models/requests/CartOrder.request'
import { AccountStatus, UserRole } from '~/models/schemas/User.schema'
import { toLocalDate } from '~/models/schemas/common'
import { aggregateOrderStatus } from '~/utils/order-status'
import { deliveryCodExpected, validEvidenceUrls } from '~/utils/delivery'
import database from './database.services'
import tracking from './tracking.services'
import { readCODLedger, refreshCODSummary } from './cod-ledger.services'

function fail(status: number, message: string): never {
  throw new ErrorWithStatus({ status, message })
}

class ShipperService {
  async updateStatus(actorId: string, orderId: string, deliveryId: string, payload: ShipperStatusReqBody) {
    if (
      ![actorId, orderId, deliveryId].every((id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) ||
      !Number.isSafeInteger(payload.version) ||
      payload.version < 0 ||
      !['Delivering', 'Completed', 'Failed'].includes(payload.status)
    ) {
      fail(400, 'ID, version hoặc trạng thái không hợp lệ')
    }
    if (
      payload.codCollectedAmount !== undefined &&
      (!Number.isSafeInteger(payload.codCollectedAmount) || payload.codCollectedAmount < 0)
    )
      fail(400, 'COD thực thu phải là số nguyên VND không âm')
    if (
      payload.status === 'Failed' &&
      (typeof payload.reason !== 'string' ||
        !payload.reason.trim() ||
        payload.reason.trim().length > 500 ||
        (payload.evidenceUrls !== undefined && !validEvidenceUrls(payload.evidenceUrls)))
    ) {
      fail(400, 'Giao thất bại cần lý do 1–500 ký tự; ảnh tùy chọn, tối đa 10 URL HTTPS hợp lệ')
    }
    return database.withTransaction(async (session) => {
      const actor = await database.users.findOne(
        { _id: new ObjectId(actorId), role: UserRole.DELIVERY, account_status: AccountStatus.ACTIVE },
        { session }
      )
      if (!actor) fail(403, 'Chỉ shipper đang hoạt động được thực hiện')
      const order = await database.orders.findOne({ _id: new ObjectId(orderId) }, { session })
      if (!order) fail(404, 'Không tìm thấy đơn')
      const day = order.deliveries.find((day) => day._id.equals(deliveryId))
      if (!day) fail(404, 'Không tìm thấy ngày giao')
      if (!day.assignedShipperId?.equals(actorId)) fail(403, 'Ngày giao này không được gán cho bạn')
      const previousResult = day.deliveryResult
      const replayDispatch =
        payload.status === 'Delivering' &&
        day.dispatch?.actorId.equals(actorId) &&
        day.dispatch.requestVersion === payload.version &&
        payload.codCollectedAmount === undefined &&
        payload.reason === undefined &&
        payload.evidenceUrls === undefined
      const replayResult =
        previousResult?.actorId.equals(actorId) &&
        previousResult.requestVersion === payload.version &&
        previousResult.status === payload.status &&
        previousResult.codCollectedAmount === payload.codCollectedAmount &&
        previousResult.reason === payload.reason?.trim() &&
        JSON.stringify(previousResult.evidenceUrls || []) === JSON.stringify(payload.evidenceUrls || [])
      if (replayDispatch || replayResult)
        return {
          orderId: order._id,
          deliveryId: day._id,
          status: day.status,
          version: order.version,
          changed: false,
          replayed: true
        }
      if (order.version !== payload.version) fail(409, 'Đơn đã thay đổi, vui lòng tải lại')
      if (['Completed', 'Cancelled', 'Rejected'].includes(order.status)) fail(409, 'Đơn đã kết thúc')
      if (
        !(
          (day.status === 'Ready' && payload.status === 'Delivering') ||
          (day.status === 'Delivering' && ['Completed', 'Failed'].includes(payload.status))
        )
      ) {
        fail(409, 'Chỉ được nhận hàng/xuất phát từ Ready và ghi kết quả từ Delivering')
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
          fail(409, 'Thanh toán online chưa được xác thực')
      }
      if (
        payload.codCollectedAmount !== undefined &&
        (payload.status !== 'Completed' || order.payment.method !== 'COD')
      ) {
        fail(400, 'Chỉ nhập COD thực thu khi hoàn thành giao đơn COD')
      }
      if (payload.status !== 'Failed' && (payload.reason !== undefined || payload.evidenceUrls !== undefined)) {
        fail(400, 'Lý do và ảnh minh chứng chỉ dành cho kết quả Failed')
      }
      const guard = await database.users.updateOne(
        { _id: actor._id, role: UserRole.DELIVERY, account_status: AccountStatus.ACTIVE },
        { $inc: { assignmentVersion: 1 } },
        { session }
      )
      if (!guard.matchedCount) fail(403, 'Tài khoản shipper đã thay đổi')
      const now = new Date()
      const previousStatus = day.status
      const reason =
        payload.status === 'Delivering'
          ? 'Shipper nhận hàng và xuất phát'
          : payload.status === 'Failed'
            ? payload.reason!.trim()
            : 'Shipper giao thành công'
      day.status = payload.status
      const event = { status: payload.status, changedAt: now, actorId: actor._id, reason }
      day.statusHistory.push(event)
      if (payload.status === 'Delivering')
        day.dispatch = { actorId: actor._id!, requestVersion: payload.version, dispatchedAt: now }
      if (payload.status === 'Completed')
        day.deliveryResult = {
          status: payload.status,
          actorId: actor._id!,
          recordedAt: now,
          requestVersion: payload.version
        }
      if (payload.status === 'Failed') {
        day.failedAt = now
        day.deliveryResult = {
          status: 'Failed',
          actorId: actor._id!,
          recordedAt: now,
          requestVersion: payload.version,
          reason,
          evidenceUrls: payload.evidenceUrls ?? []
        }
      }
      if (payload.status === 'Completed' && order.payment.method === 'COD') {
        if (payload.codCollectedAmount === undefined) fail(400, 'Phải nhập số tiền COD thực thu, kể cả khi bằng 0')
        const actual = payload.codCollectedAmount
        const expected = deliveryCodExpected(order, day)
        if (!Number.isSafeInteger(expected) || expected < 0) fail(409, 'Số tiền phải thu của ngày giao không hợp lệ')
        const payments = await database.transactions
          .find({ orderId: order._id, kind: 'Payment', status: 'Succeeded' }, { session })
          .toArray()
        const paid = payments.reduce((sum, payment) => sum + payment.amount, 0)
        if (payments.some((payment) => payment.deliveryId?.equals(day._id)))
          fail(409, 'Ngày giao đã có khoản COD thực thu, cần Manager đối soát')
        if (
          payments.some(
            (payment) =>
              !['CODCollection', 'Reconciliation'].includes(payment.source) ||
              payment.method !== 'COD' ||
              !Number.isSafeInteger(payment.amount) ||
              payment.amount <= 0
          ) ||
          !Number.isSafeInteger(paid + actual) ||
          paid !== (order.payment.paidAmount || 0)
        )
          fail(409, 'Sổ tiền COD chưa khớp, cần Manager đối soát')
        const refunds = await database.transactions.find({ orderId: order._id, kind: 'Refund' }, { session }).toArray()
        const reservedRefund = refunds.reduce((sum, refund) => sum + refund.amount, 0)
        const refunded = refunds
          .filter((refund) => refund.status === 'Succeeded')
          .reduce((sum, refund) => sum + refund.amount, 0)
        if (
          refunds.some((refund) => !Number.isSafeInteger(refund.amount) || refund.amount <= 0) ||
          !Number.isSafeInteger(reservedRefund) ||
          reservedRefund > paid ||
          refunded !== (order.payment.refundedAmount || 0)
        )
          fail(409, 'Sổ hoàn COD chưa khớp, cần Manager đối soát')
        let transactionId: ObjectId | undefined
        if (actual > 0) {
          transactionId = new ObjectId()
          await database.transactions.insertOne(
            {
              _id: transactionId,
              kind: 'Payment',
              status: 'Succeeded',
              source: 'CODCollection',
              method: 'COD',
              currency: 'VND',
              amount: actual,
              orderId: order._id,
              deliveryId: day._id,
              userId: order.userId,
              idempotencyKey: `cod:${order._id}:${day._id}`,
              createdBy: actor._id,
              occurredAt: now,
              createdAt: now,
              description: `COD ngày ${day.date}; phải thu ${expected}, thực thu ${actual}, lệch ${actual - expected}`
            },
            { session }
          )
        }
        day.deliveryResult = {
          ...day.deliveryResult!,
          codExpectedAmount: expected,
          codCollectedAmount: actual,
          codDifference: actual - expected,
          ...(transactionId ? { transactionId } : {})
        }
        order.payment.paidAmount = paid + actual
        refreshCODSummary(order, await readCODLedger(order, session), now)
      }
      const status = aggregateOrderStatus(order.deliveries)
      if (status !== order.status) order.statusHistory.push({ ...event, status })
      order.status = status
      order.hasFailedDeliveries = order.deliveries.some((delivery) => delivery.status === 'Failed')
      const saved = await database.orders.updateOne(
        { _id: order._id, version: payload.version },
        {
          $set: {
            deliveries: order.deliveries,
            status: order.status,
            statusHistory: order.statusHistory,
            payment: order.payment,
            hasFailedDeliveries: order.hasFailedDeliveries,
            updatedAt: now
          },
          $inc: { version: 1 }
        },
        { session }
      )
      if (!saved.matchedCount) fail(409, 'Đơn đã thay đổi, vui lòng tải lại')
      if (payload.status === 'Completed')
        await tracking.recordOrderCalories(String(order.userId), { ...order, deliveries: [day] }, session)
      await database.auditLogs.insertOne(
        {
          actorId: actor._id,
          actorRole: UserRole.DELIVERY,
          action: 'OrderStatusChanged',
          entityType: 'Order',
          entityId: order._id!,
          before: { deliveryId: day._id, status: previousStatus, version: payload.version },
          after: {
            deliveryId: day._id,
            status: day.status,
            version: payload.version + 1,
            deliveryResult: day.deliveryResult
          },
          reason,
          createdAt: now
        },
        { session }
      )
      await database.notifications.insertOne(
        {
          userId: order.userId,
          type: 'Order',
          priority: 'Normal',
          entityType: 'Order',
          entityId: order._id,
          eventKey: `shipper:${order._id}:${payload.version + 1}`,
          title: 'Cập nhật giao hàng',
          message: `Đơn ${order.orderCode}, ngày ${day.date}: ${reason}`,
          createdAt: now
        },
        { session }
      )
      return {
        orderId: order._id,
        deliveryId: day._id,
        status: day.status,
        version: payload.version + 1,
        changed: true,
        deliveryResult: day.deliveryResult
      }
    })
  }
}
export default new ShipperService()
