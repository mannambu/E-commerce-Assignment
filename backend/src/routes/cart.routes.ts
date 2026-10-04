import { Router } from 'express'
import {
  addCartItemController,
  clearComboCartController,
  clearCartController,
  clearFoodCartController,
  getComboCartController,
  getCartController,
  getFoodCartController,
  refreshCartController,
  removeCartItemController,
  updateCartItemQuantityController
} from '~/controllers/cart.controllers'
import { accessTokenValidator, isCustomerValidator } from '~/middlewares/users.middlewares'
import {
  addCartItemValidator,
  removeCartItemValidator,
  updateCartItemQuantityValidator
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
cartRouter.get('/', wrapRequestHandler(getCartController))
cartRouter.get('/food', wrapRequestHandler(getFoodCartController))
cartRouter.get('/combo', wrapRequestHandler(getComboCartController))

/**
 * Description. Add a food item into current user's cart
 * Path: /items
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: { itemId: string, quantity: number }
 */
cartRouter.post('/items', addCartItemValidator, wrapRequestHandler(addCartItemController))

/**
 * Description. Update food item quantity in current user's cart
 * Path: /items/:itemId
 * Method: PATCH
 * Header: { Authorization: Bearer <access_token> }
 * Params: { itemId: string }
 * Body: { quantity: number }
 */
cartRouter.patch(
  '/items/:itemId',
  updateCartItemQuantityValidator,
  wrapRequestHandler(updateCartItemQuantityController)
)

/**
 * Description. Remove one food item from current user's cart
 * Path: /items/:itemId
 * Method: DELETE
 * Header: { Authorization: Bearer <access_token> }
 * Params: { itemId: string }
 */
cartRouter.delete('/items/:itemId', removeCartItemValidator, wrapRequestHandler(removeCartItemController))

/**
 * Description. Clear all food items in current user's cart
 * Path: /
 * Method: DELETE
 * Header: { Authorization: Bearer <access_token> }
 */
cartRouter.delete('/', wrapRequestHandler(clearCartController))
cartRouter.delete('/food', wrapRequestHandler(clearFoodCartController))
cartRouter.delete('/combo', wrapRequestHandler(clearComboCartController))

/**
 * Description. Refresh cart summary by latest food information
 * Path: /refresh
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 */
cartRouter.post('/refresh', wrapRequestHandler(refreshCartController))

export default cartRouter
