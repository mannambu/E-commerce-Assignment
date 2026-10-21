import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MongoClient, ObjectId, Collection } from 'mongodb'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import User, { AccountStatus, UserRole } from '../../src/models/schemas/User.schema'
import type Notification from '../../src/models/schemas/Notification.schema'
import { pendingNotificationEmail } from '../../src/utils/notification-email'
import { createSchemaIndexes } from '../../src/models/schema-indexes'

test('notification email queue on a replica set, with mocked SMTP only', { timeout: 180000 }, async (t) => {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  process.env.DB_URI = repl.getUri()
  process.env.DB_NAME = `email_${new ObjectId()}`
  const mongo = new MongoClient(process.env.DB_URI)
  const db = (await import('../../src/services/database.services')).default
  const worker = (await import('../../src/services/notification-email.services')).default
  const email = (await import('../../src/services/email.services')).default
  const users = (await import('../../src/services/user.services')).default
  const { startNotificationEmailJob } = await import('../../src/jobs/notification-email.jobs')
  t.after(async () => {
    await db.close()
    await mongo.close()
    await repl.stop()
  })
  await db.connect()
  await createSchemaIndexes(mongo.db(process.env.DB_NAME))
  const customer = new User({
    _id: new ObjectId(),
    email: 'customer@example.com',
    username: 'customer',
    password: 'hash'
  })
  const admin = new User({
    _id: new ObjectId(),
    email: 'admin@example.com',
    username: 'admin',
    password: 'hash',
    role: UserRole.ADMIN
  })
  await db.users.insertMany([customer, admin])
  const sent: { to: string; id: string; title: string; message: string }[] = []
  t.mock.method(email, 'sendNotification', async (to, message) => {
    sent.push({ to, ...message })
  })
  const now = new Date()
  function entry(overrides: Partial<Notification> = {}): Notification {
    return {
      _id: new ObjectId(),
      userId: customer._id!,
      type: 'Order',
      priority: 'Normal',
      title: 'Order confirmed',
      message: 'Order TEST confirmed',
      eventKey: `test:${new ObjectId()}`,
      email: pendingNotificationEmail(now),
      createdAt: now,
      ...overrides
    }
  }
  t.beforeEach(async () => {
    await db.notifications.deleteMany({})
    sent.length = 0
  })

  await t.test(
    'old rows and future retries are ignored; concurrent workers claim a new event exactly once',
    async () => {
      await db.notifications.insertOne(entry({ email: undefined }))
      await db.notifications.insertOne(entry({ email: pendingNotificationEmail(new Date(now.getTime() + 60000)) }))
      const notification = entry()
      await db.notifications.insertOne(notification)
      await assert.rejects(db.notifications.insertOne(entry({ eventKey: notification.eventKey })), { code: 11000 })
      const results = await Promise.all([worker.processNext(now), worker.processNext(now)])
      assert.deepEqual(results.sort(), [false, true])
      assert.equal(sent.length, 1)
      assert.equal(sent[0].to, customer.email)
      assert.equal(sent[0].id, String(notification._id))
      const saved = (await db.notifications.findOne({ _id: notification._id }))!
      assert.equal(saved.email!.status, 'Sent')
      assert.equal(saved.email!.attempts, 1)
      assert.ok(saved.email!.sentAt instanceof Date)
      assert.equal(saved.email!.lockToken, undefined)
      assert.equal(await worker.processNext(now), false)
    }
  )

  await t.test(
    'SMTP failure schedules bounded retries, stores only safe error codes and leaves the event intact',
    async (t) => {
      const notification = entry()
      await db.notifications.insertOne(notification)
      t.mock.method(email, 'sendNotification', async () => {
        throw new Error('SECRET SMTP password or provider response')
      })
      let time = now
      for (let attempt = 1; attempt <= 5; attempt++) {
        assert.equal(await worker.processNext(time), true)
        const saved = (await db.notifications.findOne({ _id: notification._id }))!
        assert.equal(saved.email!.attempts, attempt)
        assert.equal(saved.email!.status, attempt === 5 ? 'Failed' : 'Pending')
        assert.equal(saved.email!.lastErrorCode, 'SMTP_ERROR')
        assert.equal(JSON.stringify(saved).includes('SECRET'), false)
        assert.equal(saved.message, notification.message)
        if (attempt < 5) assert.equal(await worker.processNext(time), false)
        time = saved.email!.nextAttemptAt
      }
      assert.equal(await worker.processNext(new Date(time.getTime() + 86400000)), false)
    }
  )

  await t.test('a transient failure can succeed later without sending a Sent event again', async (t) => {
    const notification = entry()
    await db.notifications.insertOne(notification)
    let attempts = 0
    t.mock.method(email, 'sendNotification', async () => {
      if (++attempts === 1) throw new Error('Temporary error')
    })
    await worker.processNext(now)
    const retry = (await db.notifications.findOne({ _id: notification._id }))!.email!.nextAttemptAt
    await worker.processNext(retry)
    assert.equal((await db.notifications.findOne({ _id: notification._id }))!.email!.status, 'Sent')
    assert.equal(await worker.processNext(retry), false)
    assert.equal(attempts, 2)
  })

  await t.test('unexpired leases are respected, abandoned leases recover and exhausted leases terminate', async () => {
    const active = entry({
      email: {
        status: 'Sending',
        attempts: 1,
        nextAttemptAt: now,
        lockToken: new ObjectId(),
        leaseUntil: new Date(now.getTime() + 60000)
      }
    })
    const abandoned = entry({
      email: { status: 'Sending', attempts: 1, nextAttemptAt: now, lockToken: new ObjectId(), leaseUntil: now }
    })
    const exhausted = entry({
      email: { status: 'Sending', attempts: 5, nextAttemptAt: now, lockToken: new ObjectId(), leaseUntil: now }
    })
    await db.notifications.insertMany([active, abandoned, exhausted])
    await worker.processNext(now)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].id, String(abandoned._id))
    assert.equal((await db.notifications.findOne({ _id: active._id }))!.email!.status, 'Sending')
    const failed = (await db.notifications.findOne({ _id: exhausted._id }))!.email!
    assert.equal(failed.status, 'Failed')
    assert.equal(failed.lastErrorCode, 'DELIVERY_UNKNOWN')
  })

  await t.test(
    'a worker that loses its lease during recipient lookup cannot send or overwrite the new owner',
    async (t) => {
      const notification = entry()
      await db.notifications.insertOne(notification)
      const replacement = new ObjectId()
      t.mock.getter(
        db,
        'users',
        () =>
          ({
            findOne: async () => {
              await db.notifications.updateOne({ _id: notification._id }, { $set: { 'email.lockToken': replacement } })
              return customer
            }
          }) as unknown as Collection<User>
      )
      await worker.processNext(now)
      assert.equal(sent.length, 0)
      const saved = (await db.notifications.findOne({ _id: notification._id }))!
      assert.equal(String(saved.email!.lockToken), String(replacement))
      assert.equal(saved.email!.status, 'Sending')
    }
  )

  await t.test('uncommitted and rolled back business events never send email', async () => {
    const notification = entry()
    await assert.rejects(
      db.withTransaction(async (session) => {
        await db.notifications.insertOne(notification, { session })
        assert.equal(await worker.processNext(now), false)
        throw new Error('Rollback business action')
      }),
      /Rollback/
    )
    assert.equal(sent.length, 0)
    assert.equal(await db.notifications.countDocuments({ _id: notification._id }), 0)
    await db.withTransaction(async (session) => {
      await db.notifications.insertOne(notification, { session })
    })
    assert.equal(await worker.processNext(now), true)
    assert.equal(sent.length, 1)
  })

  await t.test(
    'missing users or invalid addresses fail safely without sending to supplied external addresses',
    async () => {
      const missing = entry({ userId: new ObjectId() })
      await db.notifications.insertOne(missing)
      await worker.processNext(now)
      assert.equal(
        (await db.notifications.findOne({ _id: missing._id }))!.email!.lastErrorCode,
        'RECIPIENT_UNAVAILABLE'
      )
      await db.users.updateOne({ _id: customer._id }, { $set: { email: 'a@example.com,b@example.com' } })
      try {
        const bad = entry()
        await db.notifications.insertOne(bad)
        await worker.processNext(now)
        assert.equal((await db.notifications.findOne({ _id: bad._id }))!.email!.status, 'Failed')
        assert.equal(sent.length, 0)
      } finally {
        await db.users.updateOne({ _id: customer._id }, { $set: { email: customer.email } })
      }
    }
  )

  await t.test(
    'Admin lock/unlock queues emails atomically and retries of the business command do not duplicate events',
    async () => {
      const userId = String(customer._id),
        adminId = String(admin._id)
      await users.updateUserStatus(userId, AccountStatus.LOCKED, adminId, 'Account violation')
      await users.updateUserStatus(userId, AccountStatus.LOCKED, adminId, 'Account violation')
      assert.equal(await db.notifications.countDocuments({ userId: customer._id, 'email.status': 'Pending' }), 1)
      await worker.processNext(new Date(Date.now() + 1000))
      assert.equal(sent.length, 1) // Locked users still receive the reason.
      assert.match(sent[0].message, /Account violation/)
      await users.updateUserStatus(userId, AccountStatus.ACTIVE, adminId, 'Resolved')
      assert.equal(await db.notifications.countDocuments({ userId: customer._id }), 2)
      const stored = (await db.users.findOne({ _id: customer._id }))!
      assert.equal(stored.account_status, AccountStatus.ACTIVE)
    }
  )

  await t.test(
    'queue persistence failure rolls back lock and audit; SMTP failure does not roll back a committed lock',
    async (t) => {
      const previous = await db.auditLogs.countDocuments()
      const getter = t.mock.getter(
        db,
        'notifications',
        () =>
          ({
            insertOne: async () => {
              throw new Error('Queue unavailable')
            }
          }) as unknown as Collection<Notification>
      )
      await assert.rejects(
        users.updateUserStatus(String(customer._id), AccountStatus.LOCKED, String(admin._id), 'Reason'),
        /Queue unavailable/
      )
      getter.mock.restore()
      assert.equal((await db.users.findOne({ _id: customer._id }))!.account_status, AccountStatus.ACTIVE)
      assert.equal(await db.auditLogs.countDocuments(), previous)
      await users.updateUserStatus(String(customer._id), AccountStatus.LOCKED, String(admin._id), 'Reason')
      t.mock.method(email, 'sendNotification', async () => {
        throw new Error('SMTP unavailable')
      })
      await worker.processNext(new Date(Date.now() + 1000))
      assert.equal((await db.users.findOne({ _id: customer._id }))!.account_status, AccountStatus.LOCKED)
      assert.equal(await db.notifications.countDocuments({ 'email.status': 'Pending', 'email.attempts': 1 }), 1)
    }
  )

  await t.test(
    'missing SMTP config consumes no attempts; worker is opt-in and never sends when disabled',
    async (t) => {
      await db.notifications.insertOne(entry())
      t.mock.method(email, 'getSmtpConfig', () => {
        throw new Error('Missing SMTP')
      })
      await assert.rejects(worker.processBatch(), /Missing SMTP/)
      assert.equal(await db.notifications.countDocuments({ 'email.attempts': 0 }), 1)
      const previous = process.env.EMAIL_NOTIFICATIONS_ENABLED
      process.env.EMAIL_NOTIFICATIONS_ENABLED = 'false'
      t.after(() => {
        if (previous === undefined) delete process.env.EMAIL_NOTIFICATIONS_ENABLED
        else process.env.EMAIL_NOTIFICATIONS_ENABLED = previous
      })
      const batch = t.mock.method(worker, 'processBatch', async () => 0)
      const stop = startNotificationEmailJob()
      await Promise.resolve()
      stop()
      assert.equal(batch.mock.callCount(), 0)
    }
  )
})
