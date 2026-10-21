import { ObjectId } from 'mongodb'

export type NotificationPriority = 'Urgent' | 'Normal' | 'News'
export type NotificationType = 'Order' | 'Payment' | 'Account' | 'Review' | 'System'

export default interface Notification {
  _id?: ObjectId
  userId: ObjectId
  type: NotificationType
  priority: NotificationPriority
  title: string
  message: string
  entityType?: 'Order' | 'User' | 'Review'
  entityId?: ObjectId
  eventKey?: string // Stable event key prevents duplicate notifications on webhook/job retries.
  readAt?: Date
  email?: {
    status: 'Pending' | 'Sending' | 'Sent' | 'Failed'
    attempts: number
    nextAttemptAt: Date
    leaseUntil?: Date
    lockToken?: ObjectId
    sentAt?: Date // SMTP accepted the message; not proof of inbox delivery.
    lastErrorCode?: 'SMTP_ERROR' | 'RECIPIENT_UNAVAILABLE' | 'DELIVERY_UNKNOWN'
  }
  createdAt?: Date
}
