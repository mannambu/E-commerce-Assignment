import type Order from '~/models/schemas/Order.schema'
import type { DeliveryPeriod } from '~/models/schemas/Order.schema'
import type Transaction from '~/models/schemas/Transaction.schema'
import { toLocalDate } from '~/models/schemas/common'
import { ErrorWithStatus } from '~/models/Errors'
import { costSnapshot } from './food-cost'

export function financeError(message: string): never {
  throw new ErrorWithStatus({ status: 409, message: `Dữ liệu báo cáo cần đối soát: ${message}` })
}
function safe(value: number) {
  if (!Number.isSafeInteger(value)) financeError('số tiền hoặc số lượng vượt phạm vi số nguyên an toàn')
  return value
}
const validTime = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime())
export function financeRange(from: string, to: string) {
  const day = (value: string) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN
    const utc = new Date(`${value}T00:00:00Z`)
    if (!validTime(utc) || utc.toISOString().slice(0, 10) !== value) return NaN
    return new Date(`${value}T00:00:00+07:00`).getTime()
  }
  const start = day(from),
    last = day(to)
  if (!Number.isFinite(start) || !Number.isFinite(last) || last < start || last - start >= 366 * 86400000)
    throw new ErrorWithStatus({
      status: 400,
      message: 'from/to phải là ngày YYYY-MM-DD hợp lệ, từ trước đến sau, tối đa 366 ngày'
    })
  return { from, to, start: new Date(start), end: new Date(last + 86400000), timezone: 'Asia/Ho_Chi_Minh' }
}
export type FinanceRange = ReturnType<typeof financeRange>
function completedTime(day: DeliveryPeriod) {
  if (day.deliveryResult?.status === 'Completed' && validTime(day.deliveryResult.recordedAt))
    return day.deliveryResult.recordedAt
  return day.statusHistory
    .filter((event) => event.status === 'Completed' && validTime(event.changedAt))
    .map((event) => event.changedAt)
    .sort((a, b) => b.getTime() - a.getTime())[0]
}

export function buildCODFinance(orders: Order[], transactions: Transaction[], range: FinanceRange) {
  const inside = (date: Date) => date >= range.start && date < range.end
  const totals = () => ({
    foodRevenue: 0,
    shippingRevenue: 0,
    cost: 0,
    grossProfit: 0,
    cashCollected: 0,
    cashRefunded: 0,
    netCash: 0,
    recognizedDeliveryCount: 0,
    estimatedCostDeliveryCount: 0
  })
  const summary = { ...totals(), recognizedOrderCount: 0 }
  const days = new Map<string, ReturnType<typeof totals>>()
  for (let time = range.start.getTime(); time < range.end.getTime(); time += 86400000)
    days.set(toLocalDate(new Date(time)), totals())
  const foods = new Map<
    string,
    {
      foodId: string
      name: string
      quantity: number
      revenue: number
      cost: number
      grossProfit: number
      estimatedQuantity: number
    }
  >()
  const countedOrders = new Set<string>()
  const rows = []
  const warnings: { orderId: string; deliveryId: string; code: string }[] = []
  for (const order of orders)
    for (const day of order.deliveries) {
      const entries = transactions.filter(
        (entry) =>
          entry.orderId?.equals(order._id!) && entry.deliveryId?.equals(day._id) && entry.status === 'Succeeded'
      )
      for (const entry of entries) {
        if (
          !validTime(entry.occurredAt) ||
          !Number.isSafeInteger(entry.amount) ||
          entry.amount <= 0 ||
          !['Payment', 'Refund'].includes(entry.kind) ||
          entry.method !== 'COD'
        )
          financeError(`giao dịch ${entry._id} không hợp lệ`)
      }
      const completedAt = completedTime(day)
      const relevant =
        (day.date >= range.from && day.date <= range.to) ||
        (completedAt && inside(completedAt)) ||
        entries.some((entry) => inside(entry.occurredAt))
      if (!relevant) continue
      const charge = safe(day.subtotal + day.shipping.totalFee)
      if (day.subtotal < 0 || day.shipping.totalFee < 0) financeError(`giá trị ngày giao ${day._id} không hợp lệ`)
      const credited =
        day.cancellation && validTime(day.cancellation.cancelledAt) && day.cancellation.cancelledAt < range.end
          ? (day.cancellation.creditedAmount ?? 0)
          : 0
      const expected = safe(charge - credited)
      if (expected < 0) financeError(`khoản giảm vượt giá trị ngày giao ${day._id}`)
      const lines = day.items.map((item) => {
        if (
          !Number.isSafeInteger(item.quantity) ||
          item.quantity <= 0 ||
          !Number.isSafeInteger(item.price) ||
          item.price < 0
        )
          financeError(`snapshot món ${item._id} không hợp lệ`)
        const legacy = item.costPrice === undefined
        if (
          !legacy &&
          (typeof item.costEstimated !== 'boolean' || !Number.isSafeInteger(item.costPrice) || item.costPrice! < 0)
        )
          financeError(`snapshot giá vốn món ${item._id} không hợp lệ`)
        const snapshot = legacy
          ? costSnapshot(item.price)
          : { costPrice: item.costPrice!, costEstimated: item.costEstimated! }
        return {
          foodId: String(item.foodId),
          name: item.foodName,
          quantity: item.quantity,
          revenue: safe(item.price * item.quantity),
          cost: safe(snapshot.costPrice * item.quantity),
          estimated: snapshot.costEstimated,
          legacy
        }
      })
      if (safe(lines.reduce((sum, line) => safe(sum + line.revenue), 0)) !== day.subtotal)
        financeError(`tổng snapshot món khác subtotal ngày giao ${day._id}`)
      const cost = lines.reduce((sum, line) => safe(sum + line.cost), 0)
      const successful = entries.filter((entry) => entry.occurredAt < range.end)
      let collected = 0,
        refunded = 0,
        receivedInRange = 0,
        refundedInRange = 0
      // Group equal timestamps so payment/refund ordering within one instant is deterministic.
      const events = new Map<number, number>()
      for (const entry of successful) {
        const direction = entry.kind === 'Payment' ? 1 : -1
        if (direction === 1) collected = safe(collected + entry.amount)
        else refunded = safe(refunded + entry.amount)
        events.set(
          entry.occurredAt.getTime(),
          safe((events.get(entry.occurredAt.getTime()) || 0) + direction * entry.amount)
        )
        if (inside(entry.occurredAt)) {
          const bucket = days.get(toLocalDate(entry.occurredAt))!
          if (direction === 1) {
            receivedInRange = safe(receivedInRange + entry.amount)
            bucket.cashCollected = safe(bucket.cashCollected + entry.amount)
          } else {
            refundedInRange = safe(refundedInRange + entry.amount)
            bucket.cashRefunded = safe(bucket.cashRefunded + entry.amount)
          }
        }
      }
      if (refunded > collected) financeError(`hoàn nhiều hơn đã thu tại ngày giao ${day._id}`)
      let recognizedAt: Date | null = null
      const complete = day.status === 'Completed' && completedAt && completedAt < range.end
      if (complete) {
        if (credited !== 0) financeError(`ngày Completed có giảm tiền ngoài luồng COD ${day._id}`)
        events.set(completedAt.getTime(), events.get(completedAt.getTime()) || 0)
        let net = 0
        for (const [time, delta] of [...events].sort((a, b) => a[0] - b[0])) {
          net = safe(net + delta)
          if (recognizedAt && net < charge) financeError(`hoàn vượt khoản thừa của ngày Completed ${day._id}`)
          if (!recognizedAt && time >= completedAt.getTime() && net >= charge) recognizedAt = new Date(time)
        }
      }
      const estimatedCost = lines.some((line) => line.estimated)
      const legacyCostEstimate = lines.some((line) => line.legacy)
      if (day.status === 'Completed' && !completedAt)
        warnings.push({ orderId: String(order._id), deliveryId: String(day._id), code: 'MISSING_COMPLETION_TIME' })
      const recognizedInRange = Boolean(recognizedAt && inside(recognizedAt))
      if (recognizedInRange) {
        const bucket = days.get(toLocalDate(recognizedAt!))!
        bucket.foodRevenue = safe(bucket.foodRevenue + day.subtotal)
        bucket.shippingRevenue = safe(bucket.shippingRevenue + day.shipping.totalFee)
        bucket.cost = safe(bucket.cost + cost)
        bucket.recognizedDeliveryCount++
        if (estimatedCost) bucket.estimatedCostDeliveryCount++
        countedOrders.add(String(order._id))
        for (const line of lines) {
          const aggregate = foods.get(line.foodId) || {
            foodId: line.foodId,
            name: line.name,
            quantity: 0,
            revenue: 0,
            cost: 0,
            grossProfit: 0,
            estimatedQuantity: 0
          }
          aggregate.quantity = safe(aggregate.quantity + line.quantity)
          aggregate.revenue = safe(aggregate.revenue + line.revenue)
          aggregate.cost = safe(aggregate.cost + line.cost)
          aggregate.grossProfit = safe(aggregate.revenue - aggregate.cost)
          if (line.estimated) aggregate.estimatedQuantity = safe(aggregate.estimatedQuantity + line.quantity)
          foods.set(line.foodId, aggregate)
        }
      }
      rows.push({
        orderId: String(order._id),
        orderCode: order.orderCode,
        userId: String(order.userId),
        deliveryId: String(day._id),
        deliveryDate: day.date,
        currentStatus: day.status,
        paymentMethod: 'COD',
        completedAt: completedAt || null,
        recognizedAt,
        recognizedInRange,
        expectedAmount: expected,
        collectedAsOfEnd: collected,
        refundedAsOfEnd: refunded,
        balanceAsOfEnd: safe(expected - collected + refunded),
        cashCollected: receivedInRange,
        cashRefunded: refundedInRange,
        foodRevenue: recognizedInRange ? day.subtotal : 0,
        cost: recognizedInRange ? cost : 0,
        grossProfit: recognizedInRange ? safe(day.subtotal - cost) : 0,
        estimatedCost,
        legacyCostEstimate,
        recognitionStatus: recognizedAt
          ? 'Recognized'
          : day.status !== 'Completed'
            ? 'NotCompleted'
            : !completedAt
              ? 'MissingCompletionTime'
              : completedAt >= range.end
                ? 'CompletedAfterPeriod'
                : 'AwaitingFullPayment'
      })
    }
  for (const bucket of days.values()) {
    bucket.grossProfit = safe(bucket.foodRevenue - bucket.cost)
    bucket.netCash = safe(bucket.cashCollected - bucket.cashRefunded)
    for (const key of Object.keys(bucket) as (keyof typeof bucket)[]) summary[key] = safe(summary[key] + bucket[key])
  }
  summary.recognizedOrderCount = countedOrders.size
  rows.sort(
    (a, b) =>
      b.deliveryDate.localeCompare(a.deliveryDate) ||
      a.orderId.localeCompare(b.orderId) ||
      a.deliveryId.localeCompare(b.deliveryId)
  )
  return {
    period: { from: range.from, to: range.to, timezone: range.timezone },
    summary,
    daily: [...days].map(([date, totals]) => ({ date, ...totals })),
    byFood: [...foods.values()].sort((a, b) => a.foodId.localeCompare(b.foodId)),
    rows,
    warnings
  }
}
