import { ClientSession, ObjectId } from 'mongodb'
import { ErrorWithStatus } from '~/models/Errors'
import Order, { CancellationRequest, DeliveryPeriod } from '~/models/schemas/Order.schema'
import Transaction from '~/models/schemas/Transaction.schema'
import { AccountStatus, UserRole } from '~/models/schemas/User.schema'
import { aggregateOrderStatus } from '~/utils/order-status'
import database from './database.services'
import inventory from './inventory.services'
import { codDayLedger, readCODLedger, refreshCODSummary } from './cod-ledger.services'
import settings from './settings.services'
import { getKitchenCutoff } from '~/utils/delivery'

function fail(status: number, message: string): never {
  throw new ErrorWithStatus({ status, message })
}
function id(value: string) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) fail(400, 'ID không hợp lệ')
  return new ObjectId(value)
}
function command(version: number, reason: string) {
  if (
    !Number.isSafeInteger(version) ||
    version < 0 ||
    typeof reason !== 'string' ||
    !reason.trim() ||
    reason.trim().length > 500
  )
    fail(400, 'Cần version nguyên không âm và lý do 1–500 ký tự')
}

class CancellationService {
  private async actor(actorId: string, role: UserRole, session?: ClientSession, write = false) {
    const filter = { _id: id(actorId), role, account_status: AccountStatus.ACTIVE }
    const actor = await database.users.findOne(filter, { session })
    if (!actor) fail(403, 'Tài khoản không có quyền hoặc không còn Active')
    if (
      write &&
      !(await database.users.updateOne(filter, { $inc: { assignmentVersion: 1 } }, { session })).matchedCount
    )
      fail(403, 'Tài khoản đã thay đổi')
    return actor
  }

  private async order(orderId: string, session?: ClientSession, ownerId?: string) {
    const order = await database.orders.findOne(
      { _id: id(orderId), ...(ownerId ? { userId: id(ownerId) } : {}) },
      { session }
    )
    if (!order) fail(404, 'Không tìm thấy đơn')
    if (order.payment.method !== 'COD') fail(409, 'Luồng này chỉ áp dụng COD')
    // Old single-day COD orders predate cutoff snapshots. Use the confirmed shared configuration.
    if (order.packageType === 'ONE_DAY' && order.deliveries.some((day) => !day.cutoffAt)) {
      const rules = await settings.getCommerceRules(session)
      for (const day of order.deliveries) day.cutoffAt ??= getKitchenCutoff(day.scheduledAt, rules)
    }
    return order
  }

  private eligible(day: DeliveryPeriod, now: Date) {
    if (!['Pending', 'Confirmed'].includes(day.status)) fail(409, 'Chỉ hủy ngày Pending/Confirmed chưa nấu')
    if (!(day.cutoffAt instanceof Date) || !Number.isFinite(day.cutoffAt.getTime()))
      fail(409, 'Ngày giao chưa lưu cutoff hợp lệ; cần kiểm tra dữ liệu')
    if (day.cutoffAt <= now || day.scheduledAt <= now) fail(409, 'Đã chốt bếp, không nhận/duyệt hủy thông thường')
    if (
      day.statusHistory.some((event) =>
        ['Cooking', 'Ready', 'Delivering', 'Completed', 'Failed'].includes(event.status)
      )
    )
      fail(409, 'Ngày đã chế biến không thuộc luồng hủy thông thường')
  }

  private plan(order: Order, deliveryId: string | undefined, transactions: Transaction[], now: Date) {
    const selected = deliveryId
      ? order.deliveries.filter((day) => day._id.equals(id(deliveryId)))
      : order.deliveries.filter((day) => day.status !== 'Cancelled')
    if (!selected.length) fail(409, 'Không còn ngày giao cần hủy')
    if (['Cancelled', 'Rejected', 'Completed'].includes(order.status)) fail(409, 'Đơn đã kết thúc')
    for (const day of selected) this.eligible(day, now)
    if (order.inventoryHold.status !== 'Committed') fail(409, 'Kho COD không khớp; cần kiểm tra trước khi hủy')
    // Completing cancellation of all seven days before any delivery also cancels the package shipping.
    const wholePackage =
      order.packageType === 'WEEKLY_7D' &&
      order.deliveries.every(
        (day) =>
          day.scheduledAt > now &&
          !day.dispatch &&
          !day.statusHistory.some((event) =>
            ['Cooking', 'Ready', 'Delivering', 'Completed', 'Failed'].includes(event.status)
          ) &&
          (selected.includes(day) || (day.status === 'Cancelled' && day.cancellation?.kind === 'CustomerCancellation'))
      )
    // Confirmed policy: cancelling the first day waives/refunds its shipping, never shifts it.
    const lines = selected.map((day) => {
      const shippingCredit = day.shipping.totalFee
      const creditedAmount = day.subtotal + shippingCredit
      const summary = codDayLedger(order, day, transactions)
      const remainingCharge = day.subtotal + day.shipping.totalFee - creditedAmount
      const refundAmount = Math.max(
        0,
        summary.collectedAmount - summary.refundedAmount - summary.pendingRefundAmount - remainingCharge
      )
      return { day, creditedAmount, shippingCredit, refundAmount, summary }
    })
    return {
      selected,
      lines,
      requiresApproval: lines.some(({ summary }) => summary.collectedAmount > 0),
      wholePackage
    }
  }

  async preview(actorId: string, orderId: string, deliveryId?: string) {
    return database.withTransaction(async (session) => {
      await this.actor(actorId, UserRole.CUSTOMER, session)
      const order = await this.order(orderId, session, actorId)
      const transactions = await readCODLedger(order, session)
      const plan = this.plan(order, deliveryId, transactions, new Date())
      return {
        orderId: order._id,
        version: order.version,
        requiresApproval: plan.requiresApproval,
        wholePackage: plan.wholePackage,
        lines: plan.lines.map(({ day, creditedAmount, shippingCredit, refundAmount }) => ({
          deliveryId: day._id,
          cutoffAt: day.cutoffAt,
          foodCredit: day.subtotal,
          shippingCredit,
          creditedAmount,
          refundAmount
        }))
      }
    })
  }

  private result(order: Order, request: CancellationRequest, changed: boolean) {
    return { orderId: order._id, orderStatus: order.status, version: order.version, request, changed }
  }

  async submit(actorId: string, orderId: string, payload: { version: number; reason: string }, deliveryId?: string) {
    command(payload.version, payload.reason)
    if (Object.keys(payload).some((key) => !['version', 'reason', 'deliveryId'].includes(key)))
      fail(400, 'Chỉ gửi version, reason và deliveryId; không hỗ trợ hủy lẻ món')
    if (deliveryId) deliveryId = id(deliveryId).toHexString()
    const reason = payload.reason.trim()
    return database.withTransaction(async (session) => {
      const actor = await this.actor(actorId, UserRole.CUSTOMER, session)
      const order = await this.order(orderId, session, actorId)
      const previous = order.cancellationRequests?.find(
        (request) =>
          request.requestedBy.equals(actor._id!) &&
          request.requestVersion === payload.version &&
          request.reason === reason &&
          String(request.deliveryId || '') === (deliveryId || '')
      )
      if (previous) return this.result(order, previous, false)
      if (order.version !== payload.version) fail(409, 'Đơn đã thay đổi, vui lòng tải lại')
      const transactions = await readCODLedger(order, session)
      const now = new Date()
      const plan = this.plan(order, deliveryId, transactions, now)
      if (
        order.cancellationRequests?.some(
          (request) =>
            request.status === 'Pending' &&
            (request.scope === 'Order' ||
              !deliveryId ||
              request.deliveryIds.some((key) => plan.lines.some(({ day }) => day._id.equals(key))))
        )
      )
        fail(409, 'Đã có yêu cầu hủy chờ duyệt cho phần này')
      await this.actor(actorId, UserRole.CUSTOMER, session, true)
      const request: CancellationRequest = {
        _id: new ObjectId(),
        scope: deliveryId ? 'Delivery' : 'Order',
        ...(deliveryId ? { deliveryId: id(deliveryId) } : {}),
        deliveryIds: plan.selected.map((day) => day._id),
        requestedBy: actor._id!,
        requestedAt: now,
        requestVersion: payload.version,
        reason,
        status: plan.requiresApproval ? 'Pending' : 'Approved',
        automatic: !plan.requiresApproval
      }
      order.cancellationRequests = [...(order.cancellationRequests || []), request]
      if (!plan.requiresApproval)
        await this.apply(order, plan, transactions, actor._id!, 'Customer', reason, session, now)
      await this.save(order, session, now)
      await this.audit(
        order,
        request,
        actor._id!,
        UserRole.CUSTOMER,
        plan.requiresApproval ? 'CancellationRequested' : 'CancellationApproved',
        reason,
        session,
        now
      )
      return this.result(order, request, true)
    })
  }

  async decide(
    actorId: string,
    orderId: string,
    requestId: string,
    payload: { version: number; action: 'Approve' | 'Reject'; reason: string }
  ) {
    command(payload.version, payload.reason)
    if (!['Approve', 'Reject'].includes(payload.action)) fail(400, 'Chọn Approve hoặc Reject')
    const reason = payload.reason.trim()
    return database.withTransaction(async (session) => {
      const actor = await this.actor(actorId, UserRole.MANAGER, session)
      const order = await this.order(orderId, session)
      const request = order.cancellationRequests?.find((entry) => entry._id.equals(id(requestId)))
      if (!request) fail(404, 'Không tìm thấy yêu cầu hủy')
      const status = payload.action === 'Approve' ? 'Approved' : 'Rejected'
      if (
        request.status === status &&
        request.decision?.actorId.equals(actor._id!) &&
        request.decision.requestVersion === payload.version &&
        request.decision.reason === reason
      )
        return this.result(order, request, false)
      if (order.version !== payload.version || request.status !== 'Pending') fail(409, 'Yêu cầu/đơn đã thay đổi')
      const now = new Date()
      if (payload.action === 'Approve') {
        const transactions = await readCODLedger(order, session)
        const plan = this.plan(order, request.deliveryId?.toHexString(), transactions, now)
        if (
          plan.selected.length !== request.deliveryIds.length ||
          plan.selected.some((day) => !request.deliveryIds.some((key) => day._id.equals(key)))
        )
          fail(409, 'Phạm vi hủy đã thay đổi; cần yêu cầu mới')
        await this.apply(order, plan, transactions, actor._id!, 'Manager', reason, session, now)
      }
      await this.actor(actorId, UserRole.MANAGER, session, true)
      request.status = status
      request.decision = { actorId: actor._id!, decidedAt: now, requestVersion: payload.version, reason }
      await this.save(order, session, now)
      await this.audit(
        order,
        request,
        actor._id!,
        UserRole.MANAGER,
        payload.action === 'Approve' ? 'CancellationApproved' : 'CancellationRejected',
        reason,
        session,
        now
      )
      return this.result(order, request, true)
    })
  }

  private async apply(
    order: Order,
    plan: ReturnType<CancellationService['plan']>,
    transactions: Transaction[],
    actorId: ObjectId,
    actorRole: 'Customer' | 'Manager',
    reason: string,
    session: ClientSession,
    now: Date
  ) {
    await inventory.changeItems(
      order,
      plan.selected.flatMap((day) => day.items),
      [],
      session
    )
    for (const { day, creditedAmount, refundAmount } of plan.lines) {
      let refundTransactionId = day.cancellation?.refundTransactionId
      if (refundAmount > 0) {
        const refund: Transaction = {
          _id: new ObjectId(),
          kind: 'Refund',
          status: 'Pending',
          amount: refundAmount,
          requestedAmount: refundAmount,
          currency: 'VND',
          method: 'COD',
          source: 'Reconciliation',
          orderId: order._id,
          deliveryId: day._id,
          userId: order.userId,
          idempotencyKey: `customer-cancel:${order._id}:${day._id}:${order.version}`,
          description: reason,
          occurredAt: now,
          createdAt: now,
          createdBy: actorId
        }
        await database.transactions.insertOne(refund, { session })
        transactions.push(refund)
        refundTransactionId = refund._id
      }
      day.cancellation = {
        ...day.cancellation,
        kind: 'CustomerCancellation',
        reason,
        cancelledAt: day.cancellation?.cancelledAt || now,
        cancelledBy: actorRole,
        creditedAmount,
        refundAmount: (day.cancellation?.refundAmount || 0) + refundAmount,
        ...(refundTransactionId ? { refundTransactionId } : {})
      }
      if (day.status !== 'Cancelled') {
        day.status = 'Cancelled'
        day.statusHistory.push({ status: 'Cancelled', changedAt: now, actorId, reason })
      }
    }
    refreshCODSummary(order, transactions, now)
    const status = aggregateOrderStatus(order.deliveries)
    if (status !== order.status) order.statusHistory.push({ status, changedAt: now, actorId, reason })
    order.status = status
    order.hasFailedDeliveries = order.deliveries.some((day) => day.status === 'Failed')
    if (status === 'Cancelled') {
      order.cancelledAt = now
      order.cancelledBy = actorRole
      order.cancellationReason = reason
    }
  }

  private async save(order: Order, session: ClientSession, now: Date) {
    const { _id, version, ...fields } = order
    const result = await database.orders.updateOne(
      { _id, version },
      { $set: { ...fields, updatedAt: now }, $inc: { version: 1 } },
      { session }
    )
    if (!result.matchedCount) fail(409, 'Đơn đã thay đổi, vui lòng tải lại')
    order.version++
  }

  private async audit(
    order: Order,
    request: CancellationRequest,
    actorId: ObjectId,
    actorRole: UserRole,
    action: 'CancellationRequested' | 'CancellationApproved' | 'CancellationRejected',
    reason: string,
    session: ClientSession,
    now: Date
  ) {
    await database.auditLogs.insertOne(
      {
        actorId,
        actorRole,
        action,
        entityType: 'Order',
        entityId: order._id!,
        before: { version: order.version - 1 },
        after: {
          requestId: request._id,
          requestStatus: request.status,
          deliveryIds: request.deliveryIds,
          orderStatus: order.status,
          version: order.version
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
        eventKey: `cancellation:${order._id}:${order.version}`,
        title: 'Cập nhật yêu cầu hủy',
        message: `Đơn ${order.orderCode}: ${request.status}. ${reason}`,
        createdAt: now
      },
      { session }
    )
  }

  async history(actorId: string, orderId: string) {
    const actor = await database.users.findOne({ _id: id(actorId), account_status: AccountStatus.ACTIVE })
    if (!actor || ![UserRole.CUSTOMER, UserRole.MANAGER].includes(actor.role)) fail(403, 'Không có quyền')
    const order = await this.order(orderId, undefined, actor.role === UserRole.CUSTOMER ? actorId : undefined)
    return { orderId: order._id, version: order.version, requests: order.cancellationRequests || [] }
  }

  async pending(actorId: string, page: number, limit: number) {
    await this.actor(actorId, UserRole.MANAGER)
    const [result] = await database.orders
      .aggregate<{ items: unknown[]; count: Array<{ total: number }> }>([
        { $match: { 'payment.method': 'COD', 'cancellationRequests.status': 'Pending' } },
        { $unwind: '$cancellationRequests' },
        { $match: { 'cancellationRequests.status': 'Pending' } },
        {
          $facet: {
            items: [
              { $sort: { 'cancellationRequests.requestedAt': 1, _id: 1, 'cancellationRequests._id': 1 } },
              { $skip: (page - 1) * limit },
              { $limit: limit },
              {
                $project: {
                  _id: 0,
                  orderId: '$_id',
                  orderCode: 1,
                  orderStatus: '$status',
                  version: 1,
                  request: '$cancellationRequests'
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
}
export default new CancellationService()
