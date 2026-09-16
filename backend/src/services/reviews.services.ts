import { ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { ErrorWithStatus } from '~/models/Errors'
import Review, { ReviewTargetType } from '~/models/schemas/Review.schema'
import databaseService from './database.services'
import { UserRole, AccountStatus } from '~/models/schemas/User.schema'

type CreateReviewPayload = {
  targetType: ReviewTargetType
  targetId: string
  rating: number
  comment: string
  images?: string[]
}

class ReviewService {
  async createReview(reviewerId: string, payload: CreateReviewPayload) {
    const { targetType, targetId, rating, comment, images } = payload

    if (!ObjectId.isValid(targetId)) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.TARGET_ID_INVALID,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const targetObjectId = new ObjectId(targetId)

    // 1) Check target exists
    if (targetType === 'Food') {
      const food = await databaseService.foods.findOne({ _id: targetObjectId, isActive: true })
      if (!food) {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.TARGET_NOT_FOUND,
          status: HTTP_STATUS.NOT_FOUND
        })
      }
    } else {
      const pt = await databaseService.users.findOne({
        _id: targetObjectId,
        role: 'PT' as UserRole,
        account_status: 'Active' as AccountStatus
      })
      if (!pt) {
        throw new ErrorWithStatus({
          message: USERS_MESSAGES.TARGET_NOT_FOUND,
          status: HTTP_STATUS.NOT_FOUND
        })
      }
    }

    // 2) Check verified purchase (Đã mua hàng/Đã đăng ký dịch vụ chưa?)
    let isVerified = false

    if (targetType === 'Food') {
      // Đối với Food: Tìm xem có đơn hàng Completed nào chứa món ăn này không
      const completedOrder = await databaseService.orders.findOne({
        userId: new ObjectId(reviewerId),
        status: 'Completed',
        items: {
          $elemMatch: {
            itemId: targetObjectId
          }
        }
      })
      if (completedOrder) isVerified = true
    } else if (targetType === 'PT') {
      // Đối với PT: Kiểm tra xem user này có đang học gói nào của PT này không
      const user = await databaseService.users.findOne({ _id: new ObjectId(reviewerId) })
      
      // Lấy danh sách ID các gói tập user đã mua (hỗ trợ cả dữ liệu cũ dạng chuỗi và dữ liệu mới dạng Object)
      const registeredServiceIds = (user?.registeredPTServices || []).map((reg: any) => {
        if (reg && typeof reg === 'object' && reg.serviceId) {
          return new ObjectId(reg.serviceId)
        }
        return new ObjectId(reg)
      })

      if (registeredServiceIds.length > 0) {
        // Kiểm tra xem trong các gói tập user đã mua, có gói nào thuộc về PT đang được đánh giá (targetObjectId) không
        const matchingService = await databaseService.ptServices.findOne({
          _id: { $in: registeredServiceIds },
          ptId: targetObjectId
        })
        
        if (matchingService) isVerified = true
      }
    }

    // Nếu chưa từng mua Food hoặc chưa từng đăng ký PT này -> Chặn không cho đánh giá
    if (!isVerified) {
      throw new ErrorWithStatus({
        message: 'Bạn chỉ có thể đánh giá khi đã mua hoặc sử dụng dịch vụ',
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    // 3) Optional: prevent duplicate review for same target
    const existingReview = await databaseService.reviews.findOne({
      reviewerId: new ObjectId(reviewerId),
      targetType,
      targetId: targetObjectId
    })

    if (existingReview) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.REVIEW_ALREADY_EXISTS,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const newReview = new Review({
      reviewerId: new ObjectId(reviewerId),
      targetType,
      targetId: targetObjectId,
      rating,
      comment: comment.trim(),
      images: images || [],
      verifiedPurchase: true
    })

    const result = await databaseService.reviews.insertOne(newReview)

    await this.updateAverageRating(payload.targetType, payload.targetId)

    return {
      _id: result.insertedId,
      ...newReview
    }
  }

  async getReviews(targetType: ReviewTargetType, targetId: string) {
    if (!ObjectId.isValid(targetId)) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.TARGET_ID_INVALID,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    return databaseService.reviews
      .find({
        targetType,
        targetId: new ObjectId(targetId)
      })
      .sort({ createdAt: -1 })
      .toArray()
  }

  async updateReview(userId: string, reviewId: string, payload: Partial<CreateReviewPayload>) {
    // 1. Tìm đánh giá
    const review = await databaseService.reviews.findOne({ _id: new ObjectId(reviewId) })
    
    if (!review) {
      throw new ErrorWithStatus({
        message: 'Không tìm thấy đánh giá này',
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // 2. Kiểm tra quyền sở hữu (Chỉ người viết mới được sửa)
    if (review.reviewerId.toString() !== userId) {
      throw new ErrorWithStatus({
        message: 'Bạn không có quyền sửa đánh giá của người khác',
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    // 3. Logic 7 ngày: Kiểm tra xem đã quá 7 ngày kể từ lúc tạo chưa
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - (review.createdAt?.getTime() || now.getTime()))
    const diffDays = diffTime / (1000 * 60 * 60 * 24)

    if (diffDays > 7) {
      throw new ErrorWithStatus({
        message: 'Đã quá 7 ngày kể từ lúc viết, bạn không thể chỉnh sửa đánh giá này nữa',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // 4. Cập nhật dữ liệu
    const updateData: any = {}
    if (payload.rating !== undefined) updateData.rating = payload.rating
    if (payload.comment !== undefined) updateData.comment = payload.comment
    if (payload.images !== undefined) updateData.images = payload.images

    await databaseService.reviews.updateOne(
      { _id: new ObjectId(reviewId) },
      { $set: updateData }
    )

    await this.updateAverageRating(review.targetType, review.targetId.toString())

    return {
      message: 'Cập nhật đánh giá thành công'
    }
  }

  async deleteReview(userId: string, reviewId: string) {
    // 1. Tìm đánh giá xem có tồn tại không
    const review = await databaseService.reviews.findOne({ _id: new ObjectId(reviewId) })
    
    if (!review) {
      throw new ErrorWithStatus({
        message: 'Không tìm thấy đánh giá này',
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // 2. Tìm thông tin User đang thực hiện request để check Role
    const user = await databaseService.users.findOne({ _id: new ObjectId(userId) })
    
    // 3. Kiểm tra quyền: CHỈ ADMIN MỚI ĐƯỢC XÓA
    if (!user || user.role !== UserRole.ADMIN) {
      throw new ErrorWithStatus({
        message: 'Chỉ có Quản trị viên (Admin) mới có quyền xóa đánh giá',
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    // 4. Thực hiện xóa
    await databaseService.reviews.deleteOne({ _id: new ObjectId(reviewId) })

    await this.updateAverageRating(review.targetType, review.targetId.toString())

    return {
      message: 'Xóa đánh giá thành công (Dành cho Admin)'
    }
  }

  async updateAverageRating(targetType: 'Food' | 'PT', targetId: string) {
    const targetObjectId = new ObjectId(targetId)

    // Dùng Aggregation để tính trung bình cộng tất cả số sao (rating)
    const result = await databaseService.reviews.aggregate([
      { $match: { targetType, targetId: targetObjectId } },
      { $group: { _id: null, averageRating: { $avg: '$rating' } } }
    ]).toArray()

    // Lấy kết quả, làm tròn 1 chữ số thập phân (VD: 4.6). Nếu chưa có ai đánh giá thì về 0.
    const newRating = result.length > 0 ? Number(result[0].averageRating.toFixed(1)) : 0

    // Cập nhật ngược lại vào Database của PT hoặc Food
    if (targetType === 'PT') {
      await databaseService.users.updateOne(
        { _id: targetObjectId },
        { $set: { 'ptProfile.rating': newRating } }
      )
    } else if (targetType === 'Food') {
      await databaseService.foods.updateOne(
        { _id: targetObjectId },
        { $set: { rating: newRating } }
      )
    }
  }
}

const reviewService = new ReviewService()
export default reviewService
