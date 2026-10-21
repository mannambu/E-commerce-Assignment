import './setup'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Collection, ObjectId, ClientSession } from 'mongodb'
import database from '../src/services/database.services'
import carts from '../src/services/cart.services'
import orders from '../src/services/orders.services'
import tracking from '../src/services/tracking.services'
import User from '../src/models/schemas/User.schema'
import Order from '../src/models/schemas/Order.schema'
import Food from '../src/models/schemas/Food.schema'
import DailyHealthLog from '../src/models/schemas/DailyHealthLog.schema'
import { toLocalDate } from '../src/models/schemas/common'
import settings, { DEFAULT_COMMERCE_RULES } from '../src/services/settings.services'
import { calculateHealthMetrics } from '../src/utils/health'

test('weekly quote uses actual day menus, charges shipping once and saves nested snapshots', async (t) => {
  t.mock.method(settings, 'getCommerceRules', async () => ({ ...DEFAULT_COMMERCE_RULES }))
  t.mock.getter(database, 'users', () => ({ findOne: async () => null }) as unknown as Collection<User>)
  const foodId = new ObjectId()
  const firstDay = new Date()
  firstDay.setUTCDate(firstDay.getUTCDate() + 2)
  const start = `${toLocalDate(firstDay)}T12:00:00+07:00`
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(date.getUTCDate() + index)
    return toLocalDate(date)
  })
  const items = dates.map((deliveryDate, index) => ({
    _id: new ObjectId(),
    itemId: foodId,
    deliveryDate,
    quantity: 1,
    itemName: `Day ${index + 1}`,
    image: null,
    unitPrice: 50000 + index * 1000,
    unitCalories: 400,
    nutrition: { protein: 30, carb: 40, fat: 10 },
    lineTotal: 50000 + index * 1000,
    lineCalories: 400,
    availability: { isActive: true, inStock: true, availableQuantity: 50 }
  }))
  t.mock.method(carts, 'buildCartSummaryByType', async () => ({
    cartId: new ObjectId(),
    userId: new ObjectId(),
    cartType: 'COMBO',
    version: 0,
    items,
    canCheckout: true,
    issues: [],
    summary: {
      subtotal: 371000,
      totalCalories: 2800,
      itemCount: 7,
      lineCount: 7,
      deliveryDates: dates,
      shippingFee: null,
      shippingPolicy: 'FIRST_DAY_ONLY'
    }
  }))
  let saved: Order | undefined
  let cleared = false
  t.mock.getter(
    database,
    'orders',
    () =>
      ({
        findOne: async () => null,
        insertOne: async (order: Order) => {
          saved = order
          return { insertedId: order._id }
        }
      }) as unknown as Collection<Order>
  )
  t.mock.method(database, 'withTransaction', async (operation) => operation({} as ClientSession))
  t.mock.getter(
    database,
    'foods',
    () => ({ updateOne: async () => ({ matchedCount: 1 }) }) as unknown as Collection<Food>
  )
  t.mock.method(carts, 'finishCheckout', async () => {
    cleared = true
    return {} as never
  })
  const input = {
    idempotencyKey: 'schema-checkout-test',
    cartVersion: 0,
    deliveryAddress: 'Test address',
    deliveryDate: start,
    distanceKm: 6,
    packageType: 'WEEKLY_7D' as const,
    paymentMethod: 'VNPay' as const
  }
  const result = await orders.createOrder(new ObjectId().toString(), input)
  assert.equal(result.subtotal, 371000)
  assert.equal(result.shippingFee, 20000)
  assert.equal(saved!.deliveries.length, 7)
  assert.deepEqual(
    saved!.deliveries.map((day) => day.items[0].foodName),
    items.map((item) => item.itemName)
  )
  assert.deepEqual(
    saved!.deliveries.map((day) => day.shipping.totalFee),
    [20000, 0, 0, 0, 0, 0, 0]
  )
  assert.ok(saved!.deliveries.every((day) => day.items[0].nutrition.protein === 30))
  assert.equal('items' in saved!, false)
  assert.equal('deliverySchedule' in saved!, false)
  assert.equal(saved!.inventoryHold.status, 'Held')
  assert.equal(saved!.paymentDueAt!.getTime() - saved!.createdAt.getTime(), 15 * 60000)
  assert.equal(cleared, true)

  items.pop()
  await assert.rejects(orders.quoteOrder(new ObjectId().toString(), input), { status: 400 })
  items[0].availability.inStock = false
  await assert.rejects(orders.quoteOrder(new ObjectId().toString(), input), { status: 400 })
})

test('daily tracking atomically deduplicates a consumed serving and preserves all profile changes', async (t) => {
  const user = new User({
    _id: new ObjectId(),
    email: 'test@example.com',
    password: 'hash',
    healthProfile: {
      gender: 'Male',
      age: 25,
      heightCm: 170,
      weightKg: 70,
      activityLevel: 'Moderate',
      goal: 'MaintainWeight',
      allergies: [],
      targetCalories: 2200
    }
  })
  const days = new Map<string, DailyHealthLog>()
  t.mock.getter(
    database,
    'users',
    () =>
      ({
        findOne: async () => user,
        updateOne: async (_filter: unknown, update: { $set: { healthProfile: User['healthProfile'] } }) => {
          user.healthProfile = update.$set.healthProfile
          return { matchedCount: 1 }
        }
      }) as unknown as Collection<User>
  )
  // Emulate only the field updates used here; no MongoDB connection is opened.
  t.mock.getter(
    database,
    'dailyHealthLogs',
    () =>
      ({
        updateOne: async (filter: any, update: any) => {
          if (update.$setOnInsert && !days.has(filter.date)) {
            days.set(filter.date, { ...update.$setOnInsert, meals: [], profileChanges: [] })
          }
          const day = days.get(filter.date)!
          const excluded = filter['meals.consumptionKey']?.$ne
          if (excluded && day.meals.some((meal) => meal.consumptionKey === excluded)) return { matchedCount: 0 }
          if (update.$set) Object.assign(day, update.$set)
          if (update.$push?.meals) day.meals.push(update.$push.meals)
          if (update.$push?.profileChanges) day.profileChanges.push(update.$push.profileChanges)
          return { matchedCount: 1 }
        },
        findOne: async (filter: any) => {
          if (typeof filter.date === 'string') return days.get(filter.date) || null
          return [...days.values()].find((day) => day.date > filter.date.$gt && day.weightKg !== undefined) || null
        },
        find: () => ({ sort: () => ({ toArray: async () => [...days.values()] }) })
      }) as unknown as Collection<DailyHealthLog>
  )
  t.mock.method(database, 'withTransaction', async (operation) => operation({} as ClientSession))

  const date = '2026-09-28'
  const meal = {
    date,
    caloriesConsumed: 400,
    sourceType: 'Order' as const,
    consumptionKey: 'serving-1',
    foodName: 'Lunch'
  }
  await Promise.all([
    tracking.recordCaloriesLog(String(user._id), meal),
    tracking.recordCaloriesLog(String(user._id), meal)
  ])
  assert.equal(days.get(date)!.meals.length, 1)
  assert.equal(days.get(date)!.targetSnapshot.calories, 2200)

  await tracking.saveHealthProfile(String(user._id), { ...user.healthProfile!, targetCalories: 2300 }, 'ProfileUpdate')
  await tracking.saveHealthProfile(String(user._id), { ...user.healthProfile!, targetCalories: 2400 }, 'ProfileUpdate')
  const changes = [...days.values()].flatMap((day) => day.profileChanges)
  assert.equal(changes.length, 2)
  assert.deepEqual(
    changes.map((change) => change.profileSnapshot.targetCalories),
    [2300, 2400]
  )

  await tracking.updateWeight(String(user._id), { date: '2026-09-28', weightKg: 72 })
  await tracking.updateWeight(String(user._id), { date: '2026-09-28', weightKg: 73 })
  await tracking.updateWeight(String(user._id), { date: '2026-09-27', weightKg: 65 })
  assert.equal(days.get('2026-09-28')!.weightKg, 73)
  assert.equal(user.healthProfile!.weightKg, 73)
  assert.equal(days.get('2026-09-27')!.weightKg, 65)
  const calories = await tracking.getDailyCalories(String(user._id))
  assert.equal(calories.history.find((entry) => entry.date === date)!.caloriesConsumed, 400)
})


test('US-08: calculateHealthMetrics follows Mifflin-St Jeor, BMR floor constraint and guards against missing fields', () => {
  // 1. Missing fields throw 'Chưa đủ dữ liệu để tính chỉ số'
  assert.throws(() => calculateHealthMetrics({} as any), /Chưa đủ dữ liệu để tính chỉ số/)
  assert.throws(() => calculateHealthMetrics({ gender: 'Male', age: 25 } as any), /Chưa đủ dữ liệu để tính chỉ số/)

  // 2. Male standard profile: 70kg, 170cm, 25 years old, Moderate (1.55), MaintainWeight
  // bmrRaw = 10 * 70 + 6.25 * 170 - 5 * 25 + 5 = 1642.5 -> Math.round = 1643
  // tdeeRaw = 1642.5 * 1.55 = 2545.875 -> Math.round = 2546
  const maleMaintain = calculateHealthMetrics({
    gender: 'Male',
    age: 25,
    heightCm: 170,
    weightKg: 70,
    activityLevel: 'Moderate',
    goal: 'MaintainWeight'
  })
  assert.equal(maleMaintain.bmr, 1643)
  assert.equal(maleMaintain.tdee, 2546)
  assert.equal(maleMaintain.targetCalories, 2546)
  assert.equal(maleMaintain.targetAdjustedToBmr, false)
  // Macro: 30% P, 40% C, 30% F
  assert.equal(maleMaintain.macroDistribution.protein, Math.round((2546 * 0.3) / 4))
  assert.equal(maleMaintain.macroDistribution.carb, Math.round((2546 * 0.4) / 4))
  assert.equal(maleMaintain.macroDistribution.fat, Math.round((2546 * 0.3) / 9))

  // 3. Female LoseFat (-15%)
  // bmrRaw = 10 * 50 + 6.25 * 160 - 5 * 30 - 161 = 500 + 1000 - 150 - 161 = 1189
  // Light (1.375) -> tdeeRaw = 1189 * 1.375 = 1634.875 -> 1635
  // LoseFat (0.85) -> targetCaloriesRaw = 1634.875 * 0.85 = 1389.64 -> 1390
  const femaleLoseFat = calculateHealthMetrics({
    gender: 'Female',
    age: 30,
    heightCm: 160,
    weightKg: 50,
    activityLevel: 'Light',
    goal: 'LoseFat'
  })
  assert.equal(femaleLoseFat.bmr, 1189)
  assert.equal(femaleLoseFat.tdee, 1635)
  assert.equal(femaleLoseFat.targetCalories, 1390)
  assert.equal(femaleLoseFat.targetAdjustedToBmr, false)
  // LoseFat Macro: 40% P, 30% C, 30% F
  assert.equal(femaleLoseFat.macroDistribution.protein, Math.round((1390 * 0.4) / 4))
  assert.equal(femaleLoseFat.macroDistribution.carb, Math.round((1390 * 0.3) / 4))
  assert.equal(femaleLoseFat.macroDistribution.fat, Math.round((1390 * 0.3) / 9))
})
