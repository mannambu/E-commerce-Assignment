import { ClientSession, ObjectId } from 'mongodb'
import { ErrorWithStatus } from '~/models/Errors'
import Order from '~/models/schemas/Order.schema'
import { STOCK_HOLD_MINUTES } from '~/models/schemas/common'
import database from './database.services'

type StockItem = { foodId: ObjectId; quantity: number }

class InventoryService {
  // Một món ở nhiều ngày/bữa vẫn dùng cùng một lượng tồn kho.
  getOrderItems(order: Order): StockItem[] {
    const quantities = new Map<string, StockItem>()
    for (const day of order.deliveries) {
      if (day.status === 'Cancelled') continue
      for (const item of day.items) {
        const key = String(item.foodId)
        const current = quantities.get(key) || { foodId: item.foodId, quantity: 0 }
        current.quantity += item.quantity
        quantities.set(key, current)
      }
    }
    return [...quantities.values()]
  }

  // Caller lưu Order trong cùng session. Dùng chung cho checkout, đổi món và hủy ngày.
  async changeItems(order: Order, removed: StockItem[], added: StockItem[], session: ClientSession) {
    const hold = order.inventoryHold
    if (hold.status === 'NotReserved' || hold.status === 'Released') return
    const changes = new Map<string, StockItem>()
    for (const [items, sign] of [
      [removed, -1],
      [added, 1]
    ] as const) {
      for (const item of items) {
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0)
          throw new ErrorWithStatus({ message: 'Số lượng món trong đơn không hợp lệ', status: 409 })
        const key = String(item.foodId)
        const current = changes.get(key) || { foodId: item.foodId, quantity: 0 }
        current.quantity += sign * item.quantity
        changes.set(key, current)
      }
    }
    // Thứ tự cố định giúp các đơn có nhiều món ít tranh chấp ghi hơn.
    for (const change of [...changes.values()].sort((a, b) => String(a.foodId).localeCompare(String(b.foodId)))) {
      if (!change.quantity) continue
      const held = hold.items.find((item) => item.foodId.equals(change.foodId))
      if (change.quantity < 0 && (!held || held.quantity < -change.quantity))
        throw new ErrorWithStatus({ message: 'Số lượng kho của đơn không khớp, cần kiểm tra lại', status: 409 })
      const condition =
        change.quantity > 0
          ? {
              isActive: true,
              $expr: { $gte: [{ $subtract: ['$stock', { $ifNull: ['$reservedStock', 0] }] }, change.quantity] }
            }
          : hold.status === 'Held'
            ? { reservedStock: { $gte: -change.quantity } }
            : {}
      const result = await database.foods.updateOne(
        { _id: change.foodId, ...condition },
        {
          $inc: hold.status === 'Held' ? { reservedStock: change.quantity } : { stock: -change.quantity },
          $currentDate: { updatedAt: true }
        },
        { session }
      )
      if (!result.matchedCount) {
        const food = await database.foods.findOne({ _id: change.foodId }, { session })
        const availableQuantity = food ? Math.max(0, food.stock - (food.reservedStock ?? 0)) : 0
        throw Object.assign(
          new ErrorWithStatus({ message: 'Tồn kho đã thay đổi, vui lòng kiểm tra lại món', status: 409 }),
          {
            issues: order.deliveries.flatMap((day) =>
              day.items
                .filter((item) => item.foodId.equals(change.foodId))
                .map((item) => ({
                  code: 'INVENTORY_CONFLICT',
                  foodId: String(change.foodId),
                  deliveryDate: day.date,
                  lineId: String(item._id),
                  requestedQuantity: change.quantity,
                  availableQuantity
                }))
            )
          }
        )
      }
      if (held) held.quantity += change.quantity
      else hold.items.push({ ...change })
    }
    hold.items = hold.items.filter((item) => item.quantity > 0)
    if (!hold.items.length) {
      hold.status = 'Released'
      hold.releasedAt = new Date()
    }
  }

  async reserve(order: Order, session: ClientSession, now = new Date()) {
    if (!['NotReserved', 'Released'].includes(order.inventoryHold.status))
      throw new ErrorWithStatus({ message: 'Đơn đã giữ hoặc trừ kho, không giữ lần hai', status: 409 })
    const cod = order.payment.method === 'COD'
    if (!cod && (!order.paymentDueAt || order.paymentDueAt <= now))
      throw new ErrorWithStatus({ message: 'Đơn đã hết hạn thanh toán', status: 400 })
    const items = this.getOrderItems(order)
    if (!items.length) throw new ErrorWithStatus({ message: 'Đơn không có món để giữ kho', status: 400 })
    order.inventoryHold = cod
      ? { status: 'Committed', items: [], committedAt: now }
      : {
          status: 'Held',
          items: [],
          expiresAt: new Date(Math.min(now.getTime() + STOCK_HOLD_MINUTES * 60000, order.paymentDueAt!.getTime()))
        }
    await this.changeItems(order, [], items, session)
  }

  async releaseHold(order: Order, session: ClientSession, now = new Date()) {
    if (order.inventoryHold.status !== 'Held') return false
    await this.changeItems(order, [...order.inventoryHold.items], [], session)
    order.inventoryHold.status = 'Released'
    order.inventoryHold.releasedAt = now
    return true
  }

  // Điểm nối cho IPN đã verify: caller phải ghi Payment + Order cùng transaction.
  // Hàm này không tự xác nhận đã thanh toán và không được gọi trực tiếp từ client.
  async commitHold(order: Order, session: ClientSession, now = new Date()) {
    if (order.inventoryHold.status === 'Committed') return
    if (
      order.status !== 'Pending' ||
      order.payment.method === 'COD' ||
      !order.paymentDueAt ||
      order.paymentDueAt <= now
    )
      throw new ErrorWithStatus({ message: 'Đơn không còn đủ điều kiện chốt kho', status: 409 })
    if (
      order.inventoryHold.status === 'Held' &&
      (!order.inventoryHold.expiresAt || order.inventoryHold.expiresAt <= now)
    )
      await this.releaseHold(order, session, now)
    if (order.inventoryHold.status !== 'Held') await this.reserve(order, session, now)
    for (const item of order.inventoryHold.items) {
      const result = await database.foods.updateOne(
        { _id: item.foodId, stock: { $gte: item.quantity }, reservedStock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity, reservedStock: -item.quantity }, $currentDate: { updatedAt: true } },
        { session }
      )
      if (!result.matchedCount) throw new ErrorWithStatus({ message: 'Kho không khớp với lượng đã giữ', status: 409 })
    }
    order.inventoryHold.status = 'Committed'
    order.inventoryHold.committedAt = now
    delete order.inventoryHold.expiresAt
  }

  async releaseExpiredHold(orderId: ObjectId, now = new Date()) {
    return database.withTransaction(async (session) => {
      const order = await database.orders.findOne({ _id: orderId }, { session })
      if (
        !order ||
        order.status !== 'Pending' ||
        order.payment.method === 'COD' ||
        !['Pending', 'Failed'].includes(order.payment.status) ||
        (order.payment.paidAmount || 0) > 0 ||
        order.inventoryHold.status !== 'Held' ||
        !order.inventoryHold.expiresAt ||
        order.inventoryHold.expiresAt > now
      )
        return false
      await this.releaseHold(order, session, now)
      const result = await database.orders.updateOne(
        { _id: order._id, version: order.version, 'inventoryHold.status': 'Held' },
        { $set: { inventoryHold: order.inventoryHold, updatedAt: now }, $inc: { version: 1 } },
        { session }
      )
      if (!result.matchedCount) throw new ErrorWithStatus({ message: 'Đơn đã thay đổi khi nhả kho', status: 409 })
      await database.auditLogs.insertOne(
        {
          actorRole: 'System',
          action: 'StockReleased',
          entityType: 'Order',
          entityId: orderId,
          reason: 'Hết 10 phút giữ kho; đơn vẫn giữ hạn thanh toán ban đầu',
          createdAt: now
        },
        { session }
      )
      return true
    })
  }

  async releaseExpiredHolds(now = new Date()) {
    const orders = await database.orders
      .find({
        status: 'Pending',
        'payment.method': { $ne: 'COD' },
        'payment.status': { $in: ['Pending', 'Failed'] },
        'inventoryHold.status': 'Held',
        'inventoryHold.expiresAt': { $lte: now }
      })
      .sort({ 'inventoryHold.expiresAt': 1 })
      .limit(100)
      .toArray()
    let released = 0
    for (const order of orders) {
      try {
        if (await this.releaseExpiredHold(order._id, now)) released += 1
      } catch (error) {
        // Một đơn lỗi không chặn việc nhả kho của các đơn khác; lần quét sau sẽ thử lại.
        console.error('Không thể nhả kho hết hạn', String(order._id), error)
      }
    }
    return released
  }
}

export default new InventoryService()
