import { ClientSession, MongoServerError, ObjectId } from 'mongodb'
import { ErrorWithStatus } from '~/models/Errors'
import Review from '~/models/schemas/Review.schema'
import { AccountStatus, UserRole } from '~/models/schemas/User.schema'
import database from './database.services'
import { validEvidenceUrls } from '~/utils/delivery'
import { pendingNotificationEmail } from '~/utils/notification-email'

export type CreateReviewPayload = {
  foodId: string
  orderId: string
  deliveryId: string
  rating: number
  comment: string
  images?: string[]
}
type EditReviewPayload = { rating?: number; comment?: string; images?: string[] }
export const REVIEW_EDIT_MS = 7 * 24 * 60 * 60 * 1000
function fail(status: number, message: string): never {
  throw new ErrorWithStatus({ status, message })
}
function id(value: string) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) fail(400, 'ID không hợp lệ')
  return new ObjectId(value)
}
function content(payload: EditReviewPayload, create = false) {
  if (
    (create || payload.rating !== undefined) &&
    (!Number.isInteger(payload.rating) || payload.rating! < 1 || payload.rating! > 5)
  )
    fail(400, 'Số sao phải là số nguyên từ 1 đến 5')
  if (
    (create || payload.comment !== undefined) &&
    (typeof payload.comment !== 'string' || !payload.comment.trim() || payload.comment.trim().length > 5000)
  )
    fail(400, 'Nội dung đánh giá phải có từ 1 đến 5000 ký tự')
  if (payload.images !== undefined && !validEvidenceUrls(payload.images))
    fail(400, 'Ảnh phải là danh sách tối đa 10 URL HTTPS hợp lệ')
}

class ReviewService {
  private async actor(actorId: string, role: UserRole, session: ClientSession) {
    const filter = { _id: id(actorId), role, account_status: AccountStatus.ACTIVE }
    if (!(await database.users.updateOne(filter, { $inc: { assignmentVersion: 1 } }, { session })).matchedCount)
      fail(403, 'Tài khoản không có quyền hoặc không còn Active')
    return filter._id
  }
  private async lockFood(foodId: ObjectId, session: ClientSession) {
    if (!(await database.foods.updateOne({ _id: foodId }, { $inc: { reviewVersion: 1 } }, { session })).matchedCount)
      fail(404, 'Không tìm thấy món ăn')
  }
  private async updateAverageRating(foodId: ObjectId, session: ClientSession) {
    const [result] = await database.reviews
      .aggregate<{
        average: number
        count: number
      }>(
        [
          { $match: { foodId, isHidden: false } },
          { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
        ],
        { session }
      )
      .toArray()
    await database.foods.updateOne(
      { _id: foodId },
      {
        $set: {
          rating: result ? Number(result.average.toFixed(1)) : 0,
          reviewCount: result?.count || 0
        }
      },
      { session }
    )
  }
  async createReview(reviewerId: string, payload: CreateReviewPayload) {
    const foodId = id(payload.foodId),
      orderId = id(payload.orderId),
      deliveryId = id(payload.deliveryId)
    content(payload, true)
    try {
      return await database.withTransaction(async (session) => {
        const actorId = await this.actor(reviewerId, UserRole.CUSTOMER, session)
        const order = await database.orders.findOne(
          {
            _id: orderId,
            userId: actorId,
            deliveries: { $elemMatch: { _id: deliveryId, status: 'Completed', 'items.foodId': foodId } }
          },
          { session }
        )
        if (!order) fail(403, 'Chỉ được đánh giá món thuộc ngày Completed trong đơn của mình')
        await this.lockFood(foodId, session)
        if (
          await database.reviews.findOne(
            {
              orderId,
              foodId,
              $or: [{ deliveryId }, { deliveryId: { $exists: false } }, { deliveryId: { $type: 10 } }]
            },
            { session }
          )
        )
          fail(409, 'Món/ngày này đã có đánh giá hoặc review cũ cần xác định ngày giao')
        const now = new Date()
        const review: Review = {
          _id: new ObjectId(),
          reviewerId: actorId,
          orderId,
          deliveryId,
          foodId,
          rating: payload.rating,
          comment: payload.comment.trim(),
          images: payload.images || [],
          verifiedPurchase: true,
          isHidden: false,
          createdAt: now,
          updatedAt: now
        }
        await database.reviews.insertOne(review, { session })
        await this.updateAverageRating(foodId, session)
        return review
      })
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) fail(409, 'Đánh giá bị trùng với dữ liệu đã có')
      throw error
    }
  }
  async getReviews(
    foodId: string,
    options: { rating?: number; hasImages?: boolean; page?: number; limit?: number } = {}
  ) {
    const foodObjectId = id(foodId)
    const page = options.page ?? 1,
      limit = options.limit ?? 20
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 1000000 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (options.rating !== undefined &&
        (!Number.isInteger(options.rating) || options.rating < 1 || options.rating > 5)) ||
      (options.hasImages !== undefined && typeof options.hasImages !== 'boolean')
    )
      fail(400, 'Bộ lọc không hợp lệ')
    return database.reviews
      .find(
        {
          foodId: foodObjectId,
          isHidden: false,
          ...(options.rating !== undefined ? { rating: options.rating } : {}),
          ...(options.hasImages !== undefined ? { 'images.0': { $exists: options.hasImages } } : {})
        },
        { projection: { hiddenBy: 0, hiddenAt: 0, hiddenReason: 0 } }
      )
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()
  }
  async updateReview(userId: string, reviewId: string, payload: EditReviewPayload) {
    const reviewObjectId = id(reviewId)
    if (
      !Object.keys(payload).length ||
      Object.keys(payload).some((key) => !['rating', 'comment', 'images'].includes(key))
    )
      fail(400, 'Chỉ sửa rating, comment, images; không thay đơn/ngày/món hoặc người viết')
    content(payload)
    return database.withTransaction(async (session) => {
      const actorId = await this.actor(userId, UserRole.CUSTOMER, session)
      const review = await database.reviews.findOne({ _id: reviewObjectId }, { session })
      if (!review) fail(404, 'Không tìm thấy đánh giá')
      if (!review.reviewerId.equals(actorId)) fail(403, 'Chỉ tác giả được sửa đánh giá')
      const now = new Date()
      if (
        !(review.createdAt instanceof Date) ||
        !Number.isFinite(review.createdAt.getTime()) ||
        review.createdAt > now ||
        now.getTime() - review.createdAt.getTime() >= REVIEW_EDIT_MS
      )
        fail(409, 'Đánh giá đã hết hạn sửa 7 ngày hoặc thiếu thời điểm tạo hợp lệ')
      await this.lockFood(review.foodId, session)
      await database.reviews.updateOne(
        { _id: reviewObjectId },
        {
          $set: {
            ...(payload.rating !== undefined ? { rating: payload.rating } : {}),
            ...(payload.comment !== undefined ? { comment: payload.comment.trim() } : {}),
            ...(payload.images !== undefined ? { images: payload.images } : {}),
            updatedAt: now
          }
        },
        { session }
      )
      await this.updateAverageRating(review.foodId, session)
      return { message: 'Đã cập nhật đánh giá' }
    })
  }
  async hideReview(adminId: string, reviewId: string, reason: string) {
    const reviewObjectId = id(reviewId)
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500)
      fail(400, 'Cần lý do ẩn từ 1 đến 500 ký tự')
    return database.withTransaction(async (session) => {
      const actorId = await this.actor(adminId, UserRole.ADMIN, session)
      const review = await database.reviews.findOne({ _id: reviewObjectId }, { session })
      if (!review) fail(404, 'Không tìm thấy đánh giá')
      if (review.isHidden) return { message: 'Đánh giá đã được ẩn', changed: false }
      const now = new Date()
      await this.lockFood(review.foodId, session)
      await database.reviews.updateOne(
        { _id: reviewObjectId },
        {
          $set: {
            isHidden: true,
            hiddenBy: actorId,
            hiddenAt: now,
            hiddenReason: reason.trim(),
            updatedAt: now
          }
        },
        { session }
      )
      await this.updateAverageRating(review.foodId, session)
      await database.auditLogs.insertOne(
        {
          actorId,
          actorRole: UserRole.ADMIN,
          action: 'ReviewHidden',
          entityType: 'Review',
          entityId: reviewObjectId,
          before: { isHidden: false },
          after: { isHidden: true, foodId: review.foodId, orderId: review.orderId, deliveryId: review.deliveryId },
          reason: reason.trim(),
          createdAt: now
        },
        { session }
      )
      await database.notifications.insertOne(
        {
          userId: review.reviewerId,
          type: 'Review',
          priority: 'Normal',
          entityType: 'Review',
          entityId: reviewObjectId,
          eventKey: `review-hidden:${reviewObjectId}`,
          email: pendingNotificationEmail(now),
          title: 'Đánh giá đã được ẩn',
          message: reason.trim(),
          createdAt: now
        },
        { session }
      )
      return { message: 'Đã ẩn đánh giá và thông báo lý do cho tác giả', changed: true }
    })
  }
}
export default new ReviewService()
