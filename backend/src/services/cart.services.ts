import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { ErrorWithStatus } from '~/models/Errors'
import Cart, { CartItem, CartTypeValue } from '~/models/schemas/Cart.schema'
import { NutritionSnapshot, toLocalDate } from '~/models/schemas/common'
import { AddCartItemReqBody } from '~/models/requests/CartOrder.request'
import databaseService from '~/services/database.services'

export interface CartSummaryItem extends CartItem {
  itemName: string
  image: string | null
  unitPrice: number
  unitCalories: number
  nutrition: NutritionSnapshot
  lineTotal: number
  lineCalories: number
  availability: { isActive: boolean; inStock: boolean }
}

class CartService {
  private async getOrCreateCart(userId: string) {
    const userObjectId = new ObjectId(userId)
    const empty = new Cart({ _id: new ObjectId(), userId: userObjectId, cartType: 'FOOD', items: [] })
    try {
      await databaseService.carts.updateOne({ userId: userObjectId }, { $setOnInsert: empty }, { upsert: true })
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error
    }
    const cart = await databaseService.carts.findOne({ userId: userObjectId })
    return new Cart(cart!)
  }

  private async saveCart(cart: Cart, previousVersion: number) {
    const result = await databaseService.carts.updateOne(
      { _id: cart._id, version: previousVersion },
      {
        $set: { items: cart.items, cartType: cart.cartType },
        $inc: { version: 1 },
        $currentDate: { updatedAt: true }
      }
    )
    if (!result.matchedCount) {
      throw new ErrorWithStatus({ message: 'Giỏ đã thay đổi, vui lòng tải lại', status: HTTP_STATUS.CONFLICT })
    }
  }

  private async summarize(cart: Cart, cartType: CartTypeValue) {
    const items = cart.cartType === cartType ? cart.items : []
    const foods = await databaseService.foods.find({ _id: { $in: items.map((item) => item.itemId) } }).toArray()
    const foodMap = new Map(foods.map((food) => [String(food._id), food]))
    const quantities = new Map<string, number>()
    for (const item of items) {
      quantities.set(String(item.itemId), (quantities.get(String(item.itemId)) || 0) + item.quantity)
    }
    const normalizedItems: CartSummaryItem[] = items.map((item) => {
      const food = foodMap.get(String(item.itemId))
      const price = food?.price || 0
      const calories = food?.calories || 0
      return {
        ...item,
        itemName: food?.name || 'Món không còn kinh doanh',
        image: food?.images[0] || null,
        unitPrice: price,
        unitCalories: calories,
        nutrition: food?.nutrition || { protein: 0, carb: 0, fat: 0 },
        lineTotal: price * item.quantity,
        lineCalories: calories * item.quantity,
        availability: {
          isActive: Boolean(food?.isActive),
          inStock: Boolean(food && food.stock - food.reservedStock >= quantities.get(String(item.itemId))!)
        }
      }
    })
    return {
      cartId: cart._id,
      userId: cart.userId,
      cartType,
      version: cart.version,
      items: normalizedItems,
      summary: {
        itemCount: normalizedItems.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0),
        totalCalories: normalizedItems.reduce((sum, item) => sum + item.lineCalories, 0)
      }
    }
  }

  async buildCartSummaryByType(userId: string, cartType: CartTypeValue) {
    return this.summarize(await this.getOrCreateCart(userId), cartType)
  }

  async buildCartSummary(userId: string) {
    const cart = await this.getOrCreateCart(userId)
    // Hai phần response cho UI cũ; DB chỉ có một giỏ, phần còn lại luôn rỗng.
    const [foodCart, comboCart] = await Promise.all([this.summarize(cart, 'FOOD'), this.summarize(cart, 'COMBO')])
    return { foodCart, comboCart }
  }

  private async checkStock(itemId: ObjectId, quantity: number) {
    const food = await databaseService.foods.findOne({ _id: itemId })
    if (!food?.isActive || quantity > food.stock - food.reservedStock) {
      throw new ErrorWithStatus({ message: USERS_MESSAGES.CART_ITEM_NOT_AVAILABLE, status: HTTP_STATUS.BAD_REQUEST })
    }
  }

  async addItem(userId: string, payload: AddCartItemReqBody) {
    const cart = await this.getOrCreateCart(userId)
    const previousVersion = cart.version
    const cartType = payload.cartType || cart.cartType
    if (cart.items.length && cartType !== cart.cartType) {
      throw new ErrorWithStatus({
        message: 'Hãy xóa giỏ hiện tại trước khi đổi chế độ mua',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    if (cartType === 'COMBO' && !payload.deliveryDate) {
      throw new ErrorWithStatus({ message: 'Món trong gói tuần phải có ngày giao', status: HTTP_STATUS.BAD_REQUEST })
    }
    let deliveryDate: string | undefined
    try {
      deliveryDate = payload.deliveryDate ? toLocalDate(payload.deliveryDate) : undefined
    } catch {
      throw new ErrorWithStatus({ message: 'Ngày giao không hợp lệ', status: HTTP_STATUS.BAD_REQUEST })
    }
    const quantity = Number(payload.quantity)
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.CART_QUANTITY_MUST_BE_POSITIVE,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    const itemId = new ObjectId(payload.itemId)
    const total = cart.items
      .filter((item) => item.itemId.equals(itemId))
      .reduce((sum, item) => sum + item.quantity, quantity)
    await this.checkStock(itemId, total)
    cart.cartType = cartType
    cart.addItem({
      itemId,
      quantity,
      deliveryDate,
      mealSlot: payload.mealSlot,
      mealPlanId: payload.mealPlanId ? new ObjectId(payload.mealPlanId) : undefined,
      mealPlanItemId: payload.mealPlanItemId ? new ObjectId(payload.mealPlanItemId) : undefined
    })
    await this.saveCart(cart, previousVersion)
    return this.buildCartSummaryByType(userId, cartType)
  }

  private findLine(cart: Cart, id: string) {
    const line = cart.items.find((item) => String(item._id) === id)
    if (line) return line
    // Tương thích itemId cũ nếu chỉ có một dòng. Gói tuần phải gửi _id của dòng.
    const matches = cart.items.filter((item) => String(item.itemId) === id)
    if (matches.length === 1) return matches[0]
    throw new ErrorWithStatus({
      message: matches.length ? 'Món có nhiều ngày/bữa, hãy dùng mã dòng giỏ hàng' : USERS_MESSAGES.CART_ITEM_NOT_FOUND,
      status: matches.length ? HTTP_STATUS.BAD_REQUEST : HTTP_STATUS.NOT_FOUND
    })
  }

  async updateItemQuantity(userId: string, payload: { itemId: string; quantity: number }) {
    const cart = await this.getOrCreateCart(userId)
    const line = this.findLine(cart, payload.itemId)
    const quantity = Number(payload.quantity)
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.CART_QUANTITY_MUST_BE_ZERO_OR_POSITIVE,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    const previousVersion = cart.version
    if (quantity === 0) cart.removeLine(line._id!)
    else {
      const total = cart.items
        .filter((item) => item !== line && item.itemId.equals(line.itemId))
        .reduce((sum, item) => sum + item.quantity, quantity)
      await this.checkStock(line.itemId, total)
      line.quantity = quantity
    }
    await this.saveCart(cart, previousVersion)
    return this.buildCartSummaryByType(userId, cart.cartType)
  }

  async removeItem(userId: string, itemId: string) {
    return this.updateItemQuantity(userId, { itemId, quantity: 0 })
  }

  async clearCartByType(userId: string, cartType: CartTypeValue) {
    const cart = await this.getOrCreateCart(userId)
    if (cart.cartType === cartType) {
      cart.items = []
      await this.saveCart(cart, cart.version)
    }
    return this.buildCartSummaryByType(userId, cartType)
  }

  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId)
    cart.items = []
    await this.saveCart(cart, cart.version)
    return this.buildCartSummary(userId)
  }

  async refreshCart(userId: string) {
    return this.buildCartSummary(userId)
  }
}

export default new CartService()
