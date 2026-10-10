import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MongoClient, ObjectId } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import Cart from '../../src/models/schemas/Cart.schema'
import Food from '../../src/models/schemas/Food.schema'
import User, { UserRole } from '../../src/models/schemas/User.schema'
import { toLocalDate } from '../../src/models/schemas/common'
import { createSchemaIndexes } from '../../src/models/schema-indexes'
import type { CreateOrderReqBody } from '../../src/models/requests/CartOrder.request'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { AddressInfo } from 'node:net'

// MongoDB replica set tạm, không dùng .env hay DB của dự án. Kiểm tra transaction/unique index thật.
test('checkout and inventory on an isolated MongoDB replica set', { timeout: 180000 }, async (t) => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  process.env.DB_URI = repl.getUri()
  process.env.DB_NAME = `checkout_test_${new ObjectId()}`
  process.env.JWT_SECRET_ACCESS_TOKEN = 'checkout-integration-access-secret'
  const mongo = new MongoClient(process.env.DB_URI)
  const database = (await import('../../src/services/database.services')).default
  t.after(async () => {
    await database.close()
    await mongo.close()
    await repl.stop()
  })
  const orders = (await import('../../src/services/orders.services')).default
  const inventory = (await import('../../src/services/inventory.services')).default
  const carts = (await import('../../src/services/cart.services')).default
  const weekly = (await import('../../src/services/weekly-orders.services')).default
  const foods = (await import('../../src/services/foods.services')).default
  await database.connect()
  await createSchemaIndexes(mongo.db(process.env.DB_NAME))

  async function fixture(weeklyCart = false, stock = 100) {
    // Chỉ reset các collection trên replica set tạm vừa tạo.
    for (const collection of [
      database.users,
      database.carts,
      database.foods,
      database.orders,
      database.mealPlans,
      database.transactions,
      database.auditLogs
    ])
      await collection.deleteMany({})
    const customer = new User({ _id: new ObjectId(), email: 'checkout@test.local', password: 'unused' })
    const admin = new User({ _id: new ObjectId(), email: 'admin@test.local', password: 'unused', role: UserRole.ADMIN })
    await database.users.insertMany([customer, admin])
    const food = new Food({
      _id: new ObjectId(),
      name: 'Cơm gà',
      description: 'Test',
      images: [],
      price: 50000,
      calories: 400,
      nutrition: { protein: 30, carb: 40, fat: 13 },
      ingredients: [],
      tags: [],
      stock,
      isActive: true
    })
    const alternative = new Food({ ...food, _id: new ObjectId(), name: 'Cơm cá' })
    await database.foods.insertMany([food, alternative])
    const start = new Date()
    start.setUTCDate(start.getUTCDate() + 3)
    const deliveryDate = toLocalDate(start)
    const cart = new Cart({
      _id: new ObjectId(),
      userId: customer._id!,
      cartType: weeklyCart ? 'COMBO' : 'FOOD',
      items: Array.from({ length: weeklyCart ? 7 : 1 }, (_, index) => {
        const date = new Date(`${deliveryDate}T12:00:00+07:00`)
        date.setUTCDate(date.getUTCDate() + index)
        return { itemId: food._id!, quantity: 1, deliveryDate: toLocalDate(date), mealSlot: 'Lunch' }
      })
    })
    await database.carts.insertOne(cart)
    const payload: CreateOrderReqBody = {
      idempotencyKey: `checkout-${new ObjectId()}`,
      cartVersion: 0,
      deliveryDate,
      deliveryTime: '12:00',
      deliveryAddress: 'Test address',
      distanceKm: 6,
      packageType: weeklyCart ? 'WEEKLY_7D' : 'ONE_DAY',
      paymentMethod: 'VNPay'
    }
    return { customer, admin, userId: String(customer._id), food, alternative, cart, payload }
  }

  await t.test(
    'online checkout holds the aggregate once, snapshots every day, clears cart and records 10/15 minute deadlines',
    async () => {
      const f = await fixture(true)
      await database.carts.updateOne({ _id: f.cart._id }, { $set: { 'items.0.quantity': 2 } })
      const result = await orders.createOrder(f.userId, f.payload)
      assert.equal(result.inventoryHold.status, 'Held')
      assert.equal(result.inventoryHold.items[0].quantity, 8)
      assert.equal(result.inventoryHold.expiresAt!.getTime() - result.createdAt.getTime(), 600000)
      assert.equal(result.paymentDueAt!.getTime() - result.createdAt.getTime(), 900000)
      assert.equal(result.subtotal, 400000)
      assert.equal(result.shippingFee, 20000)
      assert.deepEqual(
        result.deliveries.map((day) => day.shipping.totalFee),
        [20000, 0, 0, 0, 0, 0, 0]
      )
      const food = await database.foods.findOne({ _id: f.food._id })
      assert.equal(food!.reservedStock, 8)
      assert.equal(food!.stock, 100)
      const cart = await database.carts.findOne({ _id: f.cart._id })
      assert.equal(cart!.items.length, 0)
      assert.equal(cart!.version, 1)
      assert.equal(result.statusHistory[0].status, 'Pending')
    }
  )

  await t.test('COD confirms and deducts stock immediately for both single and weekly orders', async () => {
    for (const isWeekly of [false, true]) {
      const f = await fixture(isWeekly)
      const result = await orders.createOrder(f.userId, { ...f.payload, paymentMethod: 'COD' })
      assert.equal(result.status, 'Confirmed')
      assert.equal(result.payment.status, 'Pending')
      assert.equal(result.inventoryHold.status, 'Committed')
      assert.equal(result.paymentDueAt, undefined)
      assert.equal(result.inventoryHold.expiresAt, undefined)
      assert.deepEqual(
        result.statusHistory.map((event) => event.status),
        ['Pending', 'Confirmed']
      )
      const food = await database.foods.findOne({ _id: f.food._id })
      assert.equal(food!.stock, isWeekly ? 93 : 99)
      assert.equal(food!.reservedStock, 0)
      assert.equal(await inventory.releaseExpiredHolds(new Date(Date.now() + 3600000)), 0)
    }
  })

  await t.test('concurrent replays create one order and preserve a newly filled cart', async () => {
    const f = await fixture()
    const results = await Promise.all(Array.from({ length: 6 }, () => orders.createOrder(f.userId, f.payload)))
    assert.equal(new Set(results.map((result) => String(result.orderId))).size, 1)
    assert.equal(await database.orders.countDocuments({}), 1)
    assert.equal((await database.foods.findOne({ _id: f.food._id }))!.reservedStock, 1)
    await carts.addItem(f.userId, { itemId: String(f.food._id), quantity: 2 })
    const replay = await orders.createOrder(f.userId, { ...f.payload })
    assert.equal(replay.replayed, true)
    assert.equal((await database.carts.findOne({ userId: f.customer._id }))!.items[0].quantity, 2)
    await assert.rejects(orders.createOrder(f.userId, { ...f.payload, note: 'Changed request' }), { status: 409 })
  })

  await t.test('different keys cannot consume the same cart twice', async () => {
    const f = await fixture()
    const outcomes = await Promise.allSettled([
      orders.createOrder(f.userId, f.payload),
      orders.createOrder(f.userId, { ...f.payload, idempotencyKey: 'other-checkout-key' })
    ])
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1)
    assert.equal(await database.orders.countDocuments({}), 1)
    assert.equal((await database.foods.findOne({ _id: f.food._id }))!.reservedStock, 1)
  })

  await t.test('two customers competing for the last serving cannot oversell', async () => {
    const f = await fixture(false, 1)
    const other = new ObjectId()
    await database.carts.insertOne(new Cart({ ...f.cart, _id: new ObjectId(), userId: other }))
    const outcomes = await Promise.allSettled([
      orders.createOrder(f.userId, f.payload),
      orders.createOrder(String(other), f.payload)
    ])
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1)
    assert.equal(await database.orders.countDocuments({}), 1)
    const failure = outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult
    assert.ok([400, 409].includes(failure.reason.status))
    assert.ok(failure.reason.issues.length > 0)
    assert.equal((await database.foods.findOne({ _id: f.food._id }))!.reservedStock, 1)
    assert.equal(await database.carts.countDocuments({ 'items.0': { $exists: true } }), 1)
  })

  await t.test(
    'price/name changes after preview are reread; fractional shipping boundaries are preserved',
    async (st) => {
      const f = await fixture()
      const original = orders.quoteOrder.bind(orders)
      st.mock.method(orders, 'quoteOrder', async (...args: Parameters<typeof orders.quoteOrder>) => {
        const quote = await original(...args)
        await database.foods.updateOne({ _id: f.food._id }, { $set: { price: 60000, name: 'Tên mới' } })
        return quote
      })
      const result = await orders.createOrder(f.userId, { ...f.payload, distanceKm: 2.001 })
      assert.equal(result.subtotal, 60000)
      assert.equal(result.deliveries[0].items[0].foodName, 'Tên mới')
      assert.equal(result.shippingFee, 5000)
    }
  )

  await t.test('stale or concurrently edited carts fail without deleting new items or holding stock', async (st) => {
    const f = await fixture()
    await assert.rejects(orders.createOrder(f.userId, { ...f.payload, cartVersion: 9 }), { status: 409 })
    const original = orders.quoteOrder.bind(orders)
    st.mock.method(orders, 'quoteOrder', async (...args: Parameters<typeof orders.quoteOrder>) => {
      const quote = await original(...args)
      await carts.addItem(f.userId, { itemId: String(f.food._id), quantity: 1 })
      return quote
    })
    await assert.rejects(orders.createOrder(f.userId, f.payload), { status: 409 })
    assert.equal(await database.orders.countDocuments({}), 0)
    assert.equal(
      (await database.carts.findOne({ _id: f.cart._id }))!.items.reduce((sum, item) => sum + item.quantity, 0),
      2
    )
    assert.equal((await database.foods.findOne({ _id: f.food._id }))!.reservedStock, 0)
  })

  await t.test('a failure after clearing the cart rolls back order, stock and cart together', async (st) => {
    const f = await fixture()
    const original = carts.finishCheckout.bind(carts)
    st.mock.method(carts, 'finishCheckout', async (...args: Parameters<typeof carts.finishCheckout>) => {
      await original(...args)
      throw new Error('Simulated failure before commit')
    })
    await assert.rejects(orders.createOrder(f.userId, f.payload), /Simulated failure/)
    assert.equal(await database.orders.countDocuments({}), 0)
    assert.equal((await database.carts.findOne({ _id: f.cart._id }))!.items.length, 1)
    assert.equal((await database.foods.findOne({ _id: f.food._id }))!.reservedStock, 0)
  })

  await t.test('hidden foods and shortages on any weekly line fail without partial reservation', async () => {
    const f = await fixture(true, 6)
    await assert.rejects(orders.createOrder(f.userId, f.payload), (error: unknown) => {
      const problem = error as { issues: unknown[] }
      assert.equal(problem.issues.length, 7)
      return true
    })
    await database.foods.updateOne({ _id: f.food._id }, { $set: { stock: 100, isActive: false } })
    await assert.rejects(orders.createOrder(f.userId, f.payload), { status: 400 })
    assert.equal(await database.orders.countDocuments({}), 0)
    assert.equal((await database.foods.findOne({ _id: f.food._id }))!.reservedStock, 0)
  })

  await t.test('overlapping expiry workers release once and never cancel the order at ten minutes', async () => {
    const f = await fixture()
    const result = await orders.createOrder(f.userId, f.payload)
    const deadline = result.inventoryHold.expiresAt!
    assert.equal(await inventory.releaseExpiredHold(result.orderId, new Date(deadline.getTime() - 1)), false)
    const outcomes = await Promise.all([
      inventory.releaseExpiredHold(result.orderId, deadline),
      inventory.releaseExpiredHold(result.orderId, deadline)
    ])
    assert.equal(outcomes.filter(Boolean).length, 1)
    const updated = await database.orders.findOne({ _id: result.orderId })
    assert.equal(updated!.status, 'Pending')
    assert.equal(updated!.inventoryHold.status, 'Released')
    assert.equal(updated!.paymentDueAt!.getTime(), result.paymentDueAt!.getTime())
    assert.equal((await database.foods.findOne({ _id: f.food._id }))!.reservedStock, 0)
    assert.equal(await database.auditLogs.countDocuments({ action: 'StockReleased' }), 1)
  })

  await t.test(
    'retry reacquires released stock within the original payment deadline and cannot extend it',
    async () => {
      const f = await fixture()
      const created = await orders.createOrder(f.userId, f.payload)
      const due = new Date(Date.now() + 240000)
      await database.orders.updateOne(
        { _id: created.orderId },
        {
          $set: { 'inventoryHold.expiresAt': new Date(Date.now() - 1), paymentDueAt: due }
        }
      )
      await inventory.releaseExpiredHolds()
      const retried = await orders.retryPayment(f.userId, String(created.orderId), { paymentMethod: 'MoMo' })
      assert.equal(retried.inventoryHold.status, 'Held')
      assert.equal(retried.inventoryHold.expiresAt!.getTime(), due.getTime())
      const again = await orders.retryPayment(f.userId, String(created.orderId), {})
      assert.equal(again.inventoryHold.expiresAt!.getTime(), due.getTime())
      assert.equal((await database.foods.findOne({ _id: f.food._id }))!.reservedStock, 1)
      await database.orders.updateOne({ _id: created.orderId }, { $set: { paymentDueAt: new Date(Date.now() - 1) } })
      await assert.rejects(orders.retryPayment(f.userId, String(created.orderId), {}), { status: 400 })
    }
  )

  await t.test('retry fails without overselling when released stock belongs to another order', async () => {
    const f = await fixture(false, 1)
    const created = await orders.createOrder(f.userId, f.payload)
    await inventory.releaseExpiredHold(created.orderId, created.inventoryHold.expiresAt!)
    const other = new ObjectId()
    await database.carts.insertOne(new Cart({ ...f.cart, _id: new ObjectId(), userId: other }))
    await orders.createOrder(String(other), f.payload)
    await assert.rejects(orders.retryPayment(f.userId, String(created.orderId), {}), { status: 409 })
    assert.equal((await database.orders.findOne({ _id: created.orderId }))!.inventoryHold.status, 'Released')
    assert.equal((await database.foods.findOne({ _id: f.food._id }))!.reservedStock, 1)
  })

  await t.test(
    'single-order cancellation releases held stock or restores unprepared COD stock exactly once',
    async () => {
      for (const method of ['VNPay', 'COD'] as const) {
        const f = await fixture()
        const created = await orders.createOrder(f.userId, { ...f.payload, paymentMethod: method })
        await orders.cancelOrder(f.userId, String(created.orderId))
        await assert.rejects(orders.cancelOrder(f.userId, String(created.orderId)), { status: 400 })
        const food = await database.foods.findOne({ _id: f.food._id })
        assert.equal(food!.stock, 100)
        assert.equal(food!.reservedStock, 0)
        assert.equal((await database.orders.findOne({ _id: created.orderId }))!.inventoryHold.status, 'Released')
      }
    }
  )

  await t.test('weekly swap and cancellation use the checkout hold without double counting', async () => {
    const f = await fixture(true)
    const created = await orders.createOrder(f.userId, f.payload)
    const first = created.deliveries[0]
    await weekly.swapItem(f.userId, String(created.orderId), String(first._id), String(first.items[0]._id), {
      foodId: String(f.alternative._id),
      version: 0
    })
    assert.equal((await database.foods.findOne({ _id: f.food._id }))!.reservedStock, 6)
    assert.equal((await database.foods.findOne({ _id: f.alternative._id }))!.reservedStock, 1)
    await weekly.cancelDelivery(f.userId, String(created.orderId), String(first._id), {
      version: 1,
      reason: 'Đổi lịch'
    })
    const updated = await database.orders.findOne({ _id: created.orderId })
    assert.equal(updated!.inventoryHold.items[0].quantity, 6)
    assert.equal((await database.foods.findOne({ _id: f.alternative._id }))!.reservedStock, 0)
    await inventory.releaseExpiredHold(created.orderId, created.inventoryHold.expiresAt!)
    assert.equal((await database.foods.findOne({ _id: f.food._id }))!.reservedStock, 0)
    assert.equal(await database.transactions.countDocuments({}), 0)
  })

  await t.test('stock commit and expiry compete atomically, without releasing a paid order', async () => {
    const f = await fixture()
    const created = await orders.createOrder(f.userId, f.payload)
    await Promise.all([
      database.withTransaction(async (session) => {
        const order = (await database.orders.findOne({ _id: created.orderId }, { session }))!
        await inventory.commitHold(order, session)
        order.payment.status = 'Paid'
        order.status = 'Confirmed'
        await database.orders.updateOne(
          { _id: order._id },
          {
            $set: { inventoryHold: order.inventoryHold, payment: order.payment, status: order.status },
            $inc: { version: 1 }
          },
          { session }
        )
      }),
      inventory.releaseExpiredHold(created.orderId, created.inventoryHold.expiresAt!)
    ])
    const order = (await database.orders.findOne({ _id: created.orderId }))!
    assert.equal(order.inventoryHold.status, 'Committed')
    assert.equal(order.payment.status, 'Paid')
    const food = (await database.foods.findOne({ _id: f.food._id }))!
    assert.equal(food.stock, 99)
    assert.equal(food.reservedStock, 0)
    assert.equal(await inventory.releaseExpiredHold(created.orderId, new Date(Date.now() + 3600000)), false)
  })

  await t.test('Admin cannot lower stock below held quantity or bypass payment through legacy endpoints', async () => {
    const f = await fixture()
    const created = await orders.createOrder(f.userId, f.payload)
    await assert.rejects(foods.updateFood(String(f.food._id), { stock: 0 }), { status: 409 })
    await foods.updateFood(String(f.food._id), { stock: 1 })
    await assert.rejects(orders.updatePaymentStatus(String(f.admin._id), String(created.orderId), { status: 'Paid' }), {
      status: 400
    })
    await assert.rejects(
      orders.updateOrderStatus(String(f.admin._id), String(created.orderId), { status: 'Cooking' }),
      { status: 400 }
    )
    assert.equal((await database.orders.findOne({ _id: created.orderId }))!.payment.status, 'Pending')
  })

  await t.test('a source meal plan is checked and locked with checkout, and rolls back on failure', async (st) => {
    const f = await fixture()
    const planId = new ObjectId(),
      mealId = new ObjectId()
    await database.mealPlans.insertOne({
      _id: planId,
      userId: f.customer._id!,
      status: 'Draft',
      version: 0,
      startDate: f.payload.deliveryDate,
      durationDays: 1,
      healthProfileSnapshot: {
        gender: 'Male',
        age: 25,
        heightCm: 170,
        weightKg: 65,
        activityLevel: 'Moderate',
        goal: 'MaintainWeight',
        allergies: []
      },
      days: [
        {
          date: f.payload.deliveryDate,
          approximate: true,
          warnings: [],
          meals: [
            {
              _id: mealId,
              foodId: f.food._id!,
              foodName: f.food.name,
              slot: 'Lunch',
              quantity: 1,
              calories: 400,
              nutrition: f.food.nutrition,
              price: f.food.price
            }
          ]
        }
      ]
    })
    await database.carts.updateOne(
      { _id: f.cart._id },
      { $set: { 'items.0.mealPlanId': planId, 'items.0.mealPlanItemId': mealId } }
    )
    const original = carts.finishCheckout.bind(carts)
    const mocked = st.mock.method(carts, 'finishCheckout', async (...args: Parameters<typeof carts.finishCheckout>) => {
      await original(...args)
      throw new Error('Simulated plan checkout rollback')
    })
    await assert.rejects(orders.createOrder(f.userId, f.payload), /Simulated plan/)
    assert.equal((await database.mealPlans.findOne({ _id: planId }))!.status, 'Draft')
    mocked.mock.restore()
    const created = await orders.createOrder(f.userId, f.payload)
    const plan = (await database.mealPlans.findOne({ _id: planId }))!
    assert.equal(plan.status, 'Ordered')
    assert.equal(String(plan.orderId), String(created.orderId))
    assert.equal(plan.version, 1)
  })

  await t.test(
    'HTTP checkout validates identity fields, enforces roles and returns 201 then 200 on replay',
    async (st) => {
      const f = await fixture()
      const users = (await import('../../src/services/user.services')).default
      st.mock.method(
        users,
        'validateSession',
        async (payload) => (await database.users.findOne({ _id: new ObjectId(payload.user_id) }))!
      )
      const router = (await import('../../src/routes/orders.routes')).default
      const { defaultErrorHandler } = await import('../../src/middlewares/errors.middlewares')
      const { TokenType } = await import('../../src/constants/enums')
      const app = express()
      app.use(express.json())
      app.use('/orders', router)
      app.use(defaultErrorHandler)
      const server = app.listen(0, '127.0.0.1')
      await new Promise<void>((resolve) => server.once('listening', resolve))
      st.after(
        () =>
          new Promise<void>((resolve) => {
            server.closeAllConnections()
            server.close(() => resolve())
          })
      )
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/orders`
      const call = async (actor: User, body: object) => {
        const token = jwt.sign(
          { user_id: String(actor._id), token_type: TokenType.AccessToken },
          process.env.JWT_SECRET_ACCESS_TOKEN!
        )
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        return { status: response.status, body: await response.json() }
      }
      assert.equal((await call(f.admin, f.payload)).status, 403)
      for (const invalid of [
        { idempotencyKey: undefined },
        { idempotencyKey: 'short' },
        { idempotencyKey: 'with space key' },
        { cartVersion: undefined },
        { cartVersion: -1 },
        { cartVersion: 0.5 },
        { cartVersion: {} }
      ]) {
        assert.equal((await call(f.customer, { ...f.payload, ...invalid })).status, 422)
      }
      const created = await call(f.customer, f.payload)
      const replay = await call(f.customer, f.payload)
      assert.equal(created.status, 201)
      assert.equal(replay.status, 200)
      assert.equal(created.body.result.orderId, replay.body.result.orderId)
      assert.equal(replay.body.result.replayed, true)
      assert.equal(await database.orders.countDocuments({}), 1)
    }
  )
})
