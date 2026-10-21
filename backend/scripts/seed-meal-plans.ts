import { MongoClient, ObjectId } from 'mongodb'
import { getDatabaseConfig } from '../src/utils/database-config'
import MealPlan, { MealPlanDay, PlannedMeal } from '../src/models/schemas/MealPlan.schema'
import Food from '../src/models/schemas/Food.schema'
import { config } from 'dotenv'

config()

export async function seedMealPlans(): Promise<void> {
  const { uri, dbName } = getDatabaseConfig()
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db(dbName)
    const usersCollection = db.collection(process.env.DB_USERS_COLLECTION || 'users')
    const foodsCollection = db.collection<Food>(process.env.DB_FOODS_COLLECTION || 'foods')
    const mealPlansCollection = db.collection<MealPlan>(process.env.DB_MEAL_PLANS_COLLECTION || 'meal_plans')

    const customer = await usersCollection.findOne({
      $or: [{ email: 'customer@fitbite.test' }, { role: 'Customer' }]
    })

    if (!customer) {
      console.warn('[MealPlan] No customer found. Skipping.')
      return
    }

    const customerId = customer._id as ObjectId
    const allFoods = await foodsCollection.find({ isActive: true }).limit(10).toArray()

    if (allFoods.length < 3) {
      console.warn('[MealPlan] Not enough foods found. Skipping.')
      return
    }

    const now = new Date()
    const startDate = now.toISOString().slice(0, 10)

    const makePlannedMeal = (f: Food, slot: 'Breakfast' | 'Lunch' | 'Dinner'): PlannedMeal => ({
      _id: new ObjectId(),
      foodId: f._id as ObjectId,
      foodName: f.name,
      slot,
      quantity: 1,
      calories: f.calories,
      nutrition: f.nutrition,
      price: f.price
    })

    const days: MealPlanDay[] = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(now)
      d.setDate(d.getDate() + i)
      const dStr = d.toISOString().slice(0, 10)

      const breakfastFood = allFoods[i % allFoods.length]
      const lunchFood = allFoods[(i + 1) % allFoods.length]
      const dinnerFood = allFoods[(i + 2) % allFoods.length]

      return {
        date: dStr,
        meals: [
          makePlannedMeal(breakfastFood, 'Breakfast'),
          makePlannedMeal(lunchFood, 'Lunch'),
          makePlannedMeal(dinnerFood, 'Dinner')
        ],
        approximate: false,
        warnings: []
      }
    })

    const mealPlan: MealPlan = {
      userId: customerId,
      startDate,
      durationDays: 7,
      healthProfileSnapshot: customer.healthProfile || {
        gender: 'Male',
        age: 25,
        heightCm: 175,
        weightKg: 72.0,
        activityLevel: 'Moderate',
        goal: 'MaintainWeight',
        allergies: []
      },
      days,
      status: 'Ordered',
      version: 1,
      createdAt: now,
      updatedAt: now
    }

    await mealPlansCollection.updateOne(
      { userId: customerId, startDate },
      { $set: mealPlan },
      { upsert: true }
    )

    console.log(`[MealPlan] Seeded 7-day Meal Plan for customer ${customer.email}`)
  } finally {
    await client.close()
  }
}

if (process.argv[1]?.endsWith('seed-meal-plans.ts')) {
  seedMealPlans().catch((err) => {
    console.error('[MealPlan] Error seeding meal plans:', err)
    process.exitCode = 1
  })
}
