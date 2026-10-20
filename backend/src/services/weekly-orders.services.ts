import { adminExceptionReason } from '~/utils/permissions'
import { aggregateOrderStatus } from '~/utils/order-status'
import { ClientSession, ObjectId } from 'mongodb'
import { ErrorWithStatus } from '~/models/Errors'
import Order, { DeliveryPeriod, OrderStatus } from '~/models/schemas/Order.schema'
import Food from '~/models/schemas/Food.schema'
import User, { UserRole } from '~/models/schemas/User.schema'
import { normalizeSearchText, toLocalDate } from '~/models/schemas/common'
import { CancelDeliveryReqBody, UpdateDeliveryStatusReqBody } from '~/models/requests/CartOrder.request'
import database from './database.services'
import tracking from './tracking.services'
import inventory from './inventory.services'
import { CartSummaryItem } from './cart.services'
import cancellations from './cancellation.services'

class WeeklyOrdersService {
  private dayNutrition(delivery: DeliveryPeriod) {
    return delivery.items.reduce(
      (total, item) => ({
        calories: total.calories + item.calories * item.quantity,
        protein: total.protein + item.nutrition.protein * item.quantity,
        carb: total.carb + item.nutrition.carb * item.quantity,
        fat: total.fat + item.nutrition.fat * item.quantity
      }),
      { calories: 0, protein: 0, carb: 0, fat: 0 }
    )
  }

  private canEdit(order: Order, delivery: DeliveryPeriod) {
    return (
      ['Pending', 'Confirmed'].includes(order.status) &&
      ['Pending', 'Confirmed'].includes(delivery.status) &&
      Boolean(delivery.cutoffAt && delivery.cutoffAt > new Date())
    )
  }

  private getAmounts(order: Order) {
    const creditedAmount =
      order.status === 'Rejected'
        ? order.grandTotal
        : order.deliveries.reduce((sum, day) => sum + (day.cancellation?.creditedAmount || 0), 0)
    const requested =
      order.status === 'Rejected'
        ? order.payment.paidAmount || 0
        : order.deliveries.reduce((sum, day) => sum + (day.cancellation?.refundAmount || 0), 0)
    const refundedAmount =
      order.payment.refundedAmount ??
      (order.payment.status === 'Refunded'
        ? order.grandTotal
        : order.deliveries.reduce((sum, day) => sum + day.refundedAmount, 0))
    const paidAmount =
      order.payment.paidAmount ??
      (['Paid', 'PartiallyRefunded', 'Refunded'].includes(order.payment.status) ? order.grandTotal : 0)
    const payableTotal = Math.max(0, order.grandTotal - creditedAmount)
    const pendingRefundAmount = Math.max(0, requested - refundedAmount)
    return {
      creditedAmount,
      payableTotal,
      paidAmount,
      refundedAmount,
      pendingRefundAmount,
      amountDue: Math.max(0, payableTotal - paidAmount + refundedAmount + pendingRefundAmount)
    }
  }

  describeOrder(order: Order) {
    if (order.packageType !== 'WEEKLY_7D') return order
    return {
      ...order,
      amounts: this.getAmounts(order),
      waivedShippingFee: order.deliveries.reduce((sum, day) => sum + day.waivedShippingFee, 0),
      deliveries: order.deliveries.map((day) => ({
        ...day,
        grandTotal: day.subtotal + day.shipping.totalFee,
        nutritionTotals: this.dayNutrition(day),
        // COD preview decides self-cancel vs Manager approval from the per-day ledger.
        canCancel:
          order.payment.method === 'COD'
            ? !['Cancelled', 'Completed', 'Rejected'].includes(order.status) &&
              ['Pending', 'Confirmed'].includes(day.status) &&
              Boolean(day.cutoffAt && day.cutoffAt > new Date()) &&
              order.inventoryHold.status === 'Committed' &&
              !order.cancellationRequests?.some(
                (request) =>
                  request.status === 'Pending' &&
                  (request.scope === 'Order' || request.deliveryIds.some((key) => key.equals(day._id)))
              )
            : this.canEdit(order, day) && Boolean(order.cancellationPolicy)
      }))
    }
  }

  private async getContext(userId: string, orderId: string, deliveryId: string, session?: ClientSession) {
    const actor = await database.users.findOne({ _id: new ObjectId(userId) }, { session })
    if (!actor || ![UserRole.CUSTOMER, UserRole.ADMIN].includes(actor.role)) {
      throw new ErrorWithStatus({ message: 'Không có quyền sửa ngày giao', status: 403 })
    }
    const order = await database.orders.findOne(
      {
        _id: new ObjectId(orderId),
        ...(actor.role === UserRole.ADMIN ? {} : { userId: actor._id })
      },
      { session }
    )
    if (!order || order.packageType !== 'WEEKLY_7D') {
      throw new ErrorWithStatus({ message: 'Không tìm thấy gói tuần', status: 404 })
    }
    const delivery = order.deliveries.find((day) => day._id.equals(new ObjectId(deliveryId)))
    if (!delivery) throw new ErrorWithStatus({ message: 'Không tìm thấy ngày giao trong gói', status: 404 })
    return { actor, order, delivery }
  }

  private checkVersion(order: Order, version: number) {
    if (order.version !== version)
      throw new ErrorWithStatus({ message: 'Đơn đã thay đổi, vui lòng tải lại', status: 409 })
  }

  private checkEditable(order: Order, delivery: DeliveryPeriod) {
    if (!this.canEdit(order, delivery)) {
      throw new ErrorWithStatus({
        message: 'Ngày giao đã chốt bếp hoặc đang được xử lý, không thể hủy',
        status: 400
      })
    }
  }

  private isFoodAllowed(food: Food, customer: User) {
    const profile = customer.healthProfile
    // Hồ sơ cũ gộp cả kiêng kỵ trong allergies; vẫn đọc được cả hai trường.
    const restrictions = [...(profile?.allergies || []), ...(profile?.dietaryRestrictions || [])]
      .flatMap((rule) => rule.split(/[,/]/))
      .map(normalizeSearchText)
      .filter(Boolean)
    const tags = food.tags.map(normalizeSearchText)
    const ingredientText = food.ingredients.flatMap((item) => [item.name, ...item.allergyTags]).map(normalizeSearchText)
    for (const rule of restrictions) {
      if (['vegan', 'an chay'].includes(rule)) {
        if (!tags.includes('vegan')) return false
      } else if (rule && [...tags, ...ingredientText].some((text) => text.includes(rule))) return false
    }
    return true
  }

  async getCartReplacements(userId: string, items: CartSummaryItem[]) {
    const unavailable = items.filter((item) => !item.availability.isActive || !item.availability.inStock)
    if (!unavailable.length) return []
    const customer = await database.users.findOne({ _id: new ObjectId(userId) })
    const foods = customer ? await database.foods.find({ isActive: true }).toArray() : []
    return unavailable.map((item) => {
      const dayCalories = items
        .filter((line) => line.deliveryDate === item.deliveryDate)
        .reduce((sum, line) => sum + line.lineCalories, 0)
      const target = customer?.healthProfile?.targetCalories || dayCalories
      const alternatives = foods
        .filter((food) => {
          if (!customer || food._id?.equals(item.itemId) || !this.isFoodAllowed(food, customer)) return false
          if (!item.unitCalories || Math.abs(food.calories - item.unitCalories) > item.unitCalories * 0.15) return false
          const nextCalories = dayCalories + (food.calories - item.unitCalories) * item.quantity
          if (Math.abs(nextCalories - target) > target * 0.1) return false
          const alreadyInCart = items
            .filter((line) => line.itemId.equals(food._id!))
            .reduce((sum, line) => sum + line.quantity, 0)
          return food.stock - (food.reservedStock ?? 0) >= alreadyInCart + item.quantity
        })
        .sort((a, b) => {
          const score = (food: Food) =>
            Math.abs(food.calories - item.unitCalories) +
            Math.abs(food.nutrition.protein - item.nutrition.protein) +
            Math.abs(food.nutrition.carb - item.nutrition.carb) +
            Math.abs(food.nutrition.fat - item.nutrition.fat)
          return score(a) - score(b)
        })
        .slice(0, 5)
        .map((food) => ({
          foodId: food._id,
          name: food.name,
          price: food.price,
          calories: food.calories,
          nutrition: food.nutrition,
          image: food.images[0] || null
        }))
      return {
        lineId: item._id,
        deliveryDate: item.deliveryDate,
        itemName: item.itemName,
        alternatives,
        message: alternatives.length ? 'Chọn món thay thế rồi cập nhật giỏ và tính lại giá' : 'Hết món thay thế phù hợp'
      }
    })
  }

  private async saveOrder(order: Order, actor: User, session: ClientSession) {
    const status = aggregateOrderStatus(order.deliveries)
    if (status !== order.status) order.statusHistory.push({ status, changedAt: new Date(), actorId: actor._id })
    if (status === 'Cancelled') {
      order.cancelledAt = new Date()
      order.cancelledBy = actor.role === UserRole.ADMIN ? 'Admin' : 'Customer'
      order.cancellationReason = 'Đã hủy tất cả ngày giao'
    }
    order.status = status
    order.hasFailedDeliveries = order.deliveries.some((day) => day.status === 'Failed')
    order.updatedAt = new Date()
    const result = await database.orders.updateOne(
      { _id: order._id, version: order.version },
      {
        $set: {
          deliveries: order.deliveries,
          inventoryHold: order.inventoryHold,
          status,
          hasFailedDeliveries: order.hasFailedDeliveries,
          statusHistory: order.statusHistory,
          cancelledAt: order.cancelledAt,
          cancelledBy: order.cancelledBy,
          cancellationReason: order.cancellationReason,
          updatedAt: order.updatedAt
        },
        $inc: { version: 1 }
      },
      { session }
    )
    if (!result.matchedCount) throw new ErrorWithStatus({ message: 'Đơn đã thay đổi, vui lòng tải lại', status: 409 })
    order.version += 1
  }

  private cancellationQuote(order: Order, delivery: DeliveryPeriod) {
    if (!order.cancellationPolicy)
      throw new ErrorWithStatus({ message: 'Đơn cũ chưa lưu chính sách hủy, cần đối soát trước', status: 409 })
    const policy = order.cancellationPolicy
    const foodCredit = Math.round((delivery.subtotal * policy.refundBeforeCutoffPercent) / 100)
    const shippingCredit = policy.refundShippingFee ? delivery.shipping.totalFee : 0
    const creditedAmount = foodCredit + shippingCredit
    const amounts = this.getAmounts(order)
    const remainingPayable = Math.max(0, amounts.payableTotal - creditedAmount)
    const refundAmount = Math.min(
      creditedAmount,
      Math.max(0, amounts.paidAmount - amounts.refundedAmount - amounts.pendingRefundAmount - remainingPayable)
    )
    return {
      orderId: order._id,
      deliveryId: delivery._id,
      version: order.version,
      cutoffAt: delivery.cutoffAt,
      policy,
      foodCredit,
      shippingCredit,
      creditedAmount,
      refundAmount,
      remainingPayable,
      refundStatus: refundAmount > 0 ? 'Pending' : 'NotRequired'
    }
  }

  async previewCancellation(userId: string, orderId: string, deliveryId: string) {
    const { actor, order, delivery } = await this.getContext(userId, orderId, deliveryId)
    if (actor.role === UserRole.CUSTOMER && order.payment.method === 'COD')
      return cancellations.preview(userId, orderId, deliveryId)
    this.checkEditable(order, delivery)
    return this.cancellationQuote(order, delivery)
  }

  async cancelDelivery(userId: string, orderId: string, deliveryId: string, payload: CancelDeliveryReqBody) {
    const context = await this.getContext(userId, orderId, deliveryId)
    if (context.actor.role === UserRole.CUSTOMER && context.order.payment.method === 'COD')
      return cancellations.submit(userId, orderId, payload, deliveryId)
    return database.withTransaction(async (session) => {
      const { actor, order, delivery } = await this.getContext(userId, orderId, deliveryId, session)
      const exceptionReason = adminExceptionReason(actor.role, payload.exceptionReason)
      // Gửi lại yêu cầu hủy không hoàn thêm tiền hay nhả kho lần hai.
      if (delivery.status === 'Cancelled') return this.describeOrder(order)
      this.checkVersion(order, payload.version)
      this.checkEditable(order, delivery)
      const quote = this.cancellationQuote(order, delivery)
      const now = new Date()
      const refundTransactionId = quote.refundAmount > 0 ? new ObjectId() : undefined
      const previousStatus = delivery.status
      delivery.status = 'Cancelled'
      delivery.statusHistory.push({
        status: 'Cancelled',
        changedAt: now,
        actorId: actor._id,
        reason: exceptionReason || payload.reason
      })
      delivery.cancellation = {
        reason: exceptionReason || payload.reason,
        cancelledAt: now,
        cancelledBy: actor.role === UserRole.ADMIN ? 'Admin' : 'Customer',
        creditedAmount: quote.creditedAmount,
        refundAmount: quote.refundAmount,
        refundTransactionId
      }
      await inventory.changeItems(order, delivery.items, [], session)
      if (refundTransactionId) {
        const foodAmount = Math.min(quote.foodCredit, quote.refundAmount)
        await database.transactions.insertOne(
          {
            _id: refundTransactionId,
            kind: 'Refund',
            status: 'Pending',
            amount: quote.refundAmount,
            currency: 'VND',
            foodAmount,
            shippingAmount: quote.refundAmount - foodAmount,
            orderId: order._id,
            deliveryId: delivery._id,
            userId: order.userId,
            method: order.payment.method,
            idempotencyKey: `weekly-cancel:${order._id}:${delivery._id}`,
            source: 'Reconciliation',
            description: `Yêu cầu hoàn ngày ${delivery.date}: ${payload.reason}`,
            occurredAt: now,
            createdAt: now,
            createdBy: actor._id
          },
          { session }
        )
      }
      await this.saveOrder(order, actor, session)
      await database.auditLogs.insertOne(
        {
          actorId: actor._id,
          actorRole: actor.role,
          action: 'DeliveryCancelled',
          entityType: 'Order',
          entityId: order._id!,
          before: { deliveryId: delivery._id, status: previousStatus },
          after: { deliveryId: delivery._id, ...delivery.cancellation },
          reason: exceptionReason || payload.reason,
          createdAt: now
        },
        { session }
      )
      return this.describeOrder(order)
    })
  }

  async updateDeliveryStatus(
    adminId: string,
    orderId: string,
    deliveryId: string,
    payload: UpdateDeliveryStatusReqBody
  ) {
    const updated = await database.withTransaction(async (session) => {
      const { actor, order, delivery } = await this.getContext(adminId, orderId, deliveryId, session)
      const exceptionReason = adminExceptionReason(actor.role, payload.exceptionReason)
      if (actor.role !== UserRole.ADMIN)
        throw new ErrorWithStatus({ message: 'Chỉ Admin được cập nhật trạng thái giao', status: 403 })
      if (delivery.status === payload.status) return order
      this.checkVersion(order, payload.version)
      const next: Partial<Record<OrderStatus, OrderStatus>> = {
        Confirmed: 'Cooking',
        Cooking: 'Ready',
        Ready: 'Delivering',
        Delivering: 'Completed'
      }
      if (next[delivery.status] !== payload.status || ['Completed', 'Cancelled', 'Rejected'].includes(order.status)) {
        throw new ErrorWithStatus({
          message: 'Chỉ cho phép Confirmed → Cooking → Ready → Delivering → Completed',
          status: 400
        })
      }
      if (delivery.date > toLocalDate(new Date())) {
        throw new ErrorWithStatus({
          message: 'Chưa tới ngày giao, không thể cập nhật trạng thái chế biến/giao hàng',
          status: 400
        })
      }
      if (payload.status === 'Cooking' && order.payment.method !== 'COD') {
        const payment = await database.transactions.findOne(
          { orderId: order._id, kind: 'Payment', status: 'Succeeded', source: 'VerifiedIPN' },
          { session }
        )
        if (!payment || !['Paid', 'PartiallyRefunded'].includes(order.payment.status)) {
          throw new ErrorWithStatus({ message: 'Đơn online chưa có IPN thanh toán được xác thực', status: 400 })
        }
      }
      if (order.inventoryHold.status !== 'Committed') {
        throw new ErrorWithStatus({
          message: 'Đơn chưa chốt kho, không thể chuyển sang chế biến/giao hàng',
          status: 409
        })
      }
      const previousStatus = delivery.status
      delivery.status = payload.status
      delivery.statusHistory.push({
        status: payload.status,
        changedAt: new Date(),
        actorId: actor._id,
        reason: exceptionReason
      })
      await this.saveOrder(order, actor, session)
      await database.auditLogs.insertOne(
        {
          actorId: actor._id,
          actorRole: actor.role,
          action: 'OrderStatusChanged',
          entityType: 'Order',
          entityId: order._id!,
          before: { deliveryId: delivery._id, status: previousStatus },
          after: { deliveryId: delivery._id, status: delivery.status },
          reason: exceptionReason!,
          createdAt: new Date()
        },
        { session }
      )
      return order
    })
    if (payload.status === 'Completed') await tracking.recordOrderCalories(String(updated.userId), updated)
    return this.describeOrder(updated)
  }
}

export default new WeeklyOrdersService()
