import { ObjectId } from 'mongodb'
import { ErrorWithStatus } from '~/models/Errors'
import { AccountStatus, UserRole } from '~/models/schemas/User.schema'
import { buildCODFinance, financeError, financeRange } from '~/utils/cod-finance'
import database from './database.services'
import { readCODLedger } from './cod-ledger.services'

class FinanceService {
  async report(actorId: string, from: string, to: string) {
    const range = financeRange(from, to)
    if (!ObjectId.isValid(actorId)) throw new ErrorWithStatus({ status: 403, message: 'Không có quyền xem báo cáo' })
    return database.withTransaction(async (session) => {
      const actor = await database.users.findOne(
        {
          _id: new ObjectId(actorId),
          account_status: AccountStatus.ACTIVE,
          role: { $in: [UserRole.MANAGER, UserRole.ADMIN] }
        },
        { session }
      )
      if (!actor) throw new ErrorWithStatus({ status: 403, message: 'Chỉ Manager và Admin được đọc báo cáo' })
      const activity = await database.transactions
        .find(
          {
            method: 'COD',
            status: 'Succeeded',
            kind: { $in: ['Payment', 'Refund'] },
            occurredAt: { $gte: range.start, $lt: range.end }
          },
          { session }
        )
        .limit(10001)
        .toArray()
      if (activity.length > 10000)
        throw new ErrorWithStatus({ status: 422, message: 'Kỳ báo cáo quá nhiều giao dịch; hãy thu hẹp khoảng ngày' })
      const orders = await database.orders
        .find(
          {
            'payment.method': 'COD',
            $or: [
              { _id: { $in: activity.flatMap((entry) => (entry.orderId ? [entry.orderId] : [])) } },
              { 'deliveries.date': { $gte: from, $lte: to } },
              { 'deliveries.deliveryResult.recordedAt': { $gte: range.start, $lt: range.end } },
              { 'deliveries.statusHistory.changedAt': { $gte: range.start, $lt: range.end } }
            ]
          },
          { session }
        )
        .limit(1001)
        .toArray()
      if (orders.length > 1000)
        throw new ErrorWithStatus({ status: 422, message: 'Kỳ báo cáo quá nhiều đơn; hãy thu hẹp khoảng ngày' })
      const known = new Set(orders.map((order) => String(order._id)))
      if (activity.some((entry) => !entry.orderId || !known.has(String(entry.orderId))))
        financeError('giao dịch COD không có đơn COD tương ứng')
      const transactions = []
      for (const order of orders) transactions.push(...(await readCODLedger(order, session)))
      const report = buildCODFinance(orders, transactions, range)
      const customers = await database.users
        .find({ _id: { $in: orders.map((order) => order.userId) } }, { session, projection: { username: 1, email: 1 } })
        .toArray()
      const customerMap = new Map(
        customers.map((user) => [String(user._id), { username: user.username, email: user.email }])
      )
      return { ...report, rows: report.rows.map((row) => ({ ...row, customer: customerMap.get(row.userId) || null })) }
    })
  }
}
export default new FinanceService()
