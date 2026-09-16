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
import Order, { OrderStatus, PackageType, ShippingBreakdown } from '~/models/schemas/Order.schema'
import { UserRole } from '~/models/schemas/User.schema'
import { CartTypeValue } from '~/models/schemas/Cart.schema'
import cartService from '~/services/cart.services'
import databaseService from '~/services/database.services'
import trackingService from '~/services/tracking.services'

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

  private toValidDate(value: string, invalidMessage: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new ErrorWithStatus({
        message: invalidMessage,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    return date
  }

  private buildDeliverySchedule(startDate: Date, packageType: PackageType): Date[] {
    if (packageType === 'WEEKLY_7D') {
      return Array.from({ length: this.WEEKLY_PACKAGE_DAYS }).map((_, index) => {
        const date = new Date(startDate)
        date.setDate(startDate.getDate() + index)
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

    if (packageType === 'WEEKLY_7D' && cartType !== 'COMBO') {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.WEEKLY_PACKAGE_REQUIRES_COMBO_CART,
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

    const packageType: PackageType = payload.packageType || 'ONE_DAY'
    const deliveryDate = this.toValidDate(payload.deliveryDate, USERS_MESSAGES.DELIVERY_DATE_IS_REQUIRED)
    const schedule = this.buildDeliverySchedule(deliveryDate, packageType)
    const distanceKm =
      payload.distanceKm !== undefined
        ? Number(payload.distanceKm)
        : await this.getDistanceKmFromAddress(payload.deliveryAddress)
    console.info('[shipping] quote inputs', {
      address: payload.deliveryAddress,
      cartType,
      distanceKm
    })

    const shippingBreakdown = this.calculateShippingForDistance(distanceKm, cartType)
    console.info('[shipping] breakdown', shippingBreakdown)
    const shippingBreakdowns = schedule.map(() => shippingBreakdown)
    const shippingFee = shippingBreakdowns.reduce((sum, item) => sum + item.totalFee, 0)
    const subtotal = cart.summary.subtotal * schedule.length
    const totalCalories = cart.summary.totalCalories * schedule.length

    return {
      cart,
      pricing: {
        subtotal,
        shippingFee,
        grandTotal: subtotal + shippingFee,
        shippingBreakdowns,
        totalCalories
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

    const items = quote.delivery.schedule.flatMap((deliveryDate) =>
      quote.cart.items.map((item) => ({
        itemId: new ObjectId(String(item.itemId)),
        quantity: item.quantity,
        price: item.unitPrice,
        calories: item.unitCalories,
        deliveryDate: new Date(deliveryDate)
      }))
    )

    const order = new Order({
      userId: new ObjectId(userId),
      items,
      packageType: quote.delivery.packageType,
      deliverySchedule: quote.delivery.schedule,
      shippingBreakdowns: quote.pricing.shippingBreakdowns,
      subtotal: quote.pricing.subtotal,
      shippingFee: quote.pricing.shippingFee,
      grandTotal: quote.pricing.grandTotal,
      status: 'Pending',
      deliveryAddress: payload.deliveryAddress,
      note: payload.note || '',
      payment: {
        method: payload.paymentMethod,
        status: 'Pending'
      }
    })

    const inserted = await databaseService.orders.insertOne(order)
    await cartService.clearCartByType(userId, quote.delivery.cartType)

    return {
      orderId: inserted.insertedId,
      ...order
    }
  }

  async getMyOrders(userId: string) {
    return databaseService.orders
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .toArray()
  }

  async getMyOrderDetail(userId: string, orderId: string) {
    const order = await databaseService.orders.findOne({ _id: new ObjectId(orderId), userId: new ObjectId(userId) })
    if (!order) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }
    return order
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

    await databaseService.orders.updateOne(
      { _id: order._id },
      {
        $set: {
          status: 'Cancelled',
          cancelledBy: user.role === UserRole.ADMIN ? 'Admin' : 'Customer',
          cancelledAt: new Date()
        },
        $currentDate: { updatedAt: true }
      }
    )

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
    this.assertAdmin(admin.role)

    // 2. Lấy toàn bộ đơn hàng, sắp xếp mới nhất lên đầu
    return databaseService.orders.find({}).sort({ createdAt: -1 }).toArray()
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

    await databaseService.orders.updateOne(
      { _id: order._id },
      {
        $set: {
          status: payload.status
        },
        $currentDate: { updatedAt: true }
      }
    )

    if (payload.status === 'Completed') {
      await trackingService.recordOrderCalories(String(order.userId), order)
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

    await databaseService.orders.updateOne(
      { _id: order._id },
      {
        $set: {
          payment: {
            ...order.payment,
            method: payload.paymentMethod || order.payment.method,
            status: 'Pending'
          }
        },
        $currentDate: { updatedAt: true }
      }
    )

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
