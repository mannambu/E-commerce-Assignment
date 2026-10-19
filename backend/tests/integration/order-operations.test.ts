import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AddressInfo } from 'node:net'
import express from 'express'
import bcrypt from 'bcryptjs'
import { MongoClient, ObjectId } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import User, { ALL_ROLES, AccountStatus, UserRole } from '../../src/models/schemas/User.schema'
import type Order from '../../src/models/schemas/Order.schema'
import { toLocalDate } from '../../src/models/schemas/common'
import { createSchemaIndexes } from '../../src/models/schema-indexes'

test('Direct assignments and kitchen workflow on a real replica set', { timeout: 180000 }, async (t) => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  process.env.DB_URI = repl.getUri()
  process.env.DB_NAME = `operations_${new ObjectId()}`
  process.env.JWT_SECRET_ACCESS_TOKEN = 'operations-access'
  process.env.JWT_SECRET_REFRESH_TOKEN = 'operations-refresh'
  const mongo = new MongoClient(process.env.DB_URI)
  const db = (await import('../../src/services/database.services')).default
  const operations = (await import('../../src/services/order-operations.services')).default
  const users = (await import('../../src/services/user.services')).default
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
  const hash = await bcrypt.hash('Kitchen123!', 4)
  async function account(key: string, role: UserRole) {
    const user = new User({
      _id: new ObjectId(),
      email: `${new ObjectId()}@example.com`,
      username: `staff_${new ObjectId()}`,
      password: hash,
      role
    })
    await db.users.insertOne(user)
    accounts.set(key, user)
    tokens.set(key, (await users.login({ identifier: user.email, password: 'Kitchen123!' })).access_token)
    return user
  }
  for (const role of ALL_ROLES) await account(role, role)
  await account('kitchen2', UserRole.KITCHEN)
  await account('shipper2', UserRole.DELIVERY)
  const uid = (key: string) => String(accounts.get(key)!._id)
  async function request(path: string, role: string = UserRole.MANAGER, body?: object) {
    const response = await fetch(`${base}${path}`, {
      method: body ? 'PATCH' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(tokens.has(role) ? { Authorization: `Bearer ${tokens.get(role)}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    return { status: response.status, body: (await response.json()) as any }
  }
  async function fixture(status: 'Pending' | 'Confirmed' | 'Cooking' | 'Ready' = 'Confirmed', days = 1) {
    const now = new Date()
    const order: Order = {
      _id: new ObjectId(),
      userId: accounts.get(UserRole.CUSTOMER)!._id!,
      orderCode: `TEST-${new ObjectId()}`,
      packageType: days === 1 ? 'ONE_DAY' : 'WEEKLY_7D',
      status,
      statusHistory: [{ status, changedAt: now }],
      deliveries: Array.from({ length: days }, () => ({
        _id: new ObjectId(),
        date: toLocalDate(now),
        scheduledAt: now,
        status,
        statusHistory: [{ status, changedAt: now }],
        subtotal: 50000,
        shipping: { baseFee: 20000, extraFee: 0, totalFee: 20000, distanceKm: 6 },
        waivedShippingFee: 0,
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
      shippingFee: days * 20000,
      grandTotal: days * 70000,
      deliveryAddress: 'Private address',
      note: '',
      payment: { method: 'COD', status: 'Pending', paidAmount: 0 },
      inventoryHold: { status: 'Committed', items: [] },
      version: 0,
      createdAt: now,
      updatedAt: now
    }
    await db.orders.insertOne(order)
    return { order, path: `/orders/${order._id}/deliveries/${order.deliveries[0]._id}` }
  }
  const kitchenBody = (version = 0, key: string = UserRole.KITCHEN) => ({
    kitchenStaffIds: [uid(key)],
    version,
    reason: 'Phân công chế biến'
  })
  const shipperBody = (version = 0, key: string = UserRole.DELIVERY) => ({
    assignedShipperId: uid(key),
    version,
    reason: 'Phân công giao hàng'
  })
  const stored = (order: Order) => db.orders.findOne({ _id: order._id })

  await t.test('only Manager can assign or list active staff; safe paginated picker', async () => {
    const f = await fixture()
    for (const role of ALL_ROLES.filter((role) => role !== UserRole.MANAGER)) {
      assert.equal((await request(`${f.path}/kitchen-assignment`, role, kitchenBody())).status, 403)
      assert.equal((await request(`${f.path}/shipper-assignment`, role, shipperBody())).status, 403)
      assert.equal((await request('/workspace/staff?role=Kitchen%20Staff', role)).status, 403)
    }
    assert.equal((await request(`${f.path}/kitchen-assignment`, 'anonymous', kitchenBody())).status, 401)
    const picker = await request('/workspace/staff?role=Kitchen%20Staff&limit=1&page=1')
    assert.equal(picker.status, 200)
    assert.equal(picker.body.total, 2)
    assert.equal(picker.body.result.length, 1)
    assert.deepEqual(Object.keys(picker.body.result[0]).sort(), ['_id', 'email', 'role', 'username'])
    assert.equal((await request('/workspace/staff?role=Admin')).status, 422)
    assert.equal((await request('/workspace/staff?role=Kitchen%20Staff&limit=0')).status, 422)
    assert.equal((await request('/workspace/staff?role=Kitchen%20Staff&search=%2E%2A')).body.total, 0)
  })

  await t.test(
    'reject invalid payload, duplicate IDs, wrong role, inactive or missing staff with no writes',
    async () => {
      const f = await fixture()
      const bodies = [
        { ...kitchenBody(), reason: ' ' },
        { ...kitchenBody(), version: -1 },
        { ...kitchenBody(), version: '0' },
        { ...kitchenBody(), kitchenStaffIds: [] },
        { ...kitchenBody(), kitchenStaffIds: ['bad'] },
        { ...kitchenBody(), kitchenStaffIds: [uid(UserRole.KITCHEN), uid(UserRole.KITCHEN).toUpperCase()] }
      ]
      for (const body of bodies)
        assert.equal((await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, body)).status, 422)
      assert.equal(
        (await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody(0, UserRole.DELIVERY))).status,
        409
      )
      assert.equal(
        (
          await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, {
            ...kitchenBody(),
            kitchenStaffIds: [String(new ObjectId())]
          })
        ).status,
        409
      )
      const locked = await account('locked', UserRole.KITCHEN)
      await db.users.updateOne({ _id: locked._id }, { $set: { account_status: AccountStatus.LOCKED } })
      assert.equal(
        (await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody(0, 'locked'))).status,
        409
      )
      assert.equal((await request(`/workspace/staff?role=Kitchen%20Staff&search=${locked.email}`)).body.total, 0)
      assert.equal((await stored(f.order))!.version, 0)
      assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id }), 0)
    }
  )

  await t.test('assignment and reassignment change visibility, preserve state and reject stale versions', async () => {
    const f = await fixture()
    const assigned = await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody())
    assert.equal(assigned.status, 200)
    assert.equal(assigned.body.result.status, 'Confirmed')
    assert.equal(assigned.body.result.version, 1)
    assert.equal((await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody())).status, 409)
    const noop = await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody(1))
    assert.equal(noop.body.result.changed, false)
    assert.equal(noop.body.result.version, 1)
    assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id }), 1)
    const queue = await request('/workspace/orders', UserRole.KITCHEN)
    const row = queue.body.result.find((row: any) => row.orderId === String(f.order._id))
    assert.ok(row)
    assert.equal(row.deliveryAddress, undefined)
    assert.equal(row.items[0].price, undefined)
    assert.equal(row.payment, undefined)
    assert.equal(
      (await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody(1, 'kitchen2'))).status,
      200
    )
    assert.ok(
      !(await request('/workspace/orders', UserRole.KITCHEN)).body.result.some(
        (row: any) => row.orderId === String(f.order._id)
      )
    )
    assert.equal(
      (await request(`${f.path}/kitchen-status`, UserRole.KITCHEN, { status: 'Cooking', version: 2 })).status,
      403
    )
    assert.equal((await request(`${f.path}/kitchen-status`, 'kitchen2', { status: 'Cooking', version: 2 })).status, 200)
    assert.equal((await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody(3))).status, 409)
  })

  await t.test('assigned kitchen follows Confirmed → Cooking → Ready, no money or calorie side effects', async () => {
    const f = await fixture()
    await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody())
    for (const role of ALL_ROLES.filter((role) => role !== UserRole.KITCHEN))
      assert.equal((await request(`${f.path}/kitchen-status`, role, { status: 'Cooking', version: 1 })).status, 403)
    assert.equal(
      (await request(`${f.path}/kitchen-status`, UserRole.KITCHEN, { status: 'Ready', version: 1 })).status,
      409
    )
    assert.equal(
      (await request(`${f.path}/kitchen-status`, UserRole.KITCHEN, { status: 'Delivering', version: 1 })).status,
      422
    )
    const cooking = await request(`${f.path}/kitchen-status`, UserRole.KITCHEN, { status: 'Cooking', version: 1 })
    assert.equal(cooking.status, 200)
    assert.deepEqual(Object.keys(cooking.body.result).sort(), ['changed', 'deliveryId', 'orderId', 'status', 'version'])
    const ready = await request(`${f.path}/kitchen-status`, UserRole.KITCHEN, { status: 'Ready', version: 2 })
    assert.equal(ready.status, 200)
    assert.equal(
      (await request(`${f.path}/kitchen-status`, UserRole.KITCHEN, { status: 'Ready', version: 3 })).body.result
        .changed,
      false
    )
    assert.equal(
      (await request(`${f.path}/kitchen-status`, UserRole.KITCHEN, { status: 'Cooking', version: 3 })).status,
      409
    )
    const order = (await stored(f.order))!
    assert.equal(order.status, 'Ready')
    assert.deepEqual(order.payment, f.order.payment)
    assert.deepEqual(order.inventoryHold, f.order.inventoryHold)
    assert.equal(order.deliveries[0].statusHistory.length, 3)
    assert.equal(await db.auditLogs.countDocuments({ entityId: order._id }), 3)
    assert.equal(await db.notifications.countDocuments({ entityId: order._id, userId: order.userId }), 2)
    assert.equal(await db.transactions.countDocuments({ orderId: order._id }), 0)
    assert.equal(await db.dailyHealthLogs.countDocuments({}), 0)
  })

  await t.test('weekly assignments and status checks apply to the selected day, not another day', async () => {
    const f = await fixture('Confirmed', 7)
    await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody())
    const second = `/orders/${f.order._id}/deliveries/${f.order.deliveries[1]._id}`
    assert.equal(
      (await request(`${second}/kitchen-status`, UserRole.KITCHEN, { status: 'Cooking', version: 1 })).status,
      403
    )
    await request(`${f.path}/kitchen-status`, UserRole.KITCHEN, { status: 'Cooking', version: 1 })
    await request(`${f.path}/kitchen-status`, UserRole.KITCHEN, { status: 'Ready', version: 2 })
    const order = (await stored(f.order))!
    assert.equal(order.status, 'Confirmed')
    assert.equal(order.deliveries[0].status, 'Ready')
    assert.ok(order.deliveries.slice(1).every((day) => day.status === 'Confirmed' && !day.kitchenStaffIds))
    const queue = (await request('/workspace/orders', UserRole.KITCHEN)).body.result
    assert.ok(!queue.some((row: any) => row.orderId === String(order._id)))
  })

  await t.test('enforce stages, delivery date, committed inventory and verified online payment', async () => {
    const pending = await fixture('Pending')
    assert.equal((await request(`${pending.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody())).status, 409)
    const f = await fixture()
    assert.equal((await request(`${f.path}/shipper-assignment`, UserRole.MANAGER, shipperBody())).status, 409)
    await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody())
    const cook = () => request(`${f.path}/kitchen-status`, UserRole.KITCHEN, { status: 'Cooking', version: 1 })
    await db.orders.updateOne(
      { _id: f.order._id },
      { $set: { 'deliveries.0.date': toLocalDate(new Date(Date.now() + 86400000)) } }
    )
    assert.equal((await cook()).status, 409)
    await db.orders.updateOne(
      { _id: f.order._id },
      { $set: { 'deliveries.0.date': toLocalDate(new Date()), 'inventoryHold.status': 'Held' } }
    )
    assert.equal((await cook()).status, 409)
    await db.orders.updateOne(
      { _id: f.order._id },
      { $set: { 'inventoryHold.status': 'Committed', payment: { method: 'VNPay', status: 'Paid', paidAmount: 70000 } } }
    )
    assert.equal((await cook()).status, 409)
    await db.transactions.insertOne({
      kind: 'Payment',
      status: 'Succeeded',
      method: 'VNPay',
      source: 'VerifiedIPN',
      orderId: f.order._id,
      amount: 70000,
      description: 'Test verified payment',
      occurredAt: new Date()
    })
    assert.equal((await cook()).status, 200)
  })

  await t.test('Manager assigns/reassigns shipper only at Ready; no dispatch or payment mutation', async () => {
    const f = await fixture('Ready')
    assert.equal(
      (await request(`${f.path}/shipper-assignment`, UserRole.MANAGER, shipperBody(0, UserRole.KITCHEN))).status,
      409
    )
    assert.equal(
      (await request(`${f.path}/shipper-assignment`, UserRole.MANAGER, { ...shipperBody(), assignedShipperId: 'bad' }))
        .status,
      422
    )
    assert.equal((await request(`${f.path}/shipper-assignment`, UserRole.MANAGER, shipperBody())).status, 200)
    assert.ok(
      (await request('/workspace/orders', UserRole.DELIVERY)).body.result.some(
        (row: any) => row.orderId === String(f.order._id)
      )
    )
    assert.equal(
      (await request(`${f.path}/shipper-assignment`, UserRole.MANAGER, shipperBody(1))).body.result.changed,
      false
    )
    assert.equal(
      (await request(`${f.path}/shipper-assignment`, UserRole.MANAGER, shipperBody(1, 'shipper2'))).status,
      200
    )
    assert.ok(
      !(await request('/workspace/orders', UserRole.DELIVERY)).body.result.some(
        (row: any) => row.orderId === String(f.order._id)
      )
    )
    assert.ok(
      (await request('/workspace/orders', 'shipper2')).body.result.some(
        (row: any) => row.orderId === String(f.order._id)
      )
    )
    assert.equal((await stored(f.order))!.status, 'Ready')
    assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id, action: 'ShipperAssigned' }), 2)
    assert.equal(await db.notifications.countDocuments({ entityId: f.order._id, userId: f.order.userId }), 2)
  })

  await t.test('concurrent reassignment and cooking have one winner, with no overwritten ownership', async () => {
    const f = await fixture()
    await request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody())
    const results = await Promise.all([
      request(`${f.path}/kitchen-assignment`, UserRole.MANAGER, kitchenBody(1, 'kitchen2')),
      request(`${f.path}/kitchen-status`, UserRole.KITCHEN, { status: 'Cooking', version: 1 })
    ])
    assert.equal(results.filter((result) => result.status === 200).length, 1)
    assert.ok(results.some((result) => [403, 409].includes(result.status)))
    const order = (await stored(f.order))!
    assert.equal(order.version, 2)
    assert.equal(await db.auditLogs.countDocuments({ entityId: order._id }), 2)
    if (order.deliveries[0].status === 'Cooking')
      assert.equal(String(order.deliveries[0].kitchenStaffIds![0]), uid(UserRole.KITCHEN))
    else assert.equal(String(order.deliveries[0].kitchenStaffIds![0]), uid('kitchen2'))
  })

  for (const collection of ['auditLogs', 'notifications'] as const) {
    await t.test(`${collection} failure rolls back assignment, user guard and order together`, async (st) => {
      const f = await fixture()
      const user = await db.users.findOne({ _id: accounts.get(UserRole.KITCHEN)!._id })
      st.mock.getter(
        db,
        collection,
        () =>
          ({
            insertOne: async () => {
              throw new Error('Storage failure')
            }
          }) as any
      )
      await assert.rejects(
        operations.assignKitchen(
          uid(UserRole.MANAGER),
          String(f.order._id),
          String(f.order.deliveries[0]._id),
          kitchenBody()
        ),
        /Storage failure/
      )
      assert.deepEqual(await stored(f.order), f.order)
      assert.equal((await db.users.findOne({ _id: user!._id }))!.assignmentVersion, user!.assignmentVersion)
      if (collection === 'notifications') assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id }), 0)
    })
  }
})
