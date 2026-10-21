import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AddressInfo } from 'node:net'
import express from 'express'
import bcrypt from 'bcryptjs'
import { MongoClient, ObjectId } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import User, { ALL_ROLES, UserRole } from '../../src/models/schemas/User.schema'
import Food from '../../src/models/schemas/Food.schema'
import type Order from '../../src/models/schemas/Order.schema'
import { toLocalDate } from '../../src/models/schemas/common'
import { createSchemaIndexes } from '../../src/models/schema-indexes'

test('Manager decisions, refunds and payment expiry on a real replica set', { timeout: 180000 }, async (t) => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  process.env.DB_URI = repl.getUri()
  process.env.DB_NAME = `decisions_${new ObjectId()}`
  process.env.JWT_SECRET_ACCESS_TOKEN = 'decisions-access'
  process.env.JWT_SECRET_REFRESH_TOKEN = 'decisions-refresh'
  const mongo = new MongoClient(process.env.DB_URI)
  const db = (await import('../../src/services/database.services')).default
  const decisions = (await import('../../src/services/order-decisions.services')).default
  const inventory = (await import('../../src/services/inventory.services')).default
  const users = (await import('../../src/services/user.services')).default
  const orders = (await import('../../src/services/orders.services')).default
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
  const accounts = new Map<UserRole, User>()
  const tokens = new Map<UserRole, string>()
  const hash = await bcrypt.hash('Manager123!', 4)
  for (const [index, role] of ALL_ROLES.entries()) {
    const user = new User({
      _id: new ObjectId(),
      email: `decision${index}@example.com`,
      username: `decision${index}`,
      password: hash,
      role
    })
    await db.users.insertOne(user)
    accounts.set(role, user)
    tokens.set(role, (await users.login({ identifier: user.email, password: 'Manager123!' })).access_token)
  }
  const managerId = String(accounts.get(UserRole.MANAGER)!._id)
  async function request(orderId: string, body: object, role = UserRole.MANAGER) {
    const response = await fetch(`${base}/orders/${orderId}/decision`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.get(role)}` },
      body: JSON.stringify(body)
    })
    return { status: response.status, body: (await response.json()) as any }
  }
  async function fixture(method: 'COD' | 'VNPay' = 'COD', paid = false, days = 1) {
    const food = new Food({
      _id: new ObjectId(),
      name: 'Decision food',
      description: '',
      price: 50000,
      calories: 400,
      nutrition: { protein: 30, carb: 40, fat: 13 },
      ingredients: [],
      tags: [],
      images: [],
      stock: 100
    })
    const now = new Date()
    const scheduledAt = new Date(now.getTime() + 3 * 86400000)
    const order: Order = {
      _id: new ObjectId(),
      userId: accounts.get(UserRole.CUSTOMER)!._id!,
      orderCode: `TEST-${new ObjectId()}`,
      packageType: days === 1 ? 'ONE_DAY' : 'WEEKLY_7D',
      status: 'Pending',
      statusHistory: [{ status: 'Pending', changedAt: now }],
      deliveries: Array.from({ length: days }, (_, i) => ({
        _id: new ObjectId(),
        date: toLocalDate(new Date(scheduledAt.getTime() + i * 86400000)),
        scheduledAt,
        cutoffAt: new Date(scheduledAt.getTime() - 86400000),
        status: 'Pending',
        statusHistory: [{ status: 'Pending', changedAt: now }],
        subtotal: 50000,
        shipping: { baseFee: i ? 0 : 20000, extraFee: 0, totalFee: i ? 0 : 20000, distanceKm: 6 },
        waivedShippingFee: i ? 20000 : 0,
        refundedAmount: 0,
        items: [
          {
            _id: new ObjectId(),
            foodId: food._id!,
            foodName: food.name,
            price: food.price,
            calories: food.calories,
            nutrition: food.nutrition,
            quantity: 1
          }
        ]
      })),
      subtotal: days * 50000,
      shippingFee: 20000,
      grandTotal: days * 50000 + 20000,
      deliveryAddress: 'Test address',
      note: '',
      payment: { method, status: paid ? 'Paid' : 'Pending', paidAmount: paid ? days * 50000 + 20000 : 0 },
      inventoryHold: {
        status: method === 'COD' || paid ? 'Committed' : 'Held',
        items: [{ foodId: food._id!, quantity: days }]
      },
      paymentDueAt: method === 'COD' ? undefined : new Date(now.getTime() + 900000),
      version: 0,
      createdAt: now,
      updatedAt: now
    }
    if (order.inventoryHold.status === 'Held') {
      order.inventoryHold.expiresAt = order.paymentDueAt
      food.reservedStock = days
    } else food.stock -= days
    await db.foods.insertOne(food)
    await db.orders.insertOne(order)
    if (paid)
      await db.transactions.insertOne({
        kind: 'Payment',
        status: 'Succeeded',
        amount: order.grandTotal,
        method,
        source: method === 'COD' ? 'CODCollection' : 'VerifiedIPN',
        orderId: order._id,
        idempotencyKey: `test-payment:${order._id}`,
        description: 'Verified test payment (no external gateway call)',
        occurredAt: now
      })
    return { order, food, id: String(order._id) }
  }

  await t.test('only Manager can decide; invalid version/status/reason fail validation', async () => {
    const f = await fixture()
    for (const role of ALL_ROLES.filter((role) => role !== UserRole.MANAGER)) {
      assert.equal(
        (await request(f.id, { status: 'Confirmed', version: 0, exceptionReason: 'Cannot bypass role' }, role)).status,
        403
      )
    }
    for (const body of [
      { status: 'Cooking', version: 0 },
      { status: 'Confirmed' },
      { status: 'Rejected', version: 0, reason: ' ' },
      { status: 'Rejected', version: 0, reason: 'x'.repeat(501) },
      { status: 'Confirmed', version: -1 }
    ])
      assert.equal((await request(f.id, body)).status, 422)
    assert.equal((await request('invalid', { status: 'Confirmed', version: 0 })).status, 422)
    assert.equal((await request(String(new ObjectId()), { status: 'Confirmed', version: 0 })).status, 404)
    assert.equal((await db.orders.findOne({ _id: f.order._id }))!.version, 0)
  })

  await t.test('COD confirmation changes only operational state, supports weekly orders and retry once', async () => {
    for (const days of [1, 7]) {
      const f = await fixture('COD', false, days)
      const body = { status: 'Confirmed' as const, version: 0 }
      const response = await request(f.id, body)
      assert.equal(response.status, 200)
      assert.equal(response.body.result.status, 'Confirmed')
      assert.equal(response.body.result.payment.status, 'Pending')
      assert.ok(response.body.result.deliveries.every((day: any) => day.status === 'Confirmed'))
      assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, 100 - days)
      assert.equal((await request(f.id, body)).body.result.replayed, true)
      assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id }), 1)
      assert.equal(await db.notifications.countDocuments({ entityId: f.order._id }), 1)
      assert.equal(await db.notifications.countDocuments({ entityId: f.order._id, 'email.status': 'Pending' }), 1)
      assert.equal((await request(f.id, { status: 'Rejected', version: 0, reason: 'Changed mind' })).status, 409)
      await assert.rejects(orders.updateOrderStatus(managerId, f.id, { status: 'Cooking' }), { status: 403 })
    }
  })

  await t.test(
    'online confirmation needs verified funds and committed inventory; Paid Pending never expires',
    async () => {
      const unpaid = await fixture('VNPay')
      assert.equal((await request(unpaid.id, { status: 'Confirmed', version: 0 })).status, 409)
      await db.orders.updateOne(
        { _id: unpaid.order._id },
        { $set: { 'payment.status': 'Paid', 'payment.paidAmount': unpaid.order.grandTotal } }
      )
      assert.equal((await request(unpaid.id, { status: 'Confirmed', version: 0 })).status, 409)
      const paid = await fixture('VNPay', true)
      assert.equal(await inventory.releaseExpiredHold(paid.order._id!, new Date(Date.now() + 86400000)), false)
      assert.equal((await db.orders.findOne({ _id: paid.order._id }))!.status, 'Pending')
      await db.orders.updateOne({ _id: paid.order._id }, { $set: { 'inventoryHold.status': 'Released' } })
      assert.equal((await request(paid.id, { status: 'Confirmed', version: 0 })).status, 409)
      await db.orders.updateOne({ _id: paid.order._id }, { $set: { 'inventoryHold.status': 'Committed' } })
      assert.equal((await request(paid.id, { status: 'Confirmed', version: 0 })).status, 200)
      assert.equal((await db.foods.findOne({ _id: paid.food._id }))!.stock, 99)
    }
  )

  await t.test('rejecting unpaid COD or online restores inventory once and cannot be reopened', async () => {
    for (const method of ['COD', 'VNPay'] as const) {
      const f = await fixture(method)
      const body = { status: 'Rejected' as const, version: 0, reason: '  Kitchen overload  ' }
      assert.equal((await request(f.id, body)).status, 200)
      assert.equal((await request(f.id, body)).body.result.replayed, true)
      const updated = (await db.orders.findOne({ _id: f.order._id }))!
      assert.equal(updated.status, 'Rejected')
      assert.equal(updated.deliveries[0].status, 'Rejected')
      assert.equal(updated.managerDecision!.reason, 'Kitchen overload')
      const food = (await db.foods.findOne({ _id: f.food._id }))!
      assert.equal(food.stock, 100)
      assert.equal(food.reservedStock, 0)
      assert.equal(await db.transactions.countDocuments({ orderId: f.order._id, kind: 'Refund' }), 0)
      assert.equal((await request(f.id, { status: 'Confirmed', version: 1 })).status, 409)
      await assert.rejects(
        orders.cancelOrder(String(accounts.get(UserRole.ADMIN)!._id), f.id, 'Cannot reopen rejected'),
        { status: 400 }
      )
    }
  })

  await t.test(
    'paid rejection requests all received money including ship, without claiming completed refund',
    async () => {
      const f = await fixture('VNPay', true, 7)
      const body = { status: 'Rejected' as const, version: 0, reason: 'Out of delivery area' }
      const responses = await Promise.all([request(f.id, body), request(f.id, body)])
      assert.ok(responses.every((response) => response.status === 200))
      assert.equal(responses.filter((response) => response.body.result.replayed).length, 1)
      const refunds = await db.transactions.find({ orderId: f.order._id, kind: 'Refund' }).toArray()
      assert.equal(refunds.length, 1)
      assert.equal(refunds[0].amount, f.order.grandTotal)
      assert.equal(refunds[0].status, 'Pending')
      const updated = responses[0].body.result
      assert.equal(updated.payment.status, 'Paid')
      assert.equal(updated.amounts.amountDue, 0)
      assert.equal(updated.amounts.pendingRefundAmount, f.order.grandTotal)
      assert.equal(updated.amounts.refundedAmount, 0)
      assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, 100)
      assert.equal(await db.notifications.countDocuments({ entityId: f.order._id }), 1)
    }
  )

  await t.test('existing refund reservations are subtracted instead of duplicating a previous refund', async () => {
    const f = await fixture('VNPay', true, 7)
    await db.transactions.insertOne({
      kind: 'Refund',
      status: 'Pending',
      amount: 10000,
      method: 'VNPay',
      source: 'Reconciliation',
      orderId: f.order._id,
      idempotencyKey: `previous-refund:${f.id}`,
      description: 'Existing reservation',
      occurredAt: new Date()
    })
    const rejected = await request(f.id, { status: 'Rejected', version: 0, reason: 'Reject remaining amount' })
    assert.equal(rejected.status, 200)
    assert.equal(rejected.body.result.amounts.pendingRefundAmount, f.order.grandTotal)
    const refunds = await db.transactions.find({ orderId: f.order._id, kind: 'Refund' }).toArray()
    assert.equal(
      refunds.reduce((sum, refund) => sum + refund.amount, 0),
      f.order.grandTotal
    )
  })

  await t.test('simultaneous confirm and reject have one winner, one audit and one inventory result', async () => {
    const f = await fixture()
    const responses = await Promise.all([
      request(f.id, { status: 'Confirmed', version: 0 }),
      request(f.id, { status: 'Rejected', version: 0, reason: 'Capacity' })
    ])
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409])
    const updated = (await db.orders.findOne({ _id: f.order._id }))!
    assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id }), 1)
    assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, updated.status === 'Rejected' ? 100 : 99)
  })

  await t.test('completed refunds are not refunded again; mismatched refund summaries block changes', async () => {
    const f = await fixture('VNPay', true, 7)
    await db.transactions.insertOne({
      kind: 'Refund',
      status: 'Succeeded',
      amount: 10000,
      method: 'VNPay',
      source: 'Reconciliation',
      orderId: f.order._id,
      idempotencyKey: `completed-refund:${f.id}`,
      description: 'Previously refunded',
      occurredAt: new Date()
    })
    const body = { status: 'Rejected' as const, version: 0, reason: 'Reject unprepared package' }
    assert.equal((await request(f.id, body)).status, 409)
    assert.equal((await db.orders.findOne({ _id: f.order._id }))!.status, 'Pending')
    assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, 93)
    assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id }), 0)
    await db.orders.updateOne(
      { _id: f.order._id },
      { $set: { 'payment.refundedAmount': 10000, 'payment.status': 'PartiallyRefunded' } }
    )
    const response = await request(f.id, body)
    assert.equal(response.status, 200)
    assert.equal(response.body.result.amounts.refundedAmount, 10000)
    assert.equal(response.body.result.amounts.pendingRefundAmount, f.order.grandTotal - 10000)
    assert.equal(response.body.result.amounts.amountDue, 0)
    assert.equal(
      (await db.transactions.findOne({ orderId: f.order._id, kind: 'Refund', status: 'Pending' }))!.amount,
      f.order.grandTotal - 10000
    )
  })

  await t.test(
    'rejecting the remaining package preserves cancelled days and only returns outstanding stock',
    async () => {
      const f = await fixture('COD', false, 7)
      const first = f.order.deliveries[0]
      first.status = 'Cancelled'
      first.statusHistory.push({ status: 'Cancelled', changedAt: new Date(), reason: 'Existing cancellation' })
      first.cancellation = {
        reason: 'Existing cancellation',
        cancelledAt: new Date(),
        cancelledBy: 'Customer',
        creditedAmount: 50000
      }
      await db.orders.updateOne(
        { _id: f.order._id },
        { $set: { deliveries: f.order.deliveries, 'inventoryHold.items.0.quantity': 6 } }
      )
      await db.foods.updateOne({ _id: f.food._id }, { $inc: { stock: 1 } })
      const response = await request(f.id, { status: 'Rejected', version: 0, reason: 'Cannot fulfil remaining days' })
      assert.equal(response.status, 200)
      assert.equal(response.body.result.deliveries[0].status, 'Cancelled')
      assert.equal(response.body.result.deliveries[0].cancellation.reason, 'Existing cancellation')
      assert.ok(response.body.result.deliveries.slice(1).every((day: { status: string }) => day.status === 'Rejected'))
      assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, 100)
    }
  )

  await t.test('notification failure rolls back decision, stock, refund and audit together', async (st) => {
    const f = await fixture('VNPay', true)
    st.mock.getter(
      db,
      'notifications',
      () =>
        ({
          insertOne: async () => {
            throw new Error('Notification storage failure')
          }
        }) as any
    )
    await assert.rejects(
      decisions.decide(managerId, f.id, { status: 'Rejected', version: 0, reason: 'Rollback test' }),
      /Notification storage failure/
    )
    assert.equal((await db.orders.findOne({ _id: f.order._id }))!.status, 'Pending')
    assert.equal((await db.foods.findOne({ _id: f.food._id }))!.stock, 99)
    assert.equal(await db.transactions.countDocuments({ orderId: f.order._id, kind: 'Refund' }), 0)
    assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id }), 0)
  })

  await t.test('timeout cancels only unpaid online, exactly once; COD and verified ledger are protected', async () => {
    const f = await fixture('VNPay')
    assert.equal(await inventory.releaseExpiredHold(f.order._id!, new Date(f.order.paymentDueAt!.getTime() - 1)), false)
    const results = await Promise.all([
      inventory.releaseExpiredHold(f.order._id!, f.order.paymentDueAt!),
      inventory.releaseExpiredHold(f.order._id!, f.order.paymentDueAt!)
    ])
    assert.equal(results.filter(Boolean).length, 1)
    assert.equal((await db.orders.findOne({ _id: f.order._id }))!.cancellationReason, 'Quá hạn thanh toán')
    assert.equal(await db.notifications.countDocuments({ entityId: f.order._id }), 1)
    assert.equal((await request(f.id, { status: 'Confirmed', version: 1 })).status, 409)
    const cod = await fixture()
    assert.equal(await inventory.releaseExpiredHold(cod.order._id!, new Date(Date.now() + 86400000)), false)
    const paid = await fixture('VNPay', true)
    await db.orders.updateOne(
      { _id: paid.order._id },
      { $set: { 'payment.status': 'Pending', 'payment.paidAmount': 0 } }
    )
    assert.equal(await inventory.releaseExpiredHold(paid.order._id!, new Date(Date.now() + 86400000)), false)
  })
})
