import { checkSchema } from 'express-validator'
import { validate } from '~/utils/validation'
import { USERS_MESSAGES } from '~/constants/messages'
import { ObjectId } from 'mongodb'

export const createReviewValidator = validate(
  checkSchema({
    foodId: { in: ['body'], optional: true, isMongoId: true },
    orderId: { in: ['body'], isMongoId: true },
    deliveryId: { in: ['body'], isMongoId: true },
    targetType: {
      in: ['body'],
      optional: true,
      isIn: {
        options: [['Food']],
        errorMessage: USERS_MESSAGES.TARGET_TYPE_INVALID
      }
    },
    targetId: {
      in: ['body'],
      custom: {
        options: (value, { req }) => {
          if (!ObjectId.isValid(req.body.foodId || value)) {
            throw new Error(USERS_MESSAGES.TARGET_ID_INVALID)
          }
          if (value && req.body.foodId && String(value).toLowerCase() !== String(req.body.foodId).toLowerCase()) {
            throw new Error('foodId and targetId must identify the same food')
          }
          return true
        }
      }
    },
    rating: {
      in: ['body'],
      notEmpty: {
        errorMessage: USERS_MESSAGES.RATING_INVALID
      },
      isInt: {
        options: { min: 1, max: 5 },
        errorMessage: USERS_MESSAGES.RATING_INVALID
      },
      toInt: true
    },
    comment: {
      in: ['body'],
      notEmpty: {
        errorMessage: USERS_MESSAGES.COMMENT_REQUIRED
      },
      isString: {
        errorMessage: USERS_MESSAGES.COMMENT_REQUIRED
      },
      trim: true
    },
    images: {
      in: ['body'],
      optional: true,
      isArray: {
        errorMessage: USERS_MESSAGES.VALIDATION_ERROR
      }
    },
    'images.*': {
      in: ['body'],
      optional: true,
      isString: {
        errorMessage: USERS_MESSAGES.VALIDATION_ERROR
      },
      trim: true
    }
  })
)

export const getReviewsValidator = validate(
  checkSchema({
    targetType: {
      in: ['params'],
      notEmpty: {
        errorMessage: USERS_MESSAGES.TARGET_TYPE_INVALID
      },
      isIn: {
        options: [['Food']],
        errorMessage: USERS_MESSAGES.TARGET_TYPE_INVALID
      }
    },
    rating: { in: ['query'], optional: true, isInt: { options: { min: 1, max: 5 } } },
    hasImages: { in: ['query'], optional: true, isIn: { options: [['true', 'false']] } },
    page: { in: ['query'], optional: true, isInt: { options: { min: 1, max: 1000000 } } },
    limit: { in: ['query'], optional: true, isInt: { options: { min: 1, max: 100 } } },
    targetId: {
      in: ['params'],
      notEmpty: {
        errorMessage: USERS_MESSAGES.TARGET_ID_INVALID
      },
      custom: {
        options: (value, { req }) => {
          for (const key of ['rating', 'hasImages', 'page', 'limit']) {
            if (req.query?.[key] !== undefined && typeof req.query[key] !== 'string')
              throw new Error('Review filters must be scalar query values')
          }
          if (!ObjectId.isValid(value)) {
            throw new Error(USERS_MESSAGES.TARGET_ID_INVALID)
          }
          return true
        }
      }
    }
  })
)

export const reviewIdParamValidator = validate(
  checkSchema({
    review_id: {
      in: ['params'],
      notEmpty: {
        errorMessage: 'Review ID là bắt buộc'
      },
      custom: {
        options: (value) => {
          if (!ObjectId.isValid(value)) {
            throw new Error('Review ID không hợp lệ')
          }
          return true
        }
      }
    }
  })
)

export const updateReviewValidator = validate(
  checkSchema({
    rating: {
      in: ['body'],
      optional: true,
      isInt: {
        options: { min: 1, max: 5 },
        errorMessage: USERS_MESSAGES.RATING_INVALID
      },
      toInt: true
    },
    comment: {
      in: ['body'],
      optional: true,
      isString: {
        errorMessage: USERS_MESSAGES.COMMENT_REQUIRED
      },
      trim: true
    },
    images: {
      in: ['body'],
      optional: true,
      isArray: {
        errorMessage: USERS_MESSAGES.VALIDATION_ERROR
      }
    },
    'images.*': {
      in: ['body'],
      optional: true,
      isString: {
        errorMessage: USERS_MESSAGES.VALIDATION_ERROR
      },
      trim: true
    }
  })
)

export const hideReviewValidator = validate(
  checkSchema({
    reason: { in: ['body'], isString: true, trim: true, isLength: { options: { min: 1, max: 500 } } }
  })
)
