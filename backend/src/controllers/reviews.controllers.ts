import { Request, Response } from 'express'
import reviewService from '~/services/reviews.services'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { TokenPayload } from '~/models/requests/User.request'

type ReviewParams = {
  targetType: string
  targetId: string
}

export const createReviewController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await reviewService.createReview(decoded_authorization.user_id, {
    ...req.body,
    foodId: req.body.foodId || req.body.targetId
  })

  return res.status(HTTP_STATUS.CREATED).json({
    message: USERS_MESSAGES.CREATE_REVIEW_SUCCESS,
    result
  })
}

export const getReviewsController = async (req: Request<ReviewParams>, res: Response) => {
  const { targetId } = req.params
  const result = await reviewService.getReviews(targetId, {
    ...(req.query.rating !== undefined ? { rating: Number(req.query.rating) } : {}),
    ...(req.query.hasImages !== undefined ? { hasImages: req.query.hasImages === 'true' } : {}),
    ...(req.query.page !== undefined ? { page: Number(req.query.page) } : {}),
    ...(req.query.limit !== undefined ? { limit: Number(req.query.limit) } : {})
  })

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.GET_REVIEWS_SUCCESS,
    result
  })
}

export const updateReviewController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const { review_id } = req.params as { review_id: string }

  const result = await reviewService.updateReview(decoded_authorization.user_id, review_id, req.body)

  return res.status(HTTP_STATUS.OK).json(result)
}

export const hideReviewController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const { review_id } = req.params as { review_id: string }

  const result = await reviewService.hideReview(decoded_authorization.user_id, review_id, req.body.reason)

  return res.status(HTTP_STATUS.OK).json(result)
}
