import { checkSchema, ParamSchema } from 'express-validator'
import { validate } from '~/utils/validation'

const version: ParamSchema = {
  in: ['body'],
  custom: { options: (value) => Number.isSafeInteger(value) && value >= 0, errorMessage: 'Cần version nguyên không âm' }
}
const reason: ParamSchema = {
  in: ['body'],
  isString: { bail: true },
  trim: true,
  isLength: { options: { min: 1, max: 500 } }
}
export const failureResolutionValidator = validate(
  checkSchema({
    version,
    reason,
    action: { in: ['body'], isString: { bail: true }, isIn: { options: [['Retry', 'Cancel']] } }
  })
)
export const codReconciliationValidator = validate(
  checkSchema({
    version,
    reason,
    action: { in: ['body'], isString: { bail: true }, isIn: { options: [['Collect', 'Refund']] } },
    amount: {
      in: ['body'],
      custom: {
        options: (value) => Number.isSafeInteger(value) && value > 0,
        errorMessage: 'Số tiền phải là số nguyên VND dương'
      }
    },
    reference: { in: ['body'], isString: { bail: true }, trim: true, isLength: { options: { min: 1, max: 120 } } }
  })
)
