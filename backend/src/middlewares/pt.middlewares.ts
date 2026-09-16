import { checkSchema } from 'express-validator'
import { validate } from '~/utils/validation'

export const getPTServiceDetailValidator = validate(
  checkSchema({
    service_id: {
      in: ['params'],
      notEmpty: {
        errorMessage: 'Service ID là bắt buộc'
      },
      isMongoId: {
        errorMessage: 'PT service ID không hợp lệ'
      }
    }
  })
)

export const createPTServiceValidator = validate(
  checkSchema({
    ptId: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'PT ID là bắt buộc'
      },
      isMongoId: {
        errorMessage: 'PT ID không hợp lệ'
      }
    },
    title: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Tiêu đề gói PT là bắt buộc'
      },
      isString: {
        errorMessage: 'Tiêu đề phải là chuỗi'
      },
      trim: true
    },
    description: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Mô tả là bắt buộc'
      },
      isString: {
        errorMessage: 'Mô tả phải là chuỗi'
      },
      trim: true
    },
    price: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Giá là bắt buộc'
      },
      isFloat: {
        options: { gt: 0 },
        errorMessage: 'Giá phải lớn hơn 0'
      },
      toFloat: true
    },
    sessions: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Số buổi là bắt buộc'
      },
      isInt: {
        options: { gt: 0 },
        errorMessage: 'Số buổi phải là số nguyên lớn hơn 0'
      },
      toInt: true
    },
    durationDays: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Số ngày là bắt buộc'
      },
      isInt: {
        options: { gt: 0 },
        errorMessage: 'Số ngày phải là số nguyên lớn hơn 0'
      },
      toInt: true
    },
    isActive: {
      in: ['body'],
      optional: true,
      isBoolean: {
        errorMessage: 'isActive phải là boolean'
      }
    }
  })
)

export const updatePTServiceValidator = validate(
  checkSchema({
    title: { in: ['body'], optional: true, isString: { errorMessage: 'Tiêu đề phải là chuỗi' }, trim: true },
    description: { in: ['body'], optional: true, isString: { errorMessage: 'Mô tả phải là chuỗi' }, trim: true },
    price: { in: ['body'], optional: true, isFloat: { options: { gt: 0 }, errorMessage: 'Giá phải lớn hơn 0' }, toFloat: true },
    sessions: { in: ['body'], optional: true, isInt: { options: { gt: 0 }, errorMessage: 'Số buổi phải lớn hơn 0' }, toInt: true },
    durationDays: { in: ['body'], optional: true, isInt: { options: { gt: 0 }, errorMessage: 'Số ngày phải lớn hơn 0' }, toInt: true },
    isActive: { in: ['body'], optional: true, isBoolean: { errorMessage: 'isActive phải là boolean' }, toBoolean: true }
  })
)
