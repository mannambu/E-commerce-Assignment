import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ObjectId } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import express from 'express'
import type { AddressInfo } from 'node:net'
import Food from '../../src/models/schemas/Food.schema'

// Real regex/count/pagination queries against an isolated temporary database, never the project DB.
test('FR-CAT-002 food search on an isolated MongoDB', { timeout: 180000 }, async (t) => {
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
    const active = food('Món hết hàng vẫn theo bộ lọc cũ', { stock: 0 })
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

  await t.test('public HTTP search keeps the response contract and rejects repeated search parameters', async () => {
    await seed([food('Cơm gà'), food('Cơm gà ẩn', { isActive: false })])
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
    assert.equal((await fetch(`${base}?search=com&search=ga`)).status, 422)
  })
})
