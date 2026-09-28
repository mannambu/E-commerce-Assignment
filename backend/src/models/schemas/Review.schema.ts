import { ObjectId } from 'mongodb'

export default interface Review {
  _id?: ObjectId
  reviewerId: ObjectId
  foodId: ObjectId
  orderId: ObjectId
  rating: number
  comment: string
  images: string[]
  verifiedPurchase: boolean
  isHidden: boolean
  hiddenBy?: ObjectId
  hiddenAt?: Date
  hiddenReason?: string
  createdAt: Date // Edits expire seven days after creation.
  updatedAt: Date
}
