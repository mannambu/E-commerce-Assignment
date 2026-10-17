import { RequestHandler } from 'express'
import { checkSchema, matchedData, ParamSchema, Schema } from 'express-validator'
import { EntityError } from '~/models/Errors'
import { FOOD_WRITABLE_FIELDS } from '~/models/requests/Food.request'
import { validate } from '~/utils/validation'

export const getFoodDetailValidator = validate(
  checkSchema({
    food_id: {
      in: ['params'],
      notEmpty: { errorMessage: 'Food ID là bắt buộc' },
      isMongoId: { errorMessage: 'Food ID không hợp lệ' }
    }
  })
)

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const nonemptyText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const textList = (value: unknown, min = 0): value is string[] =>
  Array.isArray(value) && value.length >= min && value.every(nonemptyText)
const trimList = (value: string[]) => value.map((item) => item.trim())
const nonnegativeNumber = (value: unknown) => {
  if (typeof value !== 'number' && typeof value !== 'string') return false
  if (typeof value === 'string' && !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return false
  return Number.isFinite(Number(value)) && Number(value) >= 0
}

function foodBodyValidator(partial: boolean): RequestHandler {
  const field = (
    check: (value: unknown) => boolean,
    message: string,
    sanitize?: ParamSchema['customSanitizer'],
    optional = partial
  ): ParamSchema => ({
    in: ['body'],
    optional,
    custom: { options: check, errorMessage: message, bail: true },
    ...(sanitize ? { customSanitizer: sanitize } : {})
  })
  const textField = (message: string) => field(nonemptyText, message, { options: (value: string) => value.trim() })
  const listField = (min: number, message: string) =>
    field((value) => textList(value, min), message, { options: trimList })
  const schema: Schema = {
    name: textField('Tên món phải là chuỗi không rỗng'),
    description: textField('Mô tả phải là chuỗi không rỗng'),
    images: listField(1, 'images phải có ít nhất một chuỗi ảnh không rỗng'),
    price: field((value) => nonnegativeNumber(value) && Number(value) > 0, 'Giá phải là số hữu hạn lớn hơn 0', {
      options: Number
    }),
    calories: field(nonnegativeNumber, 'Calories phải là số hữu hạn không âm', { options: Number }),
    nutrition: field(
      (value) => isObject(value) && ['protein', 'carb', 'fat'].every((key) => nonnegativeNumber(value[key])),
      'nutrition phải có đủ protein, carb, fat là số hữu hạn không âm',
      { options: (value) => ({ protein: Number(value.protein), carb: Number(value.carb), fat: Number(value.fat) }) }
    ),
    ingredients: field(
      (value) =>
        Array.isArray(value) &&
        value.length > 0 &&
        value.every(
          (ingredient) => isObject(ingredient) && nonemptyText(ingredient.name) && textList(ingredient.allergyTags)
        ),
      'ingredients phải có ít nhất một nguyên liệu gồm name không rỗng và allergyTags là mảng chuỗi không rỗng',
      {
        options: (value) =>
          value.map((ingredient: { name: string; allergyTags: string[] }) => ({
            name: ingredient.name.trim(),
            allergyTags: trimList(ingredient.allergyTags)
          }))
      }
    ),
    tags: listField(0, 'tags phải là mảng các chuỗi không rỗng'),
    goalTags: field(
      (value) =>
        textList(value) && value.every((goal) => ['LoseFat', 'GainMuscle', 'MaintainWeight'].includes(goal.trim())),
      'goalTags phải là mảng gồm LoseFat, GainMuscle hoặc MaintainWeight',
      { options: trimList },
      true
    ),
    stock: field(
      (value) =>
        (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()))) &&
        Number.isSafeInteger(Number(value)) &&
        Number(value) >= 0,
      'Tồn kho phải là số nguyên không âm trong phạm vi an toàn',
      { options: Number }
    ),
    isActive: field(
      (value) => typeof value === 'boolean' || value === 'true' || value === 'false',
      'isActive phải là boolean hoặc chuỗi true/false',
      { options: (value) => value === true || value === 'true' },
      true
    )
  }
  const runValidation = validate(checkSchema(schema, ['body']))
  return (req, res, next) => {
    if (!isObject(req.body) || (partial && !FOOD_WRITABLE_FIELDS.some((key) => req.body[key] !== undefined))) {
      return next(
        new EntityError({
          errors: {
            body: { msg: partial ? 'Cần ít nhất một trường món ăn hợp lệ để cập nhật' : 'Body phải là object món ăn' }
          }
        })
      )
    }
    return runValidation(req, res, (error) => {
      if (error) return next(error)
      // Strip server-owned fields and nested fields not part of the write contract.
      req.body = matchedData(req, { locations: ['body'] })
      next()
    })
  }
}

export const createFoodValidator = foodBodyValidator(false)
export const updateFoodValidator = foodBodyValidator(true)
