import { ObjectId } from 'mongodb'
import { PaymentMethod } from './Order.schema'
import { Currency } from './common'

export type TransactionKind = 'Payment' | 'Refund' | 'Expense'
export type TransactionStatus = 'Pending' | 'Succeeded' | 'Failed'

export default interface Transaction {
  _id?: ObjectId
  kind: TransactionKind
  status: TransactionStatus
  amount: number // Positive integer VND. Direction is determined by kind.
  currency?: Currency
  foodAmount?: number
  shippingAmount?: number
  orderId?: ObjectId // Required for Payment/Refund.
  deliveryId?: ObjectId // Refund of a single delivery period.
  userId?: ObjectId
  method?: PaymentMethod
  providerTransactionId?: string
  providerRequestId?: string
  idempotencyKey: string
  relatedTransactionId?: ObjectId // Refund -> original successful payment.
  source: 'VerifiedIPN' | 'CODCollection' | 'Reconciliation'
  verifiedAt?: Date
  occurredAt: Date
  expenseCategory?: string
  description: string
  reconciliationReference?: string
  createdBy?: ObjectId
  createdAt?: Date
  updatedAt?: Date
}
