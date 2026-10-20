import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AddressInfo } from 'node:net'
import express from 'express'
import bcrypt from 'bcryptjs'
import { Collection, MongoClient, ObjectId } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import User, { ALL_ROLES, AccountStatus, UserRole } from '../../src/models/schemas/User.schema'
import Food from '../../src/models/schemas/Food.schema'
import Order from '../../src/models/schemas/Order.schema'
import Notification from '../../src/models/schemas/Notification.schema'
import { toLocalDate } from '../../src/models/schemas/common'
import { createSchemaIndexes } from '../../src/models/schema-indexes'
import { applyReviewMigration, inspectReviewMigration } from '../../src/migrations/review-deliveries'

test('reviews by Completed delivery and food', { timeout: 180000 }, async (t) => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  process.env.DB_URI = repl.getUri()
  process.env.DB_NAME = `reviews_${new ObjectId()}`
  process.env.JWT_SECRET_ACCESS_TOKEN = 'review-access'
  process.env.JWT_SECRET_REFRESH_TOKEN = 'review-refresh'
  const mongo = new MongoClient(process.env.DB_URI)
  const db = (await import('../../src/services/database.services')).default
  const reviews = (await import('../../src/services/reviews.services')).default
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
  app.use('/reviews', (await import('../../src/routes/reviews.routes')).default)
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
  const password = 'Review123!'
  const hash = await bcrypt.hash(password, 4)
  for (const label of [...ALL_ROLES, 'OtherCustomer']) {
    const user = new User({
      _id: new ObjectId(),
      username: `u_${new ObjectId()}`,
      email: `${new ObjectId()}@example.com`,
      password: hash,
      role: label === 'OtherCustomer' ? UserRole.CUSTOMER : (label as UserRole)
    })
    await db.users.insertOne(user)
    accounts.set(label, user)
    tokens.set(label, (await users.login({ identifier: user.email, password })).access_token)
  }
  const uid = (role: string = UserRole.CUSTOMER) => String(accounts.get(role)!._id)
  async function api(path = '', method = 'GET', body?: object, role: string = UserRole.CUSTOMER) {
    const response = await fetch(`${base}/reviews${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.get(role)}` },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    return { status: response.status, body: await response.json() }
  }
  async function fixture(days = 7, role: string = UserRole.CUSTOMER, foods?: Food[]) {
    if (!foods) {
      foods = ['Rice', 'Soup'].map(
        (name) =>
          new Food({
            _id: new ObjectId(),
            name,
            description: 'Meal',
            price: 50000,
            calories: 400,
            nutrition: { protein: 30, carb: 40, fat: 13 },
            stock: 50,
            images: [],
            ingredients: [],
            tags: []
          })
      )
      await db.foods.insertMany(foods)
    }
    const now = new Date()
    const order: Order = {
      _id: new ObjectId(),
      userId: accounts.get(role)!._id!,
      orderCode: `REV-${new ObjectId()}`,
      packageType: days === 1 ? 'ONE_DAY' : 'WEEKLY_7D',
      status: days === 1 ? 'Completed' : 'Ready',
      statusHistory: [],
      deliveries: Array.from({ length: days }, (_, i) => {
        const scheduledAt = new Date(now.getTime() + i * 86400000)
        return {
          _id: new ObjectId(),
          date: toLocalDate(scheduledAt),
          scheduledAt,
          cutoffAt: new Date(scheduledAt.getTime() - 86400000),
          status: i < 2 ? 'Completed' : 'Ready',
          statusHistory: [],
          kitchenStaffIds: [],
          subtotal: 100000,
          refundedAmount: 0,
          shipping: { baseFee: 0, extraFee: 0, totalFee: 0, distanceKm: 0 },
          waivedShippingFee: 0,
          items: foods!.map((food) => ({
            _id: new ObjectId(),
            foodId: food._id!,
            foodName: food.name,
            quantity: 1,
            price: 50000,
            calories: food.calories,
            nutrition: food.nutrition
          }))
        }
      }),
      subtotal: days * 100000,
      shippingFee: 0,
      grandTotal: days * 100000,
      deliveryAddress: 'Test',
      note: '',
      payment: { method: 'COD', status: 'Pending', paidAmount: 0, refundedAmount: 0 },
      inventoryHold: { status: 'Committed', items: foods.map((food) => ({ foodId: food._id!, quantity: days })) },
      version: 0,
      createdAt: now,
      updatedAt: now
    }
    await db.orders.insertOne(order)
    const payload = (day = 0, food = 0, rating = 5) => ({
      orderId: String(order._id),
      deliveryId: String(order.deliveries[day]._id),
      foodId: String(foods![food]._id),
      rating,
      comment: 'Good food'
    })
    return { order, foods, payload }
  }
  async function assertRating(foodId: ObjectId, rating: number, count: number) {
    const food = (await db.foods.findOne({ _id: foodId }))!
    assert.equal(food.rating, rating)
    assert.equal(food.reviewCount, count)
  }

  await t.test('ownership and the same Completed delivery are required; root order may remain Ready', async () => {
    const f = await fixture()
    assert.equal((await api('', 'POST', f.payload(), 'OtherCustomer')).status, 403)
    for (const role of ALL_ROLES.filter((role) => role !== UserRole.CUSTOMER))
      assert.equal((await api('', 'POST', f.payload(), role)).status, 403)
    for (const status of [
      'Pending',
      'Confirmed',
      'Cooking',
      'Ready',
      'Delivering',
      'Failed',
      'Rejected',
      'Cancelled'
    ]) {
      await db.orders.updateOne({ _id: f.order._id }, { $set: { 'deliveries.2.status': status as 'Ready' } })
      assert.equal((await api('', 'POST', f.payload(2))).status, 403)
    }
    // The food exists in another Completed day, but is absent from the selected day.
    await db.orders.updateOne(
      { _id: f.order._id },
      { $set: { 'deliveries.0.items': [f.order.deliveries[0].items[0]] } }
    )
    assert.equal((await api('', 'POST', f.payload(0, 1))).status, 403)
    assert.equal(await db.reviews.countDocuments({ orderId: f.order._id }), 0)
    await db.foods.updateOne({ _id: f.foods[0]._id }, { $set: { isActive: false } })
    const success = await api('', 'POST', f.payload())
    assert.equal(success.status, 201)
    assert.equal(success.body.result.verifiedPurchase, true)
    assert.equal(success.body.result.deliveryId, f.payload().deliveryId)
  })

  await t.test(
    'unique per order/day/food, including repeated meal lines, quantity and concurrent requests',
    async () => {
      const f = await fixture()
      const line = { ...f.order.deliveries[0].items[0], _id: new ObjectId(), quantity: 3 }
      await db.orders.updateOne({ _id: f.order._id }, { $push: { 'deliveries.0.items': line } })
      const pair = await Promise.all([api('', 'POST', f.payload()), api('', 'POST', f.payload())])
      assert.deepEqual(pair.map((r) => r.status).sort(), [201, 409])
      assert.equal((await api('', 'POST', f.payload(0, 1))).status, 201)
      assert.equal((await api('', 'POST', f.payload(1))).status, 201)
      assert.equal(await db.reviews.countDocuments({ orderId: f.order._id }), 3)
      await assertRating(f.foods[0]._id!, 5, 2)
      const single = await fixture(1)
      assert.equal((await api('', 'POST', single.payload())).status, 201)
      assert.equal((await api('', 'POST', single.payload())).status, 409)
    }
  )

  await t.test(
    'author edits only content within seven days; invalid input and identity changes are rejected',
    async () => {
      const f = await fixture()
      for (const change of [{ deliveryId: '' }, { orderId: '' }, { rating: 7 }, { targetId: String(new ObjectId()) }])
        assert.equal((await api('', 'POST', { ...f.payload(), ...change })).status, 422)
      for (const change of [{ comment: '  ' }, { images: ['http://example.com/x.jpg'] }])
        assert.equal((await api('', 'POST', { ...f.payload(), ...change })).status, 400)
      const review = await reviews.createReview(uid(), f.payload())
      const path = `/${review._id}`
      assert.equal((await api(path, 'PATCH', { rating: 1 }, 'OtherCustomer')).status, 403)
      for (const change of [{ foodId: String(new ObjectId()) }, { isHidden: false }, { createdAt: new Date() }, {}])
        assert.equal((await api(path, 'PATCH', change)).status, 400)
      assert.equal((await api(path, 'PATCH', { rating: 3, comment: ' Updated ' })).status, 200)
      assert.equal((await db.reviews.findOne({ _id: review._id }))!.comment, 'Updated')
      await assertRating(f.foods[0]._id!, 3, 1)
      await db.reviews.updateOne({ _id: review._id }, { $set: { createdAt: new Date(Date.now() - 7 * 86400000) } })
      assert.equal((await api(path, 'PATCH', { rating: 1 })).status, 409)
      await db.reviews.updateOne({ _id: review._id }, { $unset: { createdAt: '' } })
      assert.equal((await api(path, 'PATCH', { rating: 1 })).status, 409)
      await assertRating(f.foods[0]._id!, 3, 1)
    }
  )

  await t.test(
    'Admin hides with reason, audit and notification once; hidden reviews cannot be recreated or unhidden by author',
    async () => {
      const f = await fixture()
      const review = await reviews.createReview(uid(), f.payload())
      const path = `/${review._id}/hide`
      for (const role of ALL_ROLES.filter((role) => role !== UserRole.ADMIN))
        assert.equal((await api(path, 'PATCH', { reason: 'Violation' }, role)).status, 403)
      assert.equal((await api(path, 'PATCH', {}, UserRole.ADMIN)).status, 422)
      assert.equal((await api(path, 'PATCH', { reason: '   ' }, UserRole.ADMIN)).status, 422)
      const result = await api(path, 'PATCH', { reason: ' Violation ' }, UserRole.ADMIN)
      assert.equal(result.status, 200)
      assert.equal(result.body.changed, true)
      assert.equal(
        (await api(`/${review._id}`, 'DELETE', { reason: 'Another reason' }, UserRole.ADMIN)).body.changed,
        false
      )
      const hidden = (await db.reviews.findOne({ _id: review._id }))!
      assert.equal(hidden.isHidden, true)
      assert.equal(hidden.hiddenReason, 'Violation')
      assert.equal(await db.auditLogs.countDocuments({ entityId: review._id, action: 'ReviewHidden' }), 1)
      const notices = await db.notifications.find({ entityId: review._id }).toArray()
      assert.equal(notices.length, 1)
      assert.equal(String(notices[0].userId), uid())
      assert.equal(notices[0].message, 'Violation')
      await assertRating(f.foods[0]._id!, 0, 0)
      assert.deepEqual((await api(`/Food/${f.foods[0]._id}`)).body.result, [])
      assert.equal((await api('', 'POST', f.payload())).status, 409)
      assert.equal((await api(`/${review._id}`, 'PATCH', { rating: 4 })).status, 200)
      assert.equal((await db.reviews.findOne({ _id: review._id }))!.isHidden, true)
      await assertRating(f.foods[0]._id!, 0, 0)
    }
  )

  await t.test('public star/image filters and pagination omit hidden reviews; averages stay correct', async () => {
    const f = await fixture()
    const a = await reviews.createReview(uid(), { ...f.payload(), images: ['https://example.com/meal.jpg'] })
    await reviews.createReview(uid(), f.payload(1, 0, 1))
    const other = await fixture(1, 'OtherCustomer', f.foods)
    await reviews.createReview(uid('OtherCustomer'), {
      ...other.payload(0, 0, 3),
      images: ['https://example.com/other.jpg']
    })
    await assertRating(f.foods[0]._id!, 3, 3)
    const path = `/Food/${f.foods[0]._id}`
    assert.equal((await api(`${path}?rating=5&hasImages=true`)).body.result.length, 1)
    assert.equal((await api(`${path}?hasImages=false`)).body.result[0].rating, 1)
    assert.equal((await api(`${path}?limit=1&page=2`)).body.result.length, 1)
    assert.equal((await api(`${path}?limit=1&page=4`)).body.result.length, 0)
    for (const query of [
      'rating=6',
      'hasImages=yes',
      'limit=101',
      'page=0',
      'hasImages=true&hasImages=false',
      'rating=5&rating=3'
    ])
      assert.equal((await api(`${path}?${query}`)).status, 422)
    await reviews.hideReview(uid(UserRole.ADMIN), String(a._id), 'Violation')
    assert.equal((await api(`${path}?rating=5&hasImages=true`)).body.result.length, 0)
    await assertRating(f.foods[0]._id!, 2, 2)
  })

  await t.test('concurrent independent customers and edits/hides do not lose aggregate rating updates', async () => {
    const f = await fixture()
    const g = await fixture(1, 'OtherCustomer', f.foods)
    const [a, b] = await Promise.all([
      reviews.createReview(uid(), f.payload(0, 0, 5)),
      reviews.createReview(uid('OtherCustomer'), g.payload(0, 0, 1))
    ])
    await assertRating(f.foods[0]._id!, 3, 2)
    await Promise.all([
      reviews.updateReview(uid(), String(a._id), { rating: 4 }),
      reviews.hideReview(uid(UserRole.ADMIN), String(b._id), 'Violation')
    ])
    await assertRating(f.foods[0]._id!, 4, 1)
  })

  await t.test('notification failure rolls back hiding, audit and aggregate changes', async (t) => {
    const f = await fixture()
    const review = await reviews.createReview(uid(), f.payload())
    t.mock.getter(
      db,
      'notifications',
      () =>
        ({
          insertOne: async () => {
            throw new Error('Injected notification failure')
          }
        }) as unknown as Collection<Notification>
    )
    await assert.rejects(reviews.hideReview(uid(UserRole.ADMIN), String(review._id), 'Violation'), /Injected/)
    assert.equal((await db.reviews.findOne({ _id: review._id }))!.isHidden, false)
    assert.equal(await db.auditLogs.countDocuments({ entityId: review._id }), 0)
    await assertRating(f.foods[0]._id!, 5, 1)
  })

  await t.test('service rejects locked or demoted accounts even without HTTP middleware', async () => {
    const f = await fixture()
    const userId = accounts.get(UserRole.CUSTOMER)!._id!
    try {
      await db.users.updateOne({ _id: userId }, { $set: { account_status: AccountStatus.LOCKED } })
      await assert.rejects(reviews.createReview(uid(), f.payload()), { status: 403 })
      await db.users.updateOne(
        { _id: userId },
        { $set: { account_status: AccountStatus.ACTIVE, role: UserRole.MANAGER } }
      )
      await assert.rejects(reviews.createReview(uid(), f.payload()), { status: 403 })
      assert.equal(await db.reviews.countDocuments({ orderId: f.order._id }), 0)
    } finally {
      await db.users.updateOne(
        { _id: userId },
        { $set: { account_status: AccountStatus.ACTIVE, role: UserRole.CUSTOMER } }
      )
    }
  })

  await t.test(
    'migration previews without writes, blocks ambiguous days, accepts verified mapping and preserves reviews',
    async () => {
      const f = await fixture()
      const migrationDb = mongo.db(`migration_${new ObjectId()}`)
      await migrationDb.collection('orders').insertOne(f.order)
      await migrationDb.collection('foods').insertMany(f.foods)
      const legacy = {
        _id: new ObjectId(),
        reviewerId: f.order.userId,
        orderId: f.order._id!,
        foodId: f.foods[0]._id!,
        rating: 4,
        comment: 'Legacy',
        images: [],
        verifiedPurchase: true,
        isHidden: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await migrationDb.collection('reviews').insertOne(legacy)
      await migrationDb
        .collection('reviews')
        .createIndex({ orderId: 1 }, { unique: true, name: 'one_review_per_order' })
      const before = await migrationDb.collection('reviews').findOne({ _id: legacy._id })
      const preview = await inspectReviewMigration(migrationDb)
      assert.equal(preview.issues.length, 1)
      await assert.rejects(applyReviewMigration(mongo, migrationDb), /blocked/)
      assert.deepEqual(await migrationDb.collection('reviews').findOne({ _id: legacy._id }), before)
      const mapping = { [String(legacy._id)]: String(f.order.deliveries[1]._id) }
      const mapped = await inspectReviewMigration(migrationDb, mapping)
      assert.equal(mapped.issues.length, 0)
      assert.equal(mapped.backfills.length, 1)
      assert.deepEqual(await migrationDb.collection('reviews').findOne({ _id: legacy._id }), before)
      const applied = await applyReviewMigration(mongo, migrationDb, mapping)
      assert.equal(applied.backfilled, 1)
      assert.equal(await migrationDb.collection('reviews').countDocuments(), 1)
      assert.equal(
        String((await migrationDb.collection('reviews').findOne({ _id: legacy._id }))!.deliveryId),
        mapping[String(legacy._id)]
      )
      assert.equal((await migrationDb.collection('foods').findOne({ _id: legacy.foodId }))!.rating, 4)
      const indexes = await migrationDb.collection('reviews').listIndexes().toArray()
      assert.ok(indexes.some((index) => index.name === 'one_review_per_delivery_food' && index.unique))
      assert.ok(!indexes.some((index) => index.name === 'one_review_per_order'))
      assert.equal((await applyReviewMigration(mongo, migrationDb)).backfilled, 0)
      await migrationDb
        .collection('reviews')
        .insertOne({ ...legacy, _id: new ObjectId(), deliveryId: f.order.deliveries[0]._id })
      await assert.rejects(
        migrationDb.collection('reviews').insertOne({
          ...legacy,
          _id: new ObjectId(),
          deliveryId: f.order.deliveries[1]._id,
          isHidden: true
        }),
        { code: 11000 }
      )
    }
  )

  await t.test(
    'migration infers only an unambiguous day, detects duplicates and handles an empty database',
    async () => {
      const f = await fixture(1)
      const migrationDb = mongo.db(`migration_${new ObjectId()}`)
      await migrationDb.collection('orders').insertOne(f.order)
      await migrationDb.collection('foods').insertMany(f.foods)
      const legacy = {
        _id: new ObjectId(),
        reviewerId: f.order.userId,
        orderId: f.order._id!,
        foodId: f.foods[0]._id!,
        rating: 5,
        comment: 'Legacy',
        images: [],
        isHidden: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await migrationDb.collection('reviews').insertOne(legacy)
      const preview = await inspectReviewMigration(migrationDb)
      assert.equal(preview.issues.length, 0)
      assert.equal(String(preview.backfills[0].deliveryId), String(f.order.deliveries[0]._id))
      await migrationDb.collection('reviews').insertOne({ ...legacy, _id: new ObjectId(), isHidden: true })
      assert.ok((await inspectReviewMigration(migrationDb)).issues.some((issue) => issue.message.includes('Duplicate')))
      await assert.rejects(applyReviewMigration(mongo, migrationDb), /blocked/)
      assert.equal(await migrationDb.collection('reviews').countDocuments({ deliveryId: { $exists: true } }), 0)
      const emptyDb = mongo.db(`migration_empty_${new ObjectId()}`)
      assert.equal((await applyReviewMigration(mongo, emptyDb)).backfilled, 0)
      assert.ok((await emptyDb.collection('reviews').listIndexes().toArray()).some((index) => index.unique))
    }
  )
})
