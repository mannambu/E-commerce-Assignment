import { ClientSession, ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { ErrorWithStatus } from '~/models/Errors'
import Order from '~/models/schemas/Order.schema'
import DailyHealthLog, { ConsumedMeal, HealthProfileChange } from '~/models/schemas/DailyHealthLog.schema'
import User, { HealthProfile } from '~/models/schemas/User.schema'
import { MealSlot, NutritionSnapshot, toLocalDate } from '~/models/schemas/common'
import { calculateHealthMetrics } from '~/utils/health'
import databaseService from '~/services/database.services'

type CaloriesPayload = {
  date: string | Date
  caloriesConsumed: number
  sourceType: ConsumedMeal['sourceType']
  sourceId?: string
  sourceItemId?: string
  consumptionKey?: string
  foodName?: string
  mealSlot?: MealSlot
  quantity?: number
  nutritionConsumed?: NutritionSnapshot
  note?: string
}

class TrackingService {
  private normalizeDate(value: string | Date) {
    try {
      return toLocalDate(value)
    } catch {
      throw new ErrorWithStatus({ message: 'Ngày không hợp lệ', status: HTTP_STATUS.BAD_REQUEST })
    }
  }

  private async getUserOrThrow(userId: string, session?: ClientSession) {
    const user = await databaseService.users.findOne(
      { _id: new ObjectId(userId) },
      { projection: { healthProfile: 1 }, session }
    )
    if (!user) throw new ErrorWithStatus({ message: USERS_MESSAGES.USER_NOT_FOUND, status: HTTP_STATUS.NOT_FOUND })
    return user
  }

  private async ensureDay(user: User, date: string, session?: ClientSession) {
    const now = new Date()
    const day: DailyHealthLog = {
      userId: user._id!,
      date,
      targetSnapshot: {
        calories: user.healthProfile?.targetCalories || 0,
        nutrition: user.healthProfile?.macroDistribution
      },
      meals: [],
      profileChanges: [],
      createdAt: now,
      updatedAt: now
    }
    try {
      await databaseService.dailyHealthLogs.updateOne(
        { userId: user._id!, date },
        { $setOnInsert: day },
        { upsert: true, session }
      )
    } catch (error) {
      // Hai request cùng tạo ngày mới: chỉ bỏ qua duplicate ngoài transaction.
      if (session || (error as { code?: number }).code !== 11000) throw error
    }
  }

  async recordCaloriesLog(userId: string, payload: CaloriesPayload) {
    const user = await this.getUserOrThrow(userId)
    const date = this.normalizeDate(payload.date)
    const calories = Number(payload.caloriesConsumed)
    if (!Number.isFinite(calories) || calories < 0) {
      throw new ErrorWithStatus({ message: 'Calories phải là số không âm', status: HTTP_STATUS.BAD_REQUEST })
    }
    await this.ensureDay(user, date)
    const mealId = new ObjectId()
    const meal: ConsumedMeal = {
      _id: mealId,
      consumptionKey: payload.consumptionKey || `manual:${mealId}`,
      sourceType: payload.sourceType,
      sourceId: payload.sourceId ? new ObjectId(payload.sourceId) : undefined,
      sourceItemId: payload.sourceItemId ? new ObjectId(payload.sourceItemId) : undefined,
      foodName: payload.foodName || payload.note || 'Món nhập tay',
      mealSlot: payload.mealSlot,
      quantity: payload.quantity ?? 1,
      caloriesConsumed: calories,
      nutritionConsumed: payload.nutritionConsumed,
      consumedAt: new Date(),
      note: payload.note || ''
    }
    // Kiểm tra mã và thêm món trong cùng một update, không dùng find rồi push.
    await databaseService.dailyHealthLogs.updateOne(
      { userId: user._id!, date, 'meals.consumptionKey': { $ne: meal.consumptionKey } },
      { $push: { meals: meal }, $currentDate: { updatedAt: true } }
    )
    const day = await databaseService.dailyHealthLogs.findOne({ userId: user._id!, date })
    return day!.meals.find((entry) => entry.consumptionKey === meal.consumptionKey)!
  }

  async recordOrderCalories(userId: string, order: Order) {
    const logs: ConsumedMeal[] = []
    for (const delivery of order.deliveries) {
      if (delivery.status !== 'Completed') continue
      for (const item of delivery.items) {
        const consumptionKey = item.mealPlanItemId
          ? `meal-plan:${item.mealPlanItemId}`
          : `order:${order._id}:item:${item._id}`
        logs.push(
          await this.recordCaloriesLog(userId, {
            date: delivery.date,
            sourceType: 'Order',
            sourceId: String(order._id),
            sourceItemId: String(item._id),
            consumptionKey,
            foodName: item.foodName,
            mealSlot: item.mealSlot,
            quantity: item.quantity,
            caloriesConsumed: item.calories * item.quantity,
            nutritionConsumed: {
              protein: item.nutrition.protein * item.quantity,
              carb: item.nutrition.carb * item.quantity,
              fat: item.nutrition.fat * item.quantity
            },
            note: order.note
          })
        )
      }
    }
    return logs
  }

  async addManualCalories(
    userId: string,
    payload: { date: string; caloriesConsumed: number; note?: string; foodName?: string }
  ) {
    return this.recordCaloriesLog(userId, { ...payload, sourceType: 'Manual' })
  }

  async saveHealthProfile(userId: string, profile: HealthProfile, reason: HealthProfileChange['reason']) {
    await databaseService.withTransaction(async (session) => {
      const user = await this.getUserOrThrow(userId, session)
      const date = this.normalizeDate(new Date())
      await this.ensureDay(user, date, session)
      const snapshot = { ...profile, version: (user.healthProfile?.version || 0) + 1, calculatedAt: new Date() }
      await databaseService.users.updateOne(
        { _id: user._id },
        { $set: { healthProfile: snapshot }, $currentDate: { updated_at: true } },
        { session }
      )
      await databaseService.dailyHealthLogs.updateOne(
        { userId: user._id!, date },
        {
          $set: { targetSnapshot: { calories: snapshot.targetCalories || 0, nutrition: snapshot.macroDistribution } },
          $push: { profileChanges: { changedAt: new Date(), reason, profileSnapshot: snapshot } },
          $currentDate: { updatedAt: true }
        },
        { session }
      )
    })
  }

  async updateWeight(userId: string, payload: { date: string; weightKg: number }) {
    const date = this.normalizeDate(payload.date)
    const weightKg = Number(payload.weightKg)
    if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300) {
      throw new ErrorWithStatus({ message: 'Cân nặng phải từ 25 đến 300 kg', status: HTTP_STATUS.BAD_REQUEST })
    }
    await databaseService.withTransaction(async (session) => {
      const user = await this.getUserOrThrow(userId, session)
      await this.ensureDay(user, date, session)
      await databaseService.dailyHealthLogs.updateOne(
        { userId: user._id!, date },
        { $set: { weightKg, weightRecordedAt: new Date() }, $currentDate: { updatedAt: true } },
        { session }
      )
      // Sửa số cân của ngày cũ không được thay cân hiện tại của hồ sơ.
      const newerWeight = await databaseService.dailyHealthLogs.findOne(
        { userId: user._id!, date: { $gt: date }, weightKg: { $exists: true } },
        { session }
      )
      if (!user.healthProfile || newerWeight) return
      const profile: HealthProfile = {
        ...user.healthProfile,
        weightKg,
        ...calculateHealthMetrics({ ...user.healthProfile, weightKg }),
        version: (user.healthProfile.version || 0) + 1,
        calculatedAt: new Date()
      }
      await databaseService.users.updateOne(
        { _id: user._id },
        { $set: { healthProfile: profile }, $currentDate: { updated_at: true } },
        { session }
      )
      const changedDate = this.normalizeDate(new Date())
      await this.ensureDay(user, changedDate, session)
      await databaseService.dailyHealthLogs.updateOne(
        { userId: user._id!, date: changedDate },
        {
          $set: { targetSnapshot: { calories: profile.targetCalories!, nutrition: profile.macroDistribution } },
          $push: { profileChanges: { changedAt: new Date(), reason: 'WeightUpdate', profileSnapshot: profile } },
          $currentDate: { updatedAt: true }
        },
        { session }
      )
    })
    return { date, weightKg }
  }

  async getWeightHistory(userId: string) {
    await this.getUserOrThrow(userId)
    const days = await databaseService.dailyHealthLogs
      .find({ userId: new ObjectId(userId), weightKg: { $exists: true } }, { projection: { date: 1, weightKg: 1 } })
      .sort({ date: 1 })
      .toArray()
    return days.map((day) => ({ date: day.date, weightKg: day.weightKg }))
  }

  async getDailyCalories(userId: string) {
    const user = await this.getUserOrThrow(userId)
    const days = await databaseService.dailyHealthLogs.find({ userId: user._id! }).sort({ date: 1 }).toArray()
    const history = days.map((day) => ({
      date: day.date,
      targetCalories: day.targetSnapshot.calories,
      caloriesConsumed: day.meals.reduce((sum, meal) => sum + meal.caloriesConsumed, 0),
      entries: day.meals
    }))
    return { targetCalories: user.healthProfile?.targetCalories || 0, history }
  }

  async getTodayCalories(userId: string) {
    const { targetCalories, history } = await this.getDailyCalories(userId)
    const date = this.normalizeDate(new Date())
    const today = history.find((day) => day.date === date)
    return {
      date,
      targetCalories: today?.targetCalories ?? targetCalories,
      caloriesConsumed: today?.caloriesConsumed || 0,
      entries: today?.entries || []
    }
  }
}

export default new TrackingService()
