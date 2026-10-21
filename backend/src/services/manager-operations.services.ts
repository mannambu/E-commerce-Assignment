import { ClientSession, ObjectId } from 'mongodb'
import { ErrorWithStatus } from '~/models/Errors'
import { CODReconciliationReqBody, FailureResolutionReqBody } from '~/models/requests/manager-operations.request'
import Order, { DeliveryPeriod } from '~/models/schemas/Order.schema'
import Transaction from '~/models/schemas/Transaction.schema'
import { AccountStatus, UserRole } from '~/models/schemas/User.schema'
import { aggregateOrderStatus } from '~/utils/order-status'
import database from './database.services'
import { codDayLedger, readCODLedger, refreshCODSummary } from './cod-ledger.services'
import { pendingNotificationEmail } from '~/utils/notification-email'

export const FAILED_TIMEOUT_MS = 24 * 60 * 60 * 1000

function fail(status: number, message: string): never {
  throw new ErrorWithStatus({ status, message })
}
function validateCommand(orderId: string, deliveryId: string, version: number, reason: string) {
  if (
    ![orderId, deliveryId].every((id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    typeof reason !== 'string' ||
    !reason.trim() ||
    reason.trim().length > 500
  )
    fail(400, 'Cần ID, version và lý do 1–500 ký tự hợp lệ')
}

class ManagerOperationsService {
  private async manager(actorId: string, session?: ClientSession, write = false) {
    if (!/^[a-f\d]{24}$/i.test(actorId)) fail(403, 'Không có quyền Manager')
    const filter = { _id: new ObjectId(actorId), role: UserRole.MANAGER, account_status: AccountStatus.ACTIVE }
    if (!(await database.users.findOne(filter, { session }))) fail(403, 'Chỉ Manager đang Active được thao tác')
    if (write) {
      const guard = await database.users.updateOne(filter, { $inc: { assignmentVersion: 1 } }, { session })
      if (!guard.matchedCount) fail(403, 'Tài khoản Manager đã thay đổi')
    }
    return filter._id
  }

  private async context(orderId: string, deliveryId: string, session?: ClientSession) {
    const order = await database.orders.findOne({ _id: new ObjectId(orderId) }, { session })
    if (!order) fail(404, 'Không tìm thấy đơn')
    if (order.payment.method !== 'COD') fail(409, 'Bước này chỉ xử lý đơn COD')
    const day = order.deliveries.find((day) => day._id.equals(deliveryId))
    if (!day) fail(404, 'Không tìm thấy ngày giao')
    return { order, day }
  }

  private result(order: Order, day: DeliveryPeriod, changed: boolean) {
    return {
      orderId: order._id,
      deliveryId: day._id,
      status: day.status,
      orderStatus: order.status,
      version: order.version,
      hasFailedDeliveries: order.hasFailedDeliveries,
      codSettlement: day.codSettlement,
      changed
    }
  }

  async getCODLedger(actorId: string, orderId: string, deliveryId: string) {
    validateCommand(orderId, deliveryId, 0, 'read')
    return database.withTransaction(async (session) => {
      await this.manager(actorId, session)
      const { order, day } = await this.context(orderId, deliveryId, session)
      const transactions = await readCODLedger(order, session)
      return {
        orderId: order._id,
        deliveryId: day._id,
        status: day.status,
        version: order.version,
        ...codDayLedger(order, day, transactions),
        originalCollection: day.deliveryResult,
        transactions: transactions.filter((entry) => entry.deliveryId?.equals(day._id)),
        history: day.codReconciliations || []
      }
    })
  }

  async listIssues(actorId: string, kind: 'All' | 'Failed' | 'COD', page: number, limit: number) {
    await this.manager(actorId)
    const failed = { 'deliveries.status': 'Failed' }
    const cod = {
      'deliveries.status': { $in: ['Completed', 'Cancelled'] },
      $or: [
        { 'deliveries.codSettlement.balance': { $exists: true, $ne: 0 } },
        { 'deliveries.codSettlement.pendingRefundAmount': { $gt: 0 } },
        {
          'deliveries.codSettlement': { $exists: false },
          'deliveries.deliveryResult.codDifference': { $exists: true, $ne: 0 }
        }
      ]
    }
    const [result] = await database.orders
      .aggregate<{ items: unknown[]; count: Array<{ total: number }> }>([
        { $match: { 'payment.method': 'COD' } },
        { $unwind: '$deliveries' },
        { $match: kind === 'Failed' ? failed : kind === 'COD' ? cod : { $or: [failed, cod] } },
        {
          $facet: {
            items: [
              { $sort: { updatedAt: 1, _id: 1, 'deliveries._id': 1 } },
              { $skip: (page - 1) * limit },
              { $limit: limit },
              {
                $project: {
                  _id: 0,
                  orderId: '$_id',
                  orderCode: 1,
                  orderStatus: '$status',
                  version: 1,
                  deliveryId: '$deliveries._id',
                  date: '$deliveries.date',
                  status: '$deliveries.status',
                  failedAt: '$deliveries.failedAt',
                  assignedShipperId: '$deliveries.assignedShipperId',
                  deliveryResult: '$deliveries.deliveryResult',
                  codSettlement: '$deliveries.codSettlement'
                }
              }
            ],
            count: [{ $count: 'total' }]
          }
        }
      ])
      .toArray()
    return { items: result?.items || [], total: result?.count[0]?.total || 0, page, limit }
  }

  async resolveFailure(actorId: string, orderId: string, deliveryId: string, payload: FailureResolutionReqBody) {
    validateCommand(orderId, deliveryId, payload.version, payload.reason)
    if (!['Retry', 'Cancel'].includes(payload.action)) fail(400, 'Chỉ chọn Retry hoặc Cancel')
    return database.withTransaction(async (session) => {
      const actor = await this.manager(actorId, session)
      const { order, day } = await this.context(orderId, deliveryId, session)
      const previous = day.failureResolutions?.find(
        (item) =>
          item.actorId?.equals(actor) &&
          item.requestVersion === payload.version &&
          item.action === payload.action &&
          item.reason === payload.reason.trim()
      )
      if (previous) return this.result(order, day, false)
      if (order.version !== payload.version) fail(409, 'Đơn đã thay đổi, vui lòng tải lại')
      await this.manager(actorId, session, true)
      await this.applyFailure(order, day, payload.action, payload.reason.trim(), session, new Date(), actor)
      return this.result(order, day, true)
    })
  }

  private async applyFailure(
    order: Order,
    day: DeliveryPeriod,
    action: 'Retry' | 'Cancel',
    reason: string,
    session: ClientSession,
    now: Date,
    actorId?: ObjectId
  ) {
    if (
      day.status !== 'Failed' ||
      !(day.failedAt instanceof Date) ||
      Number.isNaN(day.failedAt.getTime()) ||
      ['Cancelled', 'Completed', 'Rejected'].includes(order.status)
    )
      fail(409, 'Chỉ xử lý ngày Failed có thời điểm thất bại hợp lệ')
    if (order.inventoryHold.status !== 'Committed') fail(409, 'Kho của ngày Failed chưa hợp lệ, cần kiểm tra trước')
    const transactions = await readCODLedger(order, session)
    const before = {
      status: day.status,
      assignedShipperId: day.assignedShipperId,
      failedAt: day.failedAt,
      deliveryResult: day.deliveryResult
    }
    const version = order.version
    const actorRole = actorId ? ('Manager' as const) : ('System' as const)
    day.failureResolutions = [
      ...(day.failureResolutions || []),
      {
        action,
        actorId,
        actorRole,
        reason,
        resolvedAt: now,
        failedAt: day.failedAt,
        requestVersion: version,
        previousShipperId: day.assignedShipperId,
        previousDispatch: day.dispatch,
        failureResult: day.deliveryResult
      }
    ]
    if (action === 'Retry') {
      const summary = codDayLedger(order, day, transactions)
      if (summary.collectedAmount || summary.pendingRefundAmount)
        fail(409, 'Ngày Failed đã có tiền/hoàn tiền, cần đối soát trước khi giao lại')
      day.status = 'Ready'
      delete day.assignedShipperId
      delete day.dispatch
      delete day.deliveryResult
      delete day.failedAt
    } else {
      const summary = codDayLedger(order, day, transactions)
      const refundAmount = summary.collectedAmount - summary.refundedAmount - summary.pendingRefundAmount
      let refundTransactionId: ObjectId | undefined
      if (refundAmount > 0) {
        refundTransactionId = new ObjectId()
        const refund: Transaction = {
          _id: refundTransactionId,
          kind: 'Refund',
          status: 'Pending',
          amount: refundAmount,
          requestedAmount: refundAmount,
          currency: 'VND',
          method: 'COD',
          orderId: order._id,
          deliveryId: day._id,
          userId: order.userId,
          source: 'Reconciliation',
          idempotencyKey: `failed-cancel:${order._id}:${day._id}`,
          description: `Yêu cầu trả lại COD ngày Failed: ${reason}`,
          occurredAt: now,
          createdAt: now,
          createdBy: actorId
        }
        await database.transactions.insertOne(refund, { session })
        transactions.push(refund)
      }
      day.status = 'Cancelled'
      day.cancellation = {
        reason,
        cancelledAt: now,
        cancelledBy: actorRole,
        creditedAmount: day.subtotal + day.shipping.totalFee,
        refundAmount: summary.collectedAmount,
        ...(refundTransactionId ? { refundTransactionId } : {})
      }
      // Food has already been cooked: do not release/restore committed inventory.
    }
    day.statusHistory.push({ status: day.status, changedAt: now, actorId, reason })
    refreshCODSummary(order, transactions, now)
    await this.save(order, session, now, reason, actorId)
    if (order.status === 'Cancelled') {
      await database.orders.updateOne(
        { _id: order._id, version: order.version },
        { $set: { cancelledAt: now, cancelledBy: actorRole, cancellationReason: reason } },
        { session }
      )
    }
    await this.auditAndNotify(order, day, 'DeliveryFailureResolved', before, reason, session, now, actorId)
  }

  async reconcileCOD(actorId: string, orderId: string, deliveryId: string, payload: CODReconciliationReqBody) {
    validateCommand(orderId, deliveryId, payload.version, payload.reason)
    if (
      !['Collect', 'Refund'].includes(payload.action) ||
      !Number.isSafeInteger(payload.amount) ||
      payload.amount <= 0 ||
      typeof payload.reference !== 'string' ||
      !payload.reference.trim() ||
      payload.reference.trim().length > 120
    )
      fail(400, 'Cần thao tác, số tiền nguyên dương và mã tham chiếu 1–120 ký tự')
    const reason = payload.reason.trim()
    const reference = payload.reference.trim()
    return database.withTransaction(async (session) => {
      const actor = await this.manager(actorId, session)
      const { order, day } = await this.context(orderId, deliveryId, session)
      const previous = day.codReconciliations?.find(
        (item) =>
          item.actorId.equals(actor) &&
          item.requestVersion === payload.version &&
          item.action === payload.action &&
          item.amount === payload.amount &&
          item.reference === reference &&
          item.reason === reason
      )
      if (previous) return this.result(order, day, false)
      if (order.version !== payload.version) fail(409, 'Đơn đã thay đổi, vui lòng tải lại')
      if (!['Completed', 'Cancelled'].includes(day.status)) fail(409, 'Chỉ đối soát ngày Completed hoặc Cancelled')
      const transactions = await readCODLedger(order, session)
      if (transactions.some((entry) => entry.reconciliationReference === reference))
        fail(409, 'Mã tham chiếu đã được ghi trên đơn này')
      const summary = codDayLedger(order, day, transactions)
      const maximum = payload.action === 'Collect' ? summary.balance : -summary.balance
      if (payload.amount > maximum || (payload.action === 'Collect' && day.status !== 'Completed'))
        fail(409, 'Số tiền vượt khoản còn thiếu/thừa của ngày giao')
      await this.manager(actorId, session, true)
      const now = new Date()
      let receipt: Transaction
      const pending =
        payload.action === 'Refund'
          ? transactions.find(
              (entry) => entry.deliveryId?.equals(day._id) && entry.kind === 'Refund' && entry.status !== 'Succeeded'
            )
          : undefined
      if (pending && payload.amount > pending.amount)
        fail(409, 'Hãy xác nhận từng yêu cầu hoàn; số tiền không vượt yêu cầu đang xử lý')
      if (pending && payload.amount === pending.amount) {
        const update = await database.transactions.updateOne(
          { _id: pending._id, status: pending.status, amount: pending.amount },
          {
            $set: {
              status: 'Succeeded',
              reconciliationReference: reference,
              reconciledBy: actor,
              verifiedAt: now,
              occurredAt: now,
              updatedAt: now,
              description: reason
            }
          },
          { session }
        )
        if (!update.matchedCount) fail(409, 'Yêu cầu hoàn đã thay đổi')
        pending.status = 'Succeeded'
        pending.reconciliationReference = reference
        receipt = pending
      } else {
        if (pending) {
          const original = pending.amount
          const adjusted = await database.transactions.updateOne(
            { _id: pending._id, status: pending.status, amount: original },
            {
              $set: {
                amount: original - payload.amount,
                requestedAmount: pending.requestedAmount ?? original,
                updatedAt: now
              }
            },
            { session }
          )
          if (!adjusted.matchedCount) fail(409, 'Yêu cầu hoàn đã thay đổi')
          pending.amount -= payload.amount
        }
        receipt = {
          _id: new ObjectId(),
          kind: payload.action === 'Collect' ? 'Payment' : 'Refund',
          status: 'Succeeded',
          amount: payload.amount,
          currency: 'VND',
          method: 'COD',
          source: 'Reconciliation',
          orderId: order._id,
          deliveryId: day._id,
          userId: order.userId,
          idempotencyKey: `cod-reconcile:${order._id}:${payload.version}`,
          reconciliationReference: reference,
          description: reason,
          createdBy: actor,
          reconciledBy: actor,
          occurredAt: now,
          verifiedAt: now,
          createdAt: now,
          ...(pending ? { refundRequestId: pending._id } : {})
        }
        await database.transactions.insertOne(receipt, { session })
        transactions.push(receipt)
      }
      day.codReconciliations = [
        ...(day.codReconciliations || []),
        {
          action: payload.action,
          actorId: actor,
          amount: payload.amount,
          reference,
          reason,
          requestVersion: payload.version,
          transactionId: receipt._id!,
          recordedAt: now
        }
      ]
      refreshCODSummary(order, transactions, now)
      await this.save(order, session, now, reason, actor)
      await this.auditAndNotify(
        order,
        day,
        'CODReconciled',
        { ...summary, action: payload.action, amount: payload.amount, reference },
        reason,
        session,
        now,
        actor
      )
      return this.result(order, day, true)
    })
  }

  private async save(order: Order, session: ClientSession, now: Date, reason: string, actorId?: ObjectId) {
    const status = aggregateOrderStatus(order.deliveries)
    if (order.status !== status) order.statusHistory.push({ status, changedAt: now, reason, actorId })
    order.status = status
    order.hasFailedDeliveries = order.deliveries.some((day) => day.status === 'Failed')
    const saved = await database.orders.updateOne(
      { _id: order._id, version: order.version },
      {
        $set: {
          deliveries: order.deliveries,
          status: order.status,
          statusHistory: order.statusHistory,
          hasFailedDeliveries: order.hasFailedDeliveries,
          payment: order.payment,
          updatedAt: now
        },
        $inc: { version: 1 }
      },
      { session }
    )
    if (!saved.matchedCount) fail(409, 'Đơn đã thay đổi, vui lòng tải lại')
    order.version++
  }

  private async auditAndNotify(
    order: Order,
    day: DeliveryPeriod,
    action: 'DeliveryFailureResolved' | 'CODReconciled',
    before: Record<string, unknown>,
    reason: string,
    session: ClientSession,
    now: Date,
    actorId?: ObjectId
  ) {
    await database.auditLogs.insertOne(
      {
        actorId,
        actorRole: actorId ? UserRole.MANAGER : 'System',
        action,
        entityType: 'Order',
        entityId: order._id!,
        before: { deliveryId: day._id, version: order.version - 1, ...before },
        after: {
          deliveryId: day._id,
          status: day.status,
          version: order.version,
          codSettlement: day.codSettlement,
          cancellation: day.cancellation
        },
        reason,
        createdAt: now
      },
      { session }
    )
    await database.notifications.insertOne(
      {
        userId: order.userId,
        type: action === 'CODReconciled' ? 'Payment' : 'Order',
        priority: 'Normal',
        entityType: 'Order',
        entityId: order._id,
        eventKey: `manager-operation:${order._id}:${order.version}`,
        email: pendingNotificationEmail(now),
        title: action === 'CODReconciled' ? 'Đã ghi nhận đối soát COD' : 'Đã xử lý giao thất bại',
        message: `Đơn ${order.orderCode}, ngày ${day.date}, trạng thái ${day.status}: ${reason}${action === 'DeliveryFailureResolved' && day.status === 'Cancelled' ? '. Nếu có khoản đã thu cần hoàn, khoản đó được xử lý riêng; email này không xác nhận tiền đã hoàn.' : ''}`,
        createdAt: now
      },
      { session }
    )
  }

  async expireFailedDelivery(orderId: string, deliveryId: string, failedAt: Date, now = new Date()) {
    return database.withTransaction(async (session) => {
      const { order, day } = await this.context(orderId, deliveryId, session)
      if (
        day.status !== 'Failed' ||
        !(day.failedAt instanceof Date) ||
        day.failedAt.getTime() !== failedAt.getTime() ||
        day.failedAt.getTime() > now.getTime() - FAILED_TIMEOUT_MS
      )
        return false
      await this.applyFailure(order, day, 'Cancel', 'Tự hủy ngày giao Failed chưa được xử lý sau 24 giờ', session, now)
      return true
    })
  }

  async expireFailedDeliveries(now = new Date()) {
    const cutoff = new Date(now.getTime() - FAILED_TIMEOUT_MS)
    const cursor = database.orders.find({
      'payment.method': 'COD',
      deliveries: { $elemMatch: { status: 'Failed', failedAt: { $lte: cutoff } } }
    })
    let cancelled = 0
    let errors = 0
    for await (const order of cursor) {
      for (const day of order.deliveries) {
        if (day.status !== 'Failed' || !(day.failedAt instanceof Date) || day.failedAt > cutoff) continue
        try {
          if (await this.expireFailedDelivery(String(order._id), String(day._id), day.failedAt, now)) cancelled++
        } catch {
          errors++
          console.error(`Failed-delivery expiry needs review: order=${order._id}, delivery=${day._id}`)
        }
      }
    }
    return { cancelled, errors }
  }
}
export default new ManagerOperationsService()
