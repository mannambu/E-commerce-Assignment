import { checkSchema, ParamSchema } from 'express-validator'
import { validate } from '~/utils/validation'

const version: ParamSchema = {
  in: ['body'],
  custom: { options: (value) => !Array.isArray(value) },
  isInt: { options: { min: 0, max: Number.MAX_SAFE_INTEGER }, errorMessage: 'Cần gửi version của đơn đang xem' },
  toInt: true
}
export const deliveryParamsValidator = validate(
  checkSchema({
    orderId: { in: ['params'], isMongoId: true },
    deliveryId: { in: ['params'], isMongoId: true },
    itemId: { in: ['params'], optional: true, isMongoId: true }
  })
)
export const swapDeliveryValidator = validate(
  checkSchema({
    foodId: { in: ['body'], isString: true, isMongoId: true },
    version
  })
)
export const cancelDeliveryValidator = validate(
  checkSchema({
    reason: {
      in: ['body'],
      isString: true,
      trim: true,
      isLength: { options: { min: 3, max: 300 }, errorMessage: 'Lý do hủy từ 3 đến 300 ký tự' }
    },
    version
  })
)
export const deliveryStatusValidator = validate(
  checkSchema({
    status: { in: ['body'], isString: true, isIn: { options: [['Cooking', 'Delivering', 'Completed']] } },
    version
  })
)
export const commerceSettingsValidator = validate(
  checkSchema({
    kitchenCutoffTime: {
      in: ['body'],
      isString: true,
      matches: { options: /^([01]\d|2[0-3]):[0-5]\d$/, errorMessage: 'Giờ chốt bếp phải có dạng HH:mm' }
    },
    kitchenCutoffDaysBefore: {
      in: ['body'],
      custom: { options: (value) => !Array.isArray(value) },
      isInt: { options: { min: 0, max: 1 }, errorMessage: 'Chốt trong ngày giao (0) hoặc ngày trước đó (1)' },
      toInt: true
    }
  })
)
