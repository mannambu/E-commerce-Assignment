import { ErrorWithStatus } from '~/models/Errors'
import { DeliveryPeriod, OrderStatus } from '~/models/schemas/Order.schema'

// Preserve the existing package rule: show its earliest unfinished delivery stage.
export function aggregateOrderStatus(deliveries: DeliveryPeriod[]): OrderStatus {
  const active = deliveries.filter((day) => day.status !== 'Cancelled')
  if (!active.length) return 'Cancelled'
  if (active.every((day) => day.status === 'Rejected')) return 'Rejected'
  // Failed days are flagged separately; other days keep their own progress.
  // If only Completed/Failed remain, the unresolved package is Failed, never Completed.
  const ongoing = active.filter((day) => !['Completed', 'Failed'].includes(day.status))
  if (active.some((day) => day.status === 'Failed') && !ongoing.length) return 'Failed'
  const sequence: OrderStatus[] = ['Pending', 'Confirmed', 'Cooking', 'Ready', 'Delivering', 'Completed']
  const positions = active.filter((day) => day.status !== 'Failed').map((day) => sequence.indexOf(day.status))
  if (positions.some((position) => position < 0)) {
    throw new ErrorWithStatus({ status: 409, message: 'Trạng thái gói hỗn hợp chưa được hỗ trợ, cần đối soát' })
  }
  return sequence[Math.min(...positions)]
}
