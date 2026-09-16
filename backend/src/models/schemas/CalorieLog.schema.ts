import { ObjectId } from 'mongodb'

export type CalorieLogSourceType = 'Order' | 'Manual'

export interface CalorieLogType {
  _id?: ObjectId
  userId: ObjectId
  date: Date
  caloriesConsumed: number
  sourceType: CalorieLogSourceType
  sourceId?: ObjectId
  note?: string
  createdAt?: Date
  updatedAt?: Date
}

export default class CalorieLog implements CalorieLogType {
  _id?: ObjectId
  userId: ObjectId
  date: Date
  caloriesConsumed: number
  sourceType: CalorieLogSourceType
  sourceId?: ObjectId
  note?: string
  createdAt?: Date
  updatedAt?: Date

  constructor(calorieLog: CalorieLogType) {
    this._id = calorieLog._id
    this.userId = calorieLog.userId
    this.date = calorieLog.date
    this.caloriesConsumed = calorieLog.caloriesConsumed
    this.sourceType = calorieLog.sourceType
    this.sourceId = calorieLog.sourceId
    this.note = calorieLog.note

    const now = new Date()
    this.createdAt = calorieLog.createdAt || now
    this.updatedAt = calorieLog.updatedAt || now
  }
}
