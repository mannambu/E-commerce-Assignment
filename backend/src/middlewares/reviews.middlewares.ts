import { checkSchema } from 'express-validator'
import { validate } from '~/utils/validation'
import { USERS_MESSAGES } from '~/constants/messages'
import { ObjectId } from 'mongodb'

export const createReviewValidator = validate(
  checkSchema({
    targetType: {
      in: ['body'],
      notEmpty: {
        errorMessage: USERS_MESSAGES.TARGET_TYPE_INVALID
      },
      isIn: {
        options: [['Food', 'PT']],
        errorMessage: USERS_MESSAGES.TARGET_TYPE_INVALID
      }
    },
    targetId: {
      in: ['body'],
      notEmpty: {
        errorMessage: USERS_MESSAGES.TARGET_ID_INVALID
      },
      custom: {
        options: (value) => {
          if (!ObjectId.isValid(value)) {
            throw new Error(USERS_MESSAGES.TARGET_ID_INVALID)
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
        options: [['Food', 'PT']],
        errorMessage: USERS_MESSAGES.TARGET_TYPE_INVALID
      }
    },
    targetId: {
      in: ['params'],
      notEmpty: {
        errorMessage: USERS_MESSAGES.TARGET_ID_INVALID
      },
      custom: {
        options: (value) => {
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
