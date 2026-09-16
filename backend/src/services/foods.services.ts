import { Filter, ObjectId } from 'mongodb'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Errors'
import Food, { FoodType } from '~/models/schemas/Food.schema'
import databaseService from './database.services'

type GetFoodsQuery = {
  page?: string
  limit?: string
  search?: string
  tags?: string
  minPrice?: string
  maxPrice?: string
  minCalories?: string
  maxCalories?: string
  isCombo?: string
  sortBy?: string
  order?: 'asc' | 'desc'
}

class FoodService {
  async getFoods(query: GetFoodsQuery, isAdmin: boolean = false) {
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.max(1, Number(query.limit) || 10)
    const skip = (page - 1) * limit

    // Khởi tạo object match rỗng
    const match: Filter<Food> = {}

    // THÊM ĐOẠN NÀY ĐỂ BẢO MẬT HIỂN THỊ:
    // Nếu KHÔNG PHẢI Admin -> Bắt buộc chỉ lấy những món đang bán
    if (!isAdmin) {
      match.isActive = true
    }

    // Search theo tên món, không phân biệt hoa thường
    if (query.search?.trim()) {
      match.name = {
        $regex: query.search.trim(),
        $options: 'i'
      }
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

    if (query.isCombo === 'true') {
      match.isCombo = true
    } else if (query.isCombo === 'false') {
      match.isCombo = false
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
    const sortBy = allowedSortFields.includes(query.sortBy as (typeof allowedSortFields)[number])
      ? (query.sortBy as (typeof allowedSortFields)[number])
      : 'createdAt'

    const sortOrder = query.order === 'desc' ? -1 : 1

    const sort: Record<string, 1 | -1> = {
      [sortBy]: sortOrder
    }

    const [foods, total] = await Promise.all([
      databaseService.foods.find(match).sort(sort).skip(skip).limit(limit).toArray(),
      databaseService.foods.countDocuments(match)
    ])

    return {
      foods,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      },
      filters: {
        search: query.search || '',
        tags: query.tags || '',
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

    return food
  }

  async createFood(payload: FoodType) {
    const food = new Food({
      name: payload.name.trim(),
      description: payload.description.trim(),
      details: payload.details?.trim() || '',
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
      isCombo: payload.isCombo ?? false
    })

    const result = await databaseService.foods.insertOne(food)

    return {
      _id: result.insertedId,
      ...food
    }
  }

  async updateFood(food_id: string, payload: any) {
    if (!ObjectId.isValid(food_id)) {
      throw new ErrorWithStatus({
        message: 'ID món ăn không hợp lệ',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const updatedFood = await databaseService.foods.findOneAndUpdate(
      { _id: new ObjectId(food_id) },
      { 
        $set: payload,
        $currentDate: { updatedAt: true }
      },
      { returnDocument: 'after' } // Trả về data mới sau khi update
    )

    if (!updatedFood) {
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
