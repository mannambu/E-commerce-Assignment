import { checkSchema } from 'express-validator'
import { validate } from '~/utils/validation'

export const getFoodDetailValidator = validate(
  checkSchema({
    food_id: {
      in: ['params'],
      notEmpty: {
        errorMessage: 'Food ID là bắt buộc'
      },
      isMongoId: {
        errorMessage: 'Food ID không hợp lệ'
      }
    }
  })
)

export const createFoodValidator = validate(
  checkSchema({
    name: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Tên món ăn là bắt buộc'
      },
      isString: {
        errorMessage: 'Tên món ăn phải là chuỗi'
      },
      trim: true
    },

    description: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Mô tả món ăn là bắt buộc'
      },
      isString: {
        errorMessage: 'Mô tả phải là chuỗi'
      },
      trim: true
    },

    details: {
      in: ['body'],
      optional: true,
      isString: {
        errorMessage: 'details phải là chuỗi'
      },
      trim: true
    },

    images: {
      in: ['body'],
      isArray: {
        options: { min: 1 },
        errorMessage: 'images phải là mảng và phải có ít nhất 1 ảnh'
      }
    },

    'images.*': {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Mỗi image không được để trống'
      },
      isString: {
        errorMessage: 'Mỗi image phải là chuỗi'
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

    calories: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Calories là bắt buộc'
      },
      isFloat: {
        options: { min: 0 },
        errorMessage: 'Calories phải là số không âm'
      },
      toFloat: true
    },

    nutrition: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'nutrition là bắt buộc'
      },
      isObject: {
        errorMessage: 'nutrition phải là object'
      }
    },

    'nutrition.protein': {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Protein là bắt buộc'
      },
      isFloat: {
        options: { min: 0 },
        errorMessage: 'Protein phải là số không âm'
      },
      toFloat: true
    },

    'nutrition.carb': {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Carb là bắt buộc'
      },
      isFloat: {
        options: { min: 0 },
        errorMessage: 'Carb phải là số không âm'
      },
      toFloat: true
    },

    'nutrition.fat': {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Fat là bắt buộc'
      },
      isFloat: {
        options: { min: 0 },
        errorMessage: 'Fat phải là số không âm'
      },
      toFloat: true
    },

    ingredients: {
      in: ['body'],
      isArray: {
        options: { min: 1 },
        errorMessage: 'ingredients phải là mảng và phải có ít nhất 1 nguyên liệu'
      }
    },

    'ingredients.*.name': {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Tên nguyên liệu là bắt buộc'
      },
      isString: {
        errorMessage: 'Tên nguyên liệu phải là chuỗi'
      },
      trim: true
    },

    'ingredients.*.allergyTags': {
      in: ['body'],
      isArray: {
        errorMessage: 'allergyTags phải là mảng'
      }
    },

    'ingredients.*.allergyTags.*': {
      in: ['body'],
      optional: true,
      notEmpty: {
        errorMessage: 'Mỗi allergy tag không được để trống'
      },
      isString: {
        errorMessage: 'Mỗi allergy tag phải là chuỗi'
      },
      trim: true
    },

    tags: {
      in: ['body'],
      isArray: {
        errorMessage: 'tags phải là mảng'
      }
    },

    'tags.*': {
      in: ['body'],
      optional: true,
      notEmpty: {
        errorMessage: 'Mỗi tag không được để trống'
      },
      isString: {
        errorMessage: 'Mỗi tag phải là chuỗi'
      },
      trim: true
    },

    stock: {
      in: ['body'],
      notEmpty: {
        errorMessage: 'Số lượng tồn kho là bắt buộc'
      },
      isInt: {
        options: { min: 0 },
        errorMessage: 'Tồn kho phải là số nguyên không âm'
      },
      toInt: true
    },

    isActive: {
      in: ['body'],
      optional: true,
      isBoolean: {
        errorMessage: 'isActive phải là boolean'
      },
      toBoolean: true
    },

    isCombo: {
      in: ['body'],
      optional: true,
      isBoolean: {
        errorMessage: 'isCombo phải là boolean'
      },
      toBoolean: true
    }
  })
)

export const updateFoodValidator = validate(
  checkSchema({
    name: { in: ['body'], optional: true, isString: true, trim: true },
    description: { in: ['body'], optional: true, isString: true, trim: true },
    price: { 
      in: ['body'],
      optional: true,
      isFloat: { options: { gt: 0 }, errorMessage: 'Giá phải lớn hơn 0' }, 
      toFloat: true
    },
    calories: { 
      in: ['body'],
      optional: true,
      isFloat: { options: { min: 0 }, errorMessage: 'Calories không được âm' }, 
      toFloat: true 
    },
    images: { in: ['body'], optional: true, isArray: true },
    'images.*': { in: ['body'], optional: true, isString: true, trim: true },
    nutrition: { in: ['body'], optional: true, isObject: true },
    ingredients: { in: ['body'], optional: true, isArray: true },
    tags: { in: ['body'], optional: true, isArray: true },
    stock: { 
      in: ['body'],
      optional: true,
      isInt: { options: { min: 0 }, errorMessage: 'Tồn kho không được âm' }, 
      toInt: true 
    },
    isActive: { in: ['body'], optional: true, isBoolean: true, toBoolean: true },
    isCombo: { in: ['body'], optional: true, isBoolean: true, toBoolean: true }
  })
)