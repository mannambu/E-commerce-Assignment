import assert from 'node:assert/strict'
import test from 'node:test'
import { ObjectId } from 'mongodb'
import User, { AccountStatus, UserRole } from '../src/models/schemas/User.schema'
import Cart from '../src/models/schemas/Cart.schema'
import { normalizeSearchText, toLocalDate } from '../src/models/schemas/common'
import { getSchemaIndexPlan } from '../src/models/schema-indexes'

const userId = new ObjectId()
const foodId = new ObjectId()

test('user defaults do not reintroduce old embedded tracking arrays', () => {
  const user = new User({ email: 'customer@example.com', password: 'hash' })
  assert.equal(user.role, UserRole.CUSTOMER)
  assert.equal(user.account_status, AccountStatus.ACTIVE)
  for (const field of ['notifications', 'weightTracking', 'calorieTracking']) assert.equal(field in user, false)
})

test('cart separates dates, slots and planned servings without storing product prices', () => {
  const cart = new Cart({ userId, cartType: 'COMBO', items: [] })
  const item = { itemId: foodId, quantity: 1, mealSlot: 'Lunch' as const, deliveryDate: '2026-09-28' }
  cart.addItem(item)
  cart.addItem({ ...item, deliveryDate: '2026-09-29' })
  cart.addItem({ ...item, mealSlot: 'Dinner' })
  cart.addItem({ ...item, quantity: 2 })
  cart.addItem({ ...item, mealPlanItemId: new ObjectId() })
  cart.addItem({ ...item, mealPlanItemId: new ObjectId() })
  assert.equal(cart.items.length, 5)
  assert.equal(cart.items[0].quantity, 3)
  cart.removeLine(cart.items[1]._id!)
  assert.equal(cart.items.length, 4)
  assert.equal(
    cart.items.some((line) => line.deliveryDate === '2026-09-29'),
    false
  )
  assert.equal(
    cart.items.some((line) => 'priceAtOrder' in line),
    false
  )
})

test('local dates respect Vietnam midnight and reject invalid calendar dates', () => {
  assert.equal(toLocalDate('2026-09-28'), '2026-09-28')
  assert.equal(toLocalDate(new Date('2026-09-27T17:00:00Z')), '2026-09-28')
  assert.equal(toLocalDate(new Date('2026-09-27T16:59:59Z')), '2026-09-27')
  assert.throws(() => toLocalDate('2026-02-30'))
  assert.throws(() => toLocalDate('not-a-date'))
})

test('index plan enforces one cart, one daily log and one review per order without deleting orders by TTL', () => {
  const plan = getSchemaIndexPlan({})
  assert.equal(plan.length, 12)
  for (const [collection, key] of [
    ['carts', { userId: 1 }],
    ['daily_health_logs', { userId: 1, date: 1 }],
    ['reviews', { orderId: 1 }]
  ] as const) {
    const index = plan.find((item) => item.collection === collection)!.indexes.find((item) => item.unique)
    assert.deepEqual(index?.key, key)
  }
  assert.ok(
    plan
      .find((entry) => entry.collection === 'orders')!
      .indexes.every((index) => index.expireAfterSeconds === undefined)
  )
  assert.equal(
    plan.some((entry) => ['analytics', 'report_exports', 'inventory_reservations'].includes(entry.collection)),
    false
  )
})

test('Vietnamese search normalization handles accents, đ and combining characters', () => {
  assert.equal(normalizeSearchText('  ĐẬU   HŨ sốt CÀ  '), 'dau hu sot ca')
  assert.equal(normalizeSearchText('Ức gà'.normalize('NFD')), 'uc ga')
})
