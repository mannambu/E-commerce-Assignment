import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AddressInfo } from 'node:net'
import express from 'express'
import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import User, { ALL_ROLES, INTERNAL_ROLES, AccountStatus, UserRole } from '../../src/models/schemas/User.schema'
import type Order from '../../src/models/schemas/Order.schema'

test('roles and accounts with real HTTP, JWT and MongoDB transactions', { timeout: 180000 }, async (t) => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  process.env.DB_URI = repl.getUri()
  process.env.DB_NAME = `roles_test_${new ObjectId()}`
  process.env.JWT_SECRET_ACCESS_TOKEN = 'roles-integration-access'
  process.env.JWT_SECRET_REFRESH_TOKEN = 'roles-integration-refresh'
  const database = (await import('../../src/services/database.services')).default
  t.after(async () => {
    await database.close()
    await repl.stop()
  })
  const users = (await import('../../src/services/user.services')).default
  const { defaultErrorHandler } = await import('../../src/middlewares/errors.middlewares')
  const app = express()
  app.use(express.json())
  for (const [path, router] of [
    ['/users', (await import('../../src/routes/users.routes')).default],
    ['/workspace', (await import('../../src/routes/workspace.routes')).default],
    ['/orders', (await import('../../src/routes/orders.routes')).default],
    ['/cart', (await import('../../src/routes/cart.routes')).default],
    ['/foods', (await import('../../src/routes/foods.routes')).default]
  ] as const)
    app.use(path, router)
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
  async function request(path: string, token?: string, method = 'GET', body?: object) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    })
    return { status: response.status, body: (await response.json()) as any }
  }
  await database.connect()
  const password = 'Internal123!'
  const hash = await bcrypt.hash(password, 4)
  const accounts = new Map<UserRole, User>()
  const tokens = new Map<UserRole, string>()
  for (const [index, role] of ALL_ROLES.entries()) {
    const account = new User({
      _id: new ObjectId(),
      email: `role${index}@example.com`,
      username: `role${index}`,
      password: hash,
      role
    })
    await database.users.insertOne(account)
    accounts.set(role, account)
    tokens.set(role, (await users.login({ identifier: account.email, password })).access_token)
  }
  const admin = accounts.get(UserRole.ADMIN)!
  const adminToken = tokens.get(UserRole.ADMIN)!

  await t.test('all five roles authenticate; only Admin lists accounts or creates internal users', async () => {
    for (const role of ALL_ROLES) {
      assert.equal((await request('/users/me', tokens.get(role))).status, 200, role)
      assert.equal((await request('/users', tokens.get(role))).status, role === UserRole.ADMIN ? 200 : 403, role)
      if (role !== UserRole.ADMIN) assert.equal((await request('/users', tokens.get(role), 'POST', {})).status, 403)
    }
    const listed = await request('/users', adminToken)
    assert.equal(listed.body.result.total, 5)
    assert.deepEqual(new Set(listed.body.result.items.map((row: User) => row.role)), new Set(ALL_ROLES))
    assert.equal(JSON.stringify(listed.body).includes('password'), false)
    for (const [index, role] of INTERNAL_ROLES.entries()) {
      const body = {
        email: `new${index}@example.com`,
        username: `new${index}`,
        password,
        confirm_password: password,
        phone: '0901234567',
        role
      }
      assert.equal((await request('/users/register', undefined, 'POST', body)).status, 422)
      assert.equal((await request('/users', adminToken, 'POST', body)).status, 201)
      const created = await database.users.findOne({ email: body.email })
      assert.equal(created!.account_status, AccountStatus.ACTIVE)
      assert.equal((await request('/users/login', undefined, 'POST', { identifier: body.email, password })).status, 200)
    }
    assert.equal(
      (
        await request('/users', adminToken, 'POST', {
          email: 'customer2@example.com',
          username: 'customer2',
          password,
          confirm_password: password,
          phone: '0901234567',
          role: 'Customer'
        })
      ).status,
      422
    )
    assert.equal(await database.auditLogs.countDocuments({ action: 'UserCreated' }), 4)
    assert.equal(JSON.stringify(await database.auditLogs.find({}).toArray()).includes(password), false)
  })

  await t.test(
    'locking and changing staff roles revokes access and refresh; unlocking never restores old tokens',
    async () => {
      const target = accounts.get(UserRole.KITCHEN)!
      const old = await users.login({ identifier: target.email, password })
      const path = `/users/${target._id}`
      assert.equal(
        (await request(`${path}/status`, adminToken, 'PATCH', { status: 'Locked', reason: '  Staff left  ' })).status,
        200
      )
      assert.equal((await request('/users/me', old.access_token)).status, 401)
      assert.equal(
        (await request('/users/refresh-token', undefined, 'POST', { refresh_token: old.refresh_token })).status,
        401
      )
      const denied = await request('/users/login', undefined, 'POST', { identifier: target.email, password })
      assert.equal(denied.status, 403)
      assert.match(denied.body.message, /Staff left/)
      assert.equal(
        (await request(`${path}/status`, adminToken, 'PATCH', { status: 'Active', reason: 'Returned' })).status,
        200
      )
      assert.equal((await request('/users/me', old.access_token)).status, 401)
      const fresh = await users.login({ identifier: target.email, password })
      assert.equal(
        (await request(`${path}/role`, adminToken, 'PATCH', { role: 'Delivery Staff', reason: 'New assignment' }))
          .status,
        200
      )
      assert.equal((await request('/users/me', fresh.access_token)).status, 401)
      assert.equal(
        (await request(`${path}/role`, adminToken, 'PATCH', { role: 'Kitchen Staff', reason: 'Return to kitchen' }))
          .status,
        200
      )
      tokens.set(UserRole.KITCHEN, (await users.login({ identifier: target.email, password })).access_token)
    }
  )

  const orderId = new ObjectId()
  const kitchenDay = new ObjectId()
  const deliveryDay = new ObjectId()
  await t.test('staff only see assigned work; kitchen never receives money or customer address', async () => {
    const day = {
      date: '2026-10-18',
      status: 'Confirmed',
      items: [{ foodName: 'Test food', quantity: 1, price: 50000 }],
      statusHistory: []
    }
    await database.orders.insertOne({
      _id: orderId,
      orderCode: 'ROLE-TEST',
      packageType: 'ONE_DAY',
      version: 0,
      userId: accounts.get(UserRole.CUSTOMER)!._id,
      status: 'Confirmed',
      statusHistory: [],
      deliveryAddress: 'Private delivery address',
      payment: { method: 'COD', status: 'Pending' },
      inventoryHold: { status: 'Committed', items: [] },
      createdAt: new Date(),
      deliveries: [
        { ...day, _id: kitchenDay, kitchenStaffIds: [accounts.get(UserRole.KITCHEN)!._id] },
        { ...day, _id: deliveryDay, status: 'Delivering', assignedShipperId: accounts.get(UserRole.DELIVERY)!._id },
        { ...day, _id: new ObjectId(), kitchenStaffIds: [new ObjectId()], assignedShipperId: new ObjectId() }
      ]
    } as unknown as Order)
    for (const role of [UserRole.KITCHEN, UserRole.DELIVERY]) {
      const token = tokens.get(role)
      const rows = (await request('/workspace/orders', token)).body.result
      assert.equal(rows.length, 1)
      assert.equal(rows[0].deliveryId, String(role === UserRole.KITCHEN ? kitchenDay : deliveryDay))
      for (const field of ['payment', 'price', 'subtotal', 'grandTotal', 'healthProfile'])
        assert.equal(JSON.stringify(rows).includes(`"${field}"`), false)
      assert.equal('deliveryAddress' in rows[0], role === UserRole.DELIVERY)
      for (const path of ['/cart', '/workspace/transactions', `/orders/${orderId}`])
        assert.equal((await request(path, token)).status, 403)
      for (const [path, method] of [
        ['/orders', 'POST'],
        ['/foods', 'POST'],
        [`/orders/${orderId}/cancel`, 'PATCH']
      ])
        assert.equal((await request(path, token, method, {})).status, 403)
    }
    assert.equal((await request('/workspace/orders', tokens.get(UserRole.CUSTOMER))).status, 403)
    for (const role of [UserRole.ADMIN, UserRole.MANAGER])
      assert.equal((await request('/workspace/transactions', tokens.get(role))).status, 200)
  })

  await t.test(
    'Admin status intervention requires reason and writes actor, order, before/after and time atomically',
    async () => {
      const path = `/orders/${orderId}/status`
      assert.equal((await request(path, adminToken, 'PATCH', { status: 'Cooking' })).status, 403)
      assert.equal((await database.orders.findOne({ _id: orderId }))!.status, 'Confirmed')
      assert.equal(
        (await request(path, adminToken, 'PATCH', { status: 'Cooking', exceptionReason: 'Emergency correction' }))
          .status,
        200
      )
      const audit = await database.auditLogs.findOne({ entityId: orderId, action: 'OrderStatusChanged' })
      assert.equal(String(audit!.actorId), String(admin._id))
      assert.equal(audit!.reason, 'Emergency correction')
      assert.equal(audit!.before!.status, 'Confirmed')
      assert.equal(audit!.after!.status, 'Cooking')
      assert.ok(audit!.createdAt instanceof Date)
    }
  )

  await t.test('last Admin protection survives concurrent locks/demotions on a real replica set', async () => {
    // Only isolated test accounts are removed here.
    await database.users.deleteMany({ role: UserRole.ADMIN })
    for (const mode of ['lock', 'demote'] as const) {
      await database.users.deleteMany({ role: UserRole.ADMIN })
      const pair = [0, 1].map(
        (i) => new User({ _id: new ObjectId(), email: `${mode}${i}@example.com`, password: hash, role: UserRole.ADMIN })
      )
      await database.users.insertMany(pair)
      const outcomes = await Promise.allSettled(
        pair.map((user) =>
          mode === 'lock'
            ? users.updateUserStatus(String(user._id), AccountStatus.LOCKED, String(user._id), 'Concurrent test')
            : users.updateUserRole(
                String(user._id),
                { role: UserRole.MANAGER, reason: 'Concurrent test' },
                String(user._id)
              )
        )
      )
      assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1, JSON.stringify(outcomes))
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult
      assert.equal(rejected.reason.status, 409)
      assert.equal(
        await database.users.countDocuments({ role: UserRole.ADMIN, account_status: AccountStatus.ACTIVE }),
        1
      )
    }
  })
})
