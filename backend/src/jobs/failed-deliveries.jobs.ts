import managerOperations from '~/services/manager-operations.services'

export function startFailedDeliveriesJob() {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await managerOperations.expireFailedDeliveries()
    } catch {
      console.error('Cannot scan overdue COD failed deliveries')
    } finally {
      running = false
    }
  }
  void run()
  const timer = setInterval(() => void run(), 60000)
  timer.unref()
  return () => clearInterval(timer)
}
