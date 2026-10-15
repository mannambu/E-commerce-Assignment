import { Filter, ObjectId } from 'mongodb'
import { escapeRegExp } from 'lodash'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Errors'
import Food, { FoodType } from '~/models/schemas/Food.schema'
import { normalizeSearchText } from '~/models/schemas/common'
import { HealthGoal, UserRole } from '~/models/schemas/User.schema'
import databaseService from './database.services'

type GetFoodsQuery = {
  page?: string
  limit?: string
  search?: string
  tags?: string
  goalTags?: string
  excludeAllergens?: string
  excludeMyAllergens?: string
  minPrice?: string
  maxPrice?: string
  minCalories?: string
  maxCalories?: string
  sortBy?: string
  order?: 'asc' | 'desc'
}

// Legacy documents have no normalizedName. Match their Vietnamese names in MongoDB
// before counting/pagination, without loading the catalogue or rewriting old records.
const VIETNAMESE_LETTERS: Record<string, string> = {
  a: 'aàáảãạăằắẳẵặâầấẩẫậ',
  e: 'eèéẻẽẹêềếểễệ',
  i: 'iìíỉĩị',
  o: 'oòóỏõọôồốổỗộơờớởỡợ',
  u: 'uùúủũụưừứửữự',
  y: 'yỳýỷỹỵ',
  d: 'dđ'
}

function legacyNamePattern(normalizedSearch: string) {
  return Array.from(normalizedSearch)
    .map((character) => {
      if (character === ' ') return '\\s+'
      const letters = VIETNAMESE_LETTERS[character]
      // Accept both precomposed vowels and decomposed Unicode combining marks.
      return letters ? `[${letters}][\u0300-\u036f]*` : escapeRegExp(character)
    })
    .join('')
}

function withAvailability(food: Food) {
  const availableQuantity = Math.max(0, food.stock - (food.reservedStock ?? 0))
  return {
    ...food,
    availability: {
      isActive: food.isActive,
      availableQuantity,
      inStock: availableQuantity > 0,
      canAddToCart: food.isActive && availableQuantity > 0
    }
  }
}

class FoodService {
  async getFoods(query: GetFoodsQuery, isAdmin: boolean = false, customerId?: string) {
    const invalid = (message: string): never => {
      throw new ErrorWithStatus({ status: HTTP_STATUS.UNPROCESSABLE_ENTITY, message })
    }
    for (const key of [
      'page',
      'limit',
      'search',
      'tags',
      'goalTags',
      'excludeAllergens',
      'excludeMyAllergens',
      'minPrice',
      'maxPrice',
      'minCalories',
      'maxCalories',
      'sortBy',
      'order'
    ] as const) {
      if (query[key] !== undefined && typeof query[key] !== 'string') invalid(`${key} phải là một chuỗi duy nhất`)
    }
    const positiveInteger = (value: string | undefined, fallback: number, field: string) => {
      if (value === undefined) return fallback
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
        invalid(`${field} phải là số nguyên dương`)
      }
      return Number(value)
    }
    const page = positiveInteger(query.page, 1, 'page')
    const limit = positiveInteger(query.limit, 10, 'limit')
    if (limit > 100) invalid('limit không được vượt quá 100')
    const skip = (page - 1) * limit
    if (!Number.isSafeInteger(skip)) invalid('page vượt quá phạm vi hỗ trợ')
    for (const [min, max] of [
      ['minPrice', 'maxPrice'],
      ['minCalories', 'maxCalories']
    ] as const) {
      for (const key of [min, max]) {
        const value = query[key]
        if (
          value !== undefined &&
          value !== '' &&
          (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)))
        ) {
          invalid(`${key} phải là số hữu hạn không âm`)
        }
      }
      if (query[min] && query[max] && Number(query[min]) > Number(query[max]))
        invalid(`${min} không được lớn hơn ${max}`)
    }
    const csv = (value?: string) => [
      ...new Set(
        (value || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      )
    ]
    const goals = csv(query.goalTags)
    const allowedGoals: HealthGoal[] = ['LoseFat', 'GainMuscle', 'MaintainWeight']
    if (goals.some((goal) => !allowedGoals.includes(goal as HealthGoal))) invalid('goalTags không hợp lệ')
    if (query.excludeMyAllergens !== undefined && !['true', 'false'].includes(query.excludeMyAllergens)) {
      invalid('excludeMyAllergens phải là true hoặc false')
    }
    const excludeMyAllergens = query.excludeMyAllergens !== 'false'
    // Identity is supplied only by the controller after session validation, never from query parameters.
    const customer =
      excludeMyAllergens && customerId && !isAdmin
        ? await databaseService.users.findOne(
            { _id: new ObjectId(customerId), role: UserRole.CUSTOMER },
            { projection: { 'healthProfile.allergies': 1 } }
          )
        : null
    const personalRules = (customer?.healthProfile?.allergies || [])
      .flatMap((rule) => rule.split(/[,/]/))
      .map(normalizeSearchText)
      .filter(Boolean)
    const excludedRules = [
      ...new Set([...csv(query.excludeAllergens).map(normalizeSearchText), ...personalRules])
    ].filter(Boolean)

    // Khởi tạo object match rỗng
    const match: Filter<Food> = {}

    // Filter sellable stock before counting and pagination. Admin keeps the full catalogue.
    if (!isAdmin) {
      match.isActive = true
      match.$expr = { $gt: [{ $subtract: ['$stock', { $ifNull: ['$reservedStock', 0] }] }, 0] }
    }
    if (goals.length) match.goalTags = { $in: goals as HealthGoal[] }
    if (excludedRules.length) {
      // Keep legacy free-text ingredient matching, with literal Vietnamese-aware patterns.
      // Old profiles may store the vegan restriction in allergies.
      const vegan = excludedRules.some((rule) => ['vegan', 'an chay'].includes(rule))
      const allergens = excludedRules.filter((rule) => !['vegan', 'an chay'].includes(rule))
      if (vegan) match.$and = [{ tags: { $in: [/^vegan$/i] } }]
      if (allergens.length) {
        const patterns = allergens.map((rule) => new RegExp(legacyNamePattern(rule), 'i'))
        match.$nor = [
          { 'ingredients.allergyTags': { $in: patterns } },
          { 'ingredients.name': { $in: patterns } },
          { tags: { $in: patterns } }
        ]
      }
    }

    const search = normalizeSearchText(query.search || '')
    if (search) {
      match.$or = [
        { normalizedName: { $regex: escapeRegExp(search), $options: 'i' } },
        {
          $and: [
            { $or: [{ normalizedName: { $exists: false } }, { normalizedName: '' }] },
            { name: { $regex: legacyNamePattern(search), $options: 'i' } }
          ]
        }
      ]
    }

    // Filter theo tags: ?tags=Vegan,GlutenFree
    if (query.tags?.trim()) {
      const tagsArray = query.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

      if (tagsArray.length > 0) {
        match.tags = { $in: tagsArray }
      }
    }

    // Filter theo khoảng giá
    if (query.minPrice || query.maxPrice) {
      match.price = {}
      if (query.minPrice !== undefined && query.minPrice !== '') {
        match.price.$gte = Number(query.minPrice)
      }
      if (query.maxPrice !== undefined && query.maxPrice !== '') {
        match.price.$lte = Number(query.maxPrice)
      }
    }

    // Filter theo khoảng calories
    if (query.minCalories || query.maxCalories) {
      match.calories = {}
      if (query.minCalories !== undefined && query.minCalories !== '') {
        match.calories.$gte = Number(query.minCalories)
      }
      if (query.maxCalories !== undefined && query.maxCalories !== '') {
        match.calories.$lte = Number(query.maxCalories)
      }
    }

    // Chỉ cho phép sort theo các field an toàn
    const allowedSortFields = ['createdAt', 'price', 'calories', 'name'] as const
    if (query.sortBy !== undefined && !allowedSortFields.includes(query.sortBy as (typeof allowedSortFields)[number])) {
      invalid('sortBy không hợp lệ')
    }
    if (query.order !== undefined && !['asc', 'desc'].includes(query.order)) invalid('order không hợp lệ')
    const sortBy = allowedSortFields.includes(query.sortBy as (typeof allowedSortFields)[number])
      ? (query.sortBy as (typeof allowedSortFields)[number])
      : 'createdAt'

    const sortOrder = query.order === 'desc' ? -1 : 1

    const sort: Record<string, 1 | -1> = {
      [sortBy]: sortOrder,
      _id: sortOrder
    }

    const [foods, total] = await Promise.all([
      databaseService.foods.find(match).sort(sort).skip(skip).limit(limit).toArray(),
      databaseService.foods.countDocuments(match)
    ])

    return {
      foods: foods.map(withAvailability),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      },
      filters: {
        search: query.search || '',
        tags: query.tags || '',
        goalTags: goals.join(','),
        excludeAllergens: query.excludeAllergens || '',
        excludeMyAllergens,
        personalAllergyFilterApplied: personalRules.length > 0,
        minPrice: query.minPrice || '',
        maxPrice: query.maxPrice || '',
        minCalories: query.minCalories || '',
        maxCalories: query.maxCalories || '',
        sortBy,
        order: sortOrder === -1 ? 'desc' : 'asc'
      }
    }
  }

  async getFoodById(food_id: string) {
    if (!ObjectId.isValid(food_id)) {
      throw new ErrorWithStatus({
        message: 'Food ID không hợp lệ',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const food = await databaseService.foods.findOne({
      _id: new ObjectId(food_id),
      isActive: true
    })

    if (!food) {
      throw new ErrorWithStatus({
        message: 'Không tìm thấy món ăn',
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // An active but sold-out item remains readable by direct URL.
    return withAvailability(food)
  }

  async createFood(payload: FoodType) {
    const food = new Food({
      name: payload.name.trim(),
      description: payload.description.trim(),
      images: payload.images,
      price: payload.price,
      calories: payload.calories,
      nutrition: {
        protein: payload.nutrition.protein,
        carb: payload.nutrition.carb,
        fat: payload.nutrition.fat
      },
      ingredients: payload.ingredients.map((ingredient) => ({
        name: ingredient.name.trim(),
        allergyTags: ingredient.allergyTags.map((tag) => tag.trim())
      })),
      tags: payload.tags.map((tag) => tag.trim()),
      stock: payload.stock,
      isActive: payload.isActive ?? true,
      goalTags: payload.goalTags || []
    })

    const result = await databaseService.foods.insertOne(food)

    return {
      _id: result.insertedId,
      ...food
    }
  }

  async updateFood(food_id: string, payload: Partial<FoodType>) {
    if (!ObjectId.isValid(food_id)) {
      throw new ErrorWithStatus({
        message: 'ID món ăn không hợp lệ',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const update: Partial<Food> = {}
    if (payload.name !== undefined) {
      update.name = payload.name.trim()
      update.normalizedName = normalizeSearchText(update.name)
    }
    for (const key of [
      'description',
      'images',
      'price',
      'calories',
      'nutrition',
      'ingredients',
      'tags',
      'goalTags',
      'stock',
      'isActive'
    ] as const) {
      if (payload[key] !== undefined) Object.assign(update, { [key]: payload[key] })
    }
    const updatedFood = await databaseService.foods.findOneAndUpdate(
      {
        _id: new ObjectId(food_id),
        // Admin không được hạ tồn kho xuống dưới số phần đang giữ cho checkout.
        ...(update.stock !== undefined ? { $expr: { $lte: [{ $ifNull: ['$reservedStock', 0] }, update.stock] } } : {})
      },
      {
        $set: update,
        $currentDate: { updatedAt: true }
      },
      { returnDocument: 'after' } // Trả về data mới sau khi update
    )

    if (!updatedFood) {
      if (update.stock !== undefined && (await databaseService.foods.findOne({ _id: new ObjectId(food_id) }))) {
        throw new ErrorWithStatus({
          message: 'Tồn kho mới thấp hơn số phần đang được giữ cho đơn hàng',
          status: HTTP_STATUS.CONFLICT
        })
      }
      throw new ErrorWithStatus({
        message: 'Không tìm thấy món ăn',
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return updatedFood
  }

  async deleteFood(food_id: string) {
    if (!ObjectId.isValid(food_id)) {
      throw new ErrorWithStatus({
        message: 'ID món ăn không hợp lệ',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const deletedFood = await databaseService.foods.findOneAndUpdate(
      { _id: new ObjectId(food_id) },
      {
        $set: { isActive: false },
        $currentDate: { updatedAt: true }
      },
      { returnDocument: 'after' }
    )

    if (!deletedFood) {
      throw new ErrorWithStatus({
        message: 'Không tìm thấy món ăn',
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return {
      message: 'Xóa (ẩn) món ăn thành công'
    }
  }
}

const foodService = new FoodService()
export default foodService
