import { Router } from 'express'
import { createReviewController, deleteReviewController, getReviewsController, updateReviewController } from '~/controllers/reviews.controllers'
import { createReviewValidator, getReviewsValidator, reviewIdParamValidator, updateReviewValidator } from '~/middlewares/reviews.middlewares'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const reviewsRouter = Router()

/**
 * Description. Create a new review for Food or PT
 * Path: /
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: {
 *   targetType: 'Food' | 'PT',
 *   targetId: string,
 *   rating: number,
 *   comment: string,
 *   images?: string[]
 * }
 */
reviewsRouter.post('/', accessTokenValidator, createReviewValidator, wrapRequestHandler(createReviewController))

/**
 * Description. Get reviews by target type and target id
 * Path: /:targetType/:targetId
 * Method: GET
 * Params: {
 *   targetType: 'Food' | 'PT',
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
  reviewIdParamValidator,
  updateReviewValidator,
  wrapRequestHandler(updateReviewController)
)

/**
 * Description. Delete a review
 * Path: /:review_id
 * Method: DELETE
 * Header: { Authorization: Bearer <access_token> }
 */
reviewsRouter.delete(
  '/:review_id',
  accessTokenValidator,
  reviewIdParamValidator,
  wrapRequestHandler(deleteReviewController)
)

export default reviewsRouter
