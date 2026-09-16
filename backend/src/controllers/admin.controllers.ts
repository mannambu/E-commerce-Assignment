import { Request, Response } from 'express'
import adminService from '~/services/admin.services'
import HTTP_STATUS from '~/constants/httpStatus'

export const getDashboardStatsController = async (req: Request, res: Response) => {
  const result = await adminService.getDashboardStats()

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy thống kê Dashboard thành công',
    result
  })
}

export const getFoodDiaryLogsController = async (req: Request, res: Response) => {
  const days = typeof req.query.days === 'string' ? req.query.days : undefined
  const result = await adminService.getFoodDiaryLogs(days)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy nhật ký thực phẩm toàn hệ thống thành công',
    result
  })
}
