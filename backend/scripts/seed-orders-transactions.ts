import { MongoClient, ObjectId } from 'mongodb'
import { getDatabaseConfig } from '../src/utils/database-config'
import Order, { OrderItem, DeliveryPeriod, OrderStatus } from '../src/models/schemas/Order.schema'
import Transaction from '../src/models/schemas/Transaction.schema'
import Review from '../src/models/schemas/Review.schema'
import Food from '../src/models/schemas/Food.schema'
import { config } from 'dotenv'

config()

export async function seedOrdersTransactions(): Promise<void> {
  const { uri, dbName } = getDatabaseConfig()
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db(dbName)
    const usersCollection = db.collection(process.env.DB_USERS_COLLECTION || 'users')
    const foodsCollection = db.collection<Food>(process.env.DB_FOODS_COLLECTION || 'foods')
    const ordersCollection = db.collection<Order>(process.env.DB_ORDERS_COLLECTION || 'orders')
    const transactionsCollection = db.collection<Transaction>(process.env.DB_TRANSACTIONS_COLLECTION || 'transactions')
    const reviewsCollection = db.collection<Review>(process.env.DB_REVIEWS_COLLECTION || 'reviews')

    const customer = await usersCollection.findOne({
      $or: [{ email: 'customer@fitbite.test' }, { role: 'Customer' }]
    })

    if (!customer) {
      console.warn('[Orders] No customer account found. Skipping orders seeding.')
      return
    }

    const customerId = customer._id as ObjectId
    const allFoods = await foodsCollection.find({ isActive: true }).limit(10).toArray()

    if (allFoods.length < 3) {
      console.warn('[Orders] Not enough food items found. Please run seed-foods first.')
      return
    }

    const f1 = allFoods[0]
    const f2 = allFoods[1]
    const f3 = allFoods[2]
    const f4 = allFoods[3] || allFoods[0]

    const makeOrderItem = (food: Food, slot: 'Breakfast' | 'Lunch' | 'Dinner', qty = 1): OrderItem => ({
      _id: new ObjectId(),
      foodId: food._id as ObjectId,
      foodName: food.name,
      image: food.images?.[0] || 'default-food.jpg',
      quantity: qty,
      price: food.price,
      calories: food.calories,
      nutrition: food.nutrition,
      mealSlot: slot
    })

    const baseShipping = {
      baseFee: 25000,
      extraFee: 0,
      totalFee: 25000,
      distanceKm: 4.5
    }

    const orderConfigs: Array<{
      orderCode: string
      status: OrderStatus
      packageType: 'ONE_DAY' | 'WEEKLY_7D'
      daysAgo: number
      paymentMethod: 'VNPay' | 'COD'
      paymentStatus: 'Paid' | 'Pending'
      foodsForOrder: Food[]
      cancellation?: { reason: string }
    }> = [
      {
        orderCode: 'FB-ORD-20261001-01',
        status: 'Completed',
        packageType: 'ONE_DAY',
        daysAgo: 4,
        paymentMethod: 'VNPay',
        paymentStatus: 'Paid',
        foodsForOrder: [f1, f2]
      },
      {
        orderCode: 'FB-ORD-20261002-02',
        status: 'Completed',
        packageType: 'WEEKLY_7D',
        daysAgo: 3,
        paymentMethod: 'COD',
        paymentStatus: 'Paid',
        foodsForOrder: [f1, f3]
      },
      {
        orderCode: 'FB-ORD-20261004-03',
        status: 'Delivering',
        packageType: 'ONE_DAY',
        daysAgo: 1,
        paymentMethod: 'VNPay',
        paymentStatus: 'Paid',
        foodsForOrder: [f2, f3]
      },
      {
        orderCode: 'FB-ORD-20261005-04',
        status: 'Cooking',
        packageType: 'ONE_DAY',
        daysAgo: 0,
        paymentMethod: 'COD',
        paymentStatus: 'Pending',
        foodsForOrder: [f1, f4]
      },
      {
        orderCode: 'FB-ORD-20261005-05',
        status: 'Pending',
        packageType: 'ONE_DAY',
        daysAgo: 0,
        paymentMethod: 'VNPay',
        paymentStatus: 'Pending',
        foodsForOrder: [f2]
      },
      {
        orderCode: 'FB-ORD-20260930-06',
        status: 'Cancelled',
        packageType: 'ONE_DAY',
        daysAgo: 5,
        paymentMethod: 'VNPay',
        paymentStatus: 'Pending',
        foodsForOrder: [f3],
        cancellation: { reason: 'Khách đổi kế hoạch lịch trình cá nhân' }
      }
    ]

    for (const cfg of orderConfigs) {
      const existingOrder = await ordersCollection.findOne({ orderCode: cfg.orderCode })
      if (existingOrder) {
        continue
      }

      const orderDate = new Date()
      orderDate.setDate(orderDate.getDate() - cfg.daysAgo)
      const dateStr = orderDate.toISOString().slice(0, 10)

      let deliveries: DeliveryPeriod[] = []

      if (cfg.packageType === 'WEEKLY_7D') {
        deliveries = Array.from({ length: 7 }).map((_, idx) => {
          const dDate = new Date(orderDate)
          dDate.setDate(dDate.getDate() + idx)
          const dStr = dDate.toISOString().slice(0, 10)
          const items = [
            makeOrderItem(cfg.foodsForOrder[idx % cfg.foodsForOrder.length], 'Lunch'),
            makeOrderItem(allFoods[(idx + 1) % allFoods.length], 'Dinner')
          ]
          const sub = items.reduce((s, it) => s + it.price * it.quantity, 0)
          return {
            _id: new ObjectId(),
            date: dStr,
            scheduledAt: new Date(dDate.setHours(11, 0, 0, 0)),
            items,
            status: cfg.status,
            statusHistory: [{ status: cfg.status, changedAt: orderDate }],
            subtotal: sub,
            shipping: idx === 0 ? baseShipping : { ...baseShipping, totalFee: 0 },
            waivedShippingFee: idx === 0 ? 0 : 25000,
            refundedAmount: 0
          }
        })
      } else {
        const items = cfg.foodsForOrder.map((f, i) =>
          makeOrderItem(f, i === 0 ? 'Lunch' : 'Dinner')
        )
        const sub = items.reduce((s, it) => s + it.price * it.quantity, 0)
        deliveries = [
          {
            _id: new ObjectId(),
            date: dateStr,
            scheduledAt: new Date(orderDate.getTime() + 2 * 3600 * 1000),
            items,
            status: cfg.status,
            statusHistory: [{ status: cfg.status, changedAt: orderDate }],
            subtotal: sub,
            shipping: baseShipping,
            waivedShippingFee: 0,
            refundedAmount: 0
          }
        ]
      }

      const subtotal = deliveries.reduce((s, d) => s + d.subtotal, 0)
      const shippingFee = deliveries.reduce((s, d) => s + d.shipping.totalFee, 0)
      const grandTotal = subtotal + shippingFee

      const newOrder: Order = {
        _id: new ObjectId(),
        userId: customerId,
        orderCode: cfg.orderCode,
        packageType: cfg.packageType,
        deliveries,
        subtotal,
        shippingFee,
        grandTotal,
        status: cfg.status,
        statusHistory: [
          { status: 'Pending', changedAt: orderDate },
          ...(cfg.status !== 'Pending' ? [{ status: cfg.status, changedAt: orderDate }] : [])
        ],
        deliveryAddress: '123 Đường Nguyễn Thị Minh Khai, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh',
        note: 'Giao giờ hành chính, gọi trước khi đến 10 phút',
        payment: {
          method: cfg.paymentMethod,
          status: cfg.paymentStatus,
          transactionId: cfg.paymentStatus === 'Paid' ? `VNP-${Date.now()}-${Math.floor(Math.random() * 1000)}` : undefined,
          paidAt: cfg.paymentStatus === 'Paid' ? orderDate : undefined,
          paidAmount: cfg.paymentStatus === 'Paid' ? grandTotal : 0
        },
        inventoryHold: {
          status: cfg.status === 'Completed' || cfg.status === 'Cooking' || cfg.status === 'Delivering'
            ? 'Committed'
            : cfg.status === 'Pending'
            ? 'Held'
            : 'Released',
          items: deliveries.flatMap((d) => d.items.map((it) => ({ foodId: it.foodId, quantity: it.quantity }))),
          committedAt: cfg.status === 'Completed' ? orderDate : undefined
        },
        cancelledBy: cfg.cancellation ? 'Customer' : undefined,
        cancelledAt: cfg.cancellation ? orderDate : undefined,
        cancellationReason: cfg.cancellation?.reason,
        version: 1,
        createdAt: orderDate,
        updatedAt: orderDate
      }

      await ordersCollection.insertOne(newOrder)

      // If Paid, create matching Transaction
      if (cfg.paymentStatus === 'Paid') {
        const trans: Transaction = {
          kind: 'Payment',
          status: 'Succeeded',
          amount: grandTotal,
          currency: 'VND',
          foodAmount: subtotal,
          shippingAmount: shippingFee,
          orderId: newOrder._id,
          userId: customerId,
          method: cfg.paymentMethod,
          providerTransactionId: newOrder.payment.transactionId,
          idempotencyKey: `pay_${newOrder.orderCode}`,
          source: cfg.paymentMethod === 'VNPay' ? 'VerifiedIPN' : 'CODCollection',
          verifiedAt: orderDate,
          occurredAt: orderDate,
          description: `Thanh toán thành công cho đơn hàng ${newOrder.orderCode}`,
          createdAt: orderDate,
          updatedAt: orderDate
        }

        await transactionsCollection.updateOne(
          { idempotencyKey: trans.idempotencyKey },
          { $setOnInsert: trans },
          { upsert: true }
        )
      }

      if (cfg.status === 'Completed') {
        const ratedFood = deliveries[0].items[0]
        const review: Review = {
          reviewerId: customerId,
          foodId: ratedFood.foodId,
          orderId: newOrder._id as ObjectId,
          rating: 5,
          comment: `Món ${ratedFood.foodName} thực sự rất ngon! Dinh dưỡng chuẩn, rau củ tươi xanh, giao đúng hẹn. Rất hài lòng!`,
          images: [],
          verifiedPurchase: true,
          isHidden: false,
          createdAt: orderDate,
          updatedAt: orderDate
        }

        await reviewsCollection.updateOne(
          { orderId: newOrder._id },
          { $setOnInsert: review },
          { upsert: true }
        )
      }
    }

    const expense1Date = new Date()
    expense1Date.setDate(expense1Date.getDate() - 6)
    const expense1: Transaction = {
      kind: 'Expense',
      status: 'Succeeded',
      amount: 4200000,
      currency: 'VND',
      idempotencyKey: 'exp_supplier_20261001',
      source: 'Reconciliation',
      occurredAt: expense1Date,
      expenseCategory: 'Ingredients',
      description: 'Nhập thực phẩm tươi sống hữu cơ theo tuần (Dalathasfarm)',
      createdAt: expense1Date,
      updatedAt: expense1Date
    }

    const expense2Date = new Date()
    expense2Date.setDate(expense2Date.getDate() - 3)
    const expense2: Transaction = {
      kind: 'Expense',
      status: 'Succeeded',
      amount: 850000,
      currency: 'VND',
      idempotencyKey: 'exp_packaging_20261003',
      source: 'Reconciliation',
      occurredAt: expense2Date,
      expenseCategory: 'Packaging',
      description: 'Hộp bã mía bảo vệ môi trường và túi xách giữ nhiệt',
      createdAt: expense2Date,
      updatedAt: expense2Date
    }

    await transactionsCollection.updateOne(
      { idempotencyKey: expense1.idempotencyKey },
      { $setOnInsert: expense1 },
      { upsert: true }
    )
    await transactionsCollection.updateOne(
      { idempotencyKey: expense2.idempotencyKey },
      { $setOnInsert: expense2 },
      { upsert: true }
    )

    console.log(`[Orders & Transactions] Seeded orders, payments, reviews & operational expenses successfully.`)
  } finally {
    await client.close()
  }
}

if (process.argv[1]?.endsWith('seed-orders-transactions.ts')) {
  seedOrdersTransactions().catch((err) => {
    console.error('[Orders] Error seeding orders:', err)
    process.exitCode = 1
  })
}
