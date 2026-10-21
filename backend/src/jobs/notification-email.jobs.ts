import notificationEmail from '~/services/notification-email.services'

export function startNotificationEmailJob() {
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED !== 'true') return () => {}
  let running = false
  let stopped = false
  let reportedError = false
  const run = async () => {
    if (running || stopped) return
    running = true
    try {
      await notificationEmail.processBatch()
      reportedError = false
    } catch {
      if (!reportedError) console.error('Notification email worker failed; check SMTP and database configuration')
      reportedError = true
    } finally {
      running = false
    }
  }
  void run()
  const timer = setInterval(() => void run(), 15000)
  timer.unref()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
