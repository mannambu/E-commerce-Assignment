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

export type CreateOrderReqBody = QuoteOrderReqBody

export interface UpdateOrderStatusReqBody {
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
  foodId: string
  version: number
}

export interface CancelDeliveryReqBody {
  reason: string
  version: number
}

export interface UpdateDeliveryStatusReqBody {
  status: 'Cooking' | 'Delivering' | 'Completed'
  version: number
}
