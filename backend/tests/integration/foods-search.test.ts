import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ObjectId } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import express from 'express'
import type { AddressInfo } from 'node:net'
import Food from '../../src/models/schemas/Food.schema'

// Real regex/count/pagination queries against an isolated temporary database, never the project DB.
test('FR-CAT-001/002/006 catalogue and food availability on an isolated MongoDB', { timeout: 180000 }, async (t) => {
  const mongo = await MongoMemoryServer.create()
  t.after(() => mongo.stop())
  process.env.DB_URI = mongo.getUri()
  process.env.DB_NAME = `food_search_test_${new ObjectId()}`
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
  })
})
