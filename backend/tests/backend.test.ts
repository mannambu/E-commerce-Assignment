import './setup'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Collection, ObjectId } from 'mongodb'
import { Request, RequestHandler, Response } from 'express'
import jwt from 'jsonwebtoken'
import User, { AccountStatus, UserRole } from '../src/models/schemas/User.schema'
import Session from '../src/models/schemas/Session.schema'
import { TokenType } from '../src/constants/enums'

import database from '../src/services/database.services'
import users from '../src/services/user.services'
import reviews from '../src/services/reviews.services'
import * as userValidators from '../src/middlewares/users.middlewares'
import * as reviewValidators from '../src/middlewares/reviews.middlewares'

function runValidator(validator: RequestHandler, request: Partial<Request>) {
  return new Promise<unknown>((resolve, reject) => {
    Promise.resolve(validator(request as Request, {} as Response, (error) => resolve(error))).catch(reject)
  })
}

const registration = {
  email: 'customer@example.com',
  username: 'customer_test',
  password: 'Customer123',
  confirm_password: 'Customer123',
  phone: '0901234567'
}

test('public registration accepts Customer and rejects privileged or unsupported roles', async (t) => {
  t.mock.method(users, 'checkEmailExist', async () => false)
  t.mock.method(users, 'checkUsernameExist', async () => false)

  for (const role of [undefined, UserRole.CUSTOMER]) {
    assert.equal(await runValidator(userValidators.registerValidator, { body: { ...registration, role } }), undefined)
  }
  for (const role of [UserRole.ADMIN, UserRole.MANAGER, 'UnsupportedRole']) {
    const error = await runValidator(userValidators.registerValidator, { body: { ...registration, role } })
    assert.ok(error)
    assert.equal((error as { status: number }).status, 422)
    assert.ok((error as { errors: Record<string, unknown> }).errors.role)
  }
})

test('registration service always saves Customer even when called without the validator', async (t) => {
  let savedUser: User | undefined
  t.mock.getter(
    database,
    'users',
    () =>
      ({
        insertOne: async (user: User) => {
          savedUser = user
          return { insertedId: user._id }
        }
      }) as unknown as Collection<User>
  )
  t.mock.getter(
    database,
    'sessions',
    () =>
      ({
        insertOne: async () => ({ insertedId: new ObjectId() })
      }) as unknown as Collection<Session>
  )

  const result = await users.register({ ...registration, role: UserRole.ADMIN as UserRole.CUSTOMER })
  assert.equal(savedUser?.role, UserRole.CUSTOMER)
  assert.equal(savedUser?.account_status, AccountStatus.ACTIVE)
  assert.equal(result.role, UserRole.CUSTOMER)
  assert.ok(result.access_token)
})

test('login rejects a permanently locked account instead of automatically unlocking it', async (t) => {
  const lockedUser = new User({ ...registration, account_status: AccountStatus.LOCKED })
  t.mock.getter(
    database,
    'users',
    () =>
      ({
        findOne: async () => lockedUser,
        updateOne: async () => assert.fail('A permanent lock must not be cleared by login')
      }) as unknown as Collection<User>
  )

  await assert.rejects(users.login({ identifier: registration.email, password: registration.password }), {
    status: 403
  })
})

test('valid signed tokens are rejected when the account is no longer supported or active', async (t) => {
  t.mock.getter(
    database,
    'users',
    () =>
      ({
        findOne: async (filter: Record<string, unknown>) => {
          assert.deepEqual(filter.role, { $in: [UserRole.CUSTOMER, UserRole.ADMIN, UserRole.MANAGER] })
          assert.equal(filter.account_status, AccountStatus.ACTIVE)
          return null
        }
      }) as unknown as Collection<User>
  )
  t.mock.getter(
    database,
    'sessions',
    () =>
      ({
        findOne: async () => ({ token: 'exists' })
      }) as unknown as Collection<Session>
  )

  const user_id = new ObjectId().toString()
  const accessToken = jwt.sign({ user_id, token_type: TokenType.AccessToken }, process.env.JWT_SECRET_ACCESS_TOKEN!)
  const accessError = await runValidator(userValidators.accessTokenValidator, {
    headers: { authorization: `Bearer ${accessToken}` }
  })
  assert.equal((accessError as { status: number }).status, 401)

  const refreshToken = jwt.sign({ user_id, token_type: TokenType.RefreshToken }, process.env.JWT_SECRET_REFRESH_TOKEN!)
  const refreshError = await runValidator(userValidators.refreshTokenValidator, {
    body: { refresh_token: refreshToken }
  })
  assert.equal((refreshError as { status: number }).status, 401)
})

test('active Customer, Admin and Manager accounts can still use access tokens', async (t) => {
  const account = new User({ _id: new ObjectId(), ...registration })
  t.mock.getter(database, 'users', () => ({ findOne: async () => account }) as unknown as Collection<User>)
  const sessionId = new ObjectId().toString()
  t.mock.getter(
    database,
    'sessions',
    () => ({ findOne: async () => ({ sessionId }) }) as unknown as Collection<Session>
  )
  for (const role of [UserRole.CUSTOMER, UserRole.ADMIN, UserRole.MANAGER]) {
    account.role = role
    const accessToken = jwt.sign(
      { user_id: account._id!.toString(), token_type: TokenType.AccessToken, sessionId, tokenVersion: 0, role },
      process.env.JWT_SECRET_ACCESS_TOKEN!
    )
    const error = await runValidator(userValidators.accessTokenValidator, {
      headers: { authorization: `Bearer ${accessToken}` }
    })
    assert.equal(error, undefined)
  }
})

test('review validation only accepts food for both creation and listing', async () => {
  for (const targetType of ['Food', 'UnsupportedTarget']) {
    const targetId = new ObjectId().toString()
    const createError = await runValidator(reviewValidators.createReviewValidator, {
      body: {
        targetType,
        targetId,
        orderId: new ObjectId().toString(),
        deliveryId: new ObjectId().toString(),
        rating: 5,
        comment: 'Good food'
      }
    })
    const listError = await runValidator(reviewValidators.getReviewsValidator, { params: { targetType, targetId } })
    if (targetType === 'Food') {
      assert.equal(createError, undefined)
      assert.equal(listError, undefined)
    } else {
      assert.equal((createError as { status: number }).status, 422)
      assert.equal((listError as { status: number }).status, 422)
    }
  }
})

test('review service rejects missing delivery identity and malformed content before accessing DB', async () => {
  const payload = {
    foodId: String(new ObjectId()),
    orderId: String(new ObjectId()),
    deliveryId: String(new ObjectId()),
    rating: 5,
    comment: 'Good food'
  }
  for (const field of ['foodId', 'orderId', 'deliveryId'] as const)
    await assert.rejects(reviews.createReview(String(new ObjectId()), { ...payload, [field]: '' }), { status: 400 })
  for (const change of [
    { rating: 0 },
    { rating: 5.5 },
    { comment: '  ' },
    { images: ['http://example.com/photo.jpg'] }
  ])
    await assert.rejects(reviews.createReview(String(new ObjectId()), { ...payload, ...change }), { status: 400 })
})
