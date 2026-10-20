import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AddressInfo } from 'node:net'
import express from 'express'
import bcrypt from 'bcryptjs'
import { MongoClient, ObjectId, Collection } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import User, { ALL_ROLES, UserRole, AccountStatus } from '../../src/models/schemas/User.schema'
import type Order from '../../src/models/schemas/Order.schema'
import type Notification from '../../src/models/schemas/Notification.schema'
import { toLocalDate } from '../../src/models/schemas/common'
import { createSchemaIndexes } from '../../src/models/schema-indexes'

test('Manager COD failures, retries, expiry and actual cash reconciliation', { timeout: 180000 }, async (t) => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  process.env.DB_URI = repl.getUri()
  process.env.DB_NAME = `manager_ops_${new ObjectId()}`
  process.env.JWT_SECRET_ACCESS_TOKEN = 'manager-ops-access'
  process.env.JWT_SECRET_REFRESH_TOKEN = 'manager-ops-refresh'
  const mongo = new MongoClient(process.env.DB_URI)
  const db = (await import('../../src/services/database.services')).default
  const manager = (await import('../../src/services/manager-operations.services')).default
  const assignments = (await import('../../src/services/order-operations.services')).default
  const shipper = (await import('../../src/services/shipper.services')).default
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
  const accounts = new Map<UserRole, User>()
  const tokens = new Map<string, string>()
  const hash = await bcrypt.hash('Manager123!', 4)
  for (const role of ALL_ROLES) {
    const user = new User({
      _id: new ObjectId(),
      email: `${new ObjectId()}@example.com`,
      username: `staff_${new ObjectId()}`,
      password: hash,
      role
    })
    await db.users.insertOne(user)
    accounts.set(role, user)
    tokens.set(role, (await users.login({ identifier: user.email, password: 'Manager123!' })).access_token)
  }
  const uid = (role: UserRole) => String(accounts.get(role)!._id)
  async function api(path: string, method: string = 'GET', body?: object, role: string = UserRole.MANAGER) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(tokens.has(role) ? { Authorization: `Bearer ${tokens.get(role)}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    return {
      status: response.status,
      body: (await response.json()) as {
        result: {
          changed?: boolean
          version: number
          balance?: number
          total?: number
          items?: Array<{ deliveryId: string; status: string }>
        }
      }
    }
  }
  async function fixture(status: 'Failed' | 'Completed' = 'Failed', collected = 0, days = 1) {
    const now = new Date()
    const failedAt = new Date(now.getTime() - 1000)
    const order: Order = {
      _id: new ObjectId(),
      userId: accounts.get(UserRole.CUSTOMER)!._id!,
      orderCode: `TEST-${new ObjectId()}`,
      packageType: days === 1 ? 'ONE_DAY' : 'WEEKLY_7D',
      status: days > 1 ? 'Ready' : status,
      statusHistory: [],
      hasFailedDeliveries: status === 'Failed',
      deliveries: Array.from({ length: days }, (_, i) => ({
        _id: new ObjectId(),
        date: toLocalDate(now),
        scheduledAt: now,
        status: i === 0 ? status : 'Ready',
        statusHistory: [],
        assignedShipperId: accounts.get(UserRole.DELIVERY)!._id,
        ...(i === 0
          ? {
              failedAt: status === 'Failed' ? failedAt : undefined,
              dispatch: { actorId: accounts.get(UserRole.DELIVERY)!._id!, requestVersion: 0, dispatchedAt: failedAt },
              deliveryResult: {
                status,
                actorId: accounts.get(UserRole.DELIVERY)!._id!,
                recordedAt: failedAt,
                requestVersion: 1,
                ...(status === 'Completed'
                  ? { codExpectedAmount: 70000, codCollectedAmount: collected, codDifference: collected - 70000 }
                  : { reason: 'Khách vắng', evidenceUrls: [] })
              }
            }
          : {}),
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
      deliveryAddress: 'Address',
      note: '',
      payment: {
        method: 'COD',
        status: collected >= days * 50000 + 20000 ? 'Paid' : 'Pending',
        paidAmount: collected,
        refundedAmount: 0
      },
      inventoryHold: { status: 'Committed', items: [{ foodId: new ObjectId(), quantity: days }] },
      version: 2,
      createdAt: now,
      updatedAt: now
    }
    await db.orders.insertOne(order)
    if (collected)
      await db.transactions.insertOne({
        kind: 'Payment',
        status: 'Succeeded',
        source: 'CODCollection',
        method: 'COD',
        amount: collected,
        orderId: order._id,
        deliveryId: order.deliveries[0]._id,
        idempotencyKey: `fixture:${order._id}`,
        description: 'Actual COD fixture',
        occurredAt: now
      })
    const id = String(order._id)
    const dayId = String(order.deliveries[0]._id)
    return { order, id, dayId, path: `/orders/${id}/deliveries/${dayId}`, failedAt }
  }
  const stored = (order: Order) => db.orders.findOne({ _id: order._id })

  await t.test('only active Manager gets operations and issue queue; invalid payloads are rejected', async () => {
    const f = await fixture()
    const retry = { action: 'Retry', version: 2, reason: 'Khách đã liên lạc' }
    for (const role of ALL_ROLES.filter((role) => role !== UserRole.MANAGER)) {
      assert.equal((await api(`${f.path}/failure-resolution`, 'PATCH', retry, role)).status, 403)
      assert.equal(
        (
          await api(
            `${f.path}/cod-reconciliation`,
            'POST',
            { action: 'Collect', version: 2, amount: 1, reason: 'x', reference: 'r' },
            role
          )
        ).status,
        403
      )
      assert.equal((await api(`${f.path}/cod-reconciliation`, 'GET', undefined, role)).status, 403)
      assert.equal((await api('/workspace/cod-issues', 'GET', undefined, role)).status, 403)
    }
    assert.equal((await api(`${f.path}/failure-resolution`, 'PATCH', retry, 'anonymous')).status, 401)
    for (const body of [
      { ...retry, reason: ' ' },
      { ...retry, action: 'Delivering' },
      { ...retry, version: '2' }
    ])
      assert.equal((await api(`${f.path}/failure-resolution`, 'PATCH', body)).status, 422)
    assert.equal((await api('/workspace/cod-issues?limit=0')).status, 422)
    await db.users.updateOne(
      { _id: accounts.get(UserRole.MANAGER)!._id },
      { $set: { account_status: AccountStatus.LOCKED } }
    )
    assert.equal((await api(`${f.path}/failure-resolution`, 'PATCH', retry)).status, 401)
    await db.users.updateOne(
      { _id: accounts.get(UserRole.MANAGER)!._id },
      { $set: { account_status: AccountStatus.ACTIVE } }
    )
  })

  await t.test(
    'retry archives failure, clears assignment, requires reassignment and survives another failure',
    async () => {
      const f = await fixture()
      const retry = { action: 'Retry', version: 2, reason: 'Khách hẹn giao lại' }
      assert.equal((await api(`${f.path}/failure-resolution`, 'PATCH', retry)).status, 200)
      assert.equal((await api(`${f.path}/failure-resolution`, 'PATCH', retry)).body.result.changed, false)
      let order = (await stored(f.order))!
      assert.equal(order.status, 'Ready')
      assert.equal(order.hasFailedDeliveries, false)
      assert.equal(order.deliveries[0].assignedShipperId, undefined)
      assert.equal(order.deliveries[0].failedAt, undefined)
      assert.equal(order.deliveries[0].deliveryResult, undefined)
      assert.equal(order.deliveries[0].failureResolutions!.length, 1)
      assert.equal(order.deliveries[0].failureResolutions![0].failureResult!.reason, 'Khách vắng')
      await assert.rejects(
        shipper.updateStatus(uid(UserRole.DELIVERY), f.id, f.dayId, { status: 'Delivering', version: 3 }),
        { status: 403 }
      )
      await assignments.assignShipper(uid(UserRole.MANAGER), f.id, f.dayId, {
        assignedShipperId: uid(UserRole.DELIVERY),
        version: 3,
        reason: 'Gán lại'
      })
      await shipper.updateStatus(uid(UserRole.DELIVERY), f.id, f.dayId, { status: 'Delivering', version: 4 })
      await shipper.updateStatus(uid(UserRole.DELIVERY), f.id, f.dayId, {
        status: 'Failed',
        version: 5,
        reason: 'Vẫn vắng'
      })
      order = (await stored(f.order))!
      assert.ok(order.deliveries[0].failedAt! > f.failedAt)
      assert.equal(
        await manager.expireFailedDelivery(f.id, f.dayId, f.failedAt, new Date(Date.now() + 86400000)),
        false
      )
      assert.equal(order.deliveries[0].failureResolutions!.length, 1)
      assert.deepEqual(order.inventoryHold, f.order.inventoryHold)
    }
  )

  await t.test(
    'weekly failed cancellation removes only that day plus its shipping, no inventory return or fake refund',
    async () => {
      const f = await fixture('Failed', 0, 7)
      const cancel = { action: 'Cancel', version: 2, reason: 'Không thể giao' }
      const results = await Promise.all([
        api(`${f.path}/failure-resolution`, 'PATCH', cancel),
        api(`${f.path}/failure-resolution`, 'PATCH', cancel)
      ])
      assert.ok(results.every((result) => result.status === 200))
      assert.equal(results.filter((result) => result.body.result.changed).length, 1)
      const order = (await stored(f.order))!
      assert.equal(order.deliveries[0].cancellation!.creditedAmount, 70000)
      assert.equal(order.deliveries[0].cancellation!.cancelledBy, 'Manager')
      assert.equal(order.deliveries[1].shipping.totalFee, 0)
      assert.equal(order.status, 'Ready')
      assert.equal(order.hasFailedDeliveries, false)
      assert.equal(order.grandTotal, f.order.grandTotal)
      assert.deepEqual(order.inventoryHold, f.order.inventoryHold)
      assert.equal(await db.transactions.countDocuments({ orderId: order._id }), 0)
      assert.equal(await db.auditLogs.countDocuments({ entityId: order._id }), 1)
      assert.equal(await db.dailyHealthLogs.countDocuments({ 'meals.sourceId': order._id }), 0)
    }
  )

  await t.test('24-hour boundary is inclusive and job versus Manager commits a single resolution', async () => {
    const f = await fixture()
    const due = new Date(f.failedAt.getTime() + 86400000)
    assert.equal(await manager.expireFailedDelivery(f.id, f.dayId, f.failedAt, new Date(due.getTime() - 1)), false)
    const results = await Promise.allSettled([
      manager.expireFailedDelivery(f.id, f.dayId, f.failedAt, due),
      manager.resolveFailure(uid(UserRole.MANAGER), f.id, f.dayId, { action: 'Retry', version: 2, reason: 'Giao lại' })
    ])
    assert.ok(results.some((result) => result.status === 'fulfilled'))
    const order = (await stored(f.order))!
    assert.ok(['Ready', 'Cancelled'].includes(order.status))
    assert.equal(order.version, 3)
    assert.equal(order.deliveries[0].failureResolutions!.length, 1)
    assert.equal(await db.auditLogs.countDocuments({ entityId: order._id }), 1)
    assert.equal(await manager.expireFailedDelivery(f.id, f.dayId, f.failedAt, due), false)
    const another = await fixture()
    const exact = new Date(another.failedAt.getTime() + 86400000)
    const duplicates = await Promise.all([
      manager.expireFailedDelivery(another.id, another.dayId, another.failedAt, exact),
      manager.expireFailedDelivery(another.id, another.dayId, another.failedAt, exact)
    ])
    assert.equal(duplicates.filter(Boolean).length, 1)
    assert.equal((await stored(another.order))!.cancelledBy, 'System')
  })

  await t.test('expiry scanner skips online/new failures and continues past inconsistent COD ledger', async () => {
    const bad = await fixture()
    const good = await fixture()
    const online = await fixture()
    const recent = await fixture()
    const old = new Date(Date.now() - 90000000)
    for (const f of [bad, good, online])
      await db.orders.updateOne({ _id: f.order._id }, { $set: { 'deliveries.0.failedAt': old } })
    await db.orders.updateOne({ _id: bad.order._id }, { $set: { 'payment.paidAmount': 5000 } })
    await db.orders.updateOne({ _id: online.order._id }, { $set: { 'payment.method': 'VNPay' } })
    const result = await manager.expireFailedDeliveries()
    assert.equal(result.cancelled, 1)
    assert.equal(result.errors, 1)
    assert.equal((await stored(good.order))!.status, 'Cancelled')
    assert.equal((await stored(bad.order))!.status, 'Failed')
    assert.equal((await stored(online.order))!.status, 'Failed')
    assert.equal((await stored(recent.order))!.status, 'Failed')
    await db.orders.updateOne({ _id: bad.order._id }, { $set: { 'deliveries.0.failedAt': new Date() } })
  })

  await t.test(
    'shortage collects real money without rewriting shipper report; subsequent delivery accepts reconciliation ledger',
    async () => {
      const f = await fixture('Completed', 60000, 7)
      const original = f.order.deliveries[0].deliveryResult
      const collect = { action: 'Collect', version: 2, amount: 10000, reference: 'RECEIPT-1', reason: 'Đã thu bổ sung' }
      assert.equal((await api(`${f.path}/cod-reconciliation`, 'GET')).body.result.balance, 10000)
      assert.equal((await api(`${f.path}/cod-reconciliation`, 'POST', { ...collect, amount: 10001 })).status, 409)
      const results = await Promise.all([
        api(`${f.path}/cod-reconciliation`, 'POST', collect),
        api(`${f.path}/cod-reconciliation`, 'POST', collect)
      ])
      assert.ok(results.every((result) => result.status === 200))
      assert.equal(results.filter((result) => result.body.result.changed).length, 1)
      let order = (await stored(f.order))!
      assert.deepEqual(order.deliveries[0].deliveryResult, original)
      assert.equal(order.deliveries[0].codSettlement!.balance, 0)
      assert.equal(order.payment.codReconciliationRequired, false)
      assert.equal(order.payment.paidAmount, 70000)
      const second = String(order.deliveries[1]._id)
      await shipper.updateStatus(uid(UserRole.DELIVERY), f.id, second, { status: 'Delivering', version: 3 })
      await shipper.updateStatus(uid(UserRole.DELIVERY), f.id, second, {
        status: 'Completed',
        version: 4,
        codCollectedAmount: 50000
      })
      order = (await stored(f.order))!
      assert.equal(order.payment.paidAmount, 120000)
      assert.equal(order.payment.codReconciliationRequired, false)
      assert.equal(order.deliveries[0].codSettlement!.balance, 0)
    }
  )

  await t.test('surplus refund can be partial, cannot exceed surplus, and cannot reuse a reference', async () => {
    const f = await fixture('Completed', 80000)
    const refund = { action: 'Refund', version: 2, amount: 4000, reference: 'RETURN-1', reason: 'Đã trả tiền thừa' }
    assert.equal((await api(`${f.path}/cod-reconciliation`, 'POST', refund)).status, 200)
    assert.equal((await api(`${f.path}/cod-reconciliation`, 'POST', { ...refund, version: 3 })).status, 409)
    assert.equal(
      (
        await api(`${f.path}/cod-reconciliation`, 'POST', {
          ...refund,
          version: 3,
          amount: 6001,
          reference: 'RETURN-2'
        })
      ).status,
      409
    )
    assert.equal(
      (
        await api(`${f.path}/cod-reconciliation`, 'POST', {
          ...refund,
          version: 3,
          amount: 6000,
          reference: 'RETURN-2'
        })
      ).status,
      200
    )
    const order = (await stored(f.order))!
    assert.equal(order.payment.paidAmount, 80000)
    assert.equal(order.payment.refundedAmount, 10000)
    assert.equal(order.payment.codReconciliationRequired, false)
    assert.equal(order.deliveries[0].deliveryResult!.codDifference, 10000)
    assert.equal(order.deliveries[0].codReconciliations!.length, 2)
    assert.equal(order.status, 'Completed')
  })

  await t.test(
    'paid Failed cancellation requests refund only; actual partial/full repayment settles the same reservation',
    async () => {
      const f = await fixture('Failed', 70000)
      assert.equal(
        (await api(`${f.path}/failure-resolution`, 'PATCH', { action: 'Retry', version: 2, reason: 'Giao lại' }))
          .status,
        409
      )
      assert.equal(
        (
          await api(`${f.path}/failure-resolution`, 'PATCH', {
            action: 'Cancel',
            version: 2,
            reason: 'Hủy ngày thất bại'
          })
        ).status,
        200
      )
      let order = (await stored(f.order))!
      assert.equal(order.deliveries[0].codSettlement!.pendingRefundAmount, 70000)
      assert.equal(order.payment.refundedAmount, 0)
      assert.equal(order.payment.codReconciliationRequired, true)
      const partial = { action: 'Refund', version: 3, amount: 20000, reference: 'CASH-1', reason: 'Đã trả lại khách' }
      assert.equal((await api(`${f.path}/cod-reconciliation`, 'POST', partial)).status, 200)
      assert.equal((await api(`${f.path}/cod-reconciliation`, 'POST', partial)).body.result.changed, false)
      assert.equal(
        (
          await api(`${f.path}/cod-reconciliation`, 'POST', {
            ...partial,
            version: 4,
            amount: 50000,
            reference: 'CASH-2'
          })
        ).status,
        200
      )
      order = (await stored(f.order))!
      assert.equal(order.payment.refundedAmount, 70000)
      assert.equal(order.payment.status, 'Refunded')
      assert.equal(order.payment.codReconciliationRequired, false)
      assert.equal(order.deliveries[0].refundedAmount, 70000)
      assert.equal(order.deliveries[0].codSettlement!.pendingRefundAmount, 0)
      const refunds = await db.transactions.find({ orderId: order._id, kind: 'Refund' }).toArray()
      assert.equal(refunds.length, 2)
      assert.equal(
        refunds.reduce((sum, item) => sum + item.amount, 0),
        70000
      )
      assert.ok(refunds.every((item) => item.status === 'Succeeded'))
    }
  )

  await t.test('issue queue is paginated by day, filters COD only, and settled days leave the queue', async () => {
    const f = await fixture('Completed', 80000)
    const before = await api('/workspace/cod-issues?kind=COD&limit=100')
    assert.ok(before.body.result.items!.some((item) => item.deliveryId === f.dayId))
    await api(`${f.path}/cod-reconciliation`, 'POST', {
      action: 'Refund',
      version: 2,
      amount: 10000,
      reference: 'RETURN-Q',
      reason: 'Trả thừa'
    })
    const after = await api('/workspace/cod-issues?kind=COD&limit=100')
    assert.ok(!after.body.result.items!.some((item) => item.deliveryId === f.dayId))
    const page = await api('/workspace/cod-issues?kind=Failed&limit=1&page=1')
    assert.equal(page.body.result.items!.length, 1)
    assert.ok(page.body.result.items!.every((item) => item.status === 'Failed'))
  })

  await t.test('notification failure rolls reconciliation receipt, refund reservation and audit back', async (st) => {
    const f = await fixture('Failed', 70000)
    await manager.resolveFailure(uid(UserRole.MANAGER), f.id, f.dayId, { action: 'Cancel', version: 2, reason: 'Hủy' })
    st.mock.getter(
      db,
      'notifications',
      () =>
        ({
          insertOne: async () => {
            throw new Error('Storage failure')
          }
        }) as unknown as Collection<Notification>
    )
    await assert.rejects(
      manager.reconcileCOD(uid(UserRole.MANAGER), f.id, f.dayId, {
        action: 'Refund',
        version: 3,
        amount: 20000,
        reference: 'FAIL-ROLLBACK',
        reason: 'Trả tiền'
      }),
      /Storage failure/
    )
    assert.equal((await stored(f.order))!.version, 3)
    assert.equal((await stored(f.order))!.payment.refundedAmount, 0)
    const refunds = await db.transactions.find({ orderId: f.order._id, kind: 'Refund' }).toArray()
    assert.equal(refunds.length, 1)
    assert.equal(refunds[0].amount, 70000)
    assert.equal(refunds[0].status, 'Pending')
    assert.equal(await db.auditLogs.countDocuments({ entityId: f.order._id }), 1)
  })
})
