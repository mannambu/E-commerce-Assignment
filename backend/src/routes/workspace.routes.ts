import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { accessTokenValidator, requireRoles } from '~/middlewares/users.middlewares'
import { UserRole } from '~/models/schemas/User.schema'
import database from '~/services/database.services'
import { wrapRequestHandler } from '~/utils/handlers'

const workspace = Router()
workspace.use(accessTokenValidator)

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
