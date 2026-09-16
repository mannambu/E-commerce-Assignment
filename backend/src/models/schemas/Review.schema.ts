import { ObjectId } from 'mongodb'

export type ReviewTargetType = 'Food' | 'PT'

export interface ReviewType {
  _id?: ObjectId

  reviewerId: ObjectId

  targetType: ReviewTargetType
  targetId: ObjectId

  rating: number // 1-5
  comment: string
  images: string[]

  verifiedPurchase: boolean

  createdAt?: Date
}

export default class Review implements ReviewType {
  _id?: ObjectId

  reviewerId: ObjectId

  targetType: ReviewTargetType
  targetId: ObjectId

  rating: number
  comment: string
  images: string[]

  verifiedPurchase: boolean

  createdAt?: Date

  constructor(review: ReviewType) {
    this._id = review._id
    this.reviewerId = review.reviewerId
    this.targetType = review.targetType
    this.targetId = review.targetId
    this.rating = review.rating
    this.comment = review.comment
    this.images = review.images
    this.verifiedPurchase = review.verifiedPurchase
    const now = new Date()
    this.createdAt = review.createdAt || now
  }
}
