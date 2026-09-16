import { ObjectId } from 'mongodb'

export interface PTServiceType {
  _id?: ObjectId
  ptId: ObjectId // reference đến users._id
  title: string
  description: string
  price: number
  sessions: number // số buổi
  durationDays: number // thời gian gói (ví dụ 30 ngày)
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}
export default class PTService implements PTServiceType {
  _id?: ObjectId
  ptId: ObjectId
  title: string
  description: string
  price: number
  sessions: number
  durationDays: number
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date

  constructor(ptService: PTServiceType) {
    this._id = ptService._id
    this.ptId = ptService.ptId
    this.title = ptService.title
    this.description = ptService.description
    this.price = ptService.price
    this.sessions = ptService.sessions
    this.durationDays = ptService.durationDays
    this.isActive = ptService.isActive
    const now = new Date()
    this.createdAt = ptService.createdAt || now
    this.updatedAt = ptService.updatedAt || now
  }
}
