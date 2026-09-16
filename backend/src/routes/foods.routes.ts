import { Router } from 'express'
import { createFoodController, deleteFoodController, getFoodDetailController, getFoodsController, updateFoodController } from '~/controllers/foods.controllers'
import { createFoodValidator, getFoodDetailValidator, updateFoodValidator } from '~/middlewares/foods.middlewares'
import { accessTokenValidator, isAdminValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const foodsRouter = Router()

/**
 * Description. Get foods list with optional filtering, sorting and pagination
 * Path: /
 * Method: GET
//  * Query: { page?: number, limit?: number, search?: string, tags?: string, minPrice?: number, maxPrice?: number, minCalories?: number, maxCalories?: number, isCombo?: 'true' | 'false', sortBy?: string, order?: 'asc' | 'desc' }
 */
foodsRouter.get('/', wrapRequestHandler(getFoodsController))

/**
 * Description. Get detail of one food by id
 * Path: /:food_id
 * Method: GET
 * Params: { food_id: string }
 */
foodsRouter.get('/:food_id', getFoodDetailValidator, wrapRequestHandler(getFoodDetailController))

/**
 * Description. Create a new food item (CHỈ ADMIN MỚI ĐƯỢC TẠO)
 * Path: /
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 */
foodsRouter.post(
  '/', 
  accessTokenValidator, 
  isAdminValidator, // Đặt trạm kiểm soát Admin ở đây
  createFoodValidator, 
  wrapRequestHandler(createFoodController)
)

/**
 * Description. Update a food item (Admin only)
 * Path: /:food_id
 * Method: PATCH
 * Header: { Authorization: Bearer <access_token> }
 */
foodsRouter.patch(
  '/:food_id',
  accessTokenValidator,
  isAdminValidator, // Chặn quyền Admin
  getFoodDetailValidator, // Check id hợp lệ
  updateFoodValidator, // Check body truyền lên
  wrapRequestHandler(updateFoodController)
)

/**
 * Description. Delete (Soft delete) a food item (Admin only)
 * Path: /:food_id
 * Method: DELETE
 * Header: { Authorization: Bearer <access_token> }
 */
foodsRouter.delete(
  '/:food_id',
  accessTokenValidator,
  isAdminValidator, // Chặn quyền Admin
  getFoodDetailValidator, // Check id hợp lệ
  wrapRequestHandler(deleteFoodController)
)

export default foodsRouter
