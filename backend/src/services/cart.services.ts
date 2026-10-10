import { ClientSession, ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { ErrorWithStatus } from '~/models/Errors'
import Cart, { CartItem, CartTypeValue, MAX_CART_LINES } from '~/models/schemas/Cart.schema'
import MealPlan from '~/models/schemas/MealPlan.schema'
import { NutritionSnapshot, toLocalDate } from '~/models/schemas/common'
import {
  AddCartItemReqBody,
  AddCartItemsReqBody,
  ChangeCartModeReqBody,
  UpdateCartItemReqBody
} from '~/models/requests/CartOrder.request'
import databaseService from '~/services/database.services'

export interface CartSummaryItem extends CartItem {
  itemName: string
  image: string | null
  unitPrice: number
  unitCalories: number
  nutrition: NutritionSnapshot
  lineTotal: number
  lineCalories: number
  availability: { isActive: boolean; inStock: boolean; availableQuantity: number }
}

type CartIssue = { code: string; message: string; lineId?: string }

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
    if (!cart) throw new Error('Không thể tải giỏ hàng')
    return new Cart(cart)
  }

  private checkVersion(cart: Cart, version?: number) {
    if (version !== undefined && version !== cart.version) {
      throw new ErrorWithStatus({ message: 'Giỏ đã thay đổi, vui lòng tải lại', status: HTTP_STATUS.CONFLICT })
    }
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
    cart.version = previousVersion + 1
  }

  private checkMode(cart: Cart, cartType: CartTypeValue) {
    if (!['FOOD', 'COMBO'].includes(cartType)) {
      throw new ErrorWithStatus({ message: USERS_MESSAGES.CART_TYPE_IS_INVALID, status: HTTP_STATUS.BAD_REQUEST })
    }
    if (cart.items.length && cartType !== cart.cartType) {
      throw new ErrorWithStatus({
        message: 'Hãy xóa giỏ hiện tại trước khi đổi chế độ mua',
        status: HTTP_STATUS.CONFLICT
      })
    }
  }

  private parseDeliveryDate(value: string) {
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Sai định dạng')
      return toLocalDate(value)
    } catch {
      throw new ErrorWithStatus({ message: 'Ngày giao phải hợp lệ theo YYYY-MM-DD', status: HTTP_STATUS.BAD_REQUEST })
    }
  }

  private getScheduleIssues(cart: Cart, requireFullWeek: boolean): CartIssue[] {
    const issues: CartIssue[] = []
    const today = toLocalDate(new Date())
    for (const item of cart.items) {
      if (cart.cartType === 'COMBO' && !item.deliveryDate) {
        issues.push({ code: 'MISSING_DATE', message: 'Món trong gói tuần phải có ngày giao', lineId: String(item._id) })
      } else if (item.deliveryDate && item.deliveryDate < today) {
        issues.push({ code: 'PAST_DATE', message: 'Ngày giao đã qua, hãy chọn lại ngày', lineId: String(item._id) })
      }
    }
    const dates = [...new Set(cart.items.flatMap((item) => (item.deliveryDate ? [item.deliveryDate] : [])))].sort()
    if (cart.cartType === 'FOOD' && dates.length > 1) {
      issues.push({ code: 'MULTIPLE_DATES', message: 'Giỏ mua lẻ chỉ giao trong một ngày' })
    }
    if (cart.cartType === 'COMBO' && dates.length) {
      const span = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000
      if (span > 6) issues.push({ code: 'WEEK_TOO_LONG', message: 'Các ngày giao phải nằm trong cùng một gói 7 ngày' })
      if (requireFullWeek && dates.length !== 7) {
        issues.push({
          code: 'INCOMPLETE_WEEK',
          message: 'Gói tuần cần có món cho đủ 7 ngày liên tiếp trước khi đặt hàng'
        })
      }
    }
    return issues
  }

  private async summarize(cart: Cart, cartType: CartTypeValue, session?: ClientSession) {
    const items = cart.cartType === cartType ? cart.items : []
    const foods = await databaseService.foods
      .find({ _id: { $in: items.map((item) => item.itemId) } }, { session })
      .toArray()
    const foodMap = new Map(foods.map((food) => [String(food._id), food]))
    const quantities = new Map<string, number>()
    for (const item of items) {
      quantities.set(String(item.itemId), (quantities.get(String(item.itemId)) || 0) + item.quantity)
    }
    const issues = this.getScheduleIssues(new Cart({ ...cart, cartType, items }), true)
    if (!items.length) issues.push({ code: 'EMPTY_CART', message: USERS_MESSAGES.CART_IS_EMPTY })
    const normalizedItems: CartSummaryItem[] = items.map((item) => {
      const food = foodMap.get(String(item.itemId))
      const price = food?.price || 0
      const calories = food?.calories || 0
      const availableQuantity = food ? Math.max(0, food.stock - (food.reservedStock ?? 0)) : 0
      const isActive = Boolean(food?.isActive)
      const inStock = availableQuantity >= quantities.get(String(item.itemId))!
      if (!isActive || !inStock) {
        issues.push({
          code: !food
            ? 'FOOD_REMOVED'
            : !isActive
              ? 'FOOD_INACTIVE'
              : availableQuantity === 0
                ? 'OUT_OF_STOCK'
                : 'INSUFFICIENT_STOCK',
          message: !isActive
            ? 'Món không còn kinh doanh, hãy xóa khỏi giỏ'
            : `Món chỉ còn ${availableQuantity} phần cho toàn bộ giỏ`,
          lineId: String(item._id)
        })
      }
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
          isActive,
          inStock,
          availableQuantity
        }
      }
    })
    return {
      cartId: cart._id,
      userId: cart.userId,
      cartType,
      version: cart.version,
      items: normalizedItems,
      canCheckout: issues.length === 0,
      issues,
      summary: {
        lineCount: normalizedItems.length,
        itemCount: normalizedItems.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0),
        totalCalories: normalizedItems.reduce((sum, item) => sum + item.lineCalories, 0),
        deliveryDates: [...new Set(items.flatMap((item) => (item.deliveryDate ? [item.deliveryDate] : [])))].sort(),
        // Chưa có địa chỉ thì chưa tính ship; /orders/quote trả phí cụ thể.
        shippingFee: null,
        shippingPolicy: cartType === 'COMBO' ? 'FIRST_DAY_ONLY' : 'PER_ORDER'
      }
    }
  }

  async buildCartSummaryByType(userId: string, cartType: CartTypeValue, session?: ClientSession) {
    if (session) {
      // Checkout chỉ đọc giỏ có sẵn trong transaction; không tạo giỏ rỗng mới.
      const cart = await databaseService.carts.findOne({ userId: new ObjectId(userId) }, { session })
      if (!cart) throw new ErrorWithStatus({ message: USERS_MESSAGES.CART_IS_EMPTY, status: 400 })
      return this.summarize(new Cart(cart), cartType, session)
    }
    return this.summarize(await this.getOrCreateCart(userId), cartType)
  }

  async buildCartSummary(userId: string) {
    const cart = await this.getOrCreateCart(userId)
    // Hai phần response cho UI cũ; DB chỉ có một giỏ, phần còn lại luôn rỗng.
    const [foodCart, comboCart] = await Promise.all([this.summarize(cart, 'FOOD'), this.summarize(cart, 'COMBO')])
    return { currentCart: cart.cartType === 'FOOD' ? foodCart : comboCart, foodCart, comboCart }
  }

  private async checkStock(itemId: ObjectId, quantity: number) {
    const food = await databaseService.foods.findOne({ _id: itemId })
    if (!food?.isActive || !Number.isSafeInteger(quantity) || quantity > food.stock - (food.reservedStock ?? 0)) {
      throw new ErrorWithStatus({
        message: `${food?.name || 'Món ăn'}: ${USERS_MESSAGES.CART_ITEM_NOT_AVAILABLE}`,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
  }

  async addItem(userId: string, payload: AddCartItemReqBody) {
    return this.addItems(userId, { cartType: payload.cartType, version: payload.version, items: [payload] })
  }

  private async checkMealPlan(userId: ObjectId, item: CartItem, session?: ClientSession) {
    if (!item.mealPlanId && !item.mealPlanItemId) return
    if (!item.mealPlanId || !item.mealPlanItemId) {
      throw new ErrorWithStatus({
        message: 'Phải gửi cả mã thực đơn và mã món trong thực đơn',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    const plan = await databaseService.mealPlans.findOne({ _id: item.mealPlanId, userId }, { session })
    const day = plan?.days.find((day) => day.date === item.deliveryDate)
    const meal = day?.meals.find((meal) => meal._id.equals(item.mealPlanItemId!))
    if (
      !plan ||
      (plan.status && plan.status !== 'Draft') ||
      !meal ||
      !meal.foodId.equals(item.itemId) ||
      meal.slot !== item.mealSlot
    ) {
      throw new ErrorWithStatus({
        message: 'Món không khớp thực đơn đang chọn của bạn hoặc thực đơn đã được đặt',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    return plan
  }

  async finishCheckout(
    userId: string,
    cartId: ObjectId,
    version: number,
    items: CartItem[],
    orderId: ObjectId,
    session: ClientSession
  ) {
    // Kiểm tra lại nguồn thực đơn vì người dùng có thể đổi món ở tab khác.
    const plans = new Map<string, MealPlan>()
    for (const item of items) {
      const plan = await this.checkMealPlan(new ObjectId(userId), item, session)
      if (plan) plans.set(String(plan._id), plan)
    }
    for (const plan of plans.values()) {
      const result = await databaseService.mealPlans.updateOne(
        // Đã đọc và kiểm tra Draft trong session; MongoDB sẽ retry nếu có ghi đồng thời vào plan.
        { _id: plan._id, userId: new ObjectId(userId) },
        { $set: { status: 'Ordered', orderId, updatedAt: new Date(), version: (plan.version ?? 0) + 1 } },
        { session }
      )
      if (!result.matchedCount)
        throw new ErrorWithStatus({ message: 'Thực đơn đã thay đổi, vui lòng tải lại', status: 409 })
    }
    const result = await databaseService.carts.updateOne(
      { _id: cartId, userId: new ObjectId(userId), version },
      { $set: { items: [], updatedAt: new Date() }, $inc: { version: 1 } },
      { session }
    )
    if (!result.matchedCount) throw new ErrorWithStatus({ message: 'Giỏ đã thay đổi, vui lòng tải lại', status: 409 })
  }

  async addItems(userId: string, payload: AddCartItemsReqBody) {
    if (!payload.items.length || payload.items.length > MAX_CART_LINES) {
      throw new ErrorWithStatus({
        message: `Mỗi lần thêm từ 1 đến ${MAX_CART_LINES} dòng`,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    const cart = await this.getOrCreateCart(userId)
    this.checkVersion(cart, payload.version)
    const previousVersion = cart.version
    const cartType = payload.cartType ?? cart.cartType
    this.checkMode(cart, cartType)
    cart.cartType = cartType
    const foodIds = new Map<string, ObjectId>()
    for (const input of payload.items) {
      const quantity = Number(input.quantity)
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.CART_QUANTITY_MUST_BE_POSITIVE,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      const item: CartItem = {
        itemId: new ObjectId(input.itemId),
        quantity,
        deliveryDate: input.deliveryDate === undefined ? undefined : this.parseDeliveryDate(input.deliveryDate),
        mealSlot: input.mealSlot,
        mealPlanId: input.mealPlanId ? new ObjectId(input.mealPlanId) : undefined,
        mealPlanItemId: input.mealPlanItemId ? new ObjectId(input.mealPlanItemId) : undefined
      }
      await this.checkMealPlan(cart.userId, item)
      cart.addItem(item)
      foodIds.set(String(item.itemId), item.itemId)
    }
    if (cart.items.length > MAX_CART_LINES) {
      throw new ErrorWithStatus({ message: `Giỏ hàng tối đa ${MAX_CART_LINES} dòng`, status: HTTP_STATUS.BAD_REQUEST })
    }
    const issues = this.getScheduleIssues(cart, false)
    if (issues.length) throw new ErrorWithStatus({ message: issues[0].message, status: HTTP_STATUS.BAD_REQUEST })
    for (const itemId of foodIds.values()) {
      const total = cart.items
        .filter((item) => item.itemId.equals(itemId))
        .reduce((sum, item) => sum + item.quantity, 0)
      await this.checkStock(itemId, total)
    }
    // Ghi một lần sau khi tất cả dòng hợp lệ, tránh thêm gói tuần dở dang.
    await this.saveCart(cart, previousVersion)
    return this.summarize(cart, cartType)
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

  async updateItem(userId: string, lineId: string, payload: UpdateCartItemReqBody) {
    const cart = await this.getOrCreateCart(userId)
    this.checkVersion(cart, payload.version)
    const line = this.findLine(cart, lineId)
    const quantity = payload.quantity === undefined ? line.quantity : Number(payload.quantity)
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.CART_QUANTITY_MUST_BE_ZERO_OR_POSITIVE,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    const previousVersion = cart.version
    cart.items = cart.items.filter((item) => item !== line)
    if (quantity > 0) {
      const updated: CartItem = {
        ...line,
        quantity,
        deliveryDate:
          payload.deliveryDate === undefined
            ? line.deliveryDate
            : payload.deliveryDate === null
              ? undefined
              : this.parseDeliveryDate(payload.deliveryDate),
        mealSlot: payload.mealSlot === undefined ? line.mealSlot : (payload.mealSlot ?? undefined)
      }
      await this.checkMealPlan(cart.userId, updated)
      // Đổi ngày/bữa trùng dòng khác thì gộp số lượng, giữ mã dòng đích.
      cart.addItem(updated)
      const issues = this.getScheduleIssues(cart, false)
      if (issues.length) throw new ErrorWithStatus({ message: issues[0].message, status: HTTP_STATUS.BAD_REQUEST })
      const total = cart.items
        .filter((item) => item.itemId.equals(line.itemId))
        .reduce((sum, item) => sum + item.quantity, 0)
      await this.checkStock(line.itemId, total)
    }
    await this.saveCart(cart, previousVersion)
    return this.summarize(cart, cart.cartType)
  }

  async removeItem(userId: string, lineId: string, version?: number) {
    return this.updateItem(userId, lineId, { quantity: 0, version })
  }

  async changeMode(userId: string, payload: ChangeCartModeReqBody) {
    const cart = await this.getOrCreateCart(userId)
    this.checkVersion(cart, payload.version)
    this.checkMode(cart, payload.cartType)
    if (cart.cartType !== payload.cartType) {
      cart.cartType = payload.cartType
      await this.saveCart(cart, cart.version)
    }
    return this.summarize(cart, cart.cartType)
  }

  async clearCartByType(userId: string, cartType: CartTypeValue, version?: number) {
    const cart = await this.getOrCreateCart(userId)
    this.checkVersion(cart, version)
    if (cart.cartType === cartType && cart.items.length) {
      cart.items = []
      await this.saveCart(cart, cart.version)
    }
    return this.buildCartSummaryByType(userId, cartType)
  }

  async clearCart(userId: string, version?: number) {
    const cart = await this.getOrCreateCart(userId)
    this.checkVersion(cart, version)
    if (cart.items.length) {
      cart.items = []
      await this.saveCart(cart, cart.version)
    }
    return this.buildCartSummary(userId)
  }

  async refreshCart(userId: string) {
    return this.buildCartSummary(userId)
  }
}

export default new CartService()
