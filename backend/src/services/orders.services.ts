import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { ErrorWithStatus } from '~/models/Errors'
import {
  CreateOrderReqBody,
  QuoteOrderReqBody,
  RetryPaymentReqBody,
  UpdateOrderStatusReqBody,
  UpdatePaymentStatusReqBody
} from '~/models/requests/CartOrder.request'
import Order, { DeliveryPeriod, OrderStatus, PackageType, ShippingBreakdown } from '~/models/schemas/Order.schema'
import { PAYMENT_TIMEOUT_MINUTES, toLocalDate } from '~/models/schemas/common'
import { UserRole } from '~/models/schemas/User.schema'
import { CartTypeValue } from '~/models/schemas/Cart.schema'
import cartService from '~/services/cart.services'
import databaseService from '~/services/database.services'
import trackingService from '~/services/tracking.services'
import settingsService from '~/services/settings.services'
import weeklyOrders from '~/services/weekly-orders.services'
import { getKitchenCutoff, parseDeliveryStart } from '~/utils/delivery'

const COMBO_FREE_KM = 5
const COMBO_FLAT_FEE = 20000
const FOOD_FREE_KM = 2
const FOOD_EXTRA_PER_KM = 5000
const DEFAULT_SHIPPING_ORIGIN_LAT = 10.771638
const DEFAULT_SHIPPING_ORIGIN_LON = 106.657018
const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org/search'
const OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org'
const DEFAULT_NOMINATIM_USER_AGENT = 'ECommerce_Student_Project/1.0'

class OrdersService {
  private readonly WEEKLY_PACKAGE_DAYS = 7

  private calculateShippingForDistance(distanceKm: number, cartType: CartTypeValue): ShippingBreakdown {
    if (!Number.isFinite(distanceKm) || distanceKm < 0) {
      throw new ErrorWithStatus({ message: 'distanceKm phải là số hữu hạn không âm', status: HTTP_STATUS.BAD_REQUEST })
    }
    const normalizedDistance = Math.max(0, distanceKm)
    const distanceRounded = Number(normalizedDistance.toFixed(2))

    if (cartType === 'COMBO') {
      if (normalizedDistance < COMBO_FREE_KM) {
        return {
          baseFee: 0,
          extraFee: 0,
          totalFee: 0,
          distanceKm: distanceRounded
        }
      }

      return {
        baseFee: COMBO_FLAT_FEE,
        extraFee: 0,
        totalFee: COMBO_FLAT_FEE,
        distanceKm: distanceRounded
      }
    }

    if (normalizedDistance <= FOOD_FREE_KM) {
      return {
        baseFee: 0,
        extraFee: 0,
        totalFee: 0,
        distanceKm: distanceRounded
      }
    }

    const extraDistance = Math.max(0, normalizedDistance - FOOD_FREE_KM)
    const extraFee = Math.ceil(extraDistance) * FOOD_EXTRA_PER_KM

    return {
      baseFee: 0,
      extraFee,
      totalFee: extraFee,
      distanceKm: distanceRounded
    }
  }

  private getOriginCoords() {
    const lat = Number(process.env.SHIPPING_ORIGIN_LAT)
    const lon = Number(process.env.SHIPPING_ORIGIN_LON)

    return {
      lat: Number.isFinite(lat) ? lat : DEFAULT_SHIPPING_ORIGIN_LAT,
      lon: Number.isFinite(lon) ? lon : DEFAULT_SHIPPING_ORIGIN_LON
    }
  }

  private async geocodeAddress(address: string): Promise<{ lat: number; lon: number }> {
    const query = new URLSearchParams({
      format: 'json',
      limit: '1',
      q: address
    })
    const userAgent = process.env.NOMINATIM_USER_AGENT?.trim() || DEFAULT_NOMINATIM_USER_AGENT

    let response
    try {
      response = await fetch(`${NOMINATIM_BASE_URL}?${query.toString()}`, {
        headers: {
          'User-Agent': userAgent
        }
      })
    } catch {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.DISTANCE_GEOCODE_FAILED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (!response.ok) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.DISTANCE_GEOCODE_FAILED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.DISTANCE_GEOCODE_NOT_FOUND,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const lat = Number.parseFloat(data[0].lat)
    const lon = Number.parseFloat(data[0].lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.DISTANCE_GEOCODE_NOT_FOUND,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    console.info('[shipping] geocode result', {
      address,
      lat,
      lon
    })

    return { lat, lon }
  }

  private async getDistanceKmFromAddress(destinationAddress: string): Promise<number> {
    const originCoords = this.getOriginCoords()
    const destCoords = await this.geocodeAddress(destinationAddress)
    const osrmUrl = `${OSRM_BASE_URL}/route/v1/driving/${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}?overview=false`

    let response
    try {
      response = await fetch(osrmUrl)
    } catch {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.DISTANCE_ROUTE_FAILED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (!response.ok) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.DISTANCE_ROUTE_FAILED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const data = await response.json()
    const distanceMeters = data?.routes?.[0]?.distance
    if (data?.code !== 'Ok' || typeof distanceMeters !== 'number') {
      console.warn('[shipping] osrm response invalid', {
        code: data?.code,
        routes: Array.isArray(data?.routes) ? data.routes.length : 0,
        distanceMeters
      })
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.DISTANCE_ROUTE_NOT_FOUND,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const distanceKm = distanceMeters / 1000
    console.info('[shipping] osrm distance', {
      origin: originCoords,
      destination: destCoords,
      distanceKm
    })

    return distanceKm
  }

  private buildDeliverySchedule(startDate: Date, packageType: PackageType): Date[] {
    if (packageType === 'WEEKLY_7D') {
      return Array.from({ length: this.WEEKLY_PACKAGE_DAYS }).map((_, index) => {
        const date = new Date(startDate)
        // Dùng UTC để múi giờ của server không làm lệch giờ giao giữa các ngày.
        date.setUTCDate(startDate.getUTCDate() + index)
        return date
      })
    }

    return [startDate]
  }

  private async getRequestUser(userId: string) {
    const user = await databaseService.users.findOne(
      { _id: new ObjectId(userId) },
      { projection: { role: 1, account_status: 1 } }
    )

    if (!user) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return user
  }

  private resolveOrderCartType(payload: QuoteOrderReqBody): CartTypeValue {
    const packageType: PackageType = payload.packageType || 'ONE_DAY'
    const cartType: CartTypeValue = payload.cartType || (packageType === 'WEEKLY_7D' ? 'COMBO' : 'FOOD')

    if ((packageType === 'WEEKLY_7D') !== (cartType === 'COMBO')) {
      throw new ErrorWithStatus({
        message: 'Chế độ FOOD dùng ONE_DAY, chế độ COMBO dùng WEEKLY_7D',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    return cartType
  }

  async quoteOrder(userId: string, payload: QuoteOrderReqBody) {
    const cartType = this.resolveOrderCartType(payload)
    const cart = await cartService.buildCartSummaryByType(userId, cartType)
    if (!cart.items.length) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.CART_IS_EMPTY,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (!cart.canCheckout) {
      throw Object.assign(new ErrorWithStatus({ message: cart.issues[0].message, status: HTTP_STATUS.BAD_REQUEST }), {
        issues: cart.issues,
        ...(cartType === 'COMBO' ? { replacements: await weeklyOrders.getCartReplacements(userId, cart.items) } : {})
      })
    }

    const packageType: PackageType = payload.packageType || 'ONE_DAY'
    const deliveryDate = parseDeliveryStart(payload.deliveryDate, payload.deliveryTime)
    const now = new Date()
    if (deliveryDate <= now) {
      throw new ErrorWithStatus({ message: 'Ngày giao đã qua, hãy chọn lại ngày', status: HTTP_STATUS.BAD_REQUEST })
    }
    const schedule = this.buildDeliverySchedule(deliveryDate, packageType)
    const rules = packageType === 'WEEKLY_7D' ? await settingsService.getCommerceRules() : undefined
    const cutoffs = rules ? schedule.map((date) => getKitchenCutoff(date, rules)) : []
    if (cutoffs.some((cutoff) => cutoff <= now)) {
      throw new ErrorWithStatus({
        message: 'Đã quá giờ chốt bếp của ngày đầu, hãy chọn gói bắt đầu muộn hơn',
        status: 400
      })
    }
    const distanceKm =
      payload.distanceKm !== undefined
        ? Number(payload.distanceKm)
        : await this.getDistanceKmFromAddress(payload.deliveryAddress)

    const shippingBreakdown = this.calculateShippingForDistance(distanceKm, cartType)
    if (cart.items.some((item) => !item.availability.isActive || !item.availability.inStock)) {
      throw new ErrorWithStatus({
        message: 'Giỏ có món ngừng bán hoặc không đủ tồn kho',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    const dates = schedule.map((date) => toLocalDate(date))
    if (
      cart.items.some((item) => (item.deliveryDate ? !dates.includes(item.deliveryDate) : packageType === 'WEEKLY_7D'))
    ) {
      throw new ErrorWithStatus({
        message: 'Ngày giao trong giỏ không khớp lịch đặt hàng',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    const initialStatus: OrderStatus =
      packageType === 'WEEKLY_7D' && payload.paymentMethod === 'COD' ? 'Confirmed' : 'Pending'
    const deliveries: DeliveryPeriod[] = schedule.map((scheduledAt, index) => {
      const date = dates[index]
      const lines = cart.items.filter(
        (item) => item.deliveryDate === date || (!item.deliveryDate && packageType === 'ONE_DAY')
      )
      if (!lines.length) {
        throw new ErrorWithStatus({ message: `Chưa có món cho ngày ${date}`, status: HTTP_STATUS.BAD_REQUEST })
      }
      return {
        _id: new ObjectId(),
        date,
        scheduledAt,
        cutoffAt: cutoffs[index],
        items: lines.map((item) => ({
          _id: new ObjectId(),
          foodId: item.itemId,
          foodName: item.itemName,
          image: item.image || undefined,
          quantity: item.quantity,
          price: item.unitPrice,
          calories: item.unitCalories,
          nutrition: item.nutrition,
          mealSlot: item.mealSlot,
          mealPlanId: item.mealPlanId,
          mealPlanItemId: item.mealPlanItemId
        })),
        status: initialStatus,
        statusHistory: [{ status: initialStatus, changedAt: now }],
        subtotal: lines.reduce((sum, item) => sum + item.lineTotal, 0),
        shipping:
          index === 0 ? { ...shippingBreakdown } : { ...shippingBreakdown, baseFee: 0, extraFee: 0, totalFee: 0 },
        waivedShippingFee: index === 0 ? 0 : shippingBreakdown.totalFee,
        refundedAmount: 0
      }
    })
    const shippingBreakdowns = deliveries.map((delivery) => delivery.shipping)
    const shippingFee = shippingBreakdowns.reduce((sum, item) => sum + item.totalFee, 0)
    const subtotal = deliveries.reduce((sum, delivery) => sum + delivery.subtotal, 0)
    const totalCalories = cart.summary.totalCalories
    const customer = rules
      ? await databaseService.users.findOne({ _id: new ObjectId(userId) }, { projection: { healthProfile: 1 } })
      : null

    return {
      cart,
      deliveries,
      cancellationPolicy: rules?.cancellationPolicy,
      targetCaloriesSnapshot: customer?.healthProfile?.targetCalories,
      pricing: {
        subtotal,
        shippingFee,
        grandTotal: subtotal + shippingFee,
        shippingBreakdowns,
        totalCalories,
        waivedShippingFee: deliveries.reduce((sum, delivery) => sum + delivery.waivedShippingFee, 0)
      },
      delivery: {
        address: payload.deliveryAddress,
        schedule,
        daysCount: schedule.length,
        packageType,
        cartType
      },
      payment: {
        method: payload.paymentMethod
      },
      note: payload.note || ''
    }
  }

  async createOrder(userId: string, payload: CreateOrderReqBody) {
    const quote = await this.quoteOrder(userId, payload)
    const now = new Date()
    const orderId = new ObjectId()
    const order: Order = {
      _id: orderId,
      userId: new ObjectId(userId),
      orderCode: orderId.toHexString().toUpperCase(),
      packageType: quote.delivery.packageType,
      deliveries: quote.deliveries,
      subtotal: quote.pricing.subtotal,
      shippingFee: quote.pricing.shippingFee,
      grandTotal: quote.pricing.grandTotal,
      status: quote.deliveries[0].status,
      statusHistory: [{ status: quote.deliveries[0].status, changedAt: now }],
      deliveryAddress: payload.deliveryAddress,
      note: payload.note || '',
      payment: { method: payload.paymentMethod, status: 'Pending' },
      cancellationPolicy: quote.cancellationPolicy,
      targetCaloriesSnapshot: quote.targetCaloriesSnapshot,
      // Chỉ chuyển Held khi service thực sự giữ kho trong transaction.
      inventoryHold: { status: 'NotReserved', items: [] },
      paymentDueAt:
        payload.paymentMethod === 'COD' ? undefined : new Date(now.getTime() + PAYMENT_TIMEOUT_MINUTES * 60000),
      version: 0,
      createdAt: now,
      updatedAt: now
    }
    await databaseService.orders.insertOne(order)
    await cartService.clearCartByType(userId, quote.delivery.cartType)
    return { ...weeklyOrders.describeOrder(order), orderId }
  }

  async getMyOrders(userId: string) {
    const orders = await databaseService.orders
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray()
    return orders.map((order) => weeklyOrders.describeOrder(order))
  }

  async getMyOrderDetail(userId: string, orderId: string) {
    const user = await this.getRequestUser(userId)
    const canReadAll = [UserRole.ADMIN, UserRole.MANAGER].includes(user.role)
    const order = await databaseService.orders.findOne({
      _id: new ObjectId(orderId),
      ...(canReadAll ? {} : { userId: new ObjectId(userId) })
    })
    if (!order) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }
    return weeklyOrders.describeOrder(order)
  }

  async cancelOrder(userId: string, orderId: string) {
    const user = await this.getRequestUser(userId)

    const order = await databaseService.orders.findOne({ _id: new ObjectId(orderId) })
    if (!order) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const isOwner = String(order.userId) === userId

    if (order.packageType === 'WEEKLY_7D') {
      if (user.role !== UserRole.ADMIN && !isOwner) {
        throw new ErrorWithStatus({ message: USERS_MESSAGES.ORDER_NOT_FOUND, status: 404 })
      }
      throw new ErrorWithStatus({
        message: 'Gói tuần cần hủy theo từng ngày để tính đúng tiền hoàn và tồn kho',
        status: 400
      })
    }

    if (user.role === UserRole.CUSTOMER) {
      if (!isOwner) {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.ORDER_NOT_FOUND,
          status: HTTP_STATUS.NOT_FOUND
        })
      }

      if (order.status !== 'Pending') {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.CUSTOMER_CAN_ONLY_CANCEL_PENDING_ORDER,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
    }

    if (user.role === UserRole.ADMIN) {
      if (order.status === 'Completed' || order.status === 'Cancelled') {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.ORDER_CAN_NOT_BE_CANCELLED,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.CUSTOMER) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.NOT_AUTHORIZED,
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    const cancelledAt = new Date()
    const cancelledBy = user.role === UserRole.ADMIN ? ('Admin' as const) : ('Customer' as const)
    const deliveries = order.deliveries.map((delivery) => {
      if (delivery.status === 'Completed' || delivery.status === 'Cancelled') return delivery
      return {
        ...delivery,
        status: 'Cancelled' as const,
        statusHistory: [
          ...delivery.statusHistory,
          { status: 'Cancelled' as const, changedAt: cancelledAt, actorId: user._id }
        ],
        cancellation: { cancelledAt, cancelledBy, reason: 'Order cancelled' }
      }
    })
    const result = await databaseService.orders.updateOne(
      { _id: order._id, status: order.status, version: order.version },
      {
        $set: { status: 'Cancelled', cancelledBy, cancelledAt, deliveries },
        $push: { statusHistory: { status: 'Cancelled', changedAt: cancelledAt, actorId: user._id } },
        $inc: { version: 1 },
        $currentDate: { updatedAt: true }
      }
    )
    if (!result.matchedCount) {
      throw new ErrorWithStatus({ message: 'Order changed; please reload', status: HTTP_STATUS.CONFLICT })
    }

    return {
      message: USERS_MESSAGES.CANCEL_ORDER_SUCCESS
    }
  }

  private assertAdmin(userRole: UserRole) {
    if (userRole !== UserRole.ADMIN) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.NOT_AUTHORIZED,
        status: HTTP_STATUS.FORBIDDEN
      })
    }
  }

  // Admin lấy toàn bộ đơn hàng
  async getAllOrders(adminUserId: string) {
    // 1. Kiểm tra xem người gọi API có phải Admin không
    const admin = await this.getRequestUser(adminUserId)
    if (![UserRole.ADMIN, UserRole.MANAGER].includes(admin.role)) {
      throw new ErrorWithStatus({ status: 403, message: USERS_MESSAGES.NOT_AUTHORIZED })
    }

    // 2. Lấy toàn bộ đơn hàng, sắp xếp mới nhất lên đầu
    const orders = await databaseService.orders.find({}).sort({ createdAt: -1 }).toArray()
    return orders.map((order) => weeklyOrders.describeOrder(order))
  }

  private canTransition(current: OrderStatus, next: Exclude<OrderStatus, 'Pending' | 'Cancelled'>) {
    if (current === 'Pending' && next === 'Cooking') return true
    if (current === 'Cooking' && next === 'Delivering') return true
    if (current === 'Delivering' && next === 'Completed') return true
    return false
  }

  async updateOrderStatus(adminUserId: string, orderId: string, payload: UpdateOrderStatusReqBody) {
    const admin = await this.getRequestUser(adminUserId)
    this.assertAdmin(admin.role)

    const order = await databaseService.orders.findOne({ _id: new ObjectId(orderId) })
    if (!order) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (order.packageType === 'WEEKLY_7D') {
      throw new ErrorWithStatus({ message: 'Gói tuần phải cập nhật trạng thái từng ngày giao', status: 400 })
    }

    if (order.status === 'Cancelled' || order.status === 'Completed') {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ORDER_STATUS_UPDATE_NOT_ALLOWED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (!this.canTransition(order.status, payload.status)) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ORDER_STATUS_TRANSITION_INVALID,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const changedAt = new Date()
    const deliveries = order.deliveries.map((delivery) => {
      if (delivery.status === 'Cancelled' || delivery.status === 'Completed') return delivery
      return {
        ...delivery,
        status: payload.status,
        statusHistory: [...delivery.statusHistory, { status: payload.status, changedAt, actorId: admin._id }]
      }
    })
    const result = await databaseService.orders.updateOne(
      { _id: order._id, status: order.status, version: order.version },
      {
        $set: { status: payload.status, deliveries },
        $push: { statusHistory: { status: payload.status, changedAt, actorId: admin._id } },
        $inc: { version: 1 },
        $currentDate: { updatedAt: true }
      }
    )
    if (!result.matchedCount) {
      throw new ErrorWithStatus({ message: 'Đơn đã thay đổi, vui lòng tải lại', status: HTTP_STATUS.CONFLICT })
    }
    if (payload.status === 'Completed') {
      await trackingService.recordOrderCalories(String(order.userId), { ...order, deliveries })
    }

    return {
      message: USERS_MESSAGES.ORDER_STATUS_UPDATED_SUCCESS
    }
  }

  async retryPayment(userId: string, orderId: string, payload: RetryPaymentReqBody) {
    const order = await databaseService.orders.findOne({ _id: new ObjectId(orderId), userId: new ObjectId(userId) })
    if (!order) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (order.status === 'Cancelled' || order.status === 'Completed') {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ORDER_STATUS_UPDATE_NOT_ALLOWED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (
      order.packageType === 'WEEKLY_7D' &&
      (order.status !== 'Pending' ||
        !['Pending', 'Failed'].includes(order.payment.status) ||
        order.payment.method === 'COD' ||
        payload.paymentMethod === 'COD' ||
        order.deliveries.some((day) => day.status === 'Cancelled') ||
        !order.paymentDueAt ||
        order.paymentDueAt <= new Date())
    ) {
      throw new ErrorWithStatus({
        message: 'Gói tuần không đủ điều kiện thanh toán lại; đơn đã hủy ngày cần đối soát số tiền trước',
        status: 400
      })
    }

    const result = await databaseService.orders.updateOne(
      { _id: order._id, version: order.version },
      {
        $set: {
          payment: {
            ...order.payment,
            method: payload.paymentMethod || order.payment.method,
            status: 'Pending'
          }
        },
        $inc: { version: 1 },
        $currentDate: { updatedAt: true }
      }
    )

    if (!result.matchedCount) throw new ErrorWithStatus({ message: 'Đơn đã thay đổi, vui lòng tải lại', status: 409 })

    return {
      message: USERS_MESSAGES.RETRY_PAYMENT_SUCCESS
    }
  }

  async updatePaymentStatus(adminUserId: string, orderId: string, payload: UpdatePaymentStatusReqBody) {
    const admin = await this.getRequestUser(adminUserId)
    this.assertAdmin(admin.role)

    const order = await databaseService.orders.findOne({ _id: new ObjectId(orderId) })
    if (!order) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (order.packageType === 'WEEKLY_7D') {
      throw new ErrorWithStatus({
        message:
          'Gói tuần cần cập nhật tiền qua IPN hoặc đối soát COD/hoàn tiền, không sửa trạng thái thanh toán thủ công',
        status: 400
      })
    }

    await databaseService.orders.updateOne(
      { _id: order._id },
      {
        $set: {
          payment: {
            method: order.payment.method,
            status: payload.status,
            transactionId: payload.transactionId || order.payment.transactionId
          }
        },
        $currentDate: { updatedAt: true }
      }
    )

    return {
      message: USERS_MESSAGES.PAYMENT_STATUS_UPDATED_SUCCESS,
      statusKept: order.status
    }
  }
}

const ordersService = new OrdersService()
export default ordersService
