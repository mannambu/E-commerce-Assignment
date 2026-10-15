import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import HTTP_STATUS from '~/constants/httpStatus'
import foodService from '~/services/foods.services'
import { FoodType } from '~/models/schemas/Food.schema'
import { UserRole } from '~/models/schemas/User.schema'

type FoodParams = {
  food_id: string
}

export const getFoodsController = async (req: Request, res: Response) => {
  // Middleware đã xác thực cả JWT, tài khoản và phiên đăng nhập.
  const isAdmin = req.decoded_authorization?.role === UserRole.ADMIN
  const customerId =
    req.decoded_authorization?.role === UserRole.CUSTOMER ? req.decoded_authorization.user_id : undefined
  const result = await foodService.getFoods(req.query, isAdmin, customerId)

  res.set('Cache-Control', 'private, no-store')
  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy danh sách món ăn thành công',
    result
  })
}

export const getFoodDetailController = async (req: Request<FoodParams>, res: Response) => {
  const customerId =
    req.decoded_authorization?.role === UserRole.CUSTOMER ? req.decoded_authorization.user_id : undefined
  const result = await foodService.getFoodById(req.params.food_id, customerId)

  res.set('Cache-Control', 'private, no-store')
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
