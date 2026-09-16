import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import HTTP_STATUS from '~/constants/httpStatus'
import { TokenPayload } from '~/models/requests/User.request'
import trackingService from '~/services/tracking.services'

type UpdateWeightBody = {
  date: string
  weightKg: number
}

type AddCaloriesBody = {
  date: string
  caloriesConsumed: number
  note?: string
}

export const updateWeightController = async (
  req: Request<ParamsDictionary, unknown, UpdateWeightBody>,
  res: Response
) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization

  const result = await trackingService.updateWeight(decoded_authorization.user_id, req.body)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Cập nhật cân nặng thành công',
    result
  })
}

export const getWeightHistoryController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization

  const result = await trackingService.getWeightHistory(decoded_authorization.user_id)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy lịch sử cân nặng thành công',
    result
  })
}

export const addCaloriesController = async (
  req: Request<ParamsDictionary, unknown, AddCaloriesBody>,
  res: Response
) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization

  const result = await trackingService.addManualCalories(decoded_authorization.user_id, req.body)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Ghi nhận calories thành công',
    result
  })
}

export const getDailyCaloriesController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization

  const result = await trackingService.getDailyCalories(decoded_authorization.user_id)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy lịch sử calo thành công',
    result
  })
}

export const getTodayCaloriesController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization

  const result = await trackingService.getTodayCalories(decoded_authorization.user_id)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy calo hôm nay thành công',
    result
  })
}
