import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import HTTP_STATUS from '~/constants/httpStatus'
import foodService from '~/services/foods.services'
import { FoodType } from '~/models/schemas/Food.schema'
import { verifyToken } from '~/utils/jwt'
import { TokenPayload } from '~/models/requests/User.request'
import databaseService from '~/services/database.services'
import { ObjectId } from 'mongodb'
import { UserRole } from '~/models/schemas/User.schema'

type FoodParams = {
  food_id: string
}

type FoodListQuery = {
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

export const getFoodsController = async (req: Request, res: Response) => {
  let isAdmin = false

  // 1. Kiểm tra xem Request có đính kèm Token không (Vì API này public)
  const authorization = req.headers.authorization
  if (authorization) {
    const access_token = authorization.split(' ')[1]
    try {
      // Giải mã token (Dùng try-catch để lỡ token hết hạn/sai thì không bị crash, mà chỉ rớt xuống quyền Khách)
      const decoded_authorization = (await verifyToken({
        token: access_token,
        secretOrPublicKey: process.env.JWT_SECRET_ACCESS_TOKEN as string
      })) as TokenPayload

      // Kiểm tra Role trong DB xem có đúng là Admin không
      const user = await databaseService.users.findOne({
        _id: new ObjectId(decoded_authorization.user_id)
      })

      if (user && user.role === UserRole.ADMIN) {
        isAdmin = true
      }
    } catch {
      // Token không hợp lệ thì phớt lờ, coi như là Khách vãng lai
      isAdmin = false
    }
  }

  // 2. Truyền query param từ URL và cờ isAdmin xuống Service
  const result = await foodService.getFoods(req.query, isAdmin)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy danh sách món ăn thành công',
    result
  })
}

export const getFoodDetailController = async (req: Request<FoodParams>, res: Response) => {
  const result = await foodService.getFoodById(req.params.food_id)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy chi tiết món ăn thành công',
    result
  })
}

export const createFoodController = async (req: Request<ParamsDictionary, any, FoodType>, res: Response) => {
  const result = await foodService.createFood(req.body)

  return res.status(HTTP_STATUS.CREATED).json({
    message: 'Tạo món ăn thành công',
    result
  })
}

export const updateFoodController = async (req: Request<FoodParams, any, FoodType>, res: Response) => {
  const { food_id } = req.params as FoodParams
  // req.body đã được filter sạch sẽ qua updateFoodValidator
  const result = await foodService.updateFood(food_id, req.body)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Cập nhật món ăn thành công',
    result
  })
}

export const deleteFoodController = async (req: Request, res: Response) => {
  const { food_id } = req.params as FoodParams
  const result = await foodService.deleteFood(food_id)

  return res.status(HTTP_STATUS.OK).json(result)
}
