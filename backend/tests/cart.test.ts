import './setup'
import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import { BSON, Collection, ObjectId } from 'mongodb'
import express, { Request, RequestHandler, Response } from 'express'
import { AddressInfo } from 'node:net'
import jwt from 'jsonwebtoken'
import Cart from '../src/models/schemas/Cart.schema'
import Food from '../src/models/schemas/Food.schema'
import MealPlan from '../src/models/schemas/MealPlan.schema'
import User from '../src/models/schemas/User.schema'
import { toLocalDate } from '../src/models/schemas/common'
import { TokenType } from '../src/constants/enums'
import database from '../src/services/database.services'
import carts from '../src/services/cart.services'
import orders from '../src/services/orders.services'
import users from '../src/services/user.services'
import cartRouter from '../src/routes/cart.routes'
import { defaultErrorHandler } from '../src/middlewares/errors.middlewares'
import * as validators from '../src/middlewares/cart.middlewares'
import settings, { DEFAULT_COMMERCE_RULES } from '../src/services/settings.services'

// Bản sao BSON mô phỏng đọc/ghi độc lập, kể cả undefined -> null.
// Test không kết nối DB thật; unique index vẫn phải được tạo bằng schema:indexes.
const copy = <T extends object>(value: T): T => BSON.deserialize(BSON.serialize(value)) as T
function day(offset = 1) {
  const date = new Date(`${toLocalDate(new Date())}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function setup(t: TestContext) {
  t.mock.method(settings, 'getCommerceRules', async () => ({ ...DEFAULT_COMMERCE_RULES }))
  t.mock.getter(database, 'users', () => ({ findOne: async () => null }) as unknown as Collection<User>)
  const userId = new ObjectId().toHexString()
  const food = new Food({
    _id: new ObjectId(),
    name: 'Cơm gà',
    description: 'Cơm gà',
    images: [],
    price: 50000,
    calories: 400,
    nutrition: { protein: 30, carb: 40, fat: 10 },
    ingredients: [],
    tags: [],
    stock: 50,
    isActive: true
  })
  const cartDocs: Cart[] = []
  const foods = [food]
  const plans: MealPlan[] = []
  type CartFilter = { userId?: ObjectId; _id?: ObjectId; version?: number }
  const matches = (cart: Cart, filter: CartFilter) =>
    (!filter.userId || cart.userId.equals(filter.userId)) &&
    (!filter._id || cart._id?.equals(filter._id)) &&
    (filter.version === undefined || cart.version === filter.version)
  t.mock.getter(
    database,
    'carts',
    () =>
      ({
        findOne: async (filter: CartFilter) => {
          const cart = cartDocs.find((cart) => matches(cart, filter))
          return cart ? copy(cart) : null
        },
        updateOne: async (
          filter: CartFilter,
          update: { $setOnInsert?: Cart; $set?: Partial<Cart>; $inc?: { version: number } }
        ) => {
          let cart = cartDocs.find((cart) => matches(cart, filter))
          if (!cart && update.$setOnInsert) {
            cart = copy(update.$setOnInsert)
            cartDocs.push(cart)
          }
          if (!cart) return { matchedCount: 0 }
          if (update.$set) Object.assign(cart, copy(update.$set))
          if (update.$inc) cart.version += update.$inc.version
          return { matchedCount: 1 }
        }
      }) as unknown as Collection<Cart>
  )
  t.mock.getter(
    database,
    'foods',
    () =>
      ({
        findOne: async (filter: { _id: ObjectId }) => foods.find((item) => item._id?.equals(filter._id)) || null,
        find: (filter: { _id: { $in: ObjectId[] } }) => ({
          toArray: async () => foods.filter((food) => filter._id.$in.some((id) => food._id?.equals(id))).map(copy)
        })
      }) as unknown as Collection<Food>
  )
  t.mock.getter(
    database,
    'mealPlans',
    () =>
      ({
        findOne: async (filter: { _id: ObjectId; userId: ObjectId }) =>
          plans.find((plan) => plan._id?.equals(filter._id) && plan.userId.equals(filter.userId)) || null
      }) as unknown as Collection<MealPlan>
  )
  return { userId, food, foods, plans, cartDocs, itemId: food._id!.toHexString() }
}

test('one cart persists per account; optional BSON fields do not prevent merging', async (t) => {
  const { userId, itemId, cartDocs } = setup(t)
  await Promise.all([carts.buildCartSummary(userId), carts.buildCartSummary(userId)])
  assert.equal(cartDocs.length, 1)
  const first = await carts.addItem(userId, { itemId, quantity: 1 })
  const second = await carts.addItem(userId, { itemId, quantity: 2, version: first.version })
  assert.equal(second.items.length, 1)
  assert.equal(second.items[0].quantity, 3)
  assert.equal(String(second.items[0]._id), String(first.items[0]._id))
  assert.equal(second.summary.subtotal, 150000)
  assert.equal(second.version, first.version + 1)
  assert.equal(second.canCheckout, true)
  assert.equal('priceAtOrder' in cartDocs[0].items[0], false)
  const otherUser = new ObjectId().toHexString()
  assert.equal((await carts.buildCartSummary(otherUser)).currentCart.items.length, 0)
  assert.equal((await carts.buildCartSummary(userId)).currentCart.summary.itemCount, 3)
})

test('changing mode cannot silently discard a nonempty cart', async (t) => {
  const { userId, itemId, cartDocs } = setup(t)
  await carts.addItem(userId, { itemId, quantity: 1 })
  await assert.rejects(carts.changeMode(userId, { cartType: 'COMBO' }), { status: 409 })
  await assert.rejects(carts.addItem(userId, { itemId, quantity: 1, cartType: 'COMBO', deliveryDate: day() }), {
    status: 409
  })
  assert.equal(cartDocs[0].items.length, 1)
  await carts.clearCart(userId)
  const changed = await carts.changeMode(userId, { cartType: 'COMBO' })
  const response = await carts.buildCartSummary(userId)
  assert.equal(changed.cartType, 'COMBO')
  assert.equal(response.currentCart.cartType, 'COMBO')
  assert.equal(String(response.foodCart.cartId), String(response.comboCart.cartId))
  assert.equal(cartDocs.length, 1)
})

test('same food on different dates or meals has separate lines; edits and deletes use line ID', async (t) => {
  const { userId, itemId } = setup(t)
  const result = await carts.addItems(userId, {
    cartType: 'COMBO',
    items: [
      { itemId, quantity: 1, deliveryDate: day(), mealSlot: 'Lunch' },
      { itemId, quantity: 2, deliveryDate: day(2), mealSlot: 'Lunch' },
      { itemId, quantity: 3, deliveryDate: day(), mealSlot: 'Dinner' }
    ]
  })
  assert.equal(result.items.length, 3)
  await assert.rejects(carts.removeItem(userId, itemId), { status: 400 })
  const updated = await carts.updateItem(userId, String(result.items[1]._id), { quantity: 4 })
  assert.equal(updated.summary.itemCount, 8)
  assert.equal(updated.items.find((item) => item.deliveryDate === day(2))?.quantity, 4)
  const removed = await carts.removeItem(userId, String(result.items[2]._id))
  assert.equal(removed.items.length, 2)
  assert.equal(removed.summary.itemCount, 5)
})

test('changing date/meal merges into the destination line; null clears optional date/meal', async (t) => {
  const { userId, itemId } = setup(t)
  const result = await carts.addItems(userId, {
    items: [
      { itemId, quantity: 1, deliveryDate: day(), mealSlot: 'Lunch' },
      { itemId, quantity: 2, deliveryDate: day(), mealSlot: 'Dinner' }
    ]
  })
  const merged = await carts.updateItem(userId, String(result.items[1]._id), { mealSlot: 'Lunch' })
  assert.equal(merged.items.length, 1)
  assert.equal(merged.items[0].quantity, 3)
  assert.equal(String(merged.items[0]._id), String(result.items[0]._id))
  const cleared = await carts.updateItem(userId, String(merged.items[0]._id), { deliveryDate: null, mealSlot: null })
  assert.equal(cleared.items[0].deliveryDate, undefined)
  assert.equal(cleared.items[0].mealSlot, undefined)
  const empty = await carts.updateItem(userId, String(cleared.items[0]._id), { quantity: 0 })
  assert.equal(empty.items.length, 0)
})

test('bulk add is all or nothing; stock includes every date and reserved quantities', async (t) => {
  const { userId, itemId, food, cartDocs } = setup(t)
  food.stock = 5
  food.reservedStock = 2
  await carts.addItem(userId, { itemId, quantity: 1, cartType: 'COMBO', deliveryDate: day() })
  const before = copy(cartDocs[0])
  await assert.rejects(
    carts.addItems(userId, {
      items: [
        { itemId, quantity: 1, deliveryDate: day(2) },
        { itemId, quantity: 2, deliveryDate: day(3) }
      ]
    }),
    { status: 400 }
  )
  assert.deepEqual(cartDocs[0], before)
  await assert.rejects(
    carts.addItems(userId, {
      items: [
        { itemId, quantity: 1, deliveryDate: day(2) },
        { itemId: new ObjectId().toHexString(), quantity: 1, deliveryDate: day(3) }
      ]
    }),
    { status: 400 }
  )
  assert.deepEqual(cartDocs[0], before)
  assert.equal(food.reservedStock, 2) // Cart kiểm tra kho, chưa giữ kho.
})

test('refresh recalculates current prices and flags hidden/deleted/unavailable foods without dropping lines', async (t) => {
  const { userId, itemId, food, foods } = setup(t)
  await carts.addItem(userId, { itemId, quantity: 2 })
  food.price = 60000
  food.stock = 1
  let result = (await carts.refreshCart(userId)).currentCart
  assert.equal(result.summary.subtotal, 120000)
  assert.equal(result.canCheckout, false)
  assert.equal(result.items[0].availability.availableQuantity, 1)
  assert.equal(result.issues[0].code, 'INSUFFICIENT_STOCK')
  food.stock = 0
  assert.equal((await carts.refreshCart(userId)).currentCart.issues[0].code, 'OUT_OF_STOCK')
  food.isActive = false
  assert.equal((await carts.refreshCart(userId)).currentCart.issues[0].code, 'FOOD_INACTIVE')
  foods.length = 0
  result = (await carts.refreshCart(userId)).currentCart
  assert.equal(result.items.length, 1)
  assert.equal(result.issues[0].code, 'FOOD_REMOVED')
  assert.equal((await carts.removeItem(userId, String(result.items[0]._id))).items.length, 0)
})

test('schedule validates real dates, rejects past dates and limits a cart to one day or one week', async (t) => {
  const { userId, itemId } = setup(t)
  for (const deliveryDate of ['2099-02-30', 'invalid', day(-1), `${day()}T12:00:00+07:00`]) {
    await assert.rejects(carts.addItem(userId, { itemId, quantity: 1, deliveryDate }), { status: 400 })
  }
  await assert.rejects(carts.addItem(userId, { itemId, quantity: 1, cartType: 'COMBO' }), { status: 400 })
  await carts.addItem(userId, { itemId, quantity: 1, deliveryDate: day() })
  await assert.rejects(carts.addItem(userId, { itemId, quantity: 1, deliveryDate: day(2) }), { status: 400 })
  await carts.clearCart(userId)
  await assert.rejects(
    carts.addItems(userId, {
      cartType: 'COMBO',
      items: [
        { itemId, quantity: 1, deliveryDate: day() },
        { itemId, quantity: 1, deliveryDate: day(8) }
      ]
    }),
    { status: 400 }
  )
  const partial = await carts.addItem(userId, { itemId, quantity: 1, cartType: 'COMBO', deliveryDate: day() })
  assert.equal(partial.canCheckout, false)
  assert.equal(partial.issues[0].code, 'INCOMPLETE_WEEK')
})

test('a saved cart with expired dates remains visible and cannot checkout', async (t) => {
  const { userId, itemId, cartDocs } = setup(t)
  await carts.addItem(userId, { itemId, quantity: 1, deliveryDate: day() })
  cartDocs[0].items[0].deliveryDate = day(-1)
  const result = (await carts.buildCartSummary(userId)).currentCart
  assert.equal(result.canCheckout, false)
  assert.equal(result.issues[0].code, 'PAST_DATE')
  assert.equal(result.items.length, 1)
  const fixed = await carts.updateItem(userId, String(result.items[0]._id), { deliveryDate: day() })
  assert.equal(fixed.canCheckout, true)
})

test('stale versions and concurrent writes cannot overwrite newer cart contents', async (t) => {
  const { userId, itemId, cartDocs } = setup(t)
  const first = await carts.addItem(userId, { itemId, quantity: 1 })
  await carts.addItem(userId, { itemId, quantity: 1, version: first.version })
  await assert.rejects(carts.updateItem(userId, String(first.items[0]._id), { quantity: 8, version: first.version }), {
    status: 409
  })
  await assert.rejects(carts.clearCart(userId, first.version), { status: 409 })
  const results = await Promise.allSettled([
    carts.addItem(userId, { itemId, quantity: 1 }),
    carts.addItem(userId, { itemId, quantity: 1 })
  ])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
  assert.equal(rejected.reason.status, 409)
  assert.equal(cartDocs[0].items[0].quantity, 3)
})

test('cart line ownership and meal plan references are checked', async (t) => {
  const { userId, itemId, food, plans } = setup(t)
  const planId = new ObjectId()
  const mealId = new ObjectId()
  plans.push({
    _id: planId,
    userId: new ObjectId(userId),
    status: 'Draft',
    days: [{ date: day(), meals: [{ _id: mealId, foodId: food._id, slot: 'Lunch' }] }]
  } as MealPlan)
  const payload = {
    itemId,
    quantity: 1,
    deliveryDate: day(),
    mealSlot: 'Lunch' as const,
    mealPlanId: String(planId),
    mealPlanItemId: String(mealId)
  }
  const added = await carts.addItem(userId, payload)
  const otherUser = new ObjectId().toHexString()
  await assert.rejects(carts.removeItem(otherUser, String(added.items[0]._id)), { status: 404 })
  await assert.rejects(carts.addItem(otherUser, payload), { status: 400 })
  await assert.rejects(carts.addItem(userId, { ...payload, mealPlanItemId: undefined }), { status: 400 })
  await assert.rejects(carts.updateItem(userId, String(added.items[0]._id), { mealSlot: 'Dinner' }), { status: 400 })
  plans[0].status = 'Ordered'
  await assert.rejects(carts.addItem(userId, payload), { status: 400 })
})

test('weekly quote uses all seven menus and only first-day shipping; invalid cart blocks checkout before insert', async (t) => {
  const { userId, itemId, food } = setup(t)
  const added = await carts.addItems(userId, {
    cartType: 'COMBO',
    items: Array.from({ length: 7 }, (_, index) => ({
      itemId,
      quantity: index + 1,
      deliveryDate: day(index + 2),
      mealSlot: 'Lunch' as const
    }))
  })
  assert.equal(added.canCheckout, true)
  assert.equal(added.summary.itemCount, 28)
  assert.equal(added.summary.shippingFee, null)
  assert.equal(added.summary.shippingPolicy, 'FIRST_DAY_ONLY')
  const payload = {
    cartType: 'COMBO' as const,
    packageType: 'WEEKLY_7D' as const,
    deliveryDate: `${day(2)}T12:00:00+07:00`,
    deliveryAddress: 'Địa chỉ test',
    distanceKm: 6,
    paymentMethod: 'COD' as const
  }
  const quote = await orders.quoteOrder(userId, payload)
  assert.deepEqual(
    quote.deliveries.map((delivery) => delivery.items[0].quantity),
    [1, 2, 3, 4, 5, 6, 7]
  )
  assert.equal(quote.pricing.subtotal, 28 * food.price)
  assert.equal(quote.pricing.shippingFee, 20000)
  assert.equal(
    quote.deliveries.slice(1).reduce((sum, delivery) => sum + delivery.waivedShippingFee, 0),
    120000
  )
  await assert.rejects(orders.quoteOrder(userId, { ...payload, packageType: 'ONE_DAY' }), { status: 400 })
  food.stock = 27
  // Không mock orders collection: nếu checkout vẫn tới insert, test sẽ không thể thành công.
  await assert.rejects(orders.createOrder(userId, payload), { status: 400 })
})

function run(validator: RequestHandler, request: Partial<Request>) {
  return new Promise<unknown>((resolve, reject) => {
    Promise.resolve(validator(request as Request, {} as Response, (error) => resolve(error))).catch(reject)
  })
}

test('validators reject malformed quantities, dates, IDs, empty patches and invalid modes', async () => {
  const itemId = new ObjectId().toHexString()
  for (const quantity of [0, -1, 1.5, null, true, {}, [1], Number.MAX_SAFE_INTEGER + 1]) {
    const error = await run(validators.addCartItemValidator, { body: { itemId, quantity } })
    assert.equal((error as { status: number }).status, 422)
  }
  for (const body of [
    { itemId, quantity: 1, deliveryDate: '2099-02-30' },
    { itemId: 'bad', quantity: 1 },
    { itemId, quantity: 1, cartType: 'BAD' },
    { itemId, quantity: 1, version: -1 }
  ]) {
    assert.ok(await run(validators.addCartItemValidator, { body }))
  }
  assert.ok(await run(validators.updateCartItemValidator, { params: { lineId: itemId }, body: {} }))
  assert.ok(
    await run(validators.updateCartItemValidator, { params: { lineId: itemId }, body: {}, query: { quantity: '5' } })
  )
  assert.equal(
    await run(validators.updateCartItemValidator, { params: { lineId: itemId }, body: { quantity: 0 } }),
    undefined
  )
  assert.equal(
    await run(validators.updateCartItemValidator, {
      params: { lineId: itemId },
      body: { deliveryDate: null, mealSlot: null }
    }),
    undefined
  )
  assert.ok(await run(validators.addCartItemsValidator, { body: { items: [] } }))
  assert.ok(await run(validators.addCartItemsValidator, { body: { items: [null] } }))
  assert.ok(await run(validators.changeCartModeValidator, { body: {} }))
})

test('cart HTTP routes expose currentCart, bulk/mode and version checks with real validators', async (t) => {
  const { userId, itemId } = setup(t)
  const user = new User({ _id: new ObjectId(userId), email: 'cart@test.local', password: 'unused' })
  t.mock.method(users, 'validateSession', async () => user)
  t.mock.getter(database, 'users', () => ({ findOne: async () => user }) as unknown as Collection<User>)
  const app = express()
  app.use(express.json())
  app.use('/cart', cartRouter)
  app.use(defaultErrorHandler)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  )
  const token = jwt.sign({ user_id: userId, token_type: TokenType.AccessToken }, process.env.JWT_SECRET_ACCESS_TOKEN!)
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/cart`
  const call = async (path: string, method = 'GET', body?: object) => {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined
    })
    return { status: response.status, data: await response.json() }
  }
  assert.equal((await call('/mode', 'PATCH', { cartType: 'COMBO' })).status, 200)
  const added = await call('/items/bulk', 'POST', { items: [{ itemId, quantity: 1, deliveryDate: day() }] })
  assert.equal(added.status, 200)
  const lineId = added.data.result.items[0]._id
  const changed = await call(`/items/${lineId}`, 'PATCH', { quantity: 2, version: added.data.result.version })
  assert.equal(changed.status, 200)
  assert.equal((await call(`/items/${lineId}`, 'DELETE', { version: added.data.result.version })).status, 409)
  assert.equal((await call('?cartType=INVALID', 'DELETE')).status, 422)
  const read = await call('')
  assert.equal(read.data.result.currentCart.items[0].quantity, 2)
  assert.equal(read.data.result.foodCart.items.length, 0)
  assert.equal((await call(`/items/${lineId}`, 'DELETE')).status, 200)
  assert.equal((await call('')).data.result.currentCart.items.length, 0)
})
