import { MongoClient, ObjectId } from 'mongodb'
import { getDatabaseConfig } from '../src/utils/database-config'
import Notification from '../src/models/schemas/Notification.schema'
import { config } from 'dotenv'

config()

export async function seedNotifications(): Promise<void> {
  const { uri, dbName } = getDatabaseConfig()
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db(dbName)
    const usersCollection = db.collection(process.env.DB_USERS_COLLECTION || 'users')
    const notifsCollection = db.collection<Notification>(process.env.DB_NOTIFICATIONS_COLLECTION || 'notifications')

    const customer = await usersCollection.findOne({
      $or: [{ email: 'customer@fitbite.test' }, { role: 'Customer' }]
    })

    if (!customer) {
      console.warn('[Notifications] No customer found. Skipping.')
      return
    }

    const customerId = customer._id as ObjectId
    const now = new Date()

    const sampleNotifs: Notification[] = [
      {
        userId: customerId,
        type: 'Order',
        priority: 'Urgent',
        title: 'Đơn hàng đang được giao đến bạn!',
        message: 'Tài xế đang giao suất ăn trưa FitBite đến địa chỉ của bạn. Vui lòng để ý điện thoại nhé.',
        entityType: 'Order',
        eventKey: `notif_order_delivering_${customerId}`,
        readAt: undefined,
        createdAt: new Date(now.getTime() - 15 * 60 * 1000)
      },
      {
        userId: customerId,
        type: 'Order',
        priority: 'Normal',
        title: 'Bếp đã tiếp nhận đơn hàng',
        message: 'Đơn hàng #FB-ORD-20261005-04 đã được bếp trưởng xác nhận và bắt đầu chế biến.',
        entityType: 'Order',
        eventKey: `notif_order_cooking_${customerId}`,
        readAt: new Date(now.getTime() - 2 * 3600 * 1000),
        createdAt: new Date(now.getTime() - 3 * 3600 * 1000)
      },
      {
        userId: customerId,
        type: 'Payment',
        priority: 'Normal',
        title: 'Thanh toán thành công',
        message: 'Giao dịch qua VNPay cho đơn hàng gói tuần đã được xác nhận thành công.',
        entityType: 'Order',
        eventKey: `notif_payment_success_${customerId}`,
        readAt: new Date(now.getTime() - 24 * 3600 * 1000),
        createdAt: new Date(now.getTime() - 25 * 3600 * 1000)
      },
      {
        userId: customerId,
        type: 'Review',
        priority: 'Normal',
        title: 'Bạn thấy món ăn hôm nay thế nào?',
        message: 'Hãy chia sẻ cảm nhận và đánh giá để giúp FitBite cải thiện chất lượng phục vụ nhé!',
        entityType: 'Review',
        eventKey: `notif_review_request_${customerId}`,
        readAt: undefined,
        createdAt: new Date(now.getTime() - 48 * 3600 * 1000)
      },
      {
        userId: customerId,
        type: 'System',
        priority: 'News',
        title: 'Chào mừng bạn đến với FitBite!',
        message: 'Khám phá thực đơn Eat Clean chuẩn calo cá nhân hóa và các ưu đãi miễn phí giao hàng cho đơn đầu tiên.',
        eventKey: `notif_welcome_${customerId}`,
        readAt: new Date(now.getTime() - 72 * 3600 * 1000),
        createdAt: new Date(now.getTime() - 72 * 3600 * 1000)
      }
    ]

    for (const notif of sampleNotifs) {
      await notifsCollection.updateOne(
        { userId: customerId, eventKey: notif.eventKey },
        { $setOnInsert: notif },
        { upsert: true }
      )
    }

    console.log(`[Notifications] Seeded notifications for customer ${customer.email}`)
  } finally {
    await client.close()
  }
}

if (process.argv[1]?.endsWith('seed-notifications.ts')) {
  seedNotifications().catch((err) => {
    console.error('[Notifications] Error seeding notifications:', err)
    process.exitCode = 1
  })
}
