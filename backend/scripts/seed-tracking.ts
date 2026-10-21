import { MongoClient, ObjectId } from 'mongodb'
import { getDatabaseConfig } from '../src/utils/database-config'
import DailyHealthLog, { ConsumedMeal } from '../src/models/schemas/DailyHealthLog.schema'
import { HealthProfile } from '../src/models/schemas/User.schema'
import { calculateHealthMetrics } from '../src/utils/health'
import { config } from 'dotenv'

config()

export async function seedTracking(): Promise<void> {
  const { uri, dbName } = getDatabaseConfig()
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db(dbName)
    const usersCollection = db.collection(process.env.DB_USERS_COLLECTION || 'users')
    const dailyLogsCollection = db.collection<DailyHealthLog>(process.env.DB_DAILY_HEALTH_LOGS_COLLECTION || 'daily_health_logs')

    const customer = await usersCollection.findOne({
      $or: [{ email: 'customer@fitbite.test' }, { role: 'Customer' }]
    })

    if (!customer) {
      console.warn('[Tracking] No customer found to seed health tracking. Skipping.')
      return
    }

    const customerId = customer._id as ObjectId

    const baseMetrics = calculateHealthMetrics({
      gender: 'Male',
      age: 25,
      heightCm: 175,
      weightKg: 72.0,
      activityLevel: 'Moderate',
      goal: 'MaintainWeight'
    })

    const healthProfile: HealthProfile = {
      gender: 'Male',
      age: 25,
      heightCm: 175,
      weightKg: 72.0,
      activityLevel: 'Moderate',
      goal: 'MaintainWeight',
      allergies: ['Peanuts'],
      targetWeightKg: 70.0,
      bmr: baseMetrics.bmr,
      tdee: baseMetrics.tdee,
      targetCalories: baseMetrics.targetCalories,
      macroDistribution: baseMetrics.macroDistribution,
      version: 1,
      calculatedAt: new Date()
    }

    await usersCollection.updateOne(
      { _id: customerId },
      { $set: { healthProfile, updated_at: new Date() } }
    )
    console.log(`[Tracking] Updated healthProfile for customer: ${customer.email}`)

    const sampleMealsCatalog = [
      { name: 'Yến mạch sữa hạt & chuối', slot: 'Breakfast', cal: 410, p: 18, c: 65, f: 9 },
      { name: 'Trứng ốp la bánh mì đen bơ tươi', slot: 'Breakfast', cal: 450, p: 22, c: 45, f: 18 },
      { name: 'Sinh tố bơ chuối protein', slot: 'Breakfast', cal: 380, p: 30, c: 40, f: 10 },
      { name: 'Ức gà nướng bông cải xanh & khoai lang', slot: 'Lunch', cal: 540, p: 48, c: 52, f: 12 },
      { name: 'Cá hồi áp chảo măng tây sốt chanh', slot: 'Lunch', cal: 620, p: 42, c: 35, f: 26 },
      { name: 'Thịt bò xào ớt chuông gạo lứt', slot: 'Lunch', cal: 580, p: 44, c: 55, f: 16 },
      { name: 'Salad cá ngừ trứng luộc', slot: 'Dinner', cal: 480, p: 38, c: 28, f: 20 },
      { name: 'Đậu hũ áp chảo sốt nấm rau củ', slot: 'Dinner', cal: 420, p: 25, c: 45, f: 14 },
      { name: 'Canh rong biển ức gà viên', slot: 'Dinner', cal: 390, p: 35, c: 30, f: 10 },
      { name: 'Sữa chua Hy Lạp hạt hạnh nhân', slot: 'Snack', cal: 220, p: 15, c: 18, f: 10 },
      { name: 'Táo tươi bơ đậu phộng hạt chia', slot: 'Snack', cal: 250, p: 8, c: 32, f: 12 }
    ]

    const daysCount = 10
    const now = new Date()

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)

      const weightProgress = Number((73.8 - ((daysCount - 1 - i) / (daysCount - 1)) * 1.8).toFixed(1))

      const breakfast = sampleMealsCatalog[i % 3]
      const lunch = sampleMealsCatalog[3 + (i % 3)]
      const dinner = sampleMealsCatalog[6 + (i % 3)]
      const snack = i % 2 === 0 ? sampleMealsCatalog[9 + (i % 2)] : null

      const mealsList = [breakfast, lunch, dinner, snack].filter(Boolean) as typeof sampleMealsCatalog

      const consumedMeals: ConsumedMeal[] = mealsList.map((m, idx) => {
        const mealTime = new Date(d)
        mealTime.setHours(idx === 0 ? 7 : idx === 1 ? 12 : idx === 2 ? 19 : 15, 30, 0, 0)

        return {
          _id: new ObjectId(),
          consumptionKey: `order_${customerId}_${dateStr}_slot_${idx}`,
          sourceType: idx === 1 ? 'Order' : 'MealPlan',
          foodName: m.name,
          mealSlot: m.slot as any,
          quantity: 1,
          caloriesConsumed: m.cal,
          nutritionConsumed: { protein: m.p, carb: m.c, fat: m.f },
          consumedAt: mealTime,
          note: 'Thực đơn dinh dưỡng FitBite'
        }
      })

      const dailyLog: DailyHealthLog = {
        userId: customerId,
        date: dateStr,
        weightKg: weightProgress,
        weightRecordedAt: new Date(d.setHours(6, 45, 0, 0)),
        targetSnapshot: {
          calories: baseMetrics.targetCalories,
          nutrition: baseMetrics.macroDistribution
        },
        meals: consumedMeals,
        profileChanges: i === daysCount - 1 ? [
          {
            changedAt: new Date(d),
            reason: 'InitialSurvey',
            profileSnapshot: healthProfile
          }
        ] : [],
        createdAt: new Date(d),
        updatedAt: new Date(d)
      }

      await dailyLogsCollection.updateOne(
        { userId: customerId, date: dateStr },
        { $set: dailyLog },
        { upsert: true }
      )
    }

    console.log(`[Tracking] Seeded ${daysCount} days of DailyHealthLogs for ${customer.email}`)
  } finally {
    await client.close()
  }
}

if (process.argv[1]?.endsWith('seed-tracking.ts')) {
  seedTracking().catch((err) => {
    console.error('[Tracking] Error seeding tracking:', err)
    process.exitCode = 1
  })
}
