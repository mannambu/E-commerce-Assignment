import inventory from '~/services/inventory.services'

export function startInventoryJob() {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await inventory.releaseExpiredHolds()
    } catch (error) {
      console.error('Quét giữ kho hết hạn thất bại', error)
    } finally {
      running = false
    }
  }
  void run()
  const timer = setInterval(() => void run(), 15000)
  timer.unref()
  return () => clearInterval(timer)
}
