import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { AddCartItemReqBody, UpdateCartItemReqBody } from '~/models/requests/CartOrder.request'
import { CartTypeValue } from '~/models/schemas/Cart.schema'
import { TokenPayload } from '~/models/requests/User.request'
import cartService from '~/services/cart.services'

const parseCartType = (value?: string): CartTypeValue => (value === 'COMBO' ? 'COMBO' : 'FOOD')

export const getCartController = async (req: Request, res: Response) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await cartService.buildCartSummary(decoded.user_id)

  const requestedCartType = (req.query?.cartType as string | undefined) || ''
  if (requestedCartType === 'FOOD' || requestedCartType === 'COMBO') {
    return res.status(HTTP_STATUS.OK).json({
      message: USERS_MESSAGES.CART_RETRIEVED_SUCCESS,
      result: requestedCartType === 'FOOD' ? result.foodCart : result.comboCart
    })
  }

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.CART_RETRIEVED_SUCCESS,
    result
  })
}

export const getFoodCartController = async (req: Request, res: Response) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await cartService.buildCartSummaryByType(decoded.user_id, 'FOOD')

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.CART_RETRIEVED_SUCCESS,
    result
  })
}

export const getComboCartController = async (req: Request, res: Response) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await cartService.buildCartSummaryByType(decoded.user_id, 'COMBO')

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.CART_RETRIEVED_SUCCESS,
    result
  })
}

export const addCartItemController = async (
  req: Request<ParamsDictionary, Record<string, never>, AddCartItemReqBody>,
  res: Response
) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await cartService.addItem(decoded.user_id, req.body)

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.CART_ITEM_ADDED_SUCCESS,
    result
  })
}

export const updateCartItemQuantityController = async (
  req: Request<{ itemId: string }, Record<string, never>, UpdateCartItemReqBody>,
  res: Response
) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization

  const result = await cartService.updateItemQuantity(decoded.user_id, {
    itemId: req.params.itemId,
    quantity: req.body.quantity
  })

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.CART_ITEM_UPDATED_SUCCESS,
    result
  })
}

export const removeCartItemController = async (req: Request<{ itemId: string }>, res: Response) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization

  const result = await cartService.removeItem(decoded.user_id, req.params.itemId)

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.CART_ITEM_REMOVED_SUCCESS,
    result
  })
}

export const clearCartController = async (req: Request, res: Response) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const requestedCartType = (req.query?.cartType as string | undefined) || ''

  const result =
    requestedCartType === 'FOOD' || requestedCartType === 'COMBO'
      ? await cartService.clearCartByType(decoded.user_id, parseCartType(requestedCartType))
      : await cartService.clearCart(decoded.user_id)

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.CART_CLEARED_SUCCESS,
    result
  })
}

export const clearFoodCartController = async (req: Request, res: Response) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await cartService.clearCartByType(decoded.user_id, 'FOOD')

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.CART_CLEARED_SUCCESS,
    result
  })
}

export const clearComboCartController = async (req: Request, res: Response) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await cartService.clearCartByType(decoded.user_id, 'COMBO')

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.CART_CLEARED_SUCCESS,
    result
  })
}

export const refreshCartController = async (req: Request, res: Response) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await cartService.refreshCart(decoded.user_id)

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.CART_REFRESHED_SUCCESS,
    result
  })
}
