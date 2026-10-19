import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AddressInfo } from 'node:net'
import express from 'express'
import bcrypt from 'bcryptjs'
import { MongoClient, ObjectId, Collection } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import User, { ALL_ROLES, AccountStatus, UserRole } from '../../src/models/schemas/User.schema'
import type Order from '../../src/models/schemas/Order.schema'
import type Notification from '../../src/models/schemas/Notification.schema'
import Food from '../../src/models/schemas/Food.schema'
import { toLocalDate } from '../../src/models/schemas/common'
import { createSchemaIndexes } from '../../src/models/schema-indexes'

test('Shipper HTTP, transactions and completed-day side effects', { timeout: 180000 }, async (t) => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  process.env.DB_URI = repl.getUri()
  process.env.DB_NAME = `shipper_${new ObjectId()}`
  process.env.JWT_SECRET_ACCESS_TOKEN = 'shipper-access'
  process.env.JWT_SECRET_REFRESH_TOKEN = 'shipper-refresh'
  const mongo = new MongoClient(process.env.DB_URI)
  const db = (await import('../../src/services/database.services')).default
  const users = (await import('../../src/services/user.services')).default
  const shipper = (await import('../../src/services/shipper.services')).default
  const operations = (await import('../../src/services/order-operations.services')).default
  const reviews = (await import('../../src/services/reviews.services')).default
  t.after(async () => {
    await db.close()
    await mongo.close()
    await repl.stop()
  })
  await db.connect()
  await createSchemaIndexes(mongo.db(process.env.DB_NAME))
  const app = express()
  app.use(express.json())
  app.use('/orders', (await import('../../src/routes/orders.routes')).default)
  app.use('/workspace', (await import('../../src/routes/workspace.routes')).default)
  app.use((await import('../../src/middlewares/errors.middlewares')).defaultErrorHandler)
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
  const accounts = new Map<string, User>()
  const tokens = new Map<string, string>()
  const hash = await bcrypt.hash('Shipper123!', 4)
  for (const key of [...ALL_ROLES, 'otherShipper']) {
    const role = key === 'otherShipper' ? UserRole.DELIVERY : (key as UserRole)
    const user = new User({
      _id: new ObjectId(),
      email: `${new ObjectId()}@example.com`,
      username: `staff_${new ObjectId()}`,
      password: hash,
      role
    })
    await db.users.insertOne(user)
    accounts.set(key, user)
    tokens.set(key, (await users.login({ identifier: user.email, password: 'Shipper123!' })).access_token)
  }
  const uid = (key: string) => String(accounts.get(key)!._id)
  async function request(path: string, body: object, role: string = UserRole.DELIVERY) {
    const response = await fetch(`${base}${path}/shipper-status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(tokens.has(role) ? { Authorization: `Bearer ${tokens.get(role)}` } : {})
      },
      body: JSON.stringify(body)
    })
    return {
      status: response.status,
      body: (await response.json()) as {
        result?: { status: string; version: number; changed: boolean; replayed?: boolean }
      }
    }
  }
  async function fixture(days = 1, method: 'COD' | 'VNPay' = 'VNPay') {
    const now = new Date()
    const order: Order = {
      _id: new ObjectId(),
      userId: accounts.get(UserRole.CUSTOMER)!._id!,
      orderCode: `TEST-${new ObjectId()}`,
      packageType: days === 1 ? 'ONE_DAY' : 'WEEKLY_7D',
      status: 'Ready',
      statusHistory: [{ status: 'Ready', changedAt: now }],
      deliveries: Array.from({ length: days }, (_, i) => ({
        _id: new ObjectId(),
        date: toLocalDate(new Date(now.getTime() + i * 86400000)),
        scheduledAt: now,
        status: 'Ready',
        statusHistory: [{ status: 'Ready', changedAt: now }],
        assignedShipperId: accounts.get(UserRole.DELIVERY)!._id,
        subtotal: 50000,
        shipping: { baseFee: i ? 0 : 20000, extraFee: 0, totalFee: i ? 0 : 20000, distanceKm: 6 },
        waivedShippingFee: i ? 20000 : 0,
        refundedAmount: 0,
        items: [
          {
            _id: new ObjectId(),
            foodId: new ObjectId(),
            foodName: 'Lunch',
            quantity: 1,
            price: 50000,
            calories: 400,
            nutrition: { protein: 30, carb: 40, fat: 13 }
          }
        ]
      })),
      subtotal: days * 50000,
      shippingFee: 20000,
      grandTotal: days * 50000 + 20000,
      deliveryAddress: 'Delivery address',
      note: '',
      payment: {
        method,
        status: method === 'COD' ? 'Pending' : 'Paid',
        paidAmount: method === 'COD' ? 0 : days * 50000 + 20000
      },
      inventoryHold: { status: 'Committed', items: [] },
      version: 0,
      createdAt: now,
      updatedAt: now
    }
    await db.orders.insertOne(order)
    if (method !== 'COD')
      await db.transactions.insertOne({
        kind: 'Payment',
        status: 'Succeeded',
        source: 'VerifiedIPN',
        method,
        amount: order.grandTotal,
        orderId: order._id,
        idempotencyKey: `payment:${order._id}`,
        description: 'Verified fixture',
        occurredAt: now
      })
    return { order, path: `/orders/${order._id}/deliveries/${order.deliveries[0]._id}` }
  }

  await t.test('only assigned active shipper can act on the exact delivery', async () => {
    const f = await fixture(7)
    for (const role of ALL_ROLES.filter((role) => role !== UserRole.DELIVERY))
      assert.equal((await request(f.path, { status: 'Delivering', version: 0 }, role)).status, 403)
    assert.equal((await request(f.path, { status: 'Delivering', version: 0 }, 'anonymous')).status, 401)
    assert.equal((await request(f.path, { status: 'Delivering', version: 0 }, 'otherShipper')).status, 403)
    await db.orders.updateOne({ _id: f.order._id }, { $unset: { 'deliveries.1.assignedShipperId': '' } })
    assert.equal(
      (
        await request(`/orders/${f.order._id}/deliveries/${f.order.deliveries[1]._id}`, {
          status: 'Delivering',
          version: 0
        })
      ).status,
      403
    )
    await db.users.updateOne(
      { _id: accounts.get(UserRole.DELIVERY)!._id },
      { $set: { account_status: AccountStatus.LOCKED } }
    )
    assert.equal((await request(f.path, { status: 'Delivering', version: 0 })).status, 401)
    await db.users.updateOne(
      { _id: accounts.get(UserRole.DELIVERY)!._id },
      { $set: { account_status: AccountStatus.ACTIVE } }
    )
  })

  await t.test('dispatch and online completion are idempotent; calories are recorded exactly once', async () => {
    const f = await fixture()
    const dispatch = { status: 'Delivering', version: 0 }
    assert.equal((await request(f.path, { status: 'Completed', version: 0 })).status, 409)
    assert.equal((await request(f.path, dispatch)).status, 200)
    assert.equal((await request(f.path, dispatch)).body.result!.replayed, true)
    assert.equal((await request(f.path, { status: 'Completed', version: 1, codCollectedAmount: 70000 })).status, 400)
    const complete = { status: 'Completed', version: 1 }
    const results = await Promise.all([request(f.path, complete), request(f.path, complete)])
    assert.ok(results.every((result) => result.status === 200))
    assert.equal(results.filter((result) => result.body.result!.changed).length, 1)
    assert.equal((await request(f.path, complete)).body.result!.changed, false)
    const order = (await db.orders.findOne({ _id: f.order._id }))!
    assert.equal(order.status, 'Completed')
    assert.equal(order.version, 2)
    assert.deepEqual(order.payment, f.order.payment)
    const day = await db.dailyHealthLogs.findOne({ userId: order.userId, date: order.deliveries[0].date })
    assert.equal(day!.meals.filter((meal) => meal.sourceId?.equals(order._id!)).length, 1)
    assert.equal(await db.transactions.countDocuments({ orderId: order._id }), 1)
    assert.equal(await db.auditLogs.countDocuments({ entityId: order._id }), 2)
    assert.equal(await db.notifications.countDocuments({ entityId: order._id }), 2)
    assert.equal((await request(f.path, { status: 'Delivering', version: 2 })).status, 409)
  })

  await t.test('weekly completion logs only completed day and enables review for its food only', async () => {
    const f = await fixture(7)
    for (const day of f.order.deliveries.slice(0, 2))
      await db.foods.insertOne(
        new Food({
          _id: day.items[0].foodId,
          name: 'Lunch',
          description: '',
          price: 50000,
          calories: 400,
          nutrition: { protein: 30, carb: 40, fat: 13 },
          ingredients: [],
          tags: [],
          images: [],
          stock: 10
        })
      )
    await request(f.path, { status: 'Delivering', version: 0 })
    assert.equal((await request(f.path, { status: 'Completed', version: 1 })).status, 200)
    const order = (await db.orders.findOne({ _id: f.order._id }))!
    assert.equal(order.status, 'Ready')
    assert.ok(order.deliveries.slice(1).every((day) => day.status === 'Ready'))
    assert.equal(await db.dailyHealthLogs.countDocuments({ 'meals.sourceId': order._id }), 1)
    await assert.rejects(
      reviews.createReview(uid(UserRole.CUSTOMER), {
        orderId: String(order._id),
        foodId: String(order.deliveries[1].items[0].foodId),
        rating: 5,
        comment: 'Cannot review before delivery'
      }),
      { status: 403 }
    )
    const review = await reviews.createReview(uid(UserRole.CUSTOMER), {
      orderId: String(order._id),
      foodId: String(order.deliveries[0].items[0].foodId),
      rating: 5,
      comment: 'Delivered'
    })
    assert.equal(review.verifiedPurchase, true)
  })

  await t.test('future delivery, invalid state, payment and stale version are rejected', async () => {
    const f = await fixture(7)
    assert.equal(
      (
        await request(`/orders/${f.order._id}/deliveries/${f.order.deliveries[1]._id}`, {
          status: 'Delivering',
          version: 0
        })
      ).status,
      409
    )
    assert.equal((await request(f.path, { status: 'Cooking', version: 0 })).status, 422)
    assert.equal((await request(f.path, { status: 'Delivering', version: '0' })).status, 422)
    assert.equal((await request(f.path, { status: 'Delivering', version: 99 })).status, 409)
    await db.orders.updateOne({ _id: f.order._id }, { $set: { 'inventoryHold.status': 'Held' } })
    assert.equal((await request(f.path, { status: 'Delivering', version: 0 })).status, 409)
    await db.orders.updateOne({ _id: f.order._id }, { $set: { 'inventoryHold.status': 'Committed' } })
    await db.transactions.deleteMany({ orderId: f.order._id })
    assert.equal((await request(f.path, { status: 'Delivering', version: 0 })).status, 409)
    assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id }), 0)
  })

  await t.test('COD per day records shortage and surplus without duplicate collection or changing price', async () => {
    const f = await fixture(7, 'COD')
    await request(f.path, { status: 'Delivering', version: 0 })
    assert.equal((await request(f.path, { status: 'Completed', version: 1 })).status, 400)
    for (const amount of [-1, 0.1, '70000', Number.MAX_SAFE_INTEGER + 1])
      assert.equal((await request(f.path, { status: 'Completed', version: 1, codCollectedAmount: amount })).status, 422)
    const complete = { status: 'Completed', version: 1, codCollectedAmount: 60000 }
    const results = await Promise.all([request(f.path, complete), request(f.path, complete)])
    assert.ok(results.every((result) => result.status === 200))
    assert.equal(results.filter((result) => result.body.result!.changed).length, 1)
    let order = (await db.orders.findOne({ _id: f.order._id }))!
    assert.equal(order.deliveries[0].deliveryResult!.codExpectedAmount, 70000)
    assert.equal(order.deliveries[0].deliveryResult!.codDifference, -10000)
    assert.equal(order.payment.paidAmount, 60000)
    assert.equal(order.payment.status, 'Pending')
    assert.equal(order.payment.codReconciliationRequired, true)
    assert.equal((await request(f.path, { ...complete, codCollectedAmount: 70000 })).status, 409)
    assert.equal(await db.transactions.countDocuments({ orderId: order._id, source: 'CODCollection' }), 1)
    const second = `/orders/${order._id}/deliveries/${order.deliveries[1]._id}`
    await db.orders.updateOne({ _id: order._id }, { $set: { 'deliveries.1.date': toLocalDate(new Date()) } })
    await request(second, { status: 'Delivering', version: 2 })
    assert.equal((await request(second, { status: 'Completed', version: 3, codCollectedAmount: 55000 })).status, 200)
    order = (await db.orders.findOne({ _id: f.order._id }))!
    assert.equal(order.deliveries[1].deliveryResult!.codExpectedAmount, 50000)
    assert.equal(order.deliveries[1].deliveryResult!.codDifference, 5000)
    assert.equal(order.payment.paidAmount, 115000)
    assert.equal(order.grandTotal, f.order.grandTotal)
  })

  await t.test('COD exact, zero and excess preserve actual amounts and flag reconciliation', async () => {
    for (const amount of [70000, 0, 80000]) {
      const f = await fixture(1, 'COD')
      await request(f.path, { status: 'Delivering', version: 0 })
      assert.equal((await request(f.path, { status: 'Completed', version: 1, codCollectedAmount: amount })).status, 200)
      const order = (await db.orders.findOne({ _id: f.order._id }))!
      assert.equal(order.status, 'Completed')
      assert.equal(order.payment.paidAmount, amount)
      assert.equal(order.payment.status, amount >= 70000 ? 'Paid' : 'Pending')
      assert.equal(order.payment.codReconciliationRequired, amount !== 70000)
      assert.equal(order.grandTotal, 70000)
      const payments = await db.transactions.find({ orderId: order._id, kind: 'Payment' }).toArray()
      assert.equal(payments.length, amount ? 1 : 0)
      if (amount) {
        assert.equal(payments[0].amount, amount)
        assert.equal(String(payments[0].deliveryId), String(order.deliveries[0]._id))
        assert.equal(String(payments[0].createdBy), uid(UserRole.DELIVERY))
      }
    }
  })

  await t.test(
    'Failed requires reason, accepts optional images and preserves other-day progress, money and stock',
    async () => {
      const f = await fixture(7, 'COD')
      await request(f.path, { status: 'Delivering', version: 0 })
      const failed = {
        status: 'Failed',
        version: 1,
        reason: 'Khách vắng nhà',
        evidenceUrls: ['https://example.com/proof.jpg']
      }
      assert.equal((await request(f.path, { status: 'Failed', version: 1 })).status, 400)
      assert.equal((await request(f.path, { ...failed, evidenceUrls: null })).status, 422)
      assert.equal((await request(f.path, { ...failed, evidenceUrls: ['http://example.com/proof.jpg'] })).status, 422)
      assert.equal((await request(f.path, { ...failed, reason: ' ' })).status, 422)
      assert.equal((await request(f.path, { ...failed, codCollectedAmount: 5000 })).status, 400)
      assert.equal((await request(f.path, failed)).status, 200)
      assert.equal((await request(f.path, failed)).body.result!.replayed, true)
      const order = (await db.orders.findOne({ _id: f.order._id }))!
      assert.equal(order.status, 'Ready')
      assert.equal(order.hasFailedDeliveries, true)
      assert.equal(order.deliveries[0].status, 'Failed')
      assert.ok(order.deliveries[0].failedAt instanceof Date)
      assert.deepEqual(order.deliveries[0].deliveryResult!.evidenceUrls, failed.evidenceUrls)
      assert.deepEqual(order.inventoryHold, f.order.inventoryHold)
      assert.deepEqual(order.payment, f.order.payment)
      assert.equal(await db.transactions.countDocuments({ orderId: order._id }), 0)
      assert.equal(await db.dailyHealthLogs.countDocuments({ 'meals.sourceId': order._id }), 0)
      assert.equal((await request(f.path, { status: 'Delivering', version: 2 })).status, 409)
      assert.equal((await request(f.path, { status: 'Completed', version: 2, codCollectedAmount: 70000 })).status, 409)
      for (const evidenceUrls of [undefined, []]) {
        const single = await fixture(1, 'COD')
        await request(single.path, { status: 'Delivering', version: 0 })
        assert.equal((await request(single.path, { ...failed, evidenceUrls })).status, 200)
        // Omitted and empty images mean the same result when a request is replayed.
        assert.equal((await request(single.path, { ...failed, evidenceUrls: [] })).body.result!.replayed, true)
        const saved = (await db.orders.findOne({ _id: single.order._id }))!
        assert.equal(saved.status, 'Failed')
        assert.deepEqual(saved.deliveries[0].deliveryResult!.evidenceUrls, [])
      }
    }
  )

  await t.test('concurrent Completed and Failed commit only one result', async () => {
    const f = await fixture(1, 'COD')
    await request(f.path, { status: 'Delivering', version: 0 })
    const results = await Promise.all([
      request(f.path, { status: 'Completed', version: 1, codCollectedAmount: 70000 }),
      request(f.path, {
        status: 'Failed',
        version: 1,
        reason: 'Khách vắng',
        evidenceUrls: ['https://example.com/proof.jpg']
      })
    ])
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409])
    const order = (await db.orders.findOne({ _id: f.order._id }))!
    assert.equal(order.version, 2)
    assert.equal(await db.transactions.countDocuments({ orderId: order._id }), order.status === 'Completed' ? 1 : 0)
    assert.equal(
      await db.dailyHealthLogs.countDocuments({ 'meals.sourceId': order._id }),
      order.status === 'Completed' ? 1 : 0
    )
  })

  await t.test('reassignment racing dispatch never lets the old shipper dispatch another assignee work', async () => {
    const f = await fixture(1, 'COD')
    const results = await Promise.allSettled([
      operations.assignShipper(uid(UserRole.MANAGER), String(f.order._id), String(f.order.deliveries[0]._id), {
        assignedShipperId: uid('otherShipper'),
        version: 0,
        reason: 'Đổi người giao'
      }),
      shipper.updateStatus(uid(UserRole.DELIVERY), String(f.order._id), String(f.order.deliveries[0]._id), {
        status: 'Delivering',
        version: 0
      })
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    const order = (await db.orders.findOne({ _id: f.order._id }))!
    assert.equal(order.version, 1)
    if (order.deliveries[0].status === 'Delivering')
      assert.equal(String(order.deliveries[0].assignedShipperId), uid(UserRole.DELIVERY))
    else assert.equal(String(order.deliveries[0].assignedShipperId), uid('otherShipper'))
    assert.equal(await db.auditLogs.countDocuments({ entityId: order._id }), 1)
  })

  await t.test('mismatched or already collected COD ledger cannot be collected again', async () => {
    const f = await fixture(1, 'COD')
    await request(f.path, { status: 'Delivering', version: 0 })
    const body = { status: 'Completed', version: 1, codCollectedAmount: 70000 }
    await db.orders.updateOne({ _id: f.order._id }, { $set: { 'payment.paidAmount': 70000 } })
    assert.equal((await request(f.path, body)).status, 409)
    await db.transactions.insertOne({
      kind: 'Payment',
      status: 'Succeeded',
      source: 'CODCollection',
      method: 'COD',
      amount: 70000,
      orderId: f.order._id,
      deliveryId: f.order.deliveries[0]._id,
      idempotencyKey: `legacy:${f.order._id}`,
      description: 'Previously collected',
      occurredAt: new Date()
    })
    assert.equal((await request(f.path, body)).status, 409)
    assert.equal((await db.orders.findOne({ _id: f.order._id }))!.status, 'Delivering')
    assert.equal(await db.transactions.countDocuments({ orderId: f.order._id }), 1)
  })

  await t.test('notification failure rolls completion, COD and calories back together', async (st) => {
    const f = await fixture(1, 'COD')
    await request(f.path, { status: 'Delivering', version: 0 })
    st.mock.getter(
      db,
      'notifications',
      () =>
        ({
          insertOne: async () => {
            throw new Error('Notification failure')
          }
        }) as unknown as Collection<Notification>
    )
    await assert.rejects(
      shipper.updateStatus(uid(UserRole.DELIVERY), String(f.order._id), String(f.order.deliveries[0]._id), {
        status: 'Completed',
        version: 1,
        codCollectedAmount: 70000
      }),
      /Notification failure/
    )
    assert.equal((await db.orders.findOne({ _id: f.order._id }))!.status, 'Delivering')
    assert.equal(await db.dailyHealthLogs.countDocuments({ 'meals.sourceId': f.order._id }), 0)
    assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id }), 1)
    assert.equal(await db.transactions.countDocuments({ orderId: f.order._id }), 0)
    assert.equal((await db.orders.findOne({ _id: f.order._id }))!.payment.paidAmount, 0)
  })
})
