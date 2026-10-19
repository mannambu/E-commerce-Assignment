import { ObjectId } from 'mongodb'
import { ErrorWithStatus } from '~/models/Errors'
import { ManagerOrderDecisionReqBody } from '~/models/requests/CartOrder.request'
import { AccountStatus, UserRole } from '~/models/schemas/User.schema'
import database from './database.services'
import inventory from './inventory.services'
import weeklyOrders from './weekly-orders.services'

class OrderDecisionsService {
  // One decision for the whole Pending order. Per-day rejection needs its own shipping policy.
  async decide(actorId: string, orderId: string, payload: ManagerOrderDecisionReqBody) {
    const reason = typeof payload.reason === 'string' ? payload.reason.trim() : ''
    if (
      !ObjectId.isValid(orderId) ||
      !['Confirmed', 'Rejected'].includes(payload.status) ||
      !Number.isSafeInteger(payload.version) ||
      payload.version < 0 ||
      reason.length > 500 ||
      (payload.reason !== undefined && typeof payload.reason !== 'string') ||
      (payload.status === 'Rejected' && !reason)
    ) {
      throw new ErrorWithStatus({
        status: 400,
        message: 'Cần trạng thái, phiên bản hợp lệ và lý do từ chối 1–500 ký tự'
      })
    }
    return database.withTransaction(async (session) => {
      const actor = await database.users.findOne(
        { _id: new ObjectId(actorId), role: UserRole.MANAGER, account_status: AccountStatus.ACTIVE },
        { session }
      )
      if (!actor) throw new ErrorWithStatus({ status: 403, message: 'Chỉ Manager được xác nhận hoặc từ chối đơn' })
      const order = await database.orders.findOne({ _id: new ObjectId(orderId) }, { session })
      if (!order) throw new ErrorWithStatus({ status: 404, message: 'Không tìm thấy đơn hàng' })
      const decision = order.managerDecision
      if (
        decision &&
        decision.requestVersion === payload.version &&
        decision.actorId.equals(actor._id!) &&
        decision.status === payload.status &&
        decision.reason === reason
      ) {
        return { ...weeklyOrders.describeOrder(order), replayed: true }
      }
      if (order.version !== payload.version)
        throw new ErrorWithStatus({ status: 409, message: 'Đơn đã thay đổi, vui lòng tải lại' })
      const pending = order.deliveries.filter((day) => day.status === 'Pending')
      if (
        order.status !== 'Pending' ||
        !pending.length ||
        order.deliveries.some((day) => !['Pending', 'Cancelled'].includes(day.status))
      ) {
        throw new ErrorWithStatus({ status: 409, message: 'Chỉ được quyết định đơn Pending chưa bắt đầu xử lý' })
      }
      const payments = await database.transactions
        .find(
          {
            orderId: order._id,
            kind: 'Payment',
            status: 'Succeeded',
            method: order.payment.method,
            source: order.payment.method === 'COD' ? 'CODCollection' : 'VerifiedIPN'
          },
          { session }
        )
        .toArray()
      const paidAmount = payments.reduce((sum, transaction) => sum + transaction.amount, 0)
      if (
        payments.some((payment) => !Number.isSafeInteger(payment.amount) || payment.amount <= 0) ||
        !Number.isSafeInteger(paidAmount) ||
        (order.payment.paidAmount || 0) !== paidAmount ||
        (['Paid', 'PartiallyRefunded', 'Refunded'].includes(order.payment.status) && !paidAmount)
      ) {
        throw new ErrorWithStatus({ status: 409, message: 'Số tiền đã thu chưa khớp sổ giao dịch, cần đối soát trước' })
      }
      // A failed refund still owns its reservation: retry that same request, never create a second one.
      const refunds = await database.transactions.find({ orderId: order._id, kind: 'Refund' }, { session }).toArray()
      const reservedRefund = refunds.reduce((sum, refund) => sum + refund.amount, 0)
      const completedRefund = refunds
        .filter((refund) => refund.status === 'Succeeded')
        .reduce((sum, refund) => sum + refund.amount, 0)
      if (
        refunds.some((refund) => !Number.isSafeInteger(refund.amount) || refund.amount <= 0) ||
        reservedRefund > paidAmount ||
        (order.payment.refundedAmount || 0) !== completedRefund ||
        (order.payment.status === 'Refunded' && completedRefund !== paidAmount)
      ) {
        throw new ErrorWithStatus({ status: 409, message: 'Sổ hoàn tiền chưa khớp, cần đối soát trước' })
      }
      const now = new Date()
      let refundTransactionId: ObjectId | undefined
      let refundAmount = 0
      if (payload.status === 'Confirmed') {
        const payable =
          order.grandTotal - order.deliveries.reduce((sum, day) => sum + (day.cancellation?.creditedAmount || 0), 0)
        if (
          order.payment.method !== 'COD' &&
          (!['Paid', 'PartiallyRefunded'].includes(order.payment.status) ||
            !payments.length ||
            paidAmount - reservedRefund < payable)
        ) {
          throw new ErrorWithStatus({
            status: 409,
            message: 'Online phải có IPN thành công, đủ tiền trước khi Manager xác nhận'
          })
        }
        if (order.inventoryHold.status !== 'Committed') {
          throw new ErrorWithStatus({ status: 409, message: 'Đơn chưa chốt kho, không thể xác nhận' })
        }
      } else {
        if (order.inventoryHold.status === 'Held') await inventory.releaseHold(order, session, now)
        else if (order.inventoryHold.status === 'Committed')
          await inventory.changeItems(order, [...order.inventoryHold.items], [], session)
        refundAmount = paidAmount - reservedRefund
        if (refundAmount > 0) {
          refundTransactionId = new ObjectId()
          await database.transactions.insertOne(
            {
              _id: refundTransactionId,
              kind: 'Refund',
              status: 'Pending',
              amount: refundAmount,
              currency: 'VND',
              orderId: order._id,
              userId: order.userId,
              method: order.payment.method,
              idempotencyKey: `manager-rejection:${order._id}`,
              source: 'Reconciliation',
              description: `Hoàn toàn đơn bị từ chối, gồm phí ship: ${reason}`,
              occurredAt: now,
              createdAt: now,
              createdBy: actor._id
            },
            { session }
          )
        }
      }
      const event = { status: payload.status, changedAt: now, actorId: actor._id, reason }
      for (const day of pending) {
        day.status = payload.status
        day.statusHistory.push(event)
      }
      order.managerDecision = {
        status: payload.status,
        actorId: actor._id!,
        reason,
        decidedAt: now,
        requestVersion: payload.version,
        ...(refundTransactionId ? { refundTransactionId, refundAmount } : {})
      }
      order.status = payload.status
      order.statusHistory.push(event)
      const result = await database.orders.updateOne(
        { _id: order._id, status: 'Pending', version: payload.version },
        {
          $set: {
            status: order.status,
            statusHistory: order.statusHistory,
            deliveries: order.deliveries,
            inventoryHold: order.inventoryHold,
            managerDecision: order.managerDecision,
            updatedAt: now
          },
          $inc: { version: 1 }
        },
        { session }
      )
      if (!result.matchedCount) throw new ErrorWithStatus({ status: 409, message: 'Đơn đã thay đổi, vui lòng tải lại' })
      await database.auditLogs.insertOne(
        {
          actorId: actor._id,
          actorRole: UserRole.MANAGER,
          action: 'OrderStatusChanged',
          entityType: 'Order',
          entityId: order._id!,
          before: { status: 'Pending', version: payload.version },
          after: { status: payload.status, version: payload.version + 1, refundTransactionId },
          reason: reason || 'Manager xác nhận đơn',
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
          eventKey: `manager-decision:${order._id}`,
          title: payload.status === 'Confirmed' ? 'Đơn đã được xác nhận' : 'Đơn bị từ chối',
          message:
            payload.status === 'Confirmed'
              ? `Đơn ${order.orderCode} đã được Manager xác nhận, chờ bếp tiếp nhận.`
              : `Đơn ${order.orderCode} bị từ chối: ${reason}.${paidAmount > 0 ? ' Khoản đã thu được đưa vào quy trình hoàn tiền; chưa xác nhận đã hoàn.' : ''}`,
          createdAt: now
        },
        { session }
      )
      order.version++
      order.updatedAt = now
      return { ...weeklyOrders.describeOrder(order), replayed: false }
    })
  }
}
export default new OrderDecisionsService()
