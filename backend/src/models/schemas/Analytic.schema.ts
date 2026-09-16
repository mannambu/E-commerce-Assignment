import { ObjectId } from 'mongodb'

export interface TopSellingFood {
  foodId: ObjectId
  soldQty: number
}

export interface AnalyticsType {
  _id?: ObjectId

  date: Date // ngày thống kê

  totalRevenue: number
  newUsers: number

  topSellingFoods: TopSellingFood[]

  createdAt?: Date
  updatedAt?: Date
}

export default class Analytics implements AnalyticsType {
  _id?: ObjectId

  date: Date

  totalRevenue: number
  newUsers: number

  topSellingFoods: TopSellingFood[]

  createdAt?: Date
  updatedAt?: Date

  constructor(analytics: AnalyticsType) {
    this._id = analytics._id
    this.date = analytics.date
    this.totalRevenue = analytics.totalRevenue
    this.newUsers = analytics.newUsers
    this.topSellingFoods = analytics.topSellingFoods
    const now = new Date()
    this.createdAt = analytics.createdAt || now
    this.updatedAt = analytics.updatedAt || now
  }
}
