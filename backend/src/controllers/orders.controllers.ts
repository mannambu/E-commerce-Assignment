import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import {
  CreateOrderReqBody,
  QuoteOrderReqBody,
  RetryPaymentReqBody,
  UpdateOrderStatusReqBody,
  UpdatePaymentStatusReqBody
} from '~/models/requests/CartOrder.request'
import { TokenPayload } from '~/models/requests/User.request'
import ordersService from '~/services/orders.services'

export const quoteOrderController = async (
  req: Request<ParamsDictionary, Record<string, never>, QuoteOrderReqBody>,
  res: Response
) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await ordersService.quoteOrder(decoded.user_id, req.body)

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.ORDER_QUOTED_SUCCESS,
    result
  })
}

export const createOrderController = async (
  req: Request<ParamsDictionary, Record<string, never>, CreateOrderReqBody>,
  res: Response
) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await ordersService.createOrder(decoded.user_id, req.body)

  return res.status(HTTP_STATUS.CREATED).json({
    message: USERS_MESSAGES.ORDER_CREATED_SUCCESS,
    result
  })
}

export const getAllOrdersController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  
  const result = await ordersService.getAllOrders(decoded_authorization.user_id)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy danh sách tất cả đơn hàng thành công',
    result
  })
}

export const getMyOrdersController = async (req: Request, res: Response) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await ordersService.getMyOrders(decoded.user_id)

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.ORDER_LIST_RETRIEVED_SUCCESS,
    result
  })
}

export const getMyOrderDetailController = async (req: Request<{ orderId: string }>, res: Response) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await ordersService.getMyOrderDetail(decoded.user_id, req.params.orderId)

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.ORDER_DETAIL_RETRIEVED_SUCCESS,
    result
  })
}

export const cancelOrderController = async (req: Request<{ orderId: string }>, res: Response) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await ordersService.cancelOrder(decoded.user_id, req.params.orderId)

  return res.status(HTTP_STATUS.OK).json(result)
}

export const updateOrderStatusController = async (
  req: Request<{ orderId: string }, Record<string, never>, UpdateOrderStatusReqBody>,
  res: Response
) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await ordersService.updateOrderStatus(decoded.user_id, req.params.orderId, req.body)

  return res.status(HTTP_STATUS.OK).json(result)
}

export const retryPaymentController = async (
  req: Request<{ orderId: string }, Record<string, never>, RetryPaymentReqBody>,
  res: Response
) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await ordersService.retryPayment(decoded.user_id, req.params.orderId, req.body)

  return res.status(HTTP_STATUS.OK).json(result)
}

export const updatePaymentStatusController = async (
  req: Request<{ orderId: string }, Record<string, never>, UpdatePaymentStatusReqBody>,
  res: Response
) => {
  const decoded = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await ordersService.updatePaymentStatus(decoded.user_id, req.params.orderId, req.body)

  return res.status(HTTP_STATUS.OK).json(result)
}
