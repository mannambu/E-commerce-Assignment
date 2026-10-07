import { Router } from 'express'
import {
  addCartItemController,
  addCartItemsController,
  changeCartModeController,
  clearComboCartController,
  clearCartController,
  clearFoodCartController,
  getComboCartController,
  getCartController,
  getFoodCartController,
  refreshCartController,
  removeCartItemController,
  updateCartItemController
} from '~/controllers/cart.controllers'
import { accessTokenValidator, isCustomerValidator } from '~/middlewares/users.middlewares'
import {
  addCartItemValidator,
  addCartItemsValidator,
  cartQueryValidator,
  clearCartValidator,
  changeCartModeValidator,
  removeCartItemValidator,
  updateCartItemValidator
} from '~/middlewares/cart.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const cartRouter = Router()
cartRouter.use(accessTokenValidator, isCustomerValidator)

/**
 * Description. Get current user's cart summary
 * Path: /
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 */
cartRouter.get('/', cartQueryValidator, wrapRequestHandler(getCartController))
cartRouter.get('/food', wrapRequestHandler(getFoodCartController))
cartRouter.get('/combo', wrapRequestHandler(getComboCartController))

// Đổi chế độ chỉ khi giỏ rỗng; không tự xóa món của khách.
cartRouter.patch('/mode', changeCartModeValidator, wrapRequestHandler(changeCartModeController))
cartRouter.post('/items/bulk', addCartItemsValidator, wrapRequestHandler(addCartItemsController))

/**
 * Description. Add a food item into current user's cart
 * Path: /items
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: { itemId, quantity, cartType?, deliveryDate?, mealSlot?, version? }
 */
cartRouter.post('/items', addCartItemValidator, wrapRequestHandler(addCartItemController))

/**
 * Description. Update quantity/date/meal of one cart line
 * Path: /items/:lineId
 * Method: PATCH
 * Header: { Authorization: Bearer <access_token> }
 * Params: { lineId: string } (_id của dòng giỏ)
 * Body: { quantity?: number, deliveryDate?: string | null, mealSlot?: string | null, version?: number }
 */
cartRouter.patch('/items/:lineId', updateCartItemValidator, wrapRequestHandler(updateCartItemController))

/**
 * Description. Remove one food item from current user's cart
 * Path: /items/:lineId
 * Method: DELETE
 * Header: { Authorization: Bearer <access_token> }
 * Params: { lineId: string }
 */
cartRouter.delete('/items/:lineId', removeCartItemValidator, wrapRequestHandler(removeCartItemController))

/**
 * Description. Clear all food items in current user's cart
 * Path: /
 * Method: DELETE
 * Header: { Authorization: Bearer <access_token> }
 */
cartRouter.delete('/', clearCartValidator, wrapRequestHandler(clearCartController))
cartRouter.delete('/food', clearCartValidator, wrapRequestHandler(clearFoodCartController))
cartRouter.delete('/combo', clearCartValidator, wrapRequestHandler(clearComboCartController))

/**
 * Description. Refresh cart summary by latest food information
 * Path: /refresh
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 */
cartRouter.post('/refresh', wrapRequestHandler(refreshCartController))

export default cartRouter
