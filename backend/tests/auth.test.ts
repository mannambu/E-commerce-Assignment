import './setup'
import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import { createHash } from 'node:crypto'
import { BSON, Collection, ObjectId, ClientSession } from 'mongodb'
import { Request, RequestHandler, Response } from 'express'
import jwt from 'jsonwebtoken'
import User, { AccountStatus, UserRole } from '../src/models/schemas/User.schema'
import Session from '../src/models/schemas/Session.schema'
import AuditLog from '../src/models/schemas/AuditLog.schema'
import { TokenPayload } from '../src/models/requests/User.request'
import database from '../src/services/database.services'
import users from '../src/services/user.services'
import email from '../src/services/email.services'
import orders from '../src/services/orders.services'
import {
  accessTokenValidator,
  refreshTokenValidator,
  isAdminValidator,
  isManagerValidator,
  createUserValidator,
  resetPasswordValidator
} from '../src/middlewares/users.middlewares'
import { hashPassword, verifyPassword, hashToken } from '../src/utils/crypto'
import { getDatabaseConfig } from '../src/utils/database-config'

// Small in-memory MongoDB substitute. Tests use real JWT/Bcrypt and real service logic,
// but do not prove MongoDB transaction/replica-set behavior.
type Doc = Record<string, any>
const copy = (doc: Doc) => BSON.deserialize(BSON.serialize(doc))
const equal = (a: any, b: any) =>
  a instanceof ObjectId ? String(a) === String(b) : a instanceof Date ? Number(a) === Number(b) : a === b
function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((part: Doc) => matches(doc, part))
    const actual = doc[key]
    if (value === null) return actual == null
    if (value && typeof value === 'object' && !(value instanceof ObjectId) && !(value instanceof Date)) {
      return Object.entries(value).every(([op, expected]) => {
        if (op === '$exists') return (actual !== undefined) === expected
        if (op === '$gt') return actual > (expected as any)
        if (op === '$gte') return actual >= (expected as any)
        if (op === '$lte') return actual <= (expected as any)
        if (op === '$in') return (expected as any[]).some((item) => equal(actual, item))
        throw new Error(`Unsupported test operator ${op}`)
      })
    }
    return equal(actual, value)
  })
}

function collection(docs: Doc[]) {
  const update = (filter: Doc, change: Doc) => {
    const doc = docs.find((item) => matches(item, filter))
    if (!doc) return { matchedCount: 0, modifiedCount: 0 }
    Object.assign(doc, change.$set)
    for (const key of Object.keys(change.$unset || {})) delete doc[key]
    for (const [key, value] of Object.entries(change.$inc || {})) doc[key] = (doc[key] || 0) + Number(value)
    for (const key of Object.keys(change.$currentDate || {})) doc[key] = new Date()
    return { matchedCount: 1, modifiedCount: 1 }
  }
  return {
    findOne: async (filter: Doc) => {
      const doc = docs.find((item) => matches(item, filter))
      return doc ? copy(doc) : null
    },
    insertOne: async (doc: Doc) => {
      doc._id ||= new ObjectId()
      docs.push(copy(doc))
      return { insertedId: doc._id }
    },
    updateOne: async (filter: Doc, change: Doc) => update(filter, change),
    findOneAndUpdate: async (filter: Doc, change: Doc) => {
      const doc = docs.find((item) => matches(item, filter))
      update(filter, change)
      return doc ? copy(doc) : null
    },
    deleteMany: async (filter: Doc) => {
      for (let i = docs.length - 1; i >= 0; i--) if (matches(docs[i], filter)) docs.splice(i, 1)
    }
  }
}

const password = 'Customer123!'
const legacyHash = createHash('sha256')
  .update(password + process.env.PASSWORD_PEPPER)
  .digest('hex')
function setup(t: TestContext, role = UserRole.CUSTOMER) {
  const account = new User({
    _id: new ObjectId(),
    email: 'customer@example.com',
    username: 'customer',
    password: legacyHash,
    role
  })
  const accounts: Doc[] = [account]
  const sessions: Doc[] = []
  const audits: Doc[] = []
  t.mock.getter(database, 'users', () => collection(accounts) as unknown as Collection<User>)
  t.mock.getter(database, 'sessions', () => collection(sessions) as unknown as Collection<Session>)
  t.mock.getter(database, 'auditLogs', () => collection(audits) as unknown as Collection<AuditLog>)
  t.mock.method(database, 'withTransaction', async (fn: (session: ClientSession) => Promise<unknown>) =>
    fn({} as ClientSession)
  )
  return { account, accounts, sessions, audits, login: () => users.login({ identifier: account.email, password }) }
}
const decode = (token: string) => jwt.decode(token) as TokenPayload
function run(validator: RequestHandler, request: Partial<Request>) {
  return new Promise<any>((resolve, reject) => {
    Promise.resolve(validator(request as Request, {} as Response, (error) => resolve(error))).catch(reject)
  })
}
const access = (token: string) => run(accessTokenValidator, { headers: { authorization: `Bearer ${token}` } })
const refresh = (token: string) => run(refreshTokenValidator, { body: { refresh_token: token } })

test('Bcrypt salts independently, verifies passwords and rejects input above 72 bytes', async () => {
  const first = await hashPassword(password)
  const second = await hashPassword(password)
  assert.match(first, /^\$2[ab]\$12\$/)
  assert.notEqual(first, second)
  assert.equal(await verifyPassword(password, first), true)
  assert.equal(await verifyPassword('Wrong123!', first), false)
  assert.equal(await verifyPassword(password, legacyHash), true)
  await assert.rejects(hashPassword('é'.repeat(40)))
})

test('database configuration requires DB_URI/DB_NAME and preserves the chosen cluster', () => {
  assert.equal(getDatabaseConfig().uri, 'mongodb://127.0.0.1:27017')
  const uri = process.env.DB_URI
  delete process.env.DB_URI
  try {
    assert.throws(getDatabaseConfig, /DB_URI/)
  } finally {
    process.env.DB_URI = uri
  }
})

test('legacy login upgrades password and creates distinct sessions with role/version claims and hashed refresh tokens', async (t) => {
  const { account, sessions, login } = setup(t)
  const first = await login()
  const second = await login()
  assert.match(account.password, /^\$2[ab]\$/)
  assert.notEqual(first.refresh_token, second.refresh_token)
  const decoded = decode(first.access_token)
  assert.equal(decoded.role, UserRole.CUSTOMER)
  assert.equal(decoded.tokenVersion, 0)
  assert.notEqual(decoded.sessionId, decode(second.access_token).sessionId)
  assert.equal(sessions[0].token, hashToken(first.refresh_token))
  assert.equal(await access(first.access_token), undefined)
  assert.equal(await refresh(first.refresh_token), undefined)
})

test('logout rejects both tokens of that session while another session remains active', async (t) => {
  const { login } = setup(t)
  const first = await login()
  const second = await login()
  await users.logout(first.refresh_token)
  assert.equal((await access(first.access_token)).status, 401)
  assert.equal((await refresh(first.refresh_token)).status, 401)
  assert.equal(await access(second.access_token), undefined)
})

test('concurrent refresh succeeds once, rejects reuse and logout still revokes the rotated session', async (t) => {
  const { login, sessions } = setup(t)
  const original = await login()
  const results = await Promise.allSettled(
    [1, 2].map(() => users.refreshToken({ refresh_token: original.refresh_token }))
  )
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  const success = results.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<{
    access_token: string
    refresh_token: string
  }>
  assert.equal(sessions.length, 1)
  assert.equal(decode(success.value.refresh_token).exp, decode(original.refresh_token).exp)
  assert.equal((await refresh(original.refresh_token)).status, 401)
  assert.equal(await refresh(success.value.refresh_token), undefined)
  await users.logout(original.refresh_token) // models a logout already validated before rotation
  assert.equal((await access(success.value.access_token)).status, 401)
})

test('session expiry, changed role/version, tampered and legacy tokens are rejected', async (t) => {
  const { login, account, sessions } = setup(t)
  const tokens = await login()
  account.tokenVersion++
  assert.equal((await access(tokens.access_token)).status, 401)
  account.tokenVersion--
  account.role = UserRole.MANAGER
  assert.equal((await access(tokens.access_token)).status, 401)
  account.role = UserRole.CUSTOMER
  sessions[0].exp = new Date(0)
  assert.equal((await access(tokens.access_token)).status, 401)
  const legacy = jwt.sign({ user_id: account._id, token_type: 0 }, process.env.JWT_SECRET_ACCESS_TOKEN!)
  assert.equal((await access(legacy)).status, 401)
  assert.equal((await access(tokens.access_token + 'changed')).status, 401)
})

test('logout-all revokes every session and increments account version', async (t) => {
  const { login, account, sessions } = setup(t)
  const first = await login()
  const second = await login()
  await users.logoutAll(String(account._id))
  assert.equal(sessions.length, 0)
  assert.equal(account.tokenVersion, 1)
  assert.equal((await access(first.access_token)).status, 401)
  assert.equal((await refresh(second.refresh_token)).status, 401)
})

test('five failed logins revoke old sessions and temporary lock expiry permits login', async (t) => {
  const { account, login } = setup(t)
  const tokens = await login()
  const wrong = () => users.login({ identifier: account.email, password: 'Wrong123!' })
  for (let i = 0; i < 4; i++) await assert.rejects(wrong(), { status: 401 })
  await assert.rejects(wrong(), { status: 400 })
  assert.equal(account.account_status, AccountStatus.LOCKED)
  assert.equal((await access(tokens.access_token)).status, 401)
  account.locked_until = new Date(0)
  const next = await login()
  assert.equal(await access(next.access_token), undefined)
  assert.equal((await access(tokens.access_token)).status, 401)
})

test('forgot-password mails an opaque token, stores only its hash and returns a generic response', async (t) => {
  const { account } = setup(t)
  let sent = ''
  t.mock.method(email, 'getResetConfig', () => ({}))
  t.mock.method(email, 'sendPasswordReset', async (recipient: string, userId: string, token: string) => {
    assert.equal(recipient, account.email)
    assert.equal(userId, String(account._id))
    sent = token
  })
  const known = await users.forgotPasswordByEmail(account.email)
  const unknown = await users.forgotPasswordByEmail('missing@example.com')
  assert.deepEqual(known, unknown)
  assert.equal('forgot_password_token' in known, false)
  assert.match(sent, /^[a-f0-9]{64}$/)
  assert.equal(account.forgot_password_token, hashToken(sent))
  assert.ok(Number(account.forgot_password_expires_at) > Date.now())
  const original = sent
  await users.forgotPasswordByEmail(account.email)
  assert.equal(sent, original) // cooldown
})

test('SMTP failure clears the pending token without disclosing it', async (t) => {
  const { account } = setup(t)
  t.mock.method(email, 'getResetConfig', () => ({}))
  t.mock.method(email, 'sendPasswordReset', async () => {
    throw new Error('SMTP unavailable')
  })
  t.mock.method(console, 'error', () => {})
  const result = await users.forgotPasswordByEmail(account.email)
  assert.equal('forgot_password_token' in result, false)
  assert.equal(account.forgot_password_token, '')
  assert.equal(account.forgot_password_expires_at, undefined)
})

test('reset rejects expired/wrong/used tokens and atomically revokes all sessions on success', async (t) => {
  const { account, login, sessions } = setup(t)
  const first = await login()
  const second = await login()
  const token = 'a'.repeat(64)
  account.forgot_password_token = hashToken(token)
  account.forgot_password_expires_at = new Date(0)
  const body = { user_id: String(account._id), password: 'NewPassword123!', forgot_password_token: token }
  await assert.rejects(users.resetPassword(body), { status: 401 })
  account.forgot_password_expires_at = new Date(Date.now() + 60000)
  await assert.rejects(users.resetPassword({ ...body, user_id: String(new ObjectId()) }), { status: 401 })
  await assert.rejects(users.resetPassword({ ...body, forgot_password_token: 'b'.repeat(64) }), { status: 401 })
  const results = await Promise.allSettled([users.resetPassword(body), users.resetPassword(body)])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(sessions.length, 0)
  assert.equal(account.tokenVersion, 1)
  assert.equal(await verifyPassword(body.password, account.password), true)
  assert.equal(await verifyPassword(password, account.password), false)
  assert.equal((await access(first.access_token)).status, 401)
  assert.equal((await refresh(second.refresh_token)).status, 401)
  await assert.rejects(users.resetPassword(body), { status: 401 })
})

test('reset validation rejects malformed IDs and weak/oversized passwords', async () => {
  for (const badPassword of ['short', 'é'.repeat(40)]) {
    const error = await run(resetPasswordValidator, {
      body: { user_id: 'bad-id', password: badPassword, confirm_password: badPassword, forgot_password_token: 'token' }
    })
    assert.equal(error.status, 422)
  }
})

test('Admin locks/unlocks with audit, clears temporary lock and cannot revive old sessions', async (t) => {
  const { account, accounts, audits, login } = setup(t)
  const tokens = await login()
  const admin = new User({
    _id: new ObjectId(),
    email: 'admin@example.com',
    password: legacyHash,
    role: UserRole.ADMIN
  })
  accounts.push(admin)
  account.locked_until = new Date(0)
  await users.updateUserStatus(String(account._id), AccountStatus.LOCKED, String(admin._id))
  assert.equal(account.locked_until, undefined)
  await assert.rejects(login(), { status: 403 })
  await users.updateUserStatus(String(account._id), AccountStatus.ACTIVE, String(admin._id))
  assert.equal((await access(tokens.access_token)).status, 401)
  assert.equal(await access((await login()).access_token), undefined)
  assert.deepEqual(
    audits.map((audit) => audit.action),
    ['AccountLocked', 'AccountUnlocked']
  )
  await assert.rejects(users.updateUserStatus(String(admin._id), AccountStatus.LOCKED, String(admin._id)), {
    status: 403
  })
})

test('only Admin can create Customer/Manager; no Admin creation or password leakage', async (t) => {
  const { account, accounts, audits } = setup(t, UserRole.ADMIN)
  const body = {
    email: 'manager@example.com',
    username: 'manager',
    password,
    confirm_password: password,
    phone: '0901234567',
    role: UserRole.MANAGER
  }
  const result = await users.createUser(String(account._id), body)
  assert.equal(result.role, UserRole.MANAGER)
  assert.equal('password' in result, false)
  assert.match(accounts[1].password, /^\$2[ab]\$/)
  assert.equal(audits[0].action, 'UserCreated')
  assert.equal(JSON.stringify(audits).includes(password), false)
  await assert.rejects(users.createUser(String(account._id), { ...body, role: UserRole.ADMIN }), { status: 403 })
  account.role = UserRole.MANAGER
  await assert.rejects(users.createUser(String(account._id), body), { status: 403 })
  const error = await run(createUserValidator, { body: { ...body, role: UserRole.ADMIN } })
  assert.equal(error.status, 422)
})

test('Manager can read all orders but is denied Admin operations; Admin is denied Manager-only guard', async (t) => {
  const { account } = setup(t, UserRole.MANAGER)
  t.mock.getter(database, 'orders', () => ({ find: () => ({ sort: () => ({ toArray: async () => [] }) }) }) as any)
  assert.deepEqual(await orders.getAllOrders(String(account._id)), [])
  const request = { decoded_authorization: { user_id: String(account._id) } as TokenPayload }
  assert.equal((await run(isAdminValidator, request)).status, 403)
  assert.equal(await run(isManagerValidator, request), undefined)
  account.role = UserRole.ADMIN
  assert.equal((await run(isManagerValidator, request)).status, 403)
  account.role = UserRole.CUSTOMER
  await assert.rejects(orders.getAllOrders(String(account._id)), { status: 403 })
})
