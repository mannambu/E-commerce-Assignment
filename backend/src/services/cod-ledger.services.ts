import { ClientSession } from 'mongodb'
import { ErrorWithStatus } from '~/models/Errors'
import Order, { DeliveryPeriod } from '~/models/schemas/Order.schema'
import Transaction from '~/models/schemas/Transaction.schema'
import { deliveryCodExpected } from '~/utils/delivery'
import database from './database.services'

function conflict(): never {
  throw new ErrorWithStatus({
    status: 409,
    message: 'Sổ COD chưa khớp hoặc chưa phân bổ theo ngày; cần đối soát dữ liệu trước'
  })
}

export function codDayLedger(order: Order, day: DeliveryPeriod, transactions: Transaction[]) {
  const charge = day.subtotal + day.shipping.totalFee
  const credit = day.cancellation?.creditedAmount ?? 0
  if (
    ![day.subtotal, day.shipping.totalFee, charge, credit].every(
      (value) => Number.isSafeInteger(value) && value >= 0
    ) ||
    credit > charge
  )
    conflict()
  const entries = transactions.filter((entry) => entry.deliveryId?.equals(day._id))
  const collectedAmount = entries
    .filter((entry) => entry.kind === 'Payment' && entry.status === 'Succeeded')
    .reduce((sum, entry) => sum + entry.amount, 0)
  const refundedAmount = entries
    .filter((entry) => entry.kind === 'Refund' && entry.status === 'Succeeded')
    .reduce((sum, entry) => sum + entry.amount, 0)
  const pendingRefundAmount = entries
    .filter((entry) => entry.kind === 'Refund' && entry.status !== 'Succeeded')
    .reduce((sum, entry) => sum + entry.amount, 0)
  const expectedAmount = deliveryCodExpected(order, day)
  if (
    ![collectedAmount, refundedAmount, pendingRefundAmount, expectedAmount].every(Number.isSafeInteger) ||
    expectedAmount < 0 ||
    refundedAmount + pendingRefundAmount > collectedAmount
  )
    conflict()
  return {
    expectedAmount,
    collectedAmount,
    refundedAmount,
    pendingRefundAmount,
    balance: expectedAmount - collectedAmount + refundedAmount
  }
}

export async function readCODLedger(order: Order, session?: ClientSession): Promise<Transaction[]> {
  if (order.payment.method !== 'COD') throw new ErrorWithStatus({ status: 409, message: 'Chức năng này chỉ xử lý COD' })
  const transactions = await database.transactions
    .find({ orderId: order._id, kind: { $in: ['Payment', 'Refund'] } }, { session })
    .toArray()
  for (const entry of transactions) {
    if (
      !Number.isSafeInteger(entry.amount) ||
      entry.amount <= 0 ||
      entry.method !== 'COD' ||
      !['CODCollection', 'Reconciliation'].includes(entry.source) ||
      !entry.deliveryId ||
      !order.deliveries.some((day) => day._id.equals(entry.deliveryId!))
    )
      conflict()
  }
  const paid = transactions
    .filter((entry) => entry.kind === 'Payment' && entry.status === 'Succeeded')
    .reduce((sum, entry) => sum + entry.amount, 0)
  const refunded = transactions
    .filter((entry) => entry.kind === 'Refund' && entry.status === 'Succeeded')
    .reduce((sum, entry) => sum + entry.amount, 0)
  if (
    !Number.isSafeInteger(paid) ||
    !Number.isSafeInteger(refunded) ||
    paid !== (order.payment.paidAmount ?? 0) ||
    refunded !== (order.payment.refundedAmount ?? 0)
  )
    conflict()
  for (const day of order.deliveries) codDayLedger(order, day, transactions)
  return transactions
}

// Update cached amounts from immutable receipts and actual refund results, never from a price correction.
export function refreshCODSummary(order: Order, transactions: Transaction[], now: Date) {
  const days = order.deliveries.map((day) => {
    const summary = codDayLedger(order, day, transactions)
    day.codSettlement = {
      collectedAmount: summary.collectedAmount,
      refundedAmount: summary.refundedAmount,
      pendingRefundAmount: summary.pendingRefundAmount,
      balance: summary.balance,
      updatedAt: now
    }
    day.refundedAmount = summary.refundedAmount
    return { day, summary }
  })
  const paid = days.reduce((sum, { summary }) => sum + summary.collectedAmount, 0)
  const refunded = days.reduce((sum, { summary }) => sum + summary.refundedAmount, 0)
  const reserved = days.reduce((sum, { summary }) => sum + summary.pendingRefundAmount, 0)
  const expected = days.reduce((sum, { summary }) => sum + summary.expectedAmount, 0)
  if (![paid, refunded, reserved, expected].every(Number.isSafeInteger)) conflict()
  order.payment.paidAmount = paid
  order.payment.refundedAmount = refunded
  order.payment.codReconciliationRequired = days.some(
    ({ day, summary }) =>
      ['Completed', 'Cancelled', 'Rejected'].includes(day.status) &&
      (summary.balance !== 0 || summary.pendingRefundAmount > 0)
  )
  order.payment.status =
    paid > 0 && refunded === paid
      ? 'Refunded'
      : refunded > 0
        ? 'PartiallyRefunded'
        : paid > 0 && paid - reserved >= expected
          ? 'Paid'
          : 'Pending'
  if (order.payment.status === 'Paid' && !order.payment.paidAt) order.payment.paidAt = now
}
