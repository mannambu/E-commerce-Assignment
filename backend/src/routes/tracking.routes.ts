import { Router } from 'express'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
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

trackingRouter.put('/weight', accessTokenValidator, updateWeightValidator, wrapRequestHandler(updateWeightController))
trackingRouter.get('/weight-history', accessTokenValidator, wrapRequestHandler(getWeightHistoryController))
trackingRouter.post('/calories', accessTokenValidator, addCaloriesValidator, wrapRequestHandler(addCaloriesController))
trackingRouter.get('/calories', accessTokenValidator, wrapRequestHandler(getDailyCaloriesController))
trackingRouter.get('/calories/today', accessTokenValidator, wrapRequestHandler(getTodayCaloriesController))

export default trackingRouter
