import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AddressInfo } from 'node:net'
import express from 'express'
import bcrypt from 'bcryptjs'
import { MongoClient, ObjectId } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import User, { ALL_ROLES, UserRole, AccountStatus } from '../../src/models/schemas/User.schema'
import Food from '../../src/models/schemas/Food.schema'
import type Order from '../../src/models/schemas/Order.schema'
import { toLocalDate } from '../../src/models/schemas/common'
import { createSchemaIndexes } from '../../src/models/schema-indexes'

test('COD customer cancellation and Manager approval', { timeout: 180000 }, async (t) => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  process.env.DB_URI = repl.getUri()
  process.env.DB_NAME = `cancellation_${new ObjectId()}`
  process.env.JWT_SECRET_ACCESS_TOKEN = 'cancellation-access'
  process.env.JWT_SECRET_REFRESH_TOKEN = 'cancellation-refresh'
  const mongo = new MongoClient(process.env.DB_URI)
  const db = (await import('../../src/services/database.services')).default
  const cancellations = (await import('../../src/services/cancellation.services')).default
  const operations = (await import('../../src/services/order-operations.services')).default
  const reconciliation = (await import('../../src/services/manager-operations.services')).default
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
  const hash = await bcrypt.hash('Cancellation123!', 4)
  for (const label of [...ALL_ROLES, 'OtherCustomer']) {
    const user = new User({
      _id: new ObjectId(),
      email: `${new ObjectId()}@example.com`,
      username: `test_${new ObjectId()}`,
      password: hash,
      role: label === 'OtherCustomer' ? UserRole.CUSTOMER : (label as UserRole)
    })
    await db.users.insertOne(user)
    accounts.set(label, user)
    tokens.set(label, (await users.login({ identifier: user.email, password: 'Cancellation123!' })).access_token)
  }
  const uid = (role: string) => String(accounts.get(role)!._id)
  async function api(path: string, method = 'GET', body?: object, role: string = UserRole.CUSTOMER) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.get(role)}` },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    return {
      status: response.status,
      body: (await response.json()) as {
        result: { version: number; changed: boolean; total: number; request: { _id: string; status: string } }
      }
    }
  }
  async function fixture(days = 1, collected = 0) {
    const now = new Date()
    const food = new Food({
      _id: new ObjectId(),
      name: 'Rice',
      description: 'Meal',
      price: 50000,
      calories: 400,
      nutrition: { protein: 30, carb: 40, fat: 13 },
      stock: 100 - days,
      images: [],
      ingredients: [],
      tags: [],
      isActive: true
    })
    await db.foods.insertOne(food)
    const order: Order = {
      _id: new ObjectId(),
      userId: accounts.get(UserRole.CUSTOMER)!._id!,
      orderCode: `CANCEL-${new ObjectId()}`,
      packageType: days === 1 ? 'ONE_DAY' : 'WEEKLY_7D',
      status: 'Confirmed',
      statusHistory: [],
      deliveries: Array.from({ length: days }, (_, i) => {
        const scheduledAt = new Date(Date.now() + (i + 2) * 86400000)
        return {
          _id: new ObjectId(),
          date: toLocalDate(scheduledAt),
          scheduledAt,
          cutoffAt: new Date(scheduledAt.getTime() - 86400000),
          status: 'Confirmed',
          statusHistory: [],
          kitchenStaffIds: [accounts.get(UserRole.KITCHEN)!._id!],
          subtotal: 50000,
          shipping: { baseFee: i ? 0 : 20000, extraFee: 0, totalFee: i ? 0 : 20000, distanceKm: 6 },
          waivedShippingFee: i ? 20000 : 0,
          refundedAmount: 0,
          items: [
            {
              _id: new ObjectId(),
              foodId: food._id!,
              foodName: food.name,
              quantity: 1,
              price: 50000,
              calories: 400,
              nutrition: food.nutrition
            }
          ]
        }
      }),
      subtotal: 50000 * days,
      shippingFee: 20000,
      grandTotal: 50000 * days + 20000,
      deliveryAddress: 'Test',
      note: '',
      payment: { method: 'COD', status: 'Pending', paidAmount: collected, refundedAmount: 0 },
      inventoryHold: { status: 'Committed', items: [{ foodId: food._id!, quantity: days }] },
      version: 0,
      createdAt: now,
      updatedAt: now
    }
    await db.orders.insertOne(order)
    if (collected)
      await db.transactions.insertOne({
        _id: new ObjectId(),
        kind: 'Payment',
        status: 'Succeeded',
        method: 'COD',
        source: 'CODCollection',
        amount: collected,
        orderId: order._id,
        deliveryId: order.deliveries[0]._id,
        idempotencyKey: `fixture:${order._id}`,
        occurredAt: now,
        description: 'Previously collected COD'
      })
    return {
      order,
      food,
      id: String(order._id),
      dayId: String(order.deliveries[0]._id),
      path: `/orders/${order._id}/cancellation-requests`
    }
  }
  const body = { version: 0, reason: 'Thay đổi lịch nhận' }
  const stored = (order: Order) => db.orders.findOne({ _id: order._id })

  await t.test('HTTP enforces ownership, roles, active accounts and validated commands', async () => {
    const f = await fixture()
    for (const role of ALL_ROLES.filter((role) => role !== UserRole.CUSTOMER))
      assert.equal((await api(f.path, 'POST', body, role)).status, 403)
    assert.equal((await api(f.path, 'POST', body, 'OtherCustomer')).status, 404)
    assert.equal((await api(f.path, 'GET', undefined, 'OtherCustomer')).status, 404)
    for (const bad of [{ reason: 'a' }, { ...body, version: '0' }, { ...body, reason: '' }])
      assert.equal((await api(f.path, 'POST', bad)).status, 422)
    assert.equal((await api(f.path, 'POST', { ...body, itemId: String(new ObjectId()) })).status, 400)
    assert.equal((await api('/workspace/cancellation-requests')).status, 403)
    assert.equal(
      (await api('/workspace/cancellation-requests?limit=0', 'GET', undefined, UserRole.MANAGER)).status,
      422
    )
    await db.users.updateOne(
      { _id: accounts.get(UserRole.CUSTOMER)!._id },
      { $set: { account_status: AccountStatus.LOCKED } }
    )
    await assert.rejects(cancellations.submit(uid(UserRole.CUSTOMER), f.id, body), { status: 403 })
    await db.users.updateOne(
      { _id: accounts.get(UserRole.CUSTOMER)!._id },
      { $set: { account_status: AccountStatus.ACTIVE } }
    )
  })
  await t.test('unpaid single cancellation restores stock once with concurrent replay and no fake refund', async () => {
    const f = await fixture()
    const results = await Promise.all([api(f.path, 'POST', body), api(f.path, 'POST', body)])
    assert.ok(results.every((result) => result.status === 200))
    assert.equal(results.filter((result) => result.body.result.changed).length, 1)
    const order = (await stored(f.order))!
    assert.equal(order.status, 'Cancelled')
    assert.equal(order.deliveries[0].cancellation!.creditedAmount, 70000)
    assert.equal(order.inventoryHold.status, 'Released')
    assert.equal(order.cancellationRequests![0].automatic, true)
    assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, 100)
    assert.equal(await db.transactions.countDocuments({ orderId: f.order._id }), 0)
    assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id }), 1)
    assert.equal((await api(f.path, 'POST', { ...body, reason: 'Khác' })).status, 409)
  })
  await t.test(
    'cutoff inclusive, Cooking and missing weekly snapshot cannot bypass through old endpoints',
    async () => {
      for (const patch of [{ 'deliveries.0.cutoffAt': new Date() }, { 'deliveries.0.status': 'Cooking' }]) {
        const f = await fixture()
        await db.orders.updateOne({ _id: f.order._id }, { $set: patch })
        assert.equal((await api(`/orders/${f.id}/cancel`, 'PATCH', body)).status, 409)
        assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, 99)
      }
      const f = await fixture(7)
      await db.orders.updateOne({ _id: f.order._id }, { $unset: { 'deliveries.0.cutoffAt': '' } })
      assert.equal((await api(`/orders/${f.id}/deliveries/${f.dayId}/cancel`, 'POST', body)).status, 409)
    }
  )
  await t.test('legacy single COD derives shared cutoff and persists it on cancellation', async () => {
    const f = await fixture()
    await db.orders.updateOne({ _id: f.order._id }, { $unset: { 'deliveries.0.cutoffAt': '' } })
    assert.equal((await api(`/orders/${f.id}/cancellation`)).status, 200)
    assert.equal((await api(`/orders/${f.id}/cancel`, 'PATCH', body)).status, 200)
    assert.ok((await stored(f.order))!.deliveries[0].cutoffAt instanceof Date)
  })
  await t.test(
    'weekly first-day cancellation waives shipping without charging later days; other-day receipts do not require approval',
    async () => {
      const f = await fixture(7, 70000)
      await db.orders.updateOne(
        { _id: f.order._id },
        {
          $set: {
            'deliveries.0.status': 'Completed',
            'deliveries.0.cutoffAt': new Date(0)
          }
        }
      )
      const dayId = String(f.order.deliveries[1]._id)
      const response = await api(`/orders/${f.id}/deliveries/${dayId}/cancel`, 'POST', body)
      assert.equal(response.status, 200)
      assert.equal(response.body.result.request.status, 'Approved')
      assert.equal((await stored(f.order))!.deliveries[0].status, 'Completed')
      assert.equal(await db.transactions.countDocuments({ orderId: f.order._id, kind: 'Refund' }), 0)
      const other = await fixture(7)
      assert.equal((await api(`/orders/${other.id}/deliveries/${other.dayId}/cancel`, 'POST', body)).status, 200)
      const order = (await stored(other.order))!
      assert.equal(order.deliveries[0].cancellation!.creditedAmount, 70000)
      assert.ok(order.deliveries.slice(1).every((day) => day.shipping.totalFee === 0))
      assert.equal((await db.foods.findOne({ _id: other.food._id }))!.stock, 94)
    }
  )
  await t.test('whole-package cancellation is atomic and respects every remaining day', async () => {
    const f = await fixture(7)
    await db.orders.updateOne({ _id: f.order._id }, { $set: { 'deliveries.4.status': 'Cooking' } })
    assert.equal((await api(f.path, 'POST', body)).status, 409)
    assert.equal((await stored(f.order))!.deliveries.filter((day) => day.status === 'Cancelled').length, 0)
    await db.orders.updateOne({ _id: f.order._id }, { $set: { 'deliveries.4.status': 'Confirmed' } })
    assert.equal((await api(f.path, 'POST', body)).status, 200)
    const order = (await stored(f.order))!
    assert.equal(order.status, 'Cancelled')
    assert.equal(
      order.deliveries.reduce((sum, day) => sum + day.cancellation!.creditedAmount!, 0),
      370000
    )
    assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, 100)
  })
  await t.test('paid COD waits for Manager; approve reserves actual refund and real payout settles it', async () => {
    const f = await fixture(1, 70000)
    const submitted = await api(f.path, 'POST', body)
    const requestId = submitted.body.result.request._id
    assert.equal(submitted.body.result.request.status, 'Pending')
    assert.equal((await stored(f.order))!.status, 'Confirmed')
    assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, 99)
    assert.equal((await api(f.path, 'POST', { ...body, version: 1 })).status, 409)
    assert.equal(
      (await api(`${f.path}/${requestId}`, 'PATCH', { version: 1, action: 'Approve', reason: 'Duyệt' })).status,
      403
    )
    const approve = { version: 1, action: 'Approve', reason: 'Đủ điều kiện' }
    const results = await Promise.all([
      api(`${f.path}/${requestId}`, 'PATCH', approve, UserRole.MANAGER),
      api(`${f.path}/${requestId}`, 'PATCH', approve, UserRole.MANAGER)
    ])
    assert.ok(results.every((result) => result.status === 200))
    assert.equal(results.filter((result) => result.body.result.changed).length, 1)
    let order = (await stored(f.order))!
    assert.equal(order.payment.refundedAmount, 0)
    assert.equal(order.deliveries[0].codSettlement!.pendingRefundAmount, 70000)
    assert.equal(await db.transactions.countDocuments({ orderId: f.order._id, kind: 'Refund' }), 1)
    await reconciliation.reconcileCOD(uid(UserRole.MANAGER), f.id, f.dayId, {
      version: 2,
      action: 'Refund',
      amount: 70000,
      reference: `CASH-${f.id}`,
      reason: 'Đã trả tiền mặt'
    })
    order = (await stored(f.order))!
    assert.equal(order.payment.refundedAmount, 70000)
    assert.equal(order.payment.codReconciliationRequired, false)
  })
  await t.test('partial payment refunds only actual receipts, never the full price', async () => {
    const f = await fixture(1, 12000)
    const request = await cancellations.submit(uid(UserRole.CUSTOMER), f.id, body)
    await cancellations.decide(uid(UserRole.MANAGER), f.id, String(request.request._id), {
      version: 1,
      action: 'Approve',
      reason: 'Duyệt'
    })
    assert.equal((await db.transactions.findOne({ orderId: f.order._id, kind: 'Refund' }))!.amount, 12000)
    assert.equal((await stored(f.order))!.deliveries[0].cancellation!.creditedAmount, 70000)
  })
  await t.test('reject preserves order and money; approval rechecks cutoff and kitchen state', async () => {
    for (const patch of [{ 'deliveries.0.cutoffAt': new Date(0) }, { 'deliveries.0.status': 'Cooking' }]) {
      const f = await fixture(1, 70000)
      const request = await cancellations.submit(uid(UserRole.CUSTOMER), f.id, body)
      await db.orders.updateOne({ _id: f.order._id }, { $set: patch })
      const path = `${f.path}/${request.request._id}`
      assert.equal(
        (await api(path, 'PATCH', { version: 1, action: 'Approve', reason: 'Duyệt' }, UserRole.MANAGER)).status,
        409
      )
      assert.equal(
        (await api(path, 'PATCH', { version: 1, action: 'Reject', reason: 'Đã chốt/nấu' }, UserRole.MANAGER)).status,
        200
      )
      assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, 99)
      assert.equal(await db.transactions.countDocuments({ orderId: f.order._id, kind: 'Refund' }), 0)
    }
  })
  await t.test('cancellation competing with kitchen start commits exactly one outcome', async () => {
    for (const collected of [0, 70000]) {
      const f = await fixture(1, collected)
      await db.orders.updateOne({ _id: f.order._id }, { $set: { 'deliveries.0.date': toLocalDate(new Date()) } })
      const request = collected ? await cancellations.submit(uid(UserRole.CUSTOMER), f.id, body) : undefined
      const version = collected ? 1 : 0
      const results = await Promise.allSettled([
        request
          ? cancellations.decide(uid(UserRole.MANAGER), f.id, String(request.request._id), {
              version,
              action: 'Approve',
              reason: 'Duyệt'
            })
          : cancellations.submit(uid(UserRole.CUSTOMER), f.id, body),
        operations.kitchenStatus(uid(UserRole.KITCHEN), f.id, f.dayId, { version, status: 'Cooking' })
      ])
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
      const order = (await stored(f.order))!
      assert.ok(['Cooking', 'Cancelled'].includes(order.deliveries[0].status))
      assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, order.status === 'Cancelled' ? 100 : 99)
    }
  })
  await t.test('pending queue paginates and rejected requests can be submitted again', async () => {
    await db.orders.deleteMany({})
    const f = await fixture(1, 70000)
    const request = await cancellations.submit(uid(UserRole.CUSTOMER), f.id, body)
    assert.equal(
      (await api('/workspace/cancellation-requests?limit=1', 'GET', undefined, UserRole.MANAGER)).body.result.total,
      1
    )
    await cancellations.decide(uid(UserRole.MANAGER), f.id, String(request.request._id), {
      version: 1,
      action: 'Reject',
      reason: 'Khách đổi ý'
    })
    assert.equal(
      (await api('/workspace/cancellation-requests', 'GET', undefined, UserRole.MANAGER)).body.result.total,
      0
    )
    assert.equal((await api(f.path, 'POST', { ...body, version: 2 })).body.result.request.status, 'Pending')
  })
  await t.test(
    'inconsistent ledger blocks cancellation; notification failure rolls back approval, stock and refund',
    async (st) => {
      const f = await fixture(1, 70000)
      await db.orders.updateOne({ _id: f.order._id }, { $set: { 'payment.paidAmount': 0 } })
      assert.equal((await api(f.path, 'POST', body)).status, 409)
      await db.orders.updateOne({ _id: f.order._id }, { $set: { 'payment.paidAmount': 70000 } })
      const request = await cancellations.submit(uid(UserRole.CUSTOMER), f.id, body)
      const collection = db.notifications
      const original = collection.insertOne.bind(collection)
      collection.insertOne = async () => {
        throw new Error('Notification unavailable')
      }
      st.mock.getter(db, 'notifications', () => collection)
      try {
        await assert.rejects(
          cancellations.decide(uid(UserRole.MANAGER), f.id, String(request.request._id), {
            version: 1,
            action: 'Approve',
            reason: 'Duyệt'
          }),
          /Notification unavailable/
        )
      } finally {
        collection.insertOne = original
      }
      assert.equal((await stored(f.order))!.cancellationRequests![0].status, 'Pending')
      assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, 99)
      assert.equal(await db.transactions.countDocuments({ orderId: f.order._id, kind: 'Refund' }), 0)
      assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id }), 1)
    }
  )
})
