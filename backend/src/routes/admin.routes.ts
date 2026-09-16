import { Router } from 'express'
import { getDashboardStatsController, getFoodDiaryLogsController } from '~/controllers/admin.controllers'
import { accessTokenValidator, isAdminValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const adminRouter = Router()

/**
 * Description. Get system statistics for Admin Dashboard
 * Path: /admin/dashboard-stats
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 */
adminRouter.get(
  '/dashboard-stats',
  accessTokenValidator,
  isAdminValidator, // Chỉ Admin mới xem được thống kê
  wrapRequestHandler(getDashboardStatsController)
)

/**
 * Description. Get food diary logs by user/day from order + tracking
 * Path: /admin/food-diary
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 * Query: { days?: number }
 */
adminRouter.get(
  '/food-diary',
  accessTokenValidator,
  isAdminValidator,
  wrapRequestHandler(getFoodDiaryLogsController)
)

export default adminRouter
