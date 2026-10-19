import { ErrorWithStatus } from '~/models/Errors'
import { DeliveryPeriod, OrderStatus } from '~/models/schemas/Order.schema'

// Preserve the existing package rule: show its earliest unfinished delivery stage.
export function aggregateOrderStatus(deliveries: DeliveryPeriod[]): OrderStatus {
  const active = deliveries.filter((day) => day.status !== 'Cancelled')
  if (!active.length) return 'Cancelled'
  if (active.every((day) => day.status === 'Rejected')) return 'Rejected'
  const sequence: OrderStatus[] = ['Pending', 'Confirmed', 'Cooking', 'Ready', 'Delivering', 'Completed']
  const positions = active.map((day) => sequence.indexOf(day.status))
  if (positions.some((position) => position < 0)) {
    throw new ErrorWithStatus({ status: 409, message: 'Trạng thái gói hỗn hợp chưa được hỗ trợ, cần đối soát' })
  }
  return sequence[Math.min(...positions)]
}
