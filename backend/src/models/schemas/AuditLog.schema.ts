import { ObjectId } from 'mongodb'
import { UserRole } from './User.schema'

export type AuditAction =
  | 'UserCreated'
  | 'AccountLocked'
  | 'AccountUnlocked'
  | 'RoleChanged'
  | 'OrderStatusChanged'
  | 'KitchenAssigned'
  | 'ShipperAssigned'
  | 'DeliveryFailureResolved'
  | 'CODReconciled'
  | 'CancellationRequested'
  | 'CancellationApproved'
  | 'CancellationRejected'
  | 'OrderCancelled'
  | 'DeliverySwapped' // Historical audit only; post-checkout meal changes are no longer supported.
  | 'DeliveryCancelled'
  | 'StockReleased'
  | 'RefundIssued'
  | 'InvalidPaymentSignature'
  | 'ReviewHidden'
  | 'SettingsUpdated'

export default interface AuditLog {
  _id?: ObjectId
  actorId?: ObjectId
  actorRole: UserRole | 'System'
  action: AuditAction
  entityType: 'User' | 'Order' | 'Food' | 'Review' | 'Transaction' | 'Settings'
  entityId: ObjectId | string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  reason: string
  requestId?: string
  createdAt?: Date
}
