import { ErrorWithStatus } from '~/models/Errors'
import type Order from '~/models/schemas/Order.schema'

export function costSnapshot(price: number, cost?: number | null) {
  if (cost != null && (!Number.isSafeInteger(cost) || cost < 0))
    throw new ErrorWithStatus({ status: 400, message: 'Giá vốn phải là số nguyên VND không âm' })
  const costPrice = cost ?? Math.round(price * 0.6)
  if (!Number.isSafeInteger(costPrice) || costPrice < 0)
    throw new ErrorWithStatus({ status: 409, message: 'Giá món không hợp lệ để xác định giá vốn' })
  return { costPrice, costEstimated: cost == null }
}

// Return a copy: stripping response fields must never destroy persisted financial snapshots.
export function withoutOrderCosts(order: Order): Order {
  return {
    ...order,
    deliveries: order.deliveries.map((day) => ({
      ...day,
      items: day.items.map((item) => {
        const result = { ...item }
        delete result.costPrice
        delete result.costEstimated
        return result
      })
    }))
  }
}
