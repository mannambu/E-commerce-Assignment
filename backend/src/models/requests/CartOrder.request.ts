import { PackageType, PaymentMethod, PaymentStatus, OrderStatus } from '~/models/schemas/Order.schema'
import { CartTypeValue } from '~/models/schemas/Cart.schema'
import { MealSlot } from '~/models/schemas/common'

export interface CartItemInput {
  itemId: string
  quantity: number
  deliveryDate?: string
  mealSlot?: MealSlot
  mealPlanId?: string
  mealPlanItemId?: string
}

export interface AddCartItemReqBody extends CartItemInput {
  cartType?: CartTypeValue
  version?: number
}

export interface AddCartItemsReqBody {
  cartType?: CartTypeValue
  version?: number
  items: CartItemInput[]
}

export interface UpdateCartItemReqBody {
  quantity?: number
  deliveryDate?: string | null
  mealSlot?: MealSlot | null
  version?: number
}

export interface ChangeCartModeReqBody {
  cartType: CartTypeValue
  version?: number
}

export interface QuoteOrderReqBody {
  deliveryAddress: string
  deliveryDate: string
  deliveryTime?: string // HH:mm tại Việt Nam khi deliveryDate chỉ có YYYY-MM-DD.
  packageType?: PackageType
  cartType?: CartTypeValue
  distanceKm?: number
  note?: string
  paymentMethod: PaymentMethod
}

export interface CreateOrderReqBody extends QuoteOrderReqBody {
  idempotencyKey: string // Giữ nguyên khi gửi lại cùng một lần đặt hàng.
  cartVersion: number // version nhận từ giỏ/báo giá mà khách đã xác nhận.
}

export interface UpdateOrderStatusReqBody {
  exceptionReason?: string // Required for Admin intervention; never a normal workflow.
  status: Exclude<OrderStatus, 'Pending' | 'Cancelled'>
}

export interface RetryPaymentReqBody {
  paymentMethod?: PaymentMethod
}

export interface UpdatePaymentStatusReqBody {
  status: PaymentStatus
  transactionId?: string
}

export interface SwapDeliveryItemReqBody {
  exceptionReason?: string // Required for Admin intervention; never a normal workflow.
  foodId: string
  version: number
}

export interface CancelDeliveryReqBody {
  exceptionReason?: string // Required for Admin intervention; never a normal workflow.
  reason: string
  version: number
}

export interface UpdateDeliveryStatusReqBody {
  exceptionReason?: string // Required for Admin intervention; never a normal workflow.
  status: 'Cooking' | 'Ready' | 'Delivering' | 'Completed'
  version: number
}
export interface ManagerOrderDecisionReqBody {
  status: 'Confirmed' | 'Rejected'
  version: number
  reason?: string
}

export interface KitchenAssignmentReqBody {
  kitchenStaffIds: string[]
  version: number
  reason: string
}

export interface ShipperAssignmentReqBody {
  assignedShipperId: string
  version: number
  reason: string
}

export interface KitchenStatusReqBody {
  status: 'Cooking' | 'Ready'
  version: number
}

export interface ShipperStatusReqBody {
  status: 'Delivering' | 'Completed' | 'Failed'
  version: number
  codCollectedAmount?: number
  reason?: string
  evidenceUrls?: string[]
}
