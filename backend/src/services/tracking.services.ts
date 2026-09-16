import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { ErrorWithStatus } from '~/models/Errors'
import Order from '~/models/schemas/Order.schema'
import databaseService from '~/services/database.services'

type CalorieLogSourceType = 'Order' | 'Manual'

type CaloriesHistoryEntry = {
  date: Date
  caloriesConsumed: number
  entries: Array<{
    sourceType: CalorieLogSourceType | 'Legacy'
    sourceId?: string
    caloriesConsumed: number
    note?: string
  }>
}

type CreateCaloriesLogPayload = {
  date: string | Date
  caloriesConsumed: number
  sourceType: CalorieLogSourceType
  sourceId?: string
  note?: string
}

type LegacyCalorieTracking = {
  date: Date
  caloriesConsumed: number
}

class TrackingService {
  private normalizeDate(value: string | Date) {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      throw new ErrorWithStatus({
        message: 'Định dạng ngày không hợp lệ',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    date.setHours(0, 0, 0, 0)
    return date
  }

  private aggregateHistory(
    items: Array<
      | LegacyCalorieTracking
      | ({ sourceType: CalorieLogSourceType | 'Legacy'; sourceId?: string; note?: string } & LegacyCalorieTracking)
    >
  ) {
    const buckets = new Map<string, CaloriesHistoryEntry>()

    for (const item of items) {
      const normalizedDate = this.normalizeDate(item.date)
      const key = String(normalizedDate.getTime())
      const current = buckets.get(key) || {
        date: normalizedDate,
        caloriesConsumed: 0,
        entries: []
      }

      current.caloriesConsumed += Number(item.caloriesConsumed || 0)
      current.entries.push({
        sourceType: 'sourceType' in item ? item.sourceType : 'Legacy',
        sourceId: 'sourceId' in item && item.sourceId ? item.sourceId : undefined,
        caloriesConsumed: Number(item.caloriesConsumed || 0),
        note: 'note' in item ? item.note : undefined
      })

      buckets.set(key, current)
    }

    return [...buckets.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  private async getUserOrThrow(user_id: string) {
    const user = await databaseService.users.findOne(
      { _id: new ObjectId(user_id) },
      {
        projection: {
          healthProfile: 1,
          calorieTracking: 1,
          weightTracking: 1
        }
      }
    )

    if (!user) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return user
  }

  async recordCaloriesLog(user_id: string, payload: CreateCaloriesLogPayload) {
    await this.getUserOrThrow(user_id)
    const normalizedDate = this.normalizeDate(payload.date)
    const caloriesConsumed = Number(payload.caloriesConsumed)

    if (!Number.isFinite(caloriesConsumed) || caloriesConsumed < 0) {
      throw new ErrorWithStatus({
        message: 'Calories tiêu thụ phải là số không âm',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (payload.sourceType === 'Order' && payload.sourceId) {
      const existing = await databaseService.calorieLogs.findOne({
        userId: new ObjectId(user_id),
        sourceType: payload.sourceType,
        sourceId: new ObjectId(payload.sourceId),
        date: normalizedDate
      })

      if (existing) {
        return existing
      }
    }

    const log = {
      userId: new ObjectId(user_id),
      date: normalizedDate,
      caloriesConsumed,
      sourceType: payload.sourceType,
      sourceId: payload.sourceId ? new ObjectId(payload.sourceId) : undefined,
      note: payload.note || '',
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const result = await databaseService.calorieLogs.insertOne(log)

    return {
      _id: result.insertedId,
      ...log
    }
  }

  async recordOrderCalories(user_id: string, order: Pick<Order, '_id' | 'items' | 'deliverySchedule' | 'note'>) {
    const caloriesByDate = new Map<number, number>()

    for (const item of order.items) {
      const normalizedDate = this.normalizeDate(item.deliveryDate)
      const dateKey = normalizedDate.getTime()
      const calories = Number(item.quantity || 0) * Number(item.calories || 0)
      const current = caloriesByDate.get(dateKey) || 0
      caloriesByDate.set(dateKey, current + calories)
    }

    const createdLogs = []
    for (const [dateKey, calories] of caloriesByDate.entries()) {
      if (calories <= 0) continue

      const created = await this.recordCaloriesLog(user_id, {
        date: new Date(dateKey),
        caloriesConsumed: calories,
        sourceType: 'Order',
        sourceId: order._id ? String(order._id) : undefined,
        note: order.note || ''
      })

      createdLogs.push(created)
    }

    return createdLogs
  }

  async addManualCalories(user_id: string, payload: { date: string; caloriesConsumed: number; note?: string }) {
    return this.recordCaloriesLog(user_id, {
      date: payload.date,
      caloriesConsumed: payload.caloriesConsumed,
      sourceType: 'Manual',
      note: payload.note || ''
    })
  }

  async updateWeight(user_id: string, payload: { date: string; weightKg: number }) {
    const user = await this.getUserOrThrow(user_id)

    const inputDate = new Date(payload.date)
    inputDate.setHours(0, 0, 0, 0)
    const existingIndex =
      user.weightTracking?.findIndex((item) => {
        const d = new Date(item.date)
        d.setHours(0, 0, 0, 0)
        return d.getTime() === inputDate.getTime()
      }) ?? -1

    if (existingIndex >= 0) {
      await databaseService.users.updateOne(
        {
          _id: new ObjectId(user_id),
          'weightTracking.date': user.weightTracking[existingIndex].date
        },
        {
          $set: {
            'weightTracking.$.weightKg': payload.weightKg
          },
          $currentDate: {
            updated_at: true
          }
        }
      )
    } else {
      await databaseService.users.updateOne(
        { _id: new ObjectId(user_id) },
        {
          $push: {
            weightTracking: {
              date: inputDate,
              weightKg: payload.weightKg
            }
          },
          $currentDate: {
            updated_at: true
          }
        }
      )
    }

    return {
      date: inputDate,
      weightKg: payload.weightKg
    }
  }

  async getWeightHistory(user_id: string) {
    const user = await this.getUserOrThrow(user_id)

    const history = [...(user.weightTracking || [])].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    return history
  }

  async getDailyCalories(user_id: string) {
    const user = await this.getUserOrThrow(user_id)

    const logs = await databaseService.calorieLogs
      .find({ userId: new ObjectId(user_id) })
      .sort({ date: 1, createdAt: 1 })
      .toArray()

    const legacyHistory = (user.calorieTracking || []).map((item) => ({
      date: item.date,
      caloriesConsumed: item.caloriesConsumed,
      sourceType: 'Legacy' as const,
      note: 'Dữ liệu lịch sử cũ'
    }))

    const history = this.aggregateHistory([
      ...legacyHistory,
      ...logs.map((log) => ({
        date: log.date,
        caloriesConsumed: log.caloriesConsumed,
        sourceType: log.sourceType,
        sourceId: log.sourceId ? String(log.sourceId) : undefined,
        note: log.note
      }))
    ])

    return {
      targetCalories: user.healthProfile?.targetCalories || 0,
      history
    }
  }

  async getTodayCalories(user_id: string) {
    const { targetCalories, history } = await this.getDailyCalories(user_id)
    const today = this.normalizeDate(new Date())
    const todayEntry = history.find((item) => item.date.getTime() === today.getTime())

    return {
      targetCalories,
      date: today,
      caloriesConsumed: todayEntry?.caloriesConsumed || 0,
      entries: todayEntry?.entries || []
    }
  }
}

const trackingService = new TrackingService()
export default trackingService
