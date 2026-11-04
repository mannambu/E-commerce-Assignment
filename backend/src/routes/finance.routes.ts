import { Router } from 'express'
import { checkSchema } from 'express-validator'
import { accessTokenValidator, requireRoles } from '~/middlewares/users.middlewares'
import { UserRole } from '~/models/schemas/User.schema'
import { validate } from '~/utils/validation'
import { wrapRequestHandler } from '~/utils/handlers'
import finance from '~/services/finance.services'

const router = Router()
router.use(accessTokenValidator, requireRoles(UserRole.MANAGER, UserRole.ADMIN))
router.use(
  validate(
    checkSchema({
      from: { in: ['query'], isString: { bail: true }, matches: { options: /^\d{4}-\d{2}-\d{2}$/ } },
      to: { in: ['query'], isString: { bail: true }, matches: { options: /^\d{4}-\d{2}-\d{2}$/ } },
      page: { in: ['query'], optional: true, isString: { bail: true }, isInt: { options: { min: 1, max: 1000000 } } },
      limit: { in: ['query'], optional: true, isString: { bail: true }, isInt: { options: { min: 1, max: 100 } } }
    })
  )
)
router.get(
  '/summary',
  wrapRequestHandler(async (req, res) => {
    const { rows, ...result } = await finance.report(
      req.decoded_authorization!.user_id,
      String(req.query.from),
      String(req.query.to)
    )
    res.set('Cache-Control', 'private, no-store').json({ result: { ...result, deliveryRows: rows.length } })
  })
)
router.get(
  '/deliveries',
  wrapRequestHandler(async (req, res) => {
    const report = await finance.report(
      req.decoded_authorization!.user_id,
      String(req.query.from),
      String(req.query.to)
    )
    const page = Number(req.query.page || 1),
      limit = Number(req.query.limit || 20)
    res.set('Cache-Control', 'private, no-store').json({
      result: {
        period: report.period,
        items: report.rows.slice((page - 1) * limit, page * limit),
        page,
        limit,
        total: report.rows.length,
        warnings: report.warnings
      }
    })
  })
)
export default router
