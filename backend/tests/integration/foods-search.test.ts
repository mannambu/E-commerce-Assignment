import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ObjectId } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import express from 'express'
import type { AddressInfo } from 'node:net'
import Food from '../../src/models/schemas/Food.schema'
import User, { AccountStatus, UserRole } from '../../src/models/schemas/User.schema'
import bcrypt from 'bcryptjs'

// Real regex/count/pagination queries against an isolated temporary database, never the project DB.
test('FR-CAT-001/002/003/004/006/007 catalogue on an isolated MongoDB', { timeout: 180000 }, async (t) => {
  const mongo = await MongoMemoryServer.create()
  t.after(() => mongo.stop())
  process.env.DB_URI = mongo.getUri()
  process.env.DB_NAME = `food_search_test_${new ObjectId()}`
  process.env.JWT_SECRET_ACCESS_TOKEN = 'isolated-catalogue-access-test-secret'
  process.env.JWT_SECRET_REFRESH_TOKEN = 'isolated-catalogue-refresh-test-secret'
  const database = (await import('../../src/services/database.services')).default
  t.after(() => database.close())
  const foods = (await import('../../src/services/foods.services')).default
  await database.connect()

  function food(name: string, options: Partial<Food> = {}) {
    return new Food({
      _id: new ObjectId(),
      name,
      description: 'Test food',
      images: [],
      price: 50000,
      calories: 400,
      nutrition: { protein: 30, carb: 40, fat: 13 },
      ingredients: [],
      tags: [],
      stock: 10,
      isActive: true,
      ...options
    })
  }
  async function seed(rows: Food[], legacyIds: ObjectId[] = []) {
    await database.foods.deleteMany({})
    await database.foods.insertMany(rows)
    if (legacyIds.length)
      await database.foods.updateMany({ _id: { $in: legacyIds } }, { $unset: { normalizedName: '' } })
  }
  const ids = (rows: Food[]) => rows.map((row) => String(row._id)).sort()

  await t.test(
    'personal warnings agree with allergen exclusions and remain independent of stock and filter toggles',
    async () => {
      const customer = new User({
        _id: new ObjectId(),
        email: 'warnings@example.test',
        password: 'unused',
        healthProfile: {
          gender: 'Female',
          age: 25,
          heightCm: 165,
          weightKg: 60,
          activityLevel: 'Moderate',
          goal: 'MaintainWeight',
          allergies: [' TÔM / dau ', 'shellfish', 'tôm', '[Nut]', '.*', 'Vegan', 'Milk']
        }
      })
      await database.users.insertOne(customer)
      const shrimp = food('Món tôm', { ingredients: [{ name: 'TÔM tươi', allergyTags: ['SHELLFISH'] }] })
      const soy = food('Món đậu', { ingredients: [{ name: 'Đậu'.normalize('NFD'), allergyTags: [] }] })
      const tagged = food('Món gắn nhãn', { tags: ['[Nut]'] })
      const literal = food('Món ký tự', { ingredients: [{ name: 'Sốt .*', allergyTags: [] }] })
      const safe = food('Món chay', { tags: ['Vegan'] })
      await seed([shrimp, soy, tagged, literal, safe])
      const beforeFoods = await database.foods.find({}).sort({ _id: 1 }).toArray()
      const beforeUser = await database.users.findOne({ _id: customer._id })
      const customerId = String(customer._id)
      const listed = await foods.getFoods({ excludeMyAllergens: 'false' }, false, customerId)
      assert.equal(listed.filters.personalAllergyFilterApplied, false)
      assert.equal(listed.pagination.total, 5)
      for (const item of listed.foods) {
        const detail = await foods.getFoodById(String(item._id), customerId)
        assert.deepEqual(item.allergyWarning, detail.allergyWarning)
        assert.equal(item.allergyWarning.evaluated, true)
        assert.equal(item.availability.canAddToCart, true, 'A warning must not block adding available food')
        assert.equal(
          item.allergyWarning.matchedAllergens.includes('milk'),
          false,
          'Do not expose unrelated profile rules'
        )
        assert.equal(
          item.allergyWarning.matchedAllergens.includes('vegan'),
          false,
          'Dietary restrictions are not allergens'
        )
        // The default filter removes precisely the allergenic items here; the remaining item is Vegan.
        assert.equal(item.allergyWarning.hasMatch, !item._id!.equals(safe._id!))
      }
      const warning = listed.foods.find((item) => item._id!.equals(shrimp._id!))!.allergyWarning
      assert.deepEqual(warning.matchedAllergens, ['tom', 'shellfish'])
      assert.deepEqual(warning.matchedIngredients, ['TÔM tươi'])
      assert.ok(warning.message?.includes('tom, shellfish'))
      const tagWarning = listed.foods.find((item) => item._id!.equals(tagged._id!))!.allergyWarning
      assert.deepEqual(tagWarning.matchedAllergens, ['[nut]'])
      assert.deepEqual(tagWarning.matchedIngredients, [])
      assert.equal(listed.foods.find((item) => item._id!.equals(safe._id!))!.allergyWarning.message, null)
      assert.deepEqual(ids((await foods.getFoods({}, false, customerId)).foods), ids([safe]))
      assert.deepEqual(await database.foods.find({}).sort({ _id: 1 }).toArray(), beforeFoods)
      assert.deepEqual(await database.users.findOne({ _id: customer._id }), beforeUser)
      await database.foods.updateOne({ _id: shrimp._id }, { $set: { reservedStock: shrimp.stock } })
      const soldOut = await foods.getFoodById(String(shrimp._id), customerId)
      assert.equal(soldOut.allergyWarning.hasMatch, true)
      assert.equal(soldOut.availability.canAddToCart, false)
      await database.users.updateOne({ _id: customer._id }, { $set: { 'healthProfile.allergies': ['Vegan'] } })
      assert.equal((await foods.getFoodById(String(shrimp._id), customerId)).allergyWarning.hasMatch, false)
      await database.users.updateOne({ _id: customer._id }, { $set: { 'healthProfile.allergies': [] } })
      assert.deepEqual((await foods.getFoodById(String(shrimp._id), customerId)).allergyWarning, {
        evaluated: true,
        hasMatch: false,
        matchedAllergens: [],
        matchedIngredients: [],
        message: null
      })
    }
  )

  await t.test('goal and allergen filters compose with search, calories, stock and stable pagination', async () => {
    const options = { goalTags: ['GainMuscle'] as Food['goalTags'], tags: ['LowCarb'], calories: 350 }
    const first = food('Cơm gà A', options)
    const second = food('Cơm gà B', options)
    const allergenic = food('Cơm gà tôm', {
      ...options,
      ingredients: [{ name: 'Sốt', allergyTags: ['Shellfish'] }]
    })
    await seed([
      second,
      first,
      allergenic,
      food('Cơm gà chỉ có tag thường', { tags: ['GainMuscle', 'LowCarb'] }),
      food('Cơm gà nhiều calo', { ...options, calories: 600 }),
      food('Cơm gà hết', { ...options, stock: 0 }),
      food('Cơm gà ẩn', { ...options, isActive: false })
    ])
    const query = {
      search: 'com ga',
      goalTags: 'GainMuscle,GainMuscle',
      tags: 'LowCarb',
      excludeAllergens: 'Shellfish',
      minCalories: '350',
      maxCalories: '350',
      sortBy: 'calories',
      limit: '1'
    }
    const page1 = await foods.getFoods(query)
    const page2 = await foods.getFoods({ ...query, page: '2' })
    assert.deepEqual(ids(page1.foods), ids([first]))
    assert.deepEqual(ids(page2.foods), ids([second]))
    assert.deepEqual(page1.pagination, { page: 1, limit: 1, total: 2, total_pages: 2 })
    assert.equal(page1.filters.goalTags, 'GainMuscle')
    assert.deepEqual(ids((await foods.getFoods({ ...query, order: 'desc' })).foods), ids([second]))
    assert.equal((await foods.getFoods({ ...query, page: '3' })).foods.length, 0)
    assert.equal((await foods.getFoods({ goalTags: 'LoseFat,GainMuscle' })).pagination.total, 4)
  })

  await t.test(
    'allergen text is literal, handles Vietnamese names and tags, and preserves legacy vegan rules',
    async () => {
      const shrimp = food('Món tôm', { ingredients: [{ name: 'TÔM', allergyTags: [] }] })
      const decomposed = food('Món đậu', { ingredients: [{ name: 'Đậu'.normalize('NFD'), allergyTags: [] }] })
      const tagged = food('Món gắn nhãn', { tags: ['Shellfish'] })
      const safe = food('Món chay', { tags: ['Vegan'] })
      const literal = food('Món ký tự', { ingredients: [{ name: 'A+B', allergyTags: ['[Nut]'] }] })
      await seed([shrimp, decomposed, tagged, safe, literal])
      assert.deepEqual(
        ids((await foods.getFoods({ excludeAllergens: 'tom,dau,shellfish' })).foods),
        ids([safe, literal])
      )
      assert.deepEqual(
        ids((await foods.getFoods({ excludeAllergens: '[Nut]' })).foods),
        ids([shrimp, decomposed, tagged, safe])
      )
      assert.equal((await foods.getFoods({ excludeAllergens: '.*' })).pagination.total, 5)
      assert.deepEqual(ids((await foods.getFoods({ excludeAllergens: 'ăn chay' })).foods), ids([safe]))
    }
  )

  await t.test(
    'accented, unaccented, uppercase, whitespace and decomposed queries find modern and legacy names',
    async () => {
      const modern = food('Đậu hũ sốt cà chua')
      const legacy = food('ĐẬU   HŨ sốt cà chua')
      const decomposed = food('Đậu hũ sốt cà chua'.normalize('NFD'))
      const blank = food('Đậu hũ sốt cà chua', { normalizedName: '' })
      await seed([modern, legacy, decomposed, blank, food('Cơm gà')], [legacy._id!, decomposed._id!])
      const before = await database.foods.find({}).sort({ _id: 1 }).toArray()
      for (const search of ['dau hu', 'ĐẬU HŨ', '  đậu   HŨ  ', 'Đậu hũ'.normalize('NFD')]) {
        const result = await foods.getFoods({ search })
        assert.deepEqual(ids(result.foods), ids([modern, legacy, decomposed, blank]))
        assert.equal(result.pagination.total, 4)
      }
      assert.deepEqual(
        await database.foods.find({}).sort({ _id: 1 }).toArray(),
        before,
        'Searching must not migrate records'
      )
    }
  )

  await t.test('legacy lookup covers all Vietnamese vowel families and đ in both Unicode forms', async () => {
    const rows = [food('Ắ Ề Ỉ Ỡ Ự Ỹ Đ'), food('Ắ Ề Ỉ Ỡ Ự Ỹ Đ'.normalize('NFD'))]
    await seed(
      rows,
      rows.map((row) => row._id!)
    )
    assert.deepEqual(ids((await foods.getFoods({ search: 'a e i o u y d' })).foods), ids(rows))
  })

  await t.test('regex punctuation is literal on both stored and legacy names', async () => {
    const literal = food('Cơm (gà) + [đậu].*? ^$ {2}|\\')
    const legacy = food('Cơm (gà) + [đậu].*? ^$ {2}|\\')
    await seed([literal, legacy, food('Cơm gà thường')], [legacy._id!])
    for (const search of ['(ga)', '[đậu]', '+', '.', '*', '?', '^', '$', '{2}', '|', '\\', '.*']) {
      assert.deepEqual(ids((await foods.getFoods({ search })).foods), ids([literal, legacy]), search)
    }
    assert.equal((await foods.getFoods({ search: '(a+)+$' })).pagination.total, 0)
  })

  await t.test(
    'existing visibility, filters, sorting and counts apply before paging across both name branches',
    async () => {
      const first = food('Cơm gà A', { price: 30000, calories: 350, tags: ['LowCarb'] })
      const second = food('Cơm gà B', { price: 40000, calories: 450, tags: ['LowCarb'] })
      const hidden = food('Cơm gà ẩn', { price: 35000, calories: 400, tags: ['LowCarb'], isActive: false })
      await seed(
        [
          first,
          second,
          hidden,
          food('Cơm gà đắt', { price: 90000, tags: ['LowCarb'] }),
          food('Cơm gà nhiều calo', { calories: 900, tags: ['LowCarb'] }),
          food('Cơm gà khác tag', { price: 35000 })
        ],
        [second._id!, hidden._id!]
      )
      const query = {
        search: 'COM GA',
        tags: 'LowCarb',
        minPrice: '25000',
        maxPrice: '50000',
        minCalories: '300',
        maxCalories: '500',
        sortBy: 'price',
        order: 'asc' as const,
        limit: '1'
      }
      const page1 = await foods.getFoods({ ...query, page: '1' })
      const page2 = await foods.getFoods({ ...query, page: '2' })
      assert.deepEqual(ids(page1.foods), ids([first]))
      assert.deepEqual(ids(page2.foods), ids([second]))
      assert.deepEqual(page2.pagination, { page: 2, limit: 1, total: 2, total_pages: 2 })
      const admin = await foods.getFoods({ ...query, limit: '10', order: 'desc' }, true)
      assert.deepEqual(
        admin.foods.map((row) => row.name),
        [second.name, hidden.name, first.name]
      )
      assert.equal(admin.pagination.total, 3)
    }
  )

  await t.test('empty search leaves catalogue behavior intact and missing keywords return an empty page', async () => {
    const active = food('Món đang bán và còn hàng')
    await seed([active, food('Món ẩn', { isActive: false })])
    assert.deepEqual(ids((await foods.getFoods({ search: '   ' })).foods), ids([active]))
    const missing = await foods.getFoods({ search: 'khong co mon nay' })
    assert.equal(missing.foods.length, 0)
    assert.equal(missing.pagination.total_pages, 0)
  })

  await t.test('creating and renaming food keeps normalized search current', async () => {
    await database.foods.deleteMany({})
    const created = await foods.createFood(food('Ức gà'))
    assert.equal((await foods.getFoods({ search: 'uc ga' })).pagination.total, 1)
    await foods.updateFood(String(created._id), { name: 'Đậu hũ' })
    assert.equal((await foods.getFoods({ search: 'uc ga' })).pagination.total, 0)
    assert.equal((await foods.getFoods({ search: 'dau hu' })).pagination.total, 1)
  })

  await t.test(
    'customer catalogue counts only active available stock; Admin retains hidden and sold-out foods',
    async () => {
      const partial = food('Cơm gà còn một phần', {
        stock: 5,
        reservedStock: 4,
        price: 30000,
        images: ['https://example.test/food.jpg'],
        goalTags: ['GainMuscle']
      })
      const legacy = food('Cơm gà chưa có reservedStock', { stock: 2, price: 40000 })
      const empty = food('Cơm gà hết', { stock: 0, price: 10000 })
      const held = food('Cơm gà giữ hết', { stock: 5, reservedStock: 5, price: 20000 })
      const hidden = food('Cơm gà ẩn', { isActive: false, stock: 8 })
      const inconsistent = food('Cơm gà kho lệch', { stock: 1, reservedStock: 2 })
      const rows = [partial, legacy, empty, held, hidden, inconsistent]
      await seed(rows)
      await database.foods.updateOne({ _id: legacy._id }, { $unset: { reservedStock: '' } })
      const before = await database.foods.find({}).sort({ _id: 1 }).toArray()
      const query = { search: 'com ga', limit: '1', sortBy: 'price', order: 'asc' as const }
      const first = await foods.getFoods({ ...query, page: '1' })
      const second = await foods.getFoods({ ...query, page: '2' })
      assert.deepEqual(ids(first.foods), ids([partial]))
      assert.deepEqual(ids(second.foods), ids([legacy]))
      assert.deepEqual(first.pagination, { page: 1, limit: 1, total: 2, total_pages: 2 })
      assert.deepEqual(second.pagination, { page: 2, limit: 1, total: 2, total_pages: 2 })
      assert.deepEqual(first.foods[0].availability, {
        isActive: true,
        availableQuantity: 1,
        inStock: true,
        canAddToCart: true
      })
      assert.equal(first.foods[0].stock, 5, 'Raw stock must not change meaning for existing consumers')
      for (const field of ['name', 'images', 'price', 'calories', 'goalTags'] as const) {
        assert.deepEqual(first.foods[0][field], partial[field])
      }
      assert.equal(second.foods[0].availability.availableQuantity, 2)
      const admin = await foods.getFoods({ search: 'com ga' }, true)
      assert.deepEqual(ids(admin.foods), ids(rows))
      assert.equal(admin.pagination.total, 6)
      for (const item of [empty, held, hidden, inconsistent]) {
        assert.equal(admin.foods.find((row) => row._id!.equals(item._id!))!.availability.canAddToCart, false)
      }
      assert.equal(admin.foods.find((row) => row._id!.equals(inconsistent._id!))!.availability.availableQuantity, 0)
      assert.deepEqual(await database.foods.find({}).sort({ _id: 1 }).toArray(), before)
    }
  )

  await t.test(
    'stock holds, releases and depletion are reflected on the next read without changing isActive',
    async () => {
      const item = food('Cơm gà', { stock: 2 })
      await seed([item])
      assert.equal((await foods.getFoodById(String(item._id))).availability.canAddToCart, true)
      await database.foods.updateOne({ _id: item._id }, { $set: { reservedStock: 2 } })
      assert.equal((await foods.getFoods({})).pagination.total, 0)
      assert.equal((await foods.getFoodById(String(item._id))).availability.canAddToCart, false)
      await database.foods.updateOne({ _id: item._id }, { $set: { reservedStock: 0 } })
      assert.equal((await foods.getFoods({})).pagination.total, 1)
      await database.foods.updateOne({ _id: item._id }, { $set: { stock: 0 } })
      const detail = await foods.getFoodById(String(item._id))
      assert.deepEqual(detail.availability, {
        isActive: true,
        availableQuantity: 0,
        inStock: false,
        canAddToCart: false
      })
      await database.foods.updateOne({ _id: item._id }, { $set: { isActive: false } })
      await assert.rejects(foods.getFoodById(String(item._id)), { status: 404 })
      await assert.rejects(foods.getFoodById(String(new ObjectId())), { status: 404 })
    }
  )

  await t.test(
    'cart rechecks availability after a customer viewed an available item and never reserves stock itself',
    async () => {
      const carts = (await import('../../src/services/cart.services')).default
      const userId = String(new ObjectId())
      const item = food('Cơm gà', { stock: 2 })
      await seed([item])
      assert.equal((await foods.getFoodById(String(item._id))).availability.canAddToCart, true)
      await database.foods.updateOne({ _id: item._id }, { $set: { reservedStock: 2 } })
      await assert.rejects(carts.addItem(userId, { itemId: String(item._id), quantity: 1 }), { status: 400 })
      assert.equal((await database.carts.findOne({ userId: new ObjectId(userId) }))!.items.length, 0)
      await database.foods.updateOne({ _id: item._id }, { $set: { reservedStock: 1 } })
      await carts.addItem(userId, { itemId: String(item._id), quantity: 1 })
      await assert.rejects(carts.addItem(userId, { itemId: String(item._id), quantity: 1 }), { status: 400 })
      assert.equal((await database.carts.findOne({ userId: new ObjectId(userId) }))!.items[0].quantity, 1)
      assert.equal((await database.foods.findOne({ _id: item._id }))!.reservedStock, 1)
    }
  )

  await t.test('public HTTP search keeps the response contract and rejects repeated search parameters', async () => {
    const empty = food('Cơm gà hết', { stock: 0 })
    const held = food('Cơm gà giữ hết', { stock: 2, reservedStock: 2 })
    const hidden = food('Cơm gà ẩn', { isActive: false })
    await seed([food('Cơm gà'), empty, held, hidden])
    const app = express()
    const router = (await import('../../src/routes/foods.routes')).default
    const { defaultErrorHandler } = await import('../../src/middlewares/errors.middlewares')
    app.use('/foods', router)
    app.use(defaultErrorHandler)
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
    const response = await fetch(`${base}?search=com%20ga`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.result.foods.length, 1)
    assert.equal(body.result.foods[0].name, 'Cơm gà')
    assert.equal(body.result.filters.search, 'com ga')
    assert.equal(body.result.pagination.total, 1)
    assert.equal(body.result.foods[0].availability.canAddToCart, true)
    for (const item of [empty, held]) {
      const detailResponse = await fetch(`${base}/${item._id}`)
      assert.equal(detailResponse.status, 200)
      const detail = await detailResponse.json()
      assert.equal(detail.result.availability.availableQuantity, 0)
      assert.equal(detail.result.availability.canAddToCart, false)
    }
    assert.equal((await fetch(`${base}/${hidden._id}`)).status, 404)
    assert.equal((await fetch(`${base}?search=com&search=ga`)).status, 422)

    for (const query of [
      'page=0',
      'page=-1',
      'page=1.5',
      'page=Infinity',
      'page=9007199254740992',
      'page=9007199254740991&limit=100',
      'limit=0',
      'limit=101',
      'limit=abc',
      'minPrice=-1',
      'maxPrice=NaN',
      'minCalories=Infinity',
      'maxCalories=0xFF',
      'minCalories=500&maxCalories=400',
      'minPrice=2&maxPrice=1',
      'goalTags=Unknown',
      'sortBy=password',
      'order=up',
      'excludeMyAllergens=0',
      'tags=A&tags=B',
      'goalTags=LoseFat&goalTags=GainMuscle',
      'excludeAllergens=Milk&excludeAllergens=Egg',
      'excludeMyAllergens=true&excludeMyAllergens=false'
    ]) {
      assert.equal((await fetch(`${base}?${query}`)).status, 422, query)
    }

    const shrimp = food('Tôm hấp', { ingredients: [{ name: 'Tôm', allergyTags: ['Shellfish'] }] })
    const chicken = food('Cơm gà')
    await seed([shrimp, chicken, hidden])
    const password = 'Catalogue123!'
    const customer = new User({
      _id: new ObjectId(),
      email: 'catalogue@example.test',
      password: await bcrypt.hash(password, 4),
      healthProfile: {
        gender: 'Male',
        age: 25,
        heightCm: 170,
        weightKg: 65,
        activityLevel: 'Moderate',
        goal: 'GainMuscle',
        allergies: ['Shellfish']
      }
    })
    const other = new User({ _id: new ObjectId(), email: 'other@example.test', password: customer.password })
    const admin = new User({
      _id: new ObjectId(),
      email: 'admin@example.test',
      password: customer.password,
      role: UserRole.ADMIN,
      healthProfile: customer.healthProfile
    })
    const manager = new User({
      _id: new ObjectId(),
      email: 'manager@example.test',
      password: customer.password,
      role: UserRole.MANAGER,
      healthProfile: customer.healthProfile
    })
    await database.users.insertMany([customer, other, admin, manager])
    const users = (await import('../../src/services/user.services')).default
    const tokens = await users.login({ identifier: customer.email, password })
    const catalogue = async (token?: string, query = '') => {
      const response = await fetch(`${base}?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      return (await response.json()).result
    }
    const detail = async (token?: string, query = '', item = shrimp) => {
      const response = await fetch(`${base}/${item._id}?${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      return (await response.json()).result
    }
    const notEvaluated = {
      evaluated: false,
      hasMatch: false,
      matchedAllergens: [],
      matchedIngredients: [],
      message: null
    }
    const personalDetail = await detail(tokens.access_token, 'excludeMyAllergens=false')
    assert.equal(personalDetail.allergyWarning.evaluated, true)
    assert.equal(personalDetail.allergyWarning.hasMatch, true)
    assert.deepEqual(personalDetail.allergyWarning.matchedAllergens, ['shellfish'])
    assert.deepEqual(personalDetail.allergyWarning.matchedIngredients, ['Tôm'])
    const automatic = await catalogue(tokens.access_token)
    assert.deepEqual(ids(automatic.foods), ids([chicken]))
    assert.equal(automatic.filters.excludeMyAllergens, true)
    assert.equal(automatic.filters.personalAllergyFilterApplied, true)
    assert.equal(automatic.pagination.total, 1)
    assert.equal(automatic.foods[0].allergyWarning.evaluated, true)
    assert.equal(automatic.foods[0].allergyWarning.hasMatch, false)
    const unfiltered = await catalogue(tokens.access_token, 'excludeMyAllergens=false')
    assert.deepEqual(
      unfiltered.foods.find((item: Food) => String(item._id) === String(shrimp._id)).allergyWarning,
      personalDetail.allergyWarning
    )
    assert.deepEqual(
      ids((await catalogue(tokens.access_token, 'excludeMyAllergens=false')).foods),
      ids([shrimp, chicken])
    )
    // The switch disables only profile rules, not an explicitly requested allergen filter.
    assert.deepEqual(
      ids((await catalogue(tokens.access_token, 'excludeMyAllergens=false&excludeAllergens=tom')).foods),
      ids([chicken])
    )
    const anonymous = await catalogue(undefined, `user_id=${customer._id}&customerId=${customer._id}`)
    assert.deepEqual(ids(anonymous.foods), ids([shrimp, chicken]))
    assert.equal(anonymous.filters.personalAllergyFilterApplied, false)
    assert.deepEqual(anonymous.foods[0].allergyWarning, notEvaluated)
    assert.deepEqual(
      (await detail(undefined, `user_id=${customer._id}&customerId=${customer._id}`)).allergyWarning,
      notEvaluated
    )
    const otherTokens = await users.login({ identifier: other.email, password })
    assert.equal((await catalogue(otherTokens.access_token)).filters.personalAllergyFilterApplied, false)
    assert.equal((await catalogue(otherTokens.access_token, `user_id=${customer._id}`)).pagination.total, 2)
    assert.deepEqual((await detail(otherTokens.access_token, `user_id=${customer._id}`)).allergyWarning, notEvaluated)
    const adminTokens = await users.login({ identifier: admin.email, password })
    const adminList = await catalogue(adminTokens.access_token)
    assert.deepEqual(ids(adminList.foods), ids([shrimp, chicken, hidden]))
    assert.equal(adminList.filters.personalAllergyFilterApplied, false)
    assert.deepEqual(adminList.foods[0].allergyWarning, notEvaluated)
    assert.deepEqual((await detail(adminTokens.access_token)).allergyWarning, notEvaluated)
    assert.equal(
      (await fetch(`${base}/${hidden._id}`, { headers: { Authorization: `Bearer ${adminTokens.access_token}` } }))
        .status,
      404
    )
    const managerTokens = await users.login({ identifier: manager.email, password })
    assert.equal((await catalogue(managerTokens.access_token)).pagination.total, 2)
    assert.deepEqual((await detail(managerTokens.access_token)).allergyWarning, notEvaluated)
    // Read the current profile each request, with no token refresh or persistent preference needed.
    await database.users.updateOne({ _id: customer._id }, { $set: { 'healthProfile.allergies': [] } })
    assert.equal((await catalogue(tokens.access_token)).pagination.total, 2)
    assert.equal((await detail(tokens.access_token)).allergyWarning.evaluated, true)
    assert.equal((await detail(tokens.access_token)).allergyWarning.hasMatch, false)
    await database.users.updateOne({ _id: customer._id }, { $set: { 'healthProfile.allergies': ['Tôm'] } })
    assert.equal((await catalogue(tokens.access_token)).pagination.total, 1)
    assert.deepEqual((await detail(tokens.access_token)).allergyWarning.matchedAllergens, ['tom'])
    await database.users.updateOne({ _id: customer._id }, { $set: { account_status: AccountStatus.LOCKED } })
    assert.equal((await catalogue(tokens.access_token)).filters.personalAllergyFilterApplied, false)
    assert.deepEqual((await detail(tokens.access_token)).allergyWarning, notEvaluated)
    await database.users.updateOne({ _id: customer._id }, { $set: { account_status: AccountStatus.ACTIVE } })
    await users.logout(tokens.refresh_token)
    for (const token of [tokens.access_token, 'invalid-token']) {
      const result = await catalogue(token)
      assert.equal(result.pagination.total, 2)
      assert.equal(result.filters.personalAllergyFilterApplied, false)
      assert.deepEqual(result.foods[0].allergyWarning, notEvaluated)
      assert.deepEqual((await detail(token)).allergyWarning, notEvaluated)
    }
  })
})
