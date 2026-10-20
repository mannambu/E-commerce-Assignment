import { Router } from 'express'
import { checkSchema } from 'express-validator'
import { accessTokenValidator, requireRoles } from '~/middlewares/users.middlewares'
import { orderIdParamValidator } from '~/middlewares/orders.middlewares'
import { UserRole } from '~/models/schemas/User.schema'
import cancellations from '~/services/cancellation.services'
import { wrapRequestHandler } from '~/utils/handlers'
import { validate } from '~/utils/validation'

export const cancellationBodyValidator = validate(
  checkSchema({
    version: { in: ['body'], custom: { options: (value) => Number.isSafeInteger(value) && value >= 0 } },
    reason: { in: ['body'], isString: { bail: true }, trim: true, isLength: { options: { min: 1, max: 500 } } },
    deliveryId: { in: ['body'], optional: true, isString: { bail: true }, isMongoId: true }
  })
)
const router = Router()
router.get(
  '/:orderId/cancellation',
  accessTokenValidator,
  requireRoles(UserRole.CUSTOMER),
  orderIdParamValidator,
  wrapRequestHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store').json({
      result: await cancellations.preview(req.decoded_authorization!.user_id, String(req.params.orderId))
    })
  })
)
router.post(
  '/:orderId/cancellation-requests',
  accessTokenValidator,
  requireRoles(UserRole.CUSTOMER),
  orderIdParamValidator,
  cancellationBodyValidator,
  wrapRequestHandler(async (req, res) => {
    res.json({
      result: await cancellations.submit(
        req.decoded_authorization!.user_id,
        String(req.params.orderId),
        req.body,
        req.body.deliveryId
      )
    })
  })
)
router.get(
  '/:orderId/cancellation-requests',
  accessTokenValidator,
  requireRoles(UserRole.CUSTOMER, UserRole.MANAGER),
  orderIdParamValidator,
  wrapRequestHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store').json({
      result: await cancellations.history(req.decoded_authorization!.user_id, String(req.params.orderId))
    })
  })
)
router.patch(
  '/:orderId/cancellation-requests/:requestId',
  accessTokenValidator,
  requireRoles(UserRole.MANAGER),
  orderIdParamValidator,
  cancellationBodyValidator,
  validate(
    checkSchema({
      requestId: { in: ['params'], isMongoId: true },
      action: { in: ['body'], isString: { bail: true }, isIn: { options: [['Approve', 'Reject']] } }
    })
  ),
  wrapRequestHandler(async (req, res) => {
    res.json({
      result: await cancellations.decide(
        req.decoded_authorization!.user_id,
        String(req.params.orderId),
        String(req.params.requestId),
        req.body
      )
    })
  })
)
export default router
