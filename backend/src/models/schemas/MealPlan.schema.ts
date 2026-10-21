import { ObjectId } from 'mongodb'
import { HealthProfile } from './User.schema'
import { LocalDate, MealSlot, NutritionSnapshot } from './common'

export interface PlannedMeal {
  _id: ObjectId
  foodId: ObjectId
  foodName: string
  slot: MealSlot
  quantity: number
  calories: number // Per serving.
  nutrition: NutritionSnapshot // Per serving.
  price: number // Estimate, rechecked at checkout.
}

export interface MealPlanDay {
  date: LocalDate
  meals: PlannedMeal[]
  // Tổng calo/macro tính từ meals khi trả API, tránh lưu hai nơi sau khi đổi món.
  approximate: boolean
  warnings: string[]
}

export default interface MealPlan {
  _id?: ObjectId
  userId: ObjectId
  startDate: LocalDate
  durationDays: 1 | 7
  healthProfileSnapshot: HealthProfile
  days: MealPlanDay[]
  status?: 'Draft' | 'Ordered' | 'Archived'
  orderId?: ObjectId
  version?: number
  createdAt?: Date
  updatedAt?: Date
}
