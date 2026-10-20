import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { checkSchema } from 'express-validator'
import { accessTokenValidator, requireRoles } from '~/middlewares/users.middlewares'
import { AccountStatus, UserRole } from '~/models/schemas/User.schema'
import database from '~/services/database.services'
import { wrapRequestHandler } from '~/utils/handlers'
import { validate } from '~/utils/validation'
import { deliveryCodExpected } from '~/utils/delivery'
import managerOperations from '~/services/manager-operations.services'
import cancellations from '~/services/cancellation.services'

const workspace = Router()
workspace.use(accessTokenValidator)
workspace.get(
  '/cancellation-requests',
  requireRoles(UserRole.MANAGER),
  validate(
    checkSchema({
      page: { in: ['query'], optional: true, isString: { bail: true }, isInt: { options: { min: 1, max: 1000000 } } },
      limit: { in: ['query'], optional: true, isString: { bail: true }, isInt: { options: { min: 1, max: 100 } } }
    })
  ),
  wrapRequestHandler(async (req, res) => {
    res.set('Cache-Control', 'private, no-store').json({
      result: await cancellations.pending(
        req.decoded_authorization!.user_id,
        Number(req.query.page || 1),
        Number(req.query.limit || 20)
      )
    })
  })
)

workspace.get(
  '/cod-issues',
  requireRoles(UserRole.MANAGER),
  validate(
    checkSchema({
      kind: { in: ['query'], optional: true, isString: { bail: true }, isIn: { options: [['All', 'Failed', 'COD']] } },
      page: { in: ['query'], optional: true, isString: { bail: true }, isInt: { options: { min: 1, max: 1000000 } } },
      limit: { in: ['query'], optional: true, isString: { bail: true }, isInt: { options: { min: 1, max: 100 } } }
    })
  ),
  wrapRequestHandler(async (req, res) => {
    const result = await managerOperations.listIssues(
      req.decoded_authorization!.user_id,
      (req.query.kind || 'All') as 'All' | 'Failed' | 'COD',
      Number(req.query.page || 1),
      Number(req.query.limit || 20)
    )
    res.set('Cache-Control', 'private, no-store').json({ result })
  })
)

// Assignment picker only; this does not grant Manager access to account administration.
workspace.get(
  '/staff',
  requireRoles(UserRole.MANAGER),
  validate(
    checkSchema({
      role: { in: ['query'], isString: { bail: true }, isIn: { options: [[UserRole.KITCHEN, UserRole.DELIVERY]] } },
      page: { in: ['query'], optional: true, isString: { bail: true }, isInt: { options: { min: 1, max: 1000000 } } },
      limit: { in: ['query'], optional: true, isString: { bail: true }, isInt: { options: { min: 1, max: 100 } } },
      search: {
        in: ['query'],
        optional: true,
        isString: { bail: true },
        trim: true,
        isLength: { options: { max: 100 } }
      }
    })
  ),
  wrapRequestHandler(async (req, res) => {
    const page = Number(req.query.page || 1)
    const limit = Number(req.query.limit || 20)
    const search = String(req.query.search || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const filter = {
      role: req.query.role as UserRole,
      account_status: AccountStatus.ACTIVE,
      ...(search
        ? { $or: [{ username: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }] }
        : {})
    }
    const [result, total] = await Promise.all([
      database.users
        .find(filter, { projection: { _id: 1, username: 1, email: 1, role: 1 } })
        .sort({ username: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      database.users.countDocuments(filter)
    ])
    res.set('Cache-Control', 'private, no-store').json({ result, page, limit, total })
  })
)

// No assignment means no staff visibility. Never return a full Order to kitchen/delivery.
workspace.get(
  '/orders',
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.KITCHEN, UserRole.DELIVERY),
  wrapRequestHandler(async (req, res) => {
    const { role, user_id } = req.decoded_authorization!
    const staffId = new ObjectId(user_id)
    const filter =
      role === UserRole.KITCHEN
        ? { deliveries: { $elemMatch: { kitchenStaffIds: staffId, status: { $in: ['Confirmed', 'Cooking'] } } } }
        : role === UserRole.DELIVERY
          ? {
              deliveries: {
                $elemMatch: { assignedShipperId: staffId, status: { $in: ['Ready', 'Delivering', 'Failed'] } }
              }
            }
          : {}
    const orders = await database.orders.find(filter).sort({ createdAt: -1 }).limit(100).toArray()
    const result = orders.flatMap((order) =>
      order.deliveries
        .filter((day) =>
          role === UserRole.KITCHEN
            ? day.kitchenStaffIds?.some((id) => id.equals(staffId)) && ['Confirmed', 'Cooking'].includes(day.status)
            : role === UserRole.DELIVERY
              ? day.assignedShipperId?.equals(staffId) && ['Ready', 'Delivering', 'Failed'].includes(day.status)
              : true
        )
        .map((day) => ({
          orderId: order._id,
          orderCode: order.orderCode,
          deliveryId: day._id,
          date: day.date,
          status: day.status,
          packageType: order.packageType,
          version: order.version,
          hasFailedDeliveries: order.deliveries.some((delivery) => delivery.status === 'Failed'),
          ...(role !== UserRole.KITCHEN
            ? {
                paymentMethod: order.payment.method,
                codExpectedAmount: deliveryCodExpected(order, day),
                deliveryResult: day.deliveryResult,
                failedAt: day.failedAt
              }
            : {}),
          ...(role === UserRole.MANAGER || role === UserRole.ADMIN
            ? {
                kitchenStaffIds: day.kitchenStaffIds || [],
                assignedShipperId: day.assignedShipperId,
                codSettlement: day.codSettlement,
                codReconciliations: day.codReconciliations || [],
                failureResolutions: day.failureResolutions || []
              }
            : {}),
          items: day.items.map((item) => ({ name: item.foodName, quantity: item.quantity, mealSlot: item.mealSlot })),
          ...(role !== UserRole.KITCHEN ? { deliveryAddress: order.deliveryAddress } : {})
        }))
    )
    res.set('Cache-Control', 'private, no-store').json({ result })
  })
)

// Read-only ledger; financial calculations/export belong to the finance module.
workspace.get(
  '/transactions',
  requireRoles(UserRole.ADMIN, UserRole.MANAGER),
  wrapRequestHandler(async (_req, res) => {
    const result = await database.transactions
      .find(
        {},
        {
          projection: {
            _id: 1,
            kind: 1,
            status: 1,
            amount: 1,
            orderId: 1,
            deliveryId: 1,
            method: 1,
            source: 1,
            createdBy: 1,
            occurredAt: 1,
            description: 1
          }
        }
      )
      .sort({ occurredAt: -1 })
      .limit(100)
      .toArray()
    res.set('Cache-Control', 'private, no-store').json({ result })
  })
)
export default workspace
