import { ObjectId } from 'mongodb'
import { HealthProfile } from './User.schema'
import { LocalDate, MealSlot, NutritionSnapshot } from './common'

export interface ConsumedMeal {
  _id: ObjectId
  consumptionKey: string // Cùng một suất ăn dùng cùng mã ở cả tick đã ăn và đơn Completed.
  sourceType: 'Order' | 'Manual' | 'MealPlan'
  sourceId?: ObjectId
  sourceItemId?: ObjectId
  foodName: string
  mealSlot?: MealSlot
  quantity: number
  caloriesConsumed: number
  nutritionConsumed?: NutritionSnapshot // Không biết macro thì để trống, không điền 0.
  consumedAt: Date
  note: string
}

export interface HealthProfileChange {
  changedAt: Date
  reason: 'InitialSurvey' | 'ProfileUpdate' | 'WeightUpdate'
  profileSnapshot: HealthProfile
}

/** Một document/người/ngày. Giữ mọi lần đổi hồ sơ, nhưng chỉ giữ cân nặng mới nhất của ngày. */
export default interface DailyHealthLog {
  _id?: ObjectId
  userId: ObjectId
  date: LocalDate
  weightKg?: number
  weightRecordedAt?: Date
  targetSnapshot: { calories: number; nutrition?: NutritionSnapshot }
  meals: ConsumedMeal[]
  profileChanges: HealthProfileChange[]
  createdAt: Date
  updatedAt: Date
}
