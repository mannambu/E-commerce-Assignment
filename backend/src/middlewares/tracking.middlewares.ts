import { checkSchema } from 'express-validator'
import { validate } from '~/utils/validation'

export const updateWeightValidator = validate(
  checkSchema({
    date: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Ngày là bắt buộc'
      },
      isISO8601: {
        errorMessage: 'Định dạng ngày không hợp lệ'
      }
    },
    weightKg: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Cân nặng là bắt buộc'
      },
      isFloat: {
        options: { min: 30, max: 300 },
        errorMessage: 'Cân nặng phải từ 30kg đến 300kg'
      },
      toFloat: true
    }
  })
)

export const addCaloriesValidator = validate(
  checkSchema({
    date: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Ngày là bắt buộc'
      },
      isISO8601: {
        errorMessage: 'Định dạng ngày không hợp lệ'
      }
    },
    caloriesConsumed: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Calories tiêu thụ là bắt buộc'
      },
      isFloat: {
        options: { min: 0 },
        errorMessage: 'Calories tiêu thụ phải là số không âm'
      },
      toFloat: true
    },
    note: {
      in: ['body'],
      optional: true,
      isString: {
        errorMessage: 'Ghi chú phải là chuỗi'
      },
      trim: true
    }
  })
)
