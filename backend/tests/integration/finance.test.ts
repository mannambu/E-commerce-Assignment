import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AddressInfo } from 'node:net'
import express from 'express'
import bcrypt from 'bcryptjs'
import { MongoClient, ObjectId } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import User, { ALL_ROLES, UserRole, AccountStatus } from '../../src/models/schemas/User.schema'
import type Order from '../../src/models/schemas/Order.schema'
import { createSchemaIndexes } from '../../src/models/schema-indexes'

test('COD finance HTTP and privacy on an isolated replica set', { timeout: 180000 }, async (t) => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  process.env.DB_URI = repl.getUri()
  process.env.DB_NAME = `finance_${new ObjectId()}`
  process.env.JWT_SECRET_ACCESS_TOKEN = 'finance-access'
  process.env.JWT_SECRET_REFRESH_TOKEN = 'finance-refresh'
  const mongo = new MongoClient(process.env.DB_URI)
  const db = (await import('../../src/services/database.services')).default
  const users = (await import('../../src/services/user.services')).default
  const finance = (await import('../../src/services/finance.services')).default
  t.after(async () => {
    await db.close()
    await mongo.close()
    await repl.stop()
  })
  await db.connect()
  await createSchemaIndexes(mongo.db(process.env.DB_NAME))
  const app = express()
  app.use(express.json())
  app.use('/workspace/finance', (await import('../../src/routes/finance.routes')).default)
  app.use('/workspace', (await import('../../src/routes/workspace.routes')).default)
  app.use('/foods', (await import('../../src/routes/foods.routes')).default)
  app.use('/orders', (await import('../../src/routes/orders.routes')).default)
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
  const accounts = new Map<UserRole, User>(),
    tokens = new Map<UserRole, string>()
  const password = 'Finance123!'
  const hash = await bcrypt.hash(password, 4)
  for (const role of ALL_ROLES) {
    const user = new User({
      _id: new ObjectId(),
      email: `${role}@example.com`.toLowerCase(),
      username: `user_${role}`,
      password: hash,
      role
    })
    await db.users.insertOne(user)
    accounts.set(role, user)
    tokens.set(role, (await users.login({ identifier: user.email, password })).access_token)
  }
  const uid = (role: UserRole) => String(accounts.get(role)!._id)
  async function api(path: string, role: UserRole | null = UserRole.MANAGER, method = 'GET', body?: object) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${tokens.get(role)}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    const content = await response.text()
    return {
      status: response.status,
      body: content.startsWith('{') ? JSON.parse(content) : content,
      cache: response.headers.get('cache-control')
    }
  }
  const summary = '/workspace/finance/summary?from=2026-10-01&to=2026-10-02'
  t.beforeEach(async () => {
    await db.orders.deleteMany({})
    await db.transactions.deleteMany({})
    await db.foods.deleteMany({})
  })
  async function fixture() {
    const time = new Date('2026-10-01T12:00:00+07:00')
    const order: Order = {
      _id: new ObjectId(),
      userId: accounts.get(UserRole.CUSTOMER)!._id!,
      orderCode: String(new ObjectId()),
      packageType: 'WEEKLY_7D',
      status: 'Ready',
      statusHistory: [],
      deliveries: [
        {
          _id: new ObjectId(),
          date: '2026-10-01',
          scheduledAt: time,
          status: 'Completed',
          statusHistory: [{ status: 'Completed', changedAt: time }],
          items: [
            {
              _id: new ObjectId(),
              foodId: new ObjectId(),
              foodName: 'Rice',
              price: 50000,
              quantity: 2,
              costPrice: 20000,
              costEstimated: false,
              calories: 400,
              nutrition: { protein: 30, carb: 40, fat: 13 }
            }
          ],
          subtotal: 100000,
          shipping: { totalFee: 20000, baseFee: 20000, extraFee: 0, distanceKm: 6 },
          waivedShippingFee: 0,
          refundedAmount: 0
        }
      ],
      subtotal: 100000,
      shippingFee: 20000,
      grandTotal: 120000,
      deliveryAddress: 'Test',
      note: '',
      payment: { method: 'COD', status: 'Paid', paidAmount: 120000, refundedAmount: 0 },
      inventoryHold: { status: 'Committed', items: [] },
      version: 0,
      createdAt: time,
      updatedAt: time
    }
    await db.orders.insertOne(order)
    for (const [amount, occurredAt] of [
      [70000, time],
      [50000, new Date('2026-10-02T10:00:00+07:00')]
    ] as const)
      await db.transactions.insertOne({
        kind: 'Payment',
        status: 'Succeeded',
        amount,
        occurredAt,
        method: 'COD',
        source: 'Reconciliation',
        orderId: order._id,
        deliveryId: order.deliveries[0]._id,
        idempotencyKey: String(new ObjectId()),
        description: 'Real cash'
      })
    return order
  }

  await t.test(
    'only Manager and Admin may read; empty results are zero and malformed ranges are rejected',
    async () => {
      for (const role of [UserRole.CUSTOMER, UserRole.KITCHEN, UserRole.DELIVERY])
        assert.equal((await api(summary, role)).status, 403)
      assert.equal((await api(summary, null)).status, 401)
      for (const role of [UserRole.ADMIN, UserRole.MANAGER]) {
        const response = await api(summary, role)
        assert.equal(response.status, 200)
        assert.equal(response.cache, 'private, no-store')
        assert.equal(response.body.result.summary.foodRevenue, 0)
        assert.equal(response.body.result.daily.length, 2)
      }
      for (const query of ['from=2026-02-30&to=2026-03-01', 'from=2026-10-02&to=2026-10-01'])
        assert.equal((await api(`/workspace/finance/summary?${query}`)).status, 400)
      for (const query of ['from=x&to=2026-10-01', 'from=2026-10-01', 'from=2026-10-01&from=2026-10-02&to=2026-10-02'])
        assert.equal((await api(`/workspace/finance/summary?${query}`)).status, 422)
      assert.equal((await api('/workspace/finance/deliveries?from=2026-10-01&to=2026-10-02&limit=101')).status, 422)
    }
  )

  await t.test(
    'reports use completed days rather than root status, top-up date and original cost snapshots',
    async () => {
      const order = await fixture()
      const before = await db.orders.findOne({ _id: order._id })
      const response = await api(summary)
      assert.equal(response.status, 200)
      const result = response.body.result
      assert.equal(result.summary.foodRevenue, 100000)
      assert.equal(result.summary.cost, 40000)
      assert.equal(result.summary.grossProfit, 60000)
      assert.equal(result.daily[0].foodRevenue, 0)
      assert.equal(result.daily[1].foodRevenue, 100000)
      assert.equal(result.daily[1].cashCollected, 50000)
      const first = await api('/workspace/finance/summary?from=2026-10-01&to=2026-10-01')
      assert.equal(first.body.result.summary.foodRevenue, 0)
      const list = await api('/workspace/finance/deliveries?from=2026-10-02&to=2026-10-02&limit=1&page=1')
      assert.equal(list.body.result.total, 1)
      assert.equal(list.body.result.items[0].customer.email, accounts.get(UserRole.CUSTOMER)!.email)
      assert.equal(list.body.result.items[0].recognizedInRange, true)
      assert.equal(JSON.stringify(list.body).includes('password'), false)
      assert.equal(
        (await api('/workspace/finance/deliveries?from=2026-10-02&to=2026-10-02&page=2')).body.result.items.length,
        0
      )
      assert.deepEqual(await db.orders.findOne({ _id: order._id }), before)
      assert.equal((await api(summary, UserRole.MANAGER, 'POST', {})).status, 404)
      const customerOrder = await api(`/orders/${order._id}`, UserRole.CUSTOMER)
      assert.equal(customerOrder.status, 200)
      assert.equal(JSON.stringify(customerOrder.body).includes('costPrice'), false)
      assert.equal(JSON.stringify((await api('/workspace/orders', UserRole.MANAGER)).body).includes('costPrice'), false)
    }
  )

  await t.test(
    'old orders estimate from sale snapshot; orphan or inconsistent ledger never returns plausible wrong totals',
    async () => {
      const order = await fixture()
      await db.orders.updateOne(
        { _id: order._id },
        { $unset: { 'deliveries.0.items.0.costPrice': '', 'deliveries.0.items.0.costEstimated': '' } }
      )
      const response = await api(summary)
      assert.equal(response.body.result.summary.cost, 60000)
      assert.equal(response.body.result.summary.estimatedCostDeliveryCount, 1)
      await db.orders.updateOne({ _id: order._id }, { $set: { 'payment.paidAmount': 1 } })
      assert.equal((await api(summary)).status, 409)
      await db.orders.deleteOne({ _id: order._id })
      assert.equal((await api(summary)).status, 409)
    }
  )

  await t.test(
    'Admin cost price is optional, supports zero/null, rejects invalid values and is private in public catalogue',
    async () => {
      const body = {
        name: 'Rice',
        description: 'Meal',
        price: 50000,
        cost_price: 21000,
        calories: 400,
        nutrition: { protein: 30, carb: 40, fat: 13 },
        images: ['https://example.com/rice.jpg'],
        ingredients: [{ name: 'Rice', allergyTags: [] }],
        tags: [],
        stock: 20,
        goalTags: []
      }
      const created = await api('/foods', UserRole.ADMIN, 'POST', body)
      assert.equal(created.status, 201)
      const foodId = created.body.result._id
      assert.equal(created.body.result.cost_price, 21000)
      for (const role of [null, UserRole.CUSTOMER, UserRole.MANAGER, UserRole.KITCHEN, UserRole.DELIVERY]) {
        const detail = await api(`/foods/${foodId}`, role)
        assert.equal(detail.status, 200)
        assert.equal(detail.body.result.cost_price, undefined)
        assert.equal(JSON.stringify((await api('/foods', role)).body).includes('cost_price'), false)
      }
      assert.equal((await api(`/foods/${foodId}`, UserRole.ADMIN)).body.result.cost_price, 21000)
      assert.equal((await api(`/foods/${foodId}`, UserRole.MANAGER, 'PATCH', { cost_price: 1 })).status, 403)
      for (const cost_price of [-1, 1.5, 'bad', true])
        assert.equal((await api(`/foods/${foodId}`, UserRole.ADMIN, 'PATCH', { cost_price })).status, 422)
      for (const cost_price of [0, null]) {
        assert.equal((await api(`/foods/${foodId}`, UserRole.ADMIN, 'PATCH', { cost_price })).status, 200)
        assert.equal((await db.foods.findOne({ _id: new ObjectId(foodId) }))!.cost_price, cost_price)
      }
    }
  )

  await t.test('locked and demoted users cannot call finance service directly', async () => {
    const id = accounts.get(UserRole.MANAGER)!._id!
    try {
      await db.users.updateOne({ _id: id }, { $set: { account_status: AccountStatus.LOCKED } })
      await assert.rejects(finance.report(uid(UserRole.MANAGER), '2026-10-01', '2026-10-02'), { status: 403 })
      await db.users.updateOne({ _id: id }, { $set: { account_status: AccountStatus.ACTIVE, role: UserRole.CUSTOMER } })
      await assert.rejects(finance.report(uid(UserRole.MANAGER), '2026-10-01', '2026-10-02'), { status: 403 })
    } finally {
      await db.users.updateOne({ _id: id }, { $set: { account_status: AccountStatus.ACTIVE, role: UserRole.MANAGER } })
    }
  })
})
