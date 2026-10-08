import './setup'
import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import { BSON, ClientSession, Collection, ObjectId } from 'mongodb'
import express, { Request, RequestHandler, Response } from 'express'
import { AddressInfo } from 'node:net'
import jwt from 'jsonwebtoken'
import database from '../src/services/database.services'
import carts from '../src/services/cart.services'
import orders from '../src/services/orders.services'
import weekly from '../src/services/weekly-orders.services'
import settings, { DEFAULT_COMMERCE_RULES } from '../src/services/settings.services'
import users from '../src/services/user.services'
import tracking from '../src/services/tracking.services'
import User, { UserRole } from '../src/models/schemas/User.schema'
import Food from '../src/models/schemas/Food.schema'
import Order from '../src/models/schemas/Order.schema'
import Transaction from '../src/models/schemas/Transaction.schema'
import Settings from '../src/models/schemas/Settings.schema'
import AuditLog from '../src/models/schemas/AuditLog.schema'
import { toLocalDate } from '../src/models/schemas/common'
import { getKitchenCutoff, parseDeliveryStart } from '../src/utils/delivery'
import { TokenType } from '../src/constants/enums'
import ordersRouter from '../src/routes/orders.routes'
import adminRouter from '../src/routes/admin.routes'
import { defaultErrorHandler } from '../src/middlewares/errors.middlewares'
import { quoteOrderValidator } from '../src/middlewares/orders.middlewares'
import * as validators from '../src/middlewares/weekly-orders.middlewares'

type Doc = Record<string, unknown>
const copy = <T extends object>(value: T): T => BSON.deserialize(BSON.serialize(value)) as T
const equal = (a: unknown, b: unknown) => (a instanceof ObjectId ? String(a) === String(b) : a === b)
function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$expr') {
      const quantity = (value as { $gte: [unknown, number] }).$gte[1]
      return Number(doc.stock) - Number(doc.reservedStock || 0) >= quantity
    }
    const actual = doc[key]
    if (value && typeof value === 'object' && !(value instanceof ObjectId) && !(value instanceof Date)) {
      return Object.entries(value).every(([op, expected]) => {
        if (op === '$in') return (expected as unknown[]).some((item) => equal(actual, item))
        if (op === '$gte') return Number(actual) >= Number(expected)
        if (op === '$lte') return Number(actual) <= Number(expected)
        throw new Error(`Unsupported operator ${op}`)
      })
    }
    return equal(actual, value)
  })
}
function collection(docs: Doc[]) {
  return {
    findOne: async (filter: Doc) => {
      const doc = docs.find((doc) => matches(doc, filter))
      return doc ? copy(doc) : null
    },
    find: (filter: Doc) => {
      const cursor = { sort: () => cursor, toArray: async () => docs.filter((doc) => matches(doc, filter)).map(copy) }
      return cursor
    },
    insertOne: async (doc: Doc) => {
      if (doc.idempotencyKey && docs.some((entry) => entry.idempotencyKey === doc.idempotencyKey))
        throw new Error('Duplicate key')
      docs.push(copy(doc))
      return { insertedId: doc._id }
    },
    updateOne: async (filter: Doc, update: Doc, options?: { upsert?: boolean }) => {
      let doc = docs.find((doc) => matches(doc, filter))
      if (!doc && options?.upsert) {
        doc = { ...filter }
        docs.push(doc)
      }
      if (!doc) return { matchedCount: 0 }
      if (update.$set) Object.assign(doc, copy(update.$set as Doc))
      for (const [key, value] of Object.entries((update.$inc || {}) as Doc))
        doc[key] = Number(doc[key] || 0) + Number(value)
      return { matchedCount: 1 }
    }
  }
}
function futureDate(offset: number) {
  const date = new Date(`${toLocalDate(new Date())}T12:00:00+07:00`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date
}
function setup(t: TestContext) {
  const customer = new User({ _id: new ObjectId(), email: 'weekly@test.local', password: 'unused' })
  const admin = new User({ _id: new ObjectId(), email: 'admin@test.local', password: 'unused', role: UserRole.ADMIN })
  const manager = new User({
    _id: new ObjectId(),
    email: 'manager@test.local',
    password: 'unused',
    role: UserRole.MANAGER
  })
  const food = new Food({
    _id: new ObjectId(),
    name: 'Cơm gà',
    description: 'Món gà',
    images: [],
    price: 50000,
    calories: 400,
    nutrition: { protein: 30, carb: 40, fat: 13 },
    ingredients: [],
    tags: [],
    stock: 100,
    isActive: true
  })
  const alternative = new Food({ ...food, _id: new ObjectId(), name: 'Cơm cá', calories: 420 })
  const now = new Date()
  const order: Order = {
    _id: new ObjectId(),
    userId: customer._id!,
    orderCode: 'WEEKLY-TEST',
    packageType: 'WEEKLY_7D',
    deliveries: Array.from({ length: 7 }, (_, index) => {
      const scheduledAt = futureDate(index + 2)
      return {
        _id: new ObjectId(),
        date: toLocalDate(scheduledAt),
        scheduledAt,
        cutoffAt: getKitchenCutoff(scheduledAt, DEFAULT_COMMERCE_RULES),
        items: [
          {
            _id: new ObjectId(),
            foodId: food._id!,
            foodName: food.name,
            quantity: 1,
            price: food.price,
            calories: food.calories,
            nutrition: food.nutrition,
            mealSlot: 'Lunch' as const
          }
        ],
        status: 'Confirmed' as const,
        statusHistory: [{ status: 'Confirmed' as const, changedAt: now }],
        subtotal: 50000,
        shipping: { baseFee: index === 0 ? 20000 : 0, extraFee: 0, totalFee: index === 0 ? 20000 : 0, distanceKm: 6 },
        waivedShippingFee: index === 0 ? 0 : 20000,
        refundedAmount: 0
      }
    }),
    subtotal: 350000,
    shippingFee: 20000,
    grandTotal: 370000,
    status: 'Confirmed',
    statusHistory: [{ status: 'Confirmed', changedAt: now }],
    deliveryAddress: 'Test address',
    note: '',
    payment: { method: 'COD', status: 'Pending' },
    inventoryHold: { status: 'NotReserved', items: [] },
    cancellationPolicy: { ...DEFAULT_COMMERCE_RULES.cancellationPolicy },
    version: 0,
    createdAt: now,
    updatedAt: now
  }
  const data: Record<'users' | 'foods' | 'orders' | 'settings' | 'transactions' | 'audits', Doc[]> = {
    users: [customer, admin, manager].map((user) => copy(user) as unknown as Doc),
    foods: [food, alternative].map((food) => copy(food) as unknown as Doc),
    orders: [copy(order) as unknown as Doc],
    settings: [],
    transactions: [],
    audits: []
  }
  const collections = {
    users: collection(data.users),
    foods: collection(data.foods),
    orders: collection(data.orders),
    settings: collection(data.settings),
    transactions: collection(data.transactions),
    audits: collection(data.audits)
  }
  t.mock.getter(database, 'users', () => collections.users as unknown as Collection<User>)
  t.mock.getter(database, 'foods', () => collections.foods as unknown as Collection<Food>)
  t.mock.getter(database, 'orders', () => collections.orders as unknown as Collection<Order>)
  t.mock.getter(database, 'settings', () => collections.settings as unknown as Collection<Settings>)
  t.mock.getter(database, 'transactions', () => collections.transactions as unknown as Collection<Transaction>)
  t.mock.getter(database, 'auditLogs', () => collections.audits as unknown as Collection<AuditLog>)
  // Serialize and roll back the in-memory writes. This verifies service behavior, not MongoDB isolation.
  let gate = Promise.resolve()
  t.mock.method(database, 'withTransaction', async (fn: (session: ClientSession) => Promise<unknown>) => {
    const previous = gate
    let release!: () => void
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    const before = copy(data)
    try {
      return await fn({} as ClientSession)
    } catch (error) {
      for (const key of Object.keys(data) as Array<keyof typeof data>)
        data[key].splice(0, data[key].length, ...before[key])
      throw error
    } finally {
      release()
    }
  })
  t.mock.method(carts, 'buildCartSummaryByType', async (_user: string, type: string) => {
    const lines = (type === 'COMBO' ? order.deliveries : order.deliveries.slice(0, 1)).flatMap((day) =>
      day.items.map((item) => ({
        _id: item._id,
        itemId: item.foodId,
        deliveryDate: day.date,
        mealSlot: item.mealSlot,
        quantity: item.quantity,
        itemName: item.foodName,
        image: null,
        unitPrice: item.price,
        unitCalories: item.calories,
        nutrition: item.nutrition,
        lineTotal: item.quantity * item.price,
        lineCalories: item.calories * item.quantity,
        availability: { isActive: true, inStock: true, availableQuantity: 100 }
      }))
    )
    return {
      cartId: new ObjectId(),
      userId: customer._id,
      cartType: type,
      version: 0,
      items: lines,
      canCheckout: true,
      issues: [],
      summary: {
        subtotal: lines.reduce((sum, item) => sum + item.lineTotal, 0),
        itemCount: lines.length,
        totalCalories: lines.reduce((sum, item) => sum + item.lineCalories, 0)
      }
    }
  })
  t.mock.method(carts, 'clearCartByType', async () => ({}) as never)
  const userId = String(customer._id)
  const orderId = String(order._id)
  const deliveryId = String(order.deliveries[0]._id)
  const itemId = String(order.deliveries[0].items[0]._id)
  const payload = {
    deliveryDate: `${order.deliveries[0].date}T12:00:00+07:00`,
    deliveryAddress: 'Test address',
    distanceKm: 6,
    packageType: 'WEEKLY_7D' as const,
    paymentMethod: 'COD' as const
  }
  return {
    data,
    collections,
    customer,
    admin,
    manager,
    food,
    alternative,
    template: order,
    get order() {
      return data.orders[0] as unknown as Order
    },
    userId,
    orderId,
    deliveryId,
    itemId,
    payload
  }
}

test('distanceKm keeps existing tariffs at boundaries, accepts zero and never calls geocoding when supplied', async (t) => {
  const f = setup(t)
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('distanceKm must bypass network')
  })
  for (const [distanceKm, expected] of [
    [0, 0],
    [4.99, 0],
    [5, 20000],
    [6, 20000],
    [100, 20000]
  ]) {
    const quote = await orders.quoteOrder(f.userId, { ...f.payload, distanceKm })
    assert.equal(quote.pricing.shippingFee, expected)
    assert.equal(quote.pricing.waivedShippingFee, expected * 6)
    assert.deepEqual(
      quote.deliveries.map((day) => day.shipping.totalFee),
      [expected, 0, 0, 0, 0, 0, 0]
    )
  }
  for (const [distanceKm, expected] of [
    [0, 0],
    [2, 0],
    [2.01, 5000],
    [3, 5000],
    [3.01, 10000]
  ]) {
    const quote = await orders.quoteOrder(f.userId, { ...f.payload, packageType: 'ONE_DAY', distanceKm })
    assert.equal(quote.pricing.shippingFee, expected)
  }
  for (const distanceKm of [-1, NaN, Infinity]) {
    await assert.rejects(orders.quoteOrder(f.userId, { ...f.payload, distanceKm }), { status: 400 })
  }
})

test('when distanceKm is absent the address fallback still supplies the distance', async (t) => {
  const f = setup(t)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return new globalThis.Response(
      JSON.stringify(calls === 1 ? [{ lat: '10.8', lon: '106.7' }] : { code: 'Ok', routes: [{ distance: 6000 }] })
    )
  })
  const quote = await orders.quoteOrder(f.userId, { ...f.payload, distanceKm: undefined })
  assert.equal(calls, 2)
  assert.equal(quote.pricing.shippingFee, 20000)
})

test('calendar parsing is timezone-independent, validates real dates and fixes the local delivery hour across month/year', () => {
  assert.equal(parseDeliveryStart('2099-12-31', '11:30').toISOString(), '2099-12-31T04:30:00.000Z')
  assert.equal(parseDeliveryStart('2099-12-31').toISOString(), '2099-12-31T05:00:00.000Z')
  assert.equal(parseDeliveryStart('2099-12-30T17:30:00Z').toISOString(), '2099-12-30T17:30:00.000Z')
  assert.equal(
    getKitchenCutoff(parseDeliveryStart('2100-01-01', '11:30'), DEFAULT_COMMERCE_RULES).toISOString(),
    '2099-12-31T13:00:00.000Z'
  )
  for (const input of ['2099-02-30', '2099-12-31T11:00', '2099-12-31T24:00:00+07:00']) {
    assert.throws(() => parseDeliveryStart(input), { status: 400 })
  }
  assert.throws(() => parseDeliveryStart('2099-12-31T12:00:00+07:00', '12:00'), { status: 400 })
  assert.throws(
    () =>
      getKitchenCutoff(parseDeliveryStart('2099-12-31', '12:00'), {
        ...DEFAULT_COMMERCE_RULES,
        kitchenCutoffDaysBefore: 0
      }),
    { status: 400 }
  )
})

test('weekly quote uses each day menu, rejects cutoff/mismatched days and persists COD schedule and policy snapshots', async (t) => {
  const f = setup(t)
  f.template.deliveries.forEach((day, index) => {
    day.items[0].quantity = index + 1
  })
  const quote = await orders.quoteOrder(f.userId, {
    ...f.payload,
    deliveryDate: f.template.deliveries[0].date,
    deliveryTime: '11:30'
  })
  assert.equal(quote.pricing.subtotal, 28 * 50000)
  assert.equal(quote.pricing.grandTotal, 28 * 50000 + 20000)
  assert.ok(
    quote.deliveries.every((day) => day.scheduledAt.getUTCHours() === 4 && day.scheduledAt.getUTCMinutes() === 30)
  )
  assert.ok(quote.deliveries.every((day) => day.cutoffAt! < day.scheduledAt))
  const result = await orders.createOrder(f.userId, f.payload)
  const created = f.data.orders[1] as unknown as Order
  assert.equal(result.status, 'Confirmed')
  assert.equal(created.payment.status, 'Pending')
  assert.ok(created.deliveries.every((day) => day.status === 'Confirmed'))
  assert.deepEqual(created.cancellationPolicy, DEFAULT_COMMERCE_RULES.cancellationPolicy)
  const oldCutoff = created.deliveries[0].cutoffAt!.getTime()
  await settings.updateCommerceRules(String(f.admin._id), { kitchenCutoffTime: '18:00', kitchenCutoffDaysBefore: 1 })
  assert.equal(created.deliveries[0].cutoffAt!.getTime(), oldCutoff)
  const changed = await orders.quoteOrder(f.userId, f.payload)
  assert.notEqual(changed.deliveries[0].cutoffAt!.getTime(), oldCutoff)
  await assert.rejects(orders.quoteOrder(f.userId, { ...f.payload, deliveryDate: futureDate(10).toISOString() }), {
    status: 400
  })
  await assert.rejects(
    orders.quoteOrder(f.userId, { ...f.payload, deliveryDate: new Date(Date.now() - 1000).toISOString() }),
    { status: 400 }
  )
  t.mock.method(settings, 'getCommerceRules', async () => ({ ...DEFAULT_COMMERCE_RULES, kitchenCutoffDaysBefore: 10 }))
  await assert.rejects(orders.quoteOrder(f.userId, f.payload), { status: 400 })
})

test('weekly shortage reports the affected date and safe alternatives before payment without creating an order', async (t) => {
  const f = setup(t)
  const cart = await carts.buildCartSummaryByType(f.userId, 'COMBO')
  cart.canCheckout = false
  cart.issues = [{ code: 'OUT_OF_STOCK', lineId: String(cart.items[0]._id), message: 'Món hết hàng' }]
  cart.items[0].availability.inStock = false
  t.mock.method(carts, 'buildCartSummaryByType', async () => cart)
  await assert.rejects(orders.createOrder(f.userId, f.payload), (error: unknown) => {
    const problem = error as {
      status: number
      replacements: Array<{ deliveryDate: string; alternatives: Array<{ foodId: ObjectId }> }>
    }
    assert.equal(problem.status, 400)
    assert.equal(problem.replacements[0].deliveryDate, f.order.deliveries[0].date)
    assert.equal(String(problem.replacements[0].alternatives[0].foodId), String(f.alternative._id))
    return true
  })
  f.data.users[0].healthProfile = { allergies: ['cá'] }
  f.data.foods[1].ingredients = [{ name: 'Cá', allergyTags: [] }]
  assert.deepEqual((await weekly.getCartReplacements(f.userId, cart.items))[0].alternatives, [])
  assert.equal(f.data.orders.length, 1)
})

test('alternatives respect current allergies, same snapshot price, nutrition and available stock; swap changes only the chosen day', async (t) => {
  const f = setup(t)
  const alternatives = await weekly.getAlternatives(f.userId, f.orderId, f.deliveryId, f.itemId)
  assert.equal(alternatives.alternatives.length, 1)
  const before = copy(f.order)
  const swapped = await weekly.swapItem(f.userId, f.orderId, f.deliveryId, f.itemId, {
    foodId: String(f.alternative._id),
    version: 0
  })
  assert.equal(f.order.deliveries[0].items[0].foodName, f.alternative.name)
  assert.deepEqual(f.order.deliveries.slice(1), before.deliveries.slice(1))
  assert.equal(f.order.grandTotal, before.grandTotal)
  assert.equal(f.order.version, 1)
  assert.equal(swapped.calories, 420)
  assert.equal(swapped.calorieDifference, 20)
  assert.equal(swapped.targetDifference, 20)
  assert.deepEqual(swapped.nutritionTotals, { calories: 420, protein: 30, carb: 40, fat: 13 })
  assert.deepEqual(swapped.warnings, [])
  assert.equal(f.data.audits[0].action, 'DeliverySwapped')
  await assert.rejects(
    weekly.swapItem(f.userId, f.orderId, f.deliveryId, f.itemId, { foodId: String(f.food._id), version: 0 }),
    { status: 409 }
  )
})

test('swap validation rejects allergy, price/calorie/day-target mismatch, shortage and expired inventory holds', async (t) => {
  const f = setup(t)
  const candidate = () => f.data.foods[1]
  const trySwap = () =>
    weekly.swapItem(f.userId, f.orderId, f.deliveryId, f.itemId, { foodId: String(f.alternative._id), version: 0 })
  f.data.users[0].healthProfile = { allergies: ['ĐẬU PHỘNG'] }
  candidate().ingredients = [{ name: 'Sốt đậu phộng', allergyTags: [] }]
  await assert.rejects(trySwap(), { status: 400 })
  candidate().ingredients = []
  f.data.users[0].healthProfile = { allergies: ['ăn chay'] }
  await assert.rejects(trySwap(), { status: 400 })
  candidate().tags = ['vegan']
  assert.equal((await weekly.getAlternatives(f.userId, f.orderId, f.deliveryId, f.itemId)).alternatives.length, 1)
  f.data.users[0].healthProfile = { allergies: [] }
  candidate().price = 60000
  await assert.rejects(trySwap(), { status: 400 })
  candidate().price = 50000
  candidate().calories = 470
  await assert.rejects(trySwap(), { status: 400 })
  candidate().calories = 445 // Trong ±15% món, nhưng vượt ±10% tổng ngày.
  await assert.rejects(trySwap(), { status: 400 })
  candidate().calories = 420
  f.order.targetCaloriesSnapshot = 1000
  await assert.rejects(trySwap(), { status: 400 })
  delete f.order.targetCaloriesSnapshot
  candidate().stock = 0
  await assert.rejects(trySwap(), { status: 400 })
  candidate().stock = 100
  f.order.inventoryHold = { status: 'Held', items: [], expiresAt: new Date(Date.now() - 1) }
  await assert.rejects(trySwap(), { status: 409 })
  assert.equal(f.order.version, 0)
  assert.equal(f.data.audits.length, 0)
})

test('cutoff is inclusive; customers cannot edit other accounts and Manager has no write access', async (t) => {
  const f = setup(t)
  await assert.rejects(
    weekly.cancelDelivery(String(f.manager._id), f.orderId, f.deliveryId, { version: 0, reason: 'Test' }),
    { status: 403 }
  )
  f.data.users.push(
    copy(new User({ _id: new ObjectId(), email: 'other@test.local', password: 'unused' })) as unknown as Doc
  )
  await assert.rejects(weekly.previewCancellation(String(f.data.users[3]._id), f.orderId, f.deliveryId), {
    status: 404
  })
  f.order.deliveries[0].cutoffAt = new Date()
  await assert.rejects(weekly.cancelDelivery(f.userId, f.orderId, f.deliveryId, { version: 0, reason: 'Test' }), {
    status: 400
  })
  await assert.rejects(
    weekly.swapItem(f.userId, f.orderId, f.deliveryId, f.itemId, { foodId: String(f.alternative._id), version: 0 }),
    { status: 400 }
  )
})

test('cancelling unpaid first day reduces amount due, keeps original snapshots and never shifts shipping to another day', async (t) => {
  const f = setup(t)
  const preview = await weekly.previewCancellation(f.userId, f.orderId, f.deliveryId)
  assert.equal(preview.creditedAmount, 70000)
  assert.equal(preview.refundAmount, 0)
  await weekly.cancelDelivery(f.userId, f.orderId, f.deliveryId, { reason: 'Không nhận ngày đầu', version: 0 })
  const view = weekly.describeOrder(f.order)
  assert.ok('amounts' in view)
  assert.equal(view.amounts.amountDue, 300000)
  assert.equal(f.order.grandTotal, 370000)
  assert.equal(f.order.deliveries[0].shipping.totalFee, 20000)
  assert.ok(f.order.deliveries.slice(1).every((day) => day.shipping.totalFee === 0))
  assert.equal(f.data.foods[0].stock, 100)
  assert.equal(f.data.transactions.length, 0)
  assert.equal(f.order.status, 'Confirmed')
})

test('paid cancellation creates one pending refund, never marks money returned; repeats do not duplicate credit or stock', async (t) => {
  const f = setup(t)
  f.order.payment = { method: 'VNPay', status: 'Paid', paidAmount: 370000 }
  const request = { reason: 'Đổi lịch tuần', version: 0 }
  await weekly.cancelDelivery(f.userId, f.orderId, f.deliveryId, request)
  await weekly.cancelDelivery(f.userId, f.orderId, f.deliveryId, request)
  assert.equal(f.data.transactions.length, 1)
  assert.equal(f.data.transactions[0].amount, 70000)
  assert.equal(f.data.transactions[0].status, 'Pending')
  assert.equal(f.order.payment.status, 'Paid')
  assert.equal(f.order.deliveries[0].refundedAmount, 0)
  assert.equal(f.order.version, 1)
  const nextId = String(f.order.deliveries[1]._id)
  const preview = await weekly.previewCancellation(f.userId, f.orderId, nextId)
  assert.equal(preview.refundAmount, 50000)
  await weekly.cancelDelivery(f.userId, f.orderId, nextId, { reason: 'Đổi lịch tuần', version: 1 })
  const view = weekly.describeOrder(f.order)
  assert.ok('amounts' in view)
  assert.equal(view.amounts.pendingRefundAmount, 120000)
  assert.equal(view.amounts.amountDue, 0)
})

test('cancelling all seven days totals original payment once and closes the package', async (t) => {
  const f = setup(t)
  f.order.payment = { method: 'MoMo', status: 'Paid', paidAmount: 370000 }
  for (let index = 0; index < 7; index++) {
    await weekly.cancelDelivery(f.userId, f.orderId, String(f.order.deliveries[index]._id), {
      reason: 'Hủy gói tuần',
      version: index
    })
  }
  assert.equal(f.order.status, 'Cancelled')
  assert.equal(
    f.data.transactions.reduce((sum, row) => sum + Number(row.amount), 0),
    370000
  )
  assert.equal(f.order.version, 7)
})

test('held and committed inventory are released exactly once per cancelled day', async (t) => {
  const f = setup(t)
  f.order.inventoryHold = { status: 'Held', items: [{ foodId: f.food._id!, quantity: 7 }], expiresAt: futureDate(1) }
  f.data.foods[0].reservedStock = 7
  await weekly.cancelDelivery(f.userId, f.orderId, f.deliveryId, { version: 0, reason: 'Hủy một ngày' })
  assert.equal(f.data.foods[0].reservedStock, 6)
  assert.equal(f.data.foods[0].stock, 100)
  assert.equal(f.order.inventoryHold.items[0].quantity, 6)
  f.order.inventoryHold.status = 'Committed'
  f.data.foods[0].reservedStock = 0
  f.data.foods[0].stock = 94
  await weekly.cancelDelivery(f.userId, f.orderId, String(f.order.deliveries[1]._id), {
    version: 1,
    reason: 'Hủy một ngày'
  })
  assert.equal(f.data.foods[0].stock, 95)
  assert.equal(f.order.inventoryHold.items[0].quantity, 5)
})

test('swap transfers existing inventory holds; a failed refund write rolls back inventory/order/audit', async (t) => {
  const f = setup(t)
  f.order.inventoryHold = { status: 'Held', items: [{ foodId: f.food._id!, quantity: 7 }], expiresAt: futureDate(1) }
  f.data.foods[0].reservedStock = 7
  await weekly.swapItem(f.userId, f.orderId, f.deliveryId, f.itemId, { foodId: String(f.alternative._id), version: 0 })
  assert.equal(f.data.foods[0].reservedStock, 6)
  assert.equal(f.data.foods[1].reservedStock, 1)
  assert.equal(f.order.inventoryHold.items.length, 2)
  f.order.payment = { method: 'VNPay', status: 'Paid', paidAmount: 370000 }
  const before = copy(f.data)
  t.mock.method(f.collections.transactions, 'insertOne', async () => {
    throw new Error('Ledger unavailable')
  })
  await assert.rejects(
    weekly.cancelDelivery(f.userId, f.orderId, f.deliveryId, { version: 1, reason: 'Hủy ngày' }),
    /Ledger unavailable/
  )
  assert.deepEqual(f.data, before)
})

test('different concurrent day edits require fresh order version; no lost edits', async (t) => {
  const f = setup(t)
  const outcomes = await Promise.allSettled(
    [0, 1].map((index) =>
      weekly.cancelDelivery(f.userId, f.orderId, String(f.order.deliveries[index]._id), {
        version: 0,
        reason: 'Hủy ngày'
      })
    )
  )
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(f.order.deliveries.filter((day) => day.status === 'Cancelled').length, 1)
  assert.equal(f.data.audits.length, 1)
})

test('daily status affects only that day; future dates and unverified online payment cannot start cooking', async (t) => {
  const f = setup(t)
  let tracked = 0
  t.mock.method(tracking, 'recordOrderCalories', async () => {
    tracked++
    return []
  })
  const adminId = String(f.admin._id)
  await assert.rejects(
    weekly.updateDeliveryStatus(adminId, f.orderId, f.deliveryId, { version: 0, status: 'Cooking' }),
    { status: 400 }
  )
  f.order.deliveries[0].date = toLocalDate(new Date())
  f.order.payment = { method: 'VNPay', status: 'Paid', paidAmount: 370000 }
  await assert.rejects(
    weekly.updateDeliveryStatus(adminId, f.orderId, f.deliveryId, { version: 0, status: 'Cooking' }),
    { status: 400 }
  )
  f.data.transactions.push({ orderId: f.order._id, kind: 'Payment', status: 'Succeeded', source: 'VerifiedIPN' })
  await weekly.updateDeliveryStatus(adminId, f.orderId, f.deliveryId, { version: 0, status: 'Cooking' })
  await assert.rejects(
    weekly.updateDeliveryStatus(adminId, f.orderId, f.deliveryId, { version: 1, status: 'Completed' }),
    { status: 400 }
  )
  await weekly.updateDeliveryStatus(adminId, f.orderId, f.deliveryId, { version: 1, status: 'Delivering' })
  await weekly.updateDeliveryStatus(adminId, f.orderId, f.deliveryId, { version: 2, status: 'Completed' })
  assert.equal(f.order.deliveries[0].status, 'Completed')
  assert.ok(f.order.deliveries.slice(1).every((day) => day.status === 'Confirmed'))
  assert.equal(f.order.status, 'Confirmed')
  assert.equal(tracked, 1)
  await assert.rejects(orders.updateOrderStatus(adminId, f.orderId, { status: 'Completed' }), { status: 400 })
  await assert.rejects(orders.cancelOrder(f.userId, f.orderId), { status: 400 })
})

function run(validator: RequestHandler, request: Partial<Request>) {
  return new Promise<unknown>((resolve, reject) => {
    Promise.resolve(validator(request as Request, {} as Response, (error) => resolve(error))).catch(reject)
  })
}
test('legacy payment actions cannot reset paid/cancelled weekly orders or overwrite refund accounting', async (t) => {
  const f = setup(t)
  await assert.rejects(orders.updatePaymentStatus(String(f.admin._id), f.orderId, { status: 'Paid' }), { status: 400 })
  await assert.rejects(orders.retryPayment(f.userId, f.orderId, {}), { status: 400 })
  f.order.status = 'Pending'
  f.order.payment.method = 'MoMo'
  f.order.paymentDueAt = new Date(Date.now() + 600000)
  f.order.deliveries.forEach((day) => {
    day.status = 'Pending'
  })
  await orders.retryPayment(f.userId, f.orderId, { paymentMethod: 'VNPay' })
  assert.equal(f.order.version, 1)
  assert.equal(f.order.payment.method, 'VNPay')
  f.order.payment.status = 'Paid'
  await assert.rejects(orders.retryPayment(f.userId, f.orderId, {}), { status: 400 })
  f.order.payment.status = 'Pending'
  f.order.paymentDueAt = new Date(Date.now() - 1)
  await assert.rejects(orders.retryPayment(f.userId, f.orderId, {}), { status: 400 })
  f.order.paymentDueAt = new Date(Date.now() + 600000)
  await weekly.cancelDelivery(f.userId, f.orderId, f.deliveryId, { reason: 'Hủy trước trả tiền', version: 1 })
  await assert.rejects(orders.retryPayment(f.userId, f.orderId, {}), { status: 400 })
})

test('request validation requires version/reason, valid cutoff and finite nonnegative distance', async () => {
  for (const distanceKm of [-1, null, Infinity, 'Infinity', [1], {}]) {
    assert.ok(
      await run(quoteOrderValidator, {
        body: { deliveryAddress: 'Test', deliveryDate: '2099-12-31', paymentMethod: 'COD', distanceKm }
      })
    )
  }
  assert.equal(
    await run(quoteOrderValidator, {
      body: {
        deliveryAddress: 'Test',
        deliveryDate: '2099-12-31',
        deliveryTime: '11:30',
        paymentMethod: 'COD',
        distanceKm: 0
      }
    }),
    undefined
  )
  assert.ok(await run(validators.cancelDeliveryValidator, { body: { reason: 'Hủy ngày' } }))
  assert.ok(await run(validators.swapDeliveryValidator, { body: { foodId: 'bad', version: 0 } }))
  assert.ok(
    await run(validators.commerceSettingsValidator, {
      body: { kitchenCutoffTime: '25:00', kitchenCutoffDaysBefore: 2 }
    })
  )
  assert.equal(
    await run(validators.commerceSettingsValidator, {
      body: { kitchenCutoffTime: '09:00', kitchenCutoffDaysBefore: 0 }
    }),
    undefined
  )
})

test('HTTP routes enforce settings Admin-only, Manager read-only and customer ownership of daily changes', async (t) => {
  const f = setup(t)
  t.mock.method(
    users,
    'validateSession',
    async (payload) => f.data.users.find((user) => String(user._id) === payload.user_id) as unknown as User
  )
  const app = express()
  app.use(express.json())
  app.use('/orders', ordersRouter)
  app.use('/admin', adminRouter)
  app.use(defaultErrorHandler)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  )
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const call = async (actor: User, path: string, method = 'GET', body?: object) => {
    const token = jwt.sign(
      { user_id: String(actor._id), token_type: TokenType.AccessToken },
      process.env.JWT_SECRET_ACCESS_TOKEN!
    )
    const response = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    })
    return { status: response.status, body: await response.json() }
  }
  const dayPath = `/orders/${f.orderId}/deliveries/${f.deliveryId}`
  for (const actor of [f.customer, f.manager]) {
    assert.equal((await call(actor, '/admin/commerce-settings')).status, 403)
    assert.equal((await call(actor, dayPath + '/status', 'PATCH', { version: 0, status: 'Cooking' })).status, 403)
  }
  assert.equal(
    (
      await call(f.admin, '/admin/commerce-settings', 'PATCH', {
        kitchenCutoffTime: '18:30',
        kitchenCutoffDaysBefore: 1
      })
    ).status,
    200
  )
  assert.equal((await call(f.manager, dayPath + '/cancel', 'POST', { version: 0, reason: 'Hủy ngày' })).status, 403)
  assert.equal((await call(f.manager, `/orders/${f.orderId}`)).status, 200)
  assert.equal((await call(f.customer, dayPath + `/items/${f.itemId}/alternatives`)).status, 200)
  assert.equal(
    (await call(f.customer, dayPath + `/items/${f.itemId}`, 'PATCH', { foodId: String(f.alternative._id), version: 0 }))
      .status,
    200
  )
  const preview = await call(f.customer, dayPath + '/cancellation')
  assert.equal(preview.body.result.creditedAmount, 70000)
  assert.equal(
    (await call(f.customer, dayPath + '/cancel', 'POST', { version: 1, reason: 'Hủy ngày đầu' })).status,
    200
  )
})
