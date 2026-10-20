import { Router } from 'express'
import {
  createReviewController,
  hideReviewController,
  getReviewsController,
  updateReviewController
} from '~/controllers/reviews.controllers'
import {
  createReviewValidator,
  getReviewsValidator,
  hideReviewValidator,
  reviewIdParamValidator,
  updateReviewValidator
} from '~/middlewares/reviews.middlewares'
import { accessTokenValidator, isCustomerValidator, isAdminValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const reviewsRouter = Router()

/**
 * Description. Create a new review for Food
 * Path: /
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: {
 *   targetType: 'Food',
 *   targetId: string,
 *   orderId: string,
 *   deliveryId: string,
 *   rating: number,
 *   comment: string,
 *   images?: string[]
 * }
 */
reviewsRouter.post(
  '/',
  accessTokenValidator,
  isCustomerValidator,
  createReviewValidator,
  wrapRequestHandler(createReviewController)
)

/**
 * Description. Get reviews by target type and target id
 * Path: /:targetType/:targetId
 * Method: GET
 * Params: {
 *   targetType: 'Food',
 *   targetId: string
 * }
 */
reviewsRouter.get('/:targetType/:targetId', getReviewsValidator, wrapRequestHandler(getReviewsController))

/**
 * Description. Update an existing review
 * Path: /:review_id
 * Method: PATCH
 * Header: { Authorization: Bearer <access_token> }
 * Body: { rating?: number, comment?: string, images?: string[] }
 */
reviewsRouter.patch(
  '/:review_id',
  accessTokenValidator,
  isCustomerValidator,
  reviewIdParamValidator,
  updateReviewValidator,
  wrapRequestHandler(updateReviewController)
)

/**
 * Description. Hide a review with a mandatory reason; never delete the record.
 * Path: /:review_id
 * Method: DELETE
 * Header: { Authorization: Bearer <access_token> }
 * Body: { reason: string }
 */
reviewsRouter.delete(
  '/:review_id',
  accessTokenValidator,
  isAdminValidator,
  reviewIdParamValidator,
  hideReviewValidator,
  wrapRequestHandler(hideReviewController)
)

reviewsRouter.patch(
  '/:review_id/hide',
  accessTokenValidator,
  isAdminValidator,
  reviewIdParamValidator,
  hideReviewValidator,
  wrapRequestHandler(hideReviewController)
)

export default reviewsRouter
