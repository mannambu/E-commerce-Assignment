import type Notification from '~/models/schemas/Notification.schema'

// Opt in new business events explicitly. Historical notification records are never backfilled.
export function pendingNotificationEmail(now = new Date()): Notification['email'] {
  return { status: 'Pending', attempts: 0, nextAttemptAt: now }
}

export function validRecipient(email: unknown): email is string {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)
}
