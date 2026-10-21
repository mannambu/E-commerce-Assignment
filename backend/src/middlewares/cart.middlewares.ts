import { checkSchema, ParamSchema } from 'express-validator'
import { USERS_MESSAGES } from '~/constants/messages'
import { MAX_CART_LINES } from '~/models/schemas/Cart.schema'
import { toLocalDate } from '~/models/schemas/common'
import { validate } from '~/utils/validation'

const versionField: ParamSchema = {
  in: ['body'],
  optional: true,
  custom: { options: (value) => !Array.isArray(value), errorMessage: 'Version phải là một số nguyên' },
  isInt: { options: { min: 0, max: Number.MAX_SAFE_INTEGER }, errorMessage: 'Version giỏ hàng không hợp lệ' },
  toInt: true
}
const cartTypeField: ParamSchema = {
  in: ['body'],
  optional: true,
  isString: true,
  isIn: { options: [['FOOD', 'COMBO']], errorMessage: USERS_MESSAGES.CART_TYPE_IS_INVALID }
}
const dateField: ParamSchema = {
  in: ['body'],
  optional: true,
  custom: {
    options: (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && toLocalDate(value) === value,
    errorMessage: 'Ngày giao phải hợp lệ theo YYYY-MM-DD'
  }
}
const mealSlotField: ParamSchema = {
  in: ['body'],
  optional: true,
  isString: true,
  isIn: { options: [['Breakfast', 'Lunch', 'Dinner', 'Snack']], errorMessage: 'Bữa ăn không hợp lệ' }
}
const foodIdField: ParamSchema = {
  in: ['body'],
  isString: true,
  isMongoId: { errorMessage: USERS_MESSAGES.CART_ITEM_ID_IS_INVALID }
}
const quantityField: ParamSchema = {
  in: ['body'],
  custom: { options: (value) => !Array.isArray(value), errorMessage: 'Số lượng phải là một số nguyên' },
  isInt: {
    options: { min: 1, max: Number.MAX_SAFE_INTEGER },
    errorMessage: USERS_MESSAGES.CART_QUANTITY_MUST_BE_POSITIVE
  },
  toInt: true
}
const lineIdField: ParamSchema = {
  in: ['params'],
  isMongoId: { errorMessage: 'Mã dòng giỏ hàng không hợp lệ' }
}

export const cartQueryValidator = validate(
  checkSchema({
    cartType: { ...cartTypeField, in: ['query'] }
  })
)

export const addCartItemValidator = validate(
  checkSchema({
    itemId: foodIdField,
    quantity: quantityField,
    cartType: cartTypeField,
    deliveryDate: dateField,
    mealSlot: mealSlotField,
    mealPlanId: { in: ['body'], optional: true, isString: true, isMongoId: true },
    mealPlanItemId: { in: ['body'], optional: true, isString: true, isMongoId: true },
    version: versionField
  })
)

export const addCartItemsValidator = validate(
  checkSchema({
    cartType: cartTypeField,
    version: versionField,
    items: {
      in: ['body'],
      isArray: {
        options: { min: 1, max: MAX_CART_LINES },
        errorMessage: `Mỗi lần thêm từ 1 đến ${MAX_CART_LINES} dòng`
      }
    },
    'items.*': { in: ['body'], isObject: { options: { strict: true } } },
    'items.*.itemId': foodIdField,
    'items.*.quantity': quantityField,
    'items.*.deliveryDate': dateField,
    'items.*.mealSlot': mealSlotField,
    'items.*.mealPlanId': { in: ['body'], optional: true, isString: true, isMongoId: true },
    'items.*.mealPlanItemId': { in: ['body'], optional: true, isString: true, isMongoId: true }
  })
)

export const updateCartItemValidator = validate(
  checkSchema({
    lineId: lineIdField,
    quantity: {
      in: ['body'],
      optional: true,
      custom: { options: (value) => !Array.isArray(value), errorMessage: 'Số lượng phải là một số nguyên' },
      isInt: {
        options: { min: 0, max: Number.MAX_SAFE_INTEGER },
        errorMessage: USERS_MESSAGES.CART_QUANTITY_MUST_BE_ZERO_OR_POSITIVE
      },
      toInt: true
    },
    deliveryDate: { ...dateField, optional: { options: { nullable: true } } },
    mealSlot: { ...mealSlotField, optional: { options: { nullable: true } } },
    version: versionField,
    '': {
      in: ['body'],
      custom: {
        options: (body) => body && ['quantity', 'deliveryDate', 'mealSlot'].some((key) => Object.hasOwn(body, key)),
        errorMessage: 'Cần gửi số lượng, ngày giao hoặc bữa ăn cần sửa'
      }
    }
  })
)

export const removeCartItemValidator = validate(
  checkSchema({
    lineId: lineIdField,
    version: versionField
  })
)

export const clearCartValidator = validate(
  checkSchema({
    cartType: { ...cartTypeField, in: ['query'] },
    version: versionField
  })
)

export const changeCartModeValidator = validate(
  checkSchema({
    cartType: { ...cartTypeField, optional: false },
    version: versionField
  })
)
