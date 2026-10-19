import { checkSchema } from 'express-validator'
import { validate } from '~/utils/validation'
import { validEvidenceUrls } from '~/utils/delivery'

export const shipperStatusValidator = validate(
  checkSchema({
    version: {
      in: ['body'],
      custom: {
        options: (value) => Number.isSafeInteger(value) && value >= 0,
        errorMessage: 'Cần version nguyên không âm'
      }
    },
    status: { in: ['body'], isString: { bail: true }, isIn: { options: [['Delivering', 'Completed', 'Failed']] } },
    codCollectedAmount: {
      in: ['body'],
      optional: true,
      custom: {
        options: (value) => Number.isSafeInteger(value) && value >= 0,
        errorMessage: 'Tiền thực thu phải là số nguyên VND không âm'
      }
    },
    reason: {
      in: ['body'],
      optional: true,
      isString: { bail: true },
      trim: true,
      isLength: { options: { min: 1, max: 500 } }
    },
    evidenceUrls: {
      in: ['body'],
      optional: true,
      custom: { options: validEvidenceUrls, errorMessage: 'Tối đa 10 URL ảnh HTTPS, mỗi URL tối đa 2048 ký tự' }
    }
  })
)
