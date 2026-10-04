import { Router } from 'express'
import { accessTokenValidator, isCustomerValidator } from '~/middlewares/users.middlewares'
import { addCaloriesValidator, updateWeightValidator } from '~/middlewares/tracking.middlewares'
import {
  addCaloriesController,
  getDailyCaloriesController,
  getTodayCaloriesController,
  getWeightHistoryController,
  updateWeightController
} from '~/controllers/tracking.controllers'
import { wrapRequestHandler } from '~/utils/handlers'

const trackingRouter = Router()
trackingRouter.use(accessTokenValidator, isCustomerValidator)

trackingRouter.put('/weight', updateWeightValidator, wrapRequestHandler(updateWeightController))
trackingRouter.get('/weight-history', wrapRequestHandler(getWeightHistoryController))
trackingRouter.post('/calories', addCaloriesValidator, wrapRequestHandler(addCaloriesController))
trackingRouter.get('/calories', wrapRequestHandler(getDailyCaloriesController))
trackingRouter.get('/calories/today', wrapRequestHandler(getTodayCaloriesController))

export default trackingRouter
