import { Router } from 'express'
import {
  cancelOrderController,
  createOrderController,
  getAllOrdersController,
  getMyOrderDetailController,
  getMyOrdersController,
  quoteOrderController,
  retryPaymentController,
  updateOrderStatusController,
  updatePaymentStatusController
} from '~/controllers/orders.controllers'
import {
  createOrderValidator,
  checkoutIdentityValidator,
  orderIdParamValidator,
  quoteOrderValidator,
  retryPaymentValidator,
  updateOrderStatusValidator,
  updatePaymentStatusValidator
} from '~/middlewares/orders.middlewares'
import {
  accessTokenValidator,
  isAdminValidator,
  isCustomerValidator,
  requireRoles
} from '~/middlewares/users.middlewares'
import { UserRole } from '~/models/schemas/User.schema'
import { wrapRequestHandler } from '~/utils/handlers'
import {
  getDeliveryAlternativesController,
  swapDeliveryItemController,
  previewDeliveryCancellationController,
  cancelDeliveryController,
  updateDeliveryStatusController
} from '~/controllers/weekly-orders.controllers'
import {
  deliveryParamsValidator,
  swapDeliveryValidator,
  cancelDeliveryValidator,
  deliveryStatusValidator
} from '~/middlewares/weekly-orders.middlewares'

const ordersRouter = Router()

ordersRouter.get(
  '/:orderId/deliveries/:deliveryId/items/:itemId/alternatives',
  accessTokenValidator,
  requireRoles(UserRole.CUSTOMER, UserRole.ADMIN),
  deliveryParamsValidator,
  wrapRequestHandler(getDeliveryAlternativesController)
)
ordersRouter.patch(
  '/:orderId/deliveries/:deliveryId/items/:itemId',
  accessTokenValidator,
  requireRoles(UserRole.CUSTOMER, UserRole.ADMIN),
  deliveryParamsValidator,
  swapDeliveryValidator,
  wrapRequestHandler(swapDeliveryItemController)
)
ordersRouter.get(
  '/:orderId/deliveries/:deliveryId/cancellation',
  accessTokenValidator,
  requireRoles(UserRole.CUSTOMER, UserRole.ADMIN),
  deliveryParamsValidator,
  wrapRequestHandler(previewDeliveryCancellationController)
)
ordersRouter.post(
  '/:orderId/deliveries/:deliveryId/cancel',
  accessTokenValidator,
  requireRoles(UserRole.CUSTOMER, UserRole.ADMIN),
  deliveryParamsValidator,
  cancelDeliveryValidator,
  wrapRequestHandler(cancelDeliveryController)
)
ordersRouter.patch(
  '/:orderId/deliveries/:deliveryId/status',
  accessTokenValidator,
  isAdminValidator,
  deliveryParamsValidator,
  deliveryStatusValidator,
  wrapRequestHandler(updateDeliveryStatusController)
)

/**
 * Description. Quote order pricing before placing order
 * Path: /quote
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: { deliveryAddress: string, deliveryDate: string, packageType?: 'ONE_DAY' | 'WEEKLY_7D', cartType?: 'FOOD' | 'COMBO', distanceKm?: number, note?: string, paymentMethod: 'COD' | 'VNPay' | 'MoMo' }
 * Note: Neu khong truyen distanceKm, backend se tu tinh khoang cach tu dia chi mac dinh.
 */
ordersRouter.post(
  '/quote',
  accessTokenValidator,
  isCustomerValidator,
  quoteOrderValidator,
  wrapRequestHandler(quoteOrderController)
)

/**
 * Description. Create a new order from current cart
 * Path: /
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: Quote payload + idempotencyKey + cartVersion.
 */
ordersRouter.post(
  '/',
  accessTokenValidator,
  isCustomerValidator,
  createOrderValidator,
  checkoutIdentityValidator,
  wrapRequestHandler(createOrderController)
)

/**
 * Description. Get ALL orders in the system (Admin/Manager read-only access)
 * Path: /all
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 */
ordersRouter.get(
  '/all',
  accessTokenValidator,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER),
  wrapRequestHandler(getAllOrdersController)
)

/**
 * Description. Get all orders of current user
 * Path: /
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 */
ordersRouter.get('/', accessTokenValidator, isCustomerValidator, wrapRequestHandler(getMyOrdersController))

/**
 * Description. Get detail of one order by id
 * Path: /:orderId
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 * Params: { orderId: string }
 */
ordersRouter.get(
  '/:orderId',
  accessTokenValidator,
  orderIdParamValidator,
  wrapRequestHandler(getMyOrderDetailController)
)

/**
 * Description. Cancel an order (Customer only when Pending, Admin allowed by policy)
 * Path: /:orderId/cancel
 * Method: PATCH
 * Header: { Authorization: Bearer <access_token> }
 * Params: { orderId: string }
 */
ordersRouter.patch(
  '/:orderId/cancel',
  accessTokenValidator,
  requireRoles(UserRole.CUSTOMER, UserRole.ADMIN),
  orderIdParamValidator,
  wrapRequestHandler(cancelOrderController)
)

/**
 * Description. Update order status in valid transition flow
 * Path: /:orderId/status
 * Method: PATCH
 * Header: { Authorization: Bearer <access_token> }
 * Params: { orderId: string }
 * Body: { status: 'Cooking' | 'Delivering' | 'Completed' }
 */
ordersRouter.patch(
  '/:orderId/status',
  accessTokenValidator,
  isAdminValidator,
  orderIdParamValidator,
  updateOrderStatusValidator,
  wrapRequestHandler(updateOrderStatusController)
)

/**
 * Description. Retry payment for an existing order
 * Path: /:orderId/payments/retry
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Params: { orderId: string }
 * Body: { paymentMethod?: 'COD' | 'VNPay' | 'MoMo' }
 */
ordersRouter.post(
  '/:orderId/payments/retry',
  accessTokenValidator,
  isCustomerValidator,
  orderIdParamValidator,
  retryPaymentValidator,
  wrapRequestHandler(retryPaymentController)
)

/**
 * Description. Update payment status for an order
 * Path: /:orderId/payment-status
 * Method: PATCH
 * Header: { Authorization: Bearer <access_token> }
 * Params: { orderId: string }
 * Body: { status: 'Pending' | 'Paid' | 'Failed', transactionId?: string }
 */
ordersRouter.patch(
  '/:orderId/payment-status',
  accessTokenValidator,
  isAdminValidator,
  orderIdParamValidator,
  updatePaymentStatusValidator,
  wrapRequestHandler(updatePaymentStatusController)
)

export default ordersRouter
