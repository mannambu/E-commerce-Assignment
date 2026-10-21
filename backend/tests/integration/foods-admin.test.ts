import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AddressInfo } from 'node:net'
import { ObjectId } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import express from 'express'
import bcrypt from 'bcryptjs'
import User, { UserRole } from '../../src/models/schemas/User.schema'

test('FR-ADM-001 food writes through real HTTP and an isolated MongoDB', { timeout: 180000 }, async (t) => {
  const mongo = await MongoMemoryServer.create()
  t.after(() => mongo.stop())
  process.env.DB_URI = mongo.getUri()
  process.env.DB_NAME = `food_admin_test_${new ObjectId()}`
  process.env.JWT_SECRET_ACCESS_TOKEN = 'isolated-food-admin-access-secret'
  process.env.JWT_SECRET_REFRESH_TOKEN = 'isolated-food-admin-refresh-secret'
  const database = (await import('../../src/services/database.services')).default
  t.after(() => database.close())
  await database.connect()
  const users = (await import('../../src/services/user.services')).default
  const password = 'FoodAdmin123!'
  const hash = await bcrypt.hash(password, 4)
  const accounts = [UserRole.ADMIN, UserRole.CUSTOMER, UserRole.MANAGER].map(
    (role) =>
      new User({
        _id: new ObjectId(),
        email: `${role}@example.test`.toLowerCase(),
        password: hash,
        role
      })
  )
  await database.users.insertMany(accounts)
  const tokens = await Promise.all(accounts.map((account) => users.login({ identifier: account.email, password })))
  const app = express()
  app.use(express.json())
  app.use('/foods', (await import('../../src/routes/foods.routes')).default)
  app.use((await import('../../src/middlewares/errors.middlewares')).defaultErrorHandler)
  const server = app.listen(0, '127.0.0.1')
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : resolve()))
      })
  )
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/foods`
  const request = async (
    method: string,
    path = '',
    payload?: unknown,
    token: string | null = tokens[0].access_token
  ) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    })
    return { status: response.status, body: await response.json() }
  }
  const valid = () => ({
    name: '  Đậu hũ sốt  ',
    description: '  Món mới  ',
    images: [' https://example.test/food.jpg '],
    price: '50000',
    calories: '350.5',
    nutrition: { protein: '20', carb: 40, fat: 10 },
    ingredients: [{ name: ' Đậu hũ ', allergyTags: [' Soy '] }],
    tags: [' Vegan '],
    stock: '5',
    goalTags: [' GainMuscle ']
  })
  let itemId: string
  const readStored = () => database.foods.findOne({ _id: new ObjectId(itemId) })

  await t.test('create trims and types data, uses safe defaults and ignores server-owned fields', async () => {
    const payload = valid()
    const response = await request('POST', '', {
      ...payload,
      _id: new ObjectId().toString(),
      normalizedName: 'spoof',
      reservedStock: 99,
      rating: 5,
      reviewCount: 99,
      version: 99,
      createdAt: '2000-01-01',
      availability: { inStock: false },
      nutrition: { ...payload.nutrition, injected: 'ignore' },
      ingredients: [{ ...payload.ingredients[0], injected: 'ignore' }]
    })
    assert.equal(response.status, 201)
    itemId = response.body.result._id
    assert.ok(ObjectId.isValid(itemId))
    const item = (await readStored())!
    assert.equal(item.name, 'Đậu hũ sốt')
    assert.equal(item.normalizedName, 'dau hu sot')
    assert.equal(item.description, 'Món mới')
    assert.deepEqual(item.images, ['https://example.test/food.jpg'])
    assert.deepEqual(item.nutrition, { protein: 20, carb: 40, fat: 10 })
    assert.deepEqual(item.ingredients, [{ name: 'Đậu hũ', allergyTags: ['Soy'] }])
    assert.deepEqual(item.goalTags, ['GainMuscle'])
    assert.deepEqual(item.tags, ['Vegan'])
    assert.equal(item.price, 50000)
    assert.equal(item.calories, 350.5)
    assert.equal(item.stock, 5)
    assert.equal(item.isActive, true)
    assert.equal(item.reservedStock, 0)
    assert.equal(item.rating, 0)
    assert.equal(item.reviewCount, 0)
    assert.equal(item.version, 0)
    assert.notEqual(item.createdAt!.getFullYear(), 2000)
    assert.equal('availability' in item, false)
    assert.equal((await request('GET', '?goalTags=GainMuscle', undefined, null)).body.result.pagination.total, 1)
    assert.equal((await request('GET', '?excludeAllergens=Soy', undefined, null)).body.result.pagination.total, 0)
    const withoutGoals: Record<string, unknown> = valid()
    delete withoutGoals.goalTags
    const defaults = await request('POST', '', { ...withoutGoals, isActive: false, stock: 0 })
    assert.equal(defaults.status, 201)
    assert.deepEqual(defaults.body.result.goalTags, [])
    assert.equal(defaults.body.result.isActive, false)
  })

  await t.test('only a valid Admin session can create, update or hide food', async () => {
    const before = await database.foods.find({}).sort({ _id: 1 }).toArray()
    for (const [token, status] of [
      [null, 401],
      ['invalid', 401],
      [tokens[1].access_token, 403],
      [tokens[2].access_token, 403]
    ] as const) {
      assert.equal((await request('POST', '', valid(), token)).status, status)
      assert.equal((await request('PATCH', `/${itemId}`, { price: 1 }, token)).status, status)
      assert.equal((await request('DELETE', `/${itemId}`, undefined, token)).status, status)
    }
    const revoked = await users.login({ identifier: accounts[0].email, password })
    await users.logout(revoked.refresh_token)
    assert.equal((await request('PATCH', `/${itemId}`, { stock: 0 }, revoked.access_token)).status, 401)
    assert.deepEqual(await database.foods.find({}).sort({ _id: 1 }).toArray(), before)
  })

  await t.test('invalid creates and patches return field errors and never partially write', async () => {
    const invalid: Array<[string, unknown]> = [
      ['name', '   '],
      ['name', ['Món']],
      ['description', null],
      ['description', ' '],
      ['images', []],
      ['images', [' ']],
      ['images', [123]],
      ['images', 'url'],
      ['price', 0],
      ['price', -1],
      ['price', true],
      ['price', [50000]],
      ['price', 'Infinity'],
      ['calories', -1],
      ['calories', 'NaN'],
      ['calories', null],
      ['calories', ''],
      ['nutrition', {}],
      ['nutrition', { protein: 1 }],
      ['nutrition', []],
      ['nutrition', { protein: 1, carb: -1, fat: 0 }],
      ['nutrition', { protein: [1], carb: 0, fat: 0 }],
      ['ingredients', []],
      ['ingredients', [null]],
      ['ingredients', ['Tomato']],
      ['ingredients', [{ name: ' ', allergyTags: [] }]],
      ['ingredients', [{ name: 'Tomato' }]],
      ['ingredients', [{ name: 'Tomato', allergyTags: 'Soy' }]],
      ['ingredients', [{ name: 'Tomato', allergyTags: [' '] }]],
      ['tags', null],
      ['tags', ['']],
      ['tags', [false]],
      ['goalTags', 'GainMuscle'],
      ['goalTags', ['Vegan']],
      ['goalTags', [null]],
      ['stock', 1.5],
      ['stock', -1],
      ['stock', Number.MAX_SAFE_INTEGER + 1],
      ['stock', []],
      ['isActive', 'yes'],
      ['isActive', null],
      ['isActive', [true]]
    ]
    const before = await database.foods.find({}).sort({ _id: 1 }).toArray()
    for (const [field, value] of invalid) {
      for (const [method, path, payload] of [
        ['POST', '', { ...valid(), [field]: value }],
        ['PATCH', `/${itemId}`, { description: 'Must not persist', [field]: value }]
      ] as const) {
        const response = await request(method, path, payload)
        assert.equal(response.status, 422, `${method} ${field}: ${JSON.stringify(value)}`)
        assert.ok(response.body.errors[field], `${method}: missing error for ${field}`)
      }
    }
    for (const field of [
      'name',
      'description',
      'images',
      'price',
      'calories',
      'nutrition',
      'ingredients',
      'tags',
      'stock'
    ]) {
      const payload: Record<string, unknown> = valid()
      delete payload[field]
      assert.equal((await request('POST', '', payload)).status, 422, `missing ${field}`)
    }
    for (const payload of [{}, [], { reservedStock: 0, rating: 5, version: 0 }]) {
      assert.equal((await request('PATCH', `/${itemId}`, payload)).status, 422)
    }
    assert.equal((await request('POST', '', [])).status, 422)
    assert.deepEqual(await database.foods.find({}).sort({ _id: 1 }).toArray(), before)
  })

  await t.test('partial updates preserve omitted fields and replace complete nested values safely', async () => {
    const before = (await readStored())!
    const renamed = await request('PATCH', `/${itemId}`, {
      name: '  Cơm gà  ',
      normalizedName: 'spoof',
      reservedStock: 999
    })
    assert.equal(renamed.status, 200)
    const after = (await readStored())!
    assert.equal(after.name, 'Cơm gà')
    assert.equal(after.normalizedName, 'com ga')
    for (const field of [
      'description',
      'images',
      'price',
      'calories',
      'nutrition',
      'ingredients',
      'tags',
      'goalTags',
      'stock',
      'reservedStock'
    ] as const) {
      assert.deepEqual(after[field], before[field], field)
    }
    assert.equal((await request('GET', '?search=com%20ga', undefined, null)).body.result.pagination.total, 1)
    assert.equal((await request('GET', '?search=dau%20hu', undefined, null)).body.result.pagination.total, 0)
    const response = await request('PATCH', `/${itemId}`, {
      description: '  Đã sửa  ',
      images: [' /uploads/new.jpg '],
      price: '60000',
      calories: 0,
      nutrition: { protein: '0', carb: 0, fat: 0, internal: 'ignore' },
      ingredients: [{ name: ' Cơm ', allergyTags: [], internal: 'ignore' }],
      tags: [],
      goalTags: [],
      isActive: 'false',
      rating: 5,
      reviewCount: 9,
      version: 5
    })
    assert.equal(response.status, 200)
    assert.equal(response.body.result.description, 'Đã sửa')
    assert.deepEqual(response.body.result.images, ['/uploads/new.jpg'])
    assert.deepEqual(response.body.result.nutrition, { protein: 0, carb: 0, fat: 0 })
    assert.deepEqual(response.body.result.ingredients, [{ name: 'Cơm', allergyTags: [] }])
    assert.deepEqual(response.body.result.tags, [])
    assert.deepEqual(response.body.result.goalTags, [])
    assert.equal(response.body.result.rating, 0)
    assert.equal(response.body.result.reviewCount, 0)
    assert.equal(response.body.result.version, 0)
    assert.equal(response.body.result.isActive, false)
    assert.equal((await request('GET', `/${itemId}`, undefined, null)).status, 404)
    assert.equal((await request('PATCH', `/${itemId}`, { isActive: true })).status, 200)
  })

  await t.test('stock cannot drop below holds, and hiding retains food data and reservations', async () => {
    await database.foods.updateOne({ _id: new ObjectId(itemId) }, { $set: { reservedStock: 3 } })
    const before = (await readStored())!
    assert.equal((await request('PATCH', `/${itemId}`, { stock: 2, name: 'Must not persist' })).status, 409)
    assert.deepEqual(await readStored(), before)
    assert.equal((await request('PATCH', `/${itemId}`, { stock: 3 })).status, 200)
    const detail = await request('GET', `/${itemId}`, undefined, null)
    assert.equal(detail.body.result.availability.availableQuantity, 0)
    const storedBeforeHide = (await readStored())!
    assert.equal((await request('DELETE', `/${itemId}`)).status, 200)
    const hidden = (await readStored())!
    assert.equal(hidden.isActive, false)
    assert.equal(hidden.reservedStock, 3)
    assert.deepEqual(hidden.nutrition, storedBeforeHide.nutrition)
    assert.equal(hidden.stock, storedBeforeHide.stock)
    assert.equal((await request('GET', `/${itemId}`, undefined, null)).status, 404)
    assert.equal((await request('GET', '', undefined, null)).body.result.pagination.total, 0)
    assert.equal((await request('GET')).body.result.pagination.total, 2)
    assert.equal((await request('DELETE', `/${itemId}`)).status, 200)
    assert.equal(await database.foods.countDocuments({ _id: new ObjectId(itemId) }), 1)
    for (const method of ['PATCH', 'DELETE']) {
      const payload = method === 'PATCH' ? { name: 'Valid' } : undefined
      assert.equal((await request(method, '/invalid-id', payload)).status, 422)
      assert.equal((await request(method, `/${new ObjectId()}`, payload)).status, 404)
    }
  })
})
