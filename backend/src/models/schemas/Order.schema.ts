import { ObjectId } from 'mongodb'
import { LocalDate, MealSlot, NutritionSnapshot } from './common'

export type OrderStatus = 'Pending' | 'Confirmed' | 'Cooking' | 'Delivering' | 'Completed' | 'Cancelled'
export type PaymentMethod = 'COD' | 'VNPay' | 'MoMo'
export type PaymentStatus = 'Pending' | 'Paid' | 'Failed' | 'PartiallyRefunded' | 'Refunded'
export type PackageType = 'ONE_DAY' | 'WEEKLY_7D'
export type CancelledBy = 'Customer' | 'Admin' | 'System'

export interface OrderStatusEvent {
  status: OrderStatus
  changedAt: Date
  actorId?: ObjectId
  reason?: string
}

/** Price and nutrition snapshots are per serving. */
export interface OrderItem {
  _id: ObjectId
  foodId: ObjectId
  foodName: string
  image?: string
  quantity: number
  price: number
  calories: number
  nutrition: NutritionSnapshot
  mealSlot?: MealSlot
  mealPlanId?: ObjectId
  mealPlanItemId?: ObjectId
}

export interface ShippingBreakdown {
  baseFee: number
  extraFee: number
  totalFee: number
  distanceKm: number
}

export interface DeliveryPeriod {
  _id: ObjectId
  date: LocalDate
  scheduledAt: Date
  cutoffAt?: Date // Set at checkout using kitchen settings.
  items: OrderItem[]
  status: OrderStatus
  statusHistory: OrderStatusEvent[]
  subtotal: number
  shipping: ShippingBreakdown
  waivedShippingFee: number
  refundedAmount: number
  cancellation?: {
    reason: string
    cancelledAt: Date
    cancelledBy: CancelledBy
    creditedAmount?: number // Phần giảm khỏi giá trị phải trả, giữ nguyên giá gốc của đơn.
    refundAmount?: number // Số tiền đã yêu cầu hoàn, chưa đồng nghĩa đã hoàn thành.
    refundTransactionId?: ObjectId
  }
}

export interface CancellationPolicySnapshot {
  description: string
  refundBeforeCutoffPercent: number
  refundAfterCutoffPercent: number
  refundShippingFee: boolean
}

export interface PaymentInfo {
  method: PaymentMethod
  status: PaymentStatus
  transactionId?: string
  paidAt?: Date
  paidAmount?: number
  refundedAmount?: number
}

/** Embedded stock hold. Update the order and food together in a DB transaction. */
export interface InventoryHold {
  status: 'NotReserved' | 'Held' | 'Committed' | 'Released'
  items: Array<{ foodId: ObjectId; quantity: number }>
  expiresAt?: Date
  committedAt?: Date
  releasedAt?: Date
}

export default interface Order {
  _id?: ObjectId
  userId: ObjectId
  orderCode: string
  packageType: PackageType
  deliveries: DeliveryPeriod[] // One delivery for a day order; seven for a weekly order.
  subtotal: number
  shippingFee: number
  grandTotal: number
  status: OrderStatus
  statusHistory: OrderStatusEvent[]
  deliveryAddress: string
  note: string
  payment: PaymentInfo
  inventoryHold: InventoryHold
  paymentDueAt?: Date
  idempotencyKey?: string
  requestHash?: string
  cancellationPolicy?: CancellationPolicySnapshot
  targetCaloriesSnapshot?: number // Mục tiêu tại lúc đặt, dùng kiểm tra đổi món trong gói tuần.
  cancelledBy?: CancelledBy
  cancelledAt?: Date
  cancellationReason?: string
  version: number
  createdAt: Date
  updatedAt: Date
}
