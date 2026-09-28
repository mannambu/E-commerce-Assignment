import { ObjectId } from 'mongodb'
import { LocalDate, MealSlot } from './common'

export type CartTypeValue = 'FOOD' | 'COMBO'

export interface CartItem {
  _id?: ObjectId
  itemId: ObjectId // reference đến foods
  quantity: number
  deliveryDate?: LocalDate
  mealSlot?: MealSlot
  mealPlanId?: ObjectId
  mealPlanItemId?: ObjectId
}

export interface CartType {
  _id?: ObjectId
  userId: ObjectId
  cartType: CartTypeValue
  items: CartItem[]
  version?: number
  createdAt?: Date
  updatedAt?: Date
}
export default class Cart implements CartType {
  _id?: ObjectId
  userId: ObjectId
  cartType: CartTypeValue
  items: CartItem[]
  version: number
  createdAt?: Date
  updatedAt?: Date
  constructor(cart: CartType) {
    this._id = cart._id
    this.userId = cart.userId
    this.cartType = cart.cartType
    this.items = cart.items.map((item) => ({ ...item, _id: item._id ?? new ObjectId() }))
    this.version = cart.version ?? 0
    const now = new Date()
    this.createdAt = cart.createdAt || now
    this.updatedAt = cart.updatedAt || now
  }
  // Helper method để thêm item vào giỏ
  addItem(item: CartItem) {
    const existingItem = this.items.find(
      (i) =>
        i.itemId.equals(item.itemId) &&
        i.deliveryDate === item.deliveryDate &&
        i.mealSlot === item.mealSlot &&
        String(i.mealPlanId ?? '') === String(item.mealPlanId ?? '') &&
        String(i.mealPlanItemId ?? '') === String(item.mealPlanItemId ?? '')
    )
    if (existingItem) {
      existingItem.quantity += item.quantity
    } else {
      this.items.push({ ...item, _id: item._id ?? new ObjectId() })
    }
    this.version += 1
    this.updatedAt = new Date()
  }

  // Helper method để xóa item khỏi giỏ
  removeItem(itemId: ObjectId, deliveryDate?: LocalDate, mealSlot?: MealSlot) {
    this.items = this.items.filter(
      (i) => !(i.itemId.equals(itemId) && i.deliveryDate === deliveryDate && i.mealSlot === mealSlot)
    )
    this.version += 1
    this.updatedAt = new Date()
  }

  removeLine(lineId: ObjectId) {
    this.items = this.items.filter((item) => !item._id?.equals(lineId))
    this.version += 1
    this.updatedAt = new Date()
  }
}
