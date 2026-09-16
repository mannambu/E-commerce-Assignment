import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { ErrorWithStatus } from '~/models/Errors'
import Cart, { CartTypeValue } from '~/models/schemas/Cart.schema'
import databaseService from '~/services/database.services'

interface FoodProjection {
  _id: ObjectId
  name: string
  images: string[]
  calories: number
  price: number
  isActive: boolean
  stock: number
  isCombo: boolean
}

export interface CartSummaryItem {
  itemId: ObjectId
  quantity: number
  itemName: string
  image: string | null
  unitPrice: number
  unitCalories: number
  lineTotal: number
  lineCalories: number
  availability: {
    isActive: boolean
    inStock: boolean
  }
}

class CartService {
  private async getOrCreateCart(userId: string, cartType: CartTypeValue) {
    const userObjectId = new ObjectId(userId)
    const existing = await databaseService.carts.findOne({ userId: userObjectId, cartType })

    if (existing) return existing

    const newCart = new Cart({
      userId: userObjectId,
      cartType,
      items: []
    })

    await databaseService.carts.insertOne(newCart)
    return newCart
  }

  private async getFoodMap(foodIds: ObjectId[]) {
    if (foodIds.length === 0) return new Map<string, FoodProjection>()
    const foods = await databaseService.foods
      .find({ _id: { $in: foodIds } })
      .project({ _id: 1, name: 1, images: 1, calories: 1, price: 1, isActive: 1, stock: 1, isCombo: 1 })
      .toArray()

    return new Map(foods.map((food) => [String(food._id), food as FoodProjection]))
  }

  async buildCartSummaryByType(userId: string, cartType: CartTypeValue) {
    const cart = await this.getOrCreateCart(userId, cartType)

    const foodIds = cart.items.map((item) => item.itemId)
    const foodMap = await this.getFoodMap(foodIds)

    const normalizedItems: CartSummaryItem[] = []

    for (const item of cart.items) {
      const food = foodMap.get(String(item.itemId))
      if (!food) continue

      const unitPrice = Number(food.price || 0)
      const unitCalories = Number(food.calories || 0)
      normalizedItems.push({
        itemId: item.itemId,
        quantity: item.quantity,
        itemName: food.name,
        image: Array.isArray(food.images) ? food.images[0] || null : null,
        unitPrice,
        unitCalories,
        lineTotal: unitPrice * item.quantity,
        lineCalories: unitCalories * item.quantity,
        availability: {
          isActive: Boolean(food.isActive),
          inStock: Number(food.stock || 0) >= item.quantity
        }
      })
    }

    const summary = normalizedItems.reduce(
      (acc, item) => {
        acc.itemCount += Number(item?.quantity || 0)
        acc.subtotal += Number(item?.lineTotal || 0)
        acc.totalCalories += Number(item?.lineCalories || 0)
        return acc
      },
      {
        itemCount: 0,
        subtotal: 0,
        totalCalories: 0
      }
    )

    return {
      cartId: cart._id,
      userId: cart.userId,
      cartType: cart.cartType,
      items: normalizedItems,
      summary
    }
  }

  async buildCartSummary(userId: string) {
    const [foodCart, comboCart] = await Promise.all([
      this.buildCartSummaryByType(userId, 'FOOD'),
      this.buildCartSummaryByType(userId, 'COMBO')
    ])

    return {
      foodCart,
      comboCart
    }
  }

  private async ensurePurchasableFood(itemId: ObjectId) {
    const food = await databaseService.foods.findOne({ _id: itemId })
    if (!food || !food.isActive || food.stock <= 0) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.CART_ITEM_NOT_AVAILABLE,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    return {
      price: Number(food.price),
      stock: Number(food.stock),
      cartType: food.isCombo ? ('COMBO' as const) : ('FOOD' as const)
    }
  }

  private validateQuantityRules(quantity: number, foodStock?: number) {
    if (quantity <= 0) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.CART_QUANTITY_MUST_BE_POSITIVE,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (typeof foodStock === 'number' && quantity > foodStock) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.CART_FOOD_QUANTITY_EXCEEDS_STOCK,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
  }

  private async findCartContainingItem(userId: string, itemObjectId: ObjectId) {
    const [foodCart, comboCart] = await Promise.all([
      this.getOrCreateCart(userId, 'FOOD'),
      this.getOrCreateCart(userId, 'COMBO')
    ])

    if (foodCart.items.some((item) => String(item.itemId) === String(itemObjectId))) {
      return foodCart
    }

    if (comboCart.items.some((item) => String(item.itemId) === String(itemObjectId))) {
      return comboCart
    }

    return null
  }

  async addItem(userId: string, payload: { itemId: string; quantity: number }) {
    const itemObjectId = new ObjectId(payload.itemId)
    const quantity = Number(payload.quantity)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.CART_QUANTITY_MUST_BE_POSITIVE,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const purchasable = await this.ensurePurchasableFood(itemObjectId)
    const cart = await this.getOrCreateCart(userId, purchasable.cartType)

    const existing = cart.items.find((item) => String(item.itemId) === String(itemObjectId))

    const nextQuantity = existing ? existing.quantity + quantity : quantity
    this.validateQuantityRules(nextQuantity, purchasable.stock)

    if (existing) {
      existing.quantity = nextQuantity
      existing.priceAtOrder = purchasable.price
    } else {
      cart.items.push({
        itemId: itemObjectId,
        quantity: nextQuantity,
        priceAtOrder: purchasable.price
      })
    }

    await databaseService.carts.updateOne(
      { _id: cart._id },
      {
        $set: {
          items: cart.items
        },
        $currentDate: { updatedAt: true }
      }
    )

    return this.buildCartSummaryByType(userId, cart.cartType)
  }

  async updateItemQuantity(userId: string, payload: { itemId: string; quantity: number }) {
    const itemObjectId = new ObjectId(payload.itemId)
    const cart = await this.findCartContainingItem(userId, itemObjectId)

    if (!cart) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.CART_ITEM_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const target = cart.items.find((item) => String(item.itemId) === String(itemObjectId))

    if (!target) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.CART_ITEM_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (payload.quantity <= 0) {
      cart.items = cart.items.filter((item) => String(item.itemId) !== String(itemObjectId))
    } else {
      const purchasable = await this.ensurePurchasableFood(itemObjectId)
      this.validateQuantityRules(payload.quantity, purchasable.stock)
      target.quantity = payload.quantity
      target.priceAtOrder = purchasable.price
    }

    await databaseService.carts.updateOne(
      { _id: cart._id },
      {
        $set: {
          items: cart.items
        },
        $currentDate: { updatedAt: true }
      }
    )

    return this.buildCartSummaryByType(userId, cart.cartType)
  }

  async removeItem(userId: string, itemId: string) {
    const itemObjectId = new ObjectId(itemId)
    const cart = await this.findCartContainingItem(userId, itemObjectId)

    if (!cart) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.CART_ITEM_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const before = cart.items.length

    cart.items = cart.items.filter((item) => String(item.itemId) !== itemId)

    if (before === cart.items.length) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.CART_ITEM_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    await databaseService.carts.updateOne(
      { _id: cart._id },
      {
        $set: {
          items: cart.items
        },
        $currentDate: { updatedAt: true }
      }
    )

    return this.buildCartSummaryByType(userId, cart.cartType)
  }

  async clearCartByType(userId: string, cartType: CartTypeValue) {
    const cart = await this.getOrCreateCart(userId, cartType)

    await databaseService.carts.updateOne(
      { _id: cart._id },
      {
        $set: {
          items: []
        },
        $currentDate: { updatedAt: true }
      }
    )

    return this.buildCartSummaryByType(userId, cartType)
  }

  async clearCart(userId: string) {
    const [foodCart, comboCart] = await Promise.all([
      this.clearCartByType(userId, 'FOOD'),
      this.clearCartByType(userId, 'COMBO')
    ])

    return {
      foodCart,
      comboCart
    }
  }

  async refreshCart(userId: string) {
    return this.buildCartSummary(userId)
  }
}

const cartService = new CartService()
export default cartService
