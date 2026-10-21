import { ObjectId } from 'mongodb'
import database from './database.services'
import emailService from './email.services'
import { validRecipient } from '~/utils/notification-email'

export const NOTIFICATION_MAX_ATTEMPTS = 5
export const NOTIFICATION_LEASE_MS = 5 * 60 * 1000
const RETRY_DELAYS_MS = [60000, 5 * 60000, 15 * 60000, 60 * 60000]

class NotificationEmailService {
  // Only committed records with an explicit email state are eligible. SMTP is outside all business transactions.
  async processNext(now = new Date()) {
    await database.notifications.updateMany(
      {
        'email.status': 'Sending',
        'email.attempts': { $gte: NOTIFICATION_MAX_ATTEMPTS },
        'email.leaseUntil': { $lte: now }
      },
      {
        $set: { 'email.status': 'Failed', 'email.lastErrorCode': 'DELIVERY_UNKNOWN' },
        $unset: { 'email.leaseUntil': '', 'email.lockToken': '' }
      }
    )
    const lockToken = new ObjectId()
    const notification = await database.notifications.findOneAndUpdate(
      {
        'email.attempts': { $lt: NOTIFICATION_MAX_ATTEMPTS },
        $or: [
          { 'email.status': 'Pending', 'email.nextAttemptAt': { $lte: now } },
          { 'email.status': 'Sending', 'email.leaseUntil': { $lte: now } }
        ]
      },
      {
        $set: {
          'email.status': 'Sending',
          'email.lockToken': lockToken,
          'email.leaseUntil': new Date(now.getTime() + NOTIFICATION_LEASE_MS)
        },
        $inc: { 'email.attempts': 1 }
      },
      { returnDocument: 'after', sort: { createdAt: 1, _id: 1 } }
    )
    if (!notification) return false
    const owner = { _id: notification._id, 'email.status': 'Sending' as const, 'email.lockToken': lockToken }
    const cleanup = { 'email.leaseUntil': '' as const, 'email.lockToken': '' as const }
    try {
      // Locked accounts still receive security and order messages; delivery does not require a live session.
      const user = await database.users.findOne({ _id: notification.userId }, { projection: { email: 1 } })
      if (!user || !validRecipient(user.email)) {
        await database.notifications.updateOne(owner, {
          $set: { 'email.status': 'Failed', 'email.lastErrorCode': 'RECIPIENT_UNAVAILABLE' },
          $unset: cleanup
        })
        return true
      }
      // A slow DB lookup must not let a worker that lost ownership send an obsolete claim.
      const renewed = await database.notifications.updateOne(owner, {
        $set: { 'email.leaseUntil': new Date(Date.now() + NOTIFICATION_LEASE_MS) }
      })
      if (!renewed.matchedCount) return true
      await emailService.sendNotification(user.email, {
        id: notification._id.toHexString(),
        title: notification.title,
        message: notification.message
      })
    } catch {
      const attempts = notification.email!.attempts
      await database.notifications.updateOne(owner, {
        $set: {
          'email.status': attempts >= NOTIFICATION_MAX_ATTEMPTS ? 'Failed' : 'Pending',
          'email.lastErrorCode': 'SMTP_ERROR',
          'email.nextAttemptAt': new Date(
            now.getTime() + RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]
          )
        },
        $unset: cleanup
      })
      return true
    }
    // A DB failure after SMTP acceptance leaves the lease for recovery, not a false success record.
    await database.notifications.updateOne(owner, {
      $set: { 'email.status': 'Sent', 'email.sentAt': new Date() },
      $unset: { ...cleanup, 'email.lastErrorCode': '' }
    })
    return true
  }

  async processBatch(limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid email batch size')
    emailService.getSmtpConfig() // A missing config must not consume attempts on every pending message.
    let processed = 0
    while (processed < limit && (await this.processNext())) processed++
    return processed
  }
}

export default new NotificationEmailService()
