import { PackageType, PaymentMethod, PaymentStatus, OrderStatus } from '~/models/schemas/Order.schema'
import { CartTypeValue } from '~/models/schemas/Cart.schema'
import { MealSlot } from '~/models/schemas/common'

export interface AddCartItemReqBody {
  itemId: string
  quantity: number
  cartType?: CartTypeValue
  deliveryDate?: string
  mealSlot?: MealSlot
  mealPlanId?: string
  mealPlanItemId?: string
}

export interface UpdateCartItemReqBody {
  quantity: number
}

export interface QuoteOrderReqBody {
  deliveryAddress: string
  deliveryDate: string
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
