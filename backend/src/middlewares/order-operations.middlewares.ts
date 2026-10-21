import { checkSchema, ParamSchema } from 'express-validator'
import { validate } from '~/utils/validation'

const version: ParamSchema = {
  in: ['body'],
  custom: {
    options: (value) => Number.isSafeInteger(value) && value >= 0,
    errorMessage: 'Cần version nguyên không âm của đơn đang xem'
  }
}
const reason: ParamSchema = {
  in: ['body'],
  isString: { bail: true },
  trim: true,
  isLength: { options: { min: 1, max: 500 }, errorMessage: 'Cần lý do phân công từ 1 đến 500 ký tự' }
}
export const kitchenAssignmentValidator = validate(
  checkSchema({
    version,
    reason,
    kitchenStaffIds: {
      in: ['body'],
      custom: {
        options: (value) =>
          Array.isArray(value) &&
          value.length > 0 &&
          value.every((id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) &&
          new Set(value.map((id) => id.toLowerCase())).size === value.length,
        errorMessage: 'Cần danh sách ID nhân viên bếp, không trùng lặp'
      }
    }
  })
)
export const shipperAssignmentValidator = validate(
  checkSchema({
    version,
    reason,
    assignedShipperId: { in: ['body'], isString: { bail: true }, isMongoId: true }
  })
)
export const kitchenStatusValidator = validate(
  checkSchema({
    version,
    status: { in: ['body'], isString: { bail: true }, isIn: { options: [['Cooking', 'Ready']] } }
  })
)
