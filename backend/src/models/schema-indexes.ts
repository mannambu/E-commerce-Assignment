import { Db, IndexDescription } from 'mongodb'

export interface SchemaIndexPlan {
  collection: string
  indexes: IndexDescription[]
}

/** Index phục vụ 12 collection. Chỉ chạy bằng script sau khi chuẩn bị/chuyển dữ liệu. */
export function getSchemaIndexPlan(env: NodeJS.ProcessEnv = process.env): SchemaIndexPlan[] {
  return [
    {
      collection: env.DB_USERS_COLLECTION || 'users',
      indexes: [
        { key: { email: 1 }, name: 'email_unique', unique: true },
        {
          key: { username: 1 },
          name: 'username_unique',
          unique: true,
          partialFilterExpression: { username: { $gt: '' } }
        },
        { key: { role: 1, account_status: 1 }, name: 'user_management' }
      ]
    },
    {
      collection: env.DB_SESSIONS_COLLECTION || 'sessions',
      indexes: [
        { key: { token: 1 }, name: 'session_token', unique: true },
        { key: { user_id: 1, sessionId: 1 }, name: 'user_sessions' },
        { key: { exp: 1 }, name: 'session_expiry', expireAfterSeconds: 0 }
      ]
    },
    {
      collection: env.DB_FOODS_COLLECTION || 'foods',
      indexes: [
        { key: { isActive: 1, price: 1 }, name: 'food_price' },
        { key: { normalizedName: 1 }, name: 'food_search' },
        { key: { isActive: 1, goalTags: 1 }, name: 'food_goals' }
      ]
    },
    {
      collection: env.DB_CARTS_COLLECTION || 'carts',
      indexes: [{ key: { userId: 1 }, name: 'one_cart_per_user', unique: true }]
    },
    {
      collection: env.DB_ORDERS_COLLECTION || 'orders',
      indexes: [
        { key: { userId: 1, createdAt: -1 }, name: 'user_orders' },
        { key: { status: 1, createdAt: -1 }, name: 'order_management' },
        { key: { orderCode: 1 }, name: 'order_code', unique: true },
        {
          key: { userId: 1, idempotencyKey: 1 },
          name: 'checkout_once',
          unique: true,
          partialFilterExpression: { idempotencyKey: { $type: 'string' } }
        },
        { key: { status: 1, 'payment.status': 1, paymentDueAt: 1 }, name: 'payment_timeout' },
        { key: { 'inventoryHold.status': 1, 'inventoryHold.expiresAt': 1 }, name: 'release_stock' },
        { key: { 'deliveries.date': 1, 'deliveries.status': 1 }, name: 'delivery_schedule' }
      ]
    },
    {
      collection: env.DB_MEAL_PLANS_COLLECTION || 'meal_plans',
      indexes: [{ key: { userId: 1, startDate: -1 }, name: 'user_meal_plans' }]
    },
    {
      collection: env.DB_DAILY_HEALTH_LOGS_COLLECTION || 'daily_health_logs',
      indexes: [{ key: { userId: 1, date: 1 }, name: 'one_health_log_per_day', unique: true }]
    },
    {
      collection: env.DB_REVIEWS_COLLECTION || 'reviews',
      indexes: [
        { key: { orderId: 1 }, name: 'one_review_per_order', unique: true },
        { key: { foodId: 1, isHidden: 1, rating: 1, createdAt: -1 }, name: 'food_reviews' }
      ]
    },
    {
      collection: env.DB_NOTIFICATIONS_COLLECTION || 'notifications',
      indexes: [
        { key: { userId: 1, createdAt: -1 }, name: 'user_notifications' },
        { key: { userId: 1, readAt: 1 }, name: 'unread_notifications' },
        {
          key: { userId: 1, eventKey: 1 },
          name: 'notification_once',
          unique: true,
          partialFilterExpression: { eventKey: { $type: 'string' } }
        }
      ]
    },
    {
      collection: env.DB_TRANSACTIONS_COLLECTION || 'transactions',
      indexes: [
        { key: { idempotencyKey: 1 }, name: 'transaction_once', unique: true },
        {
          key: { method: 1, kind: 1, providerTransactionId: 1 },
          name: 'gateway_transaction',
          unique: true,
          partialFilterExpression: { providerTransactionId: { $type: 'string' } }
        },
        { key: { orderId: 1, occurredAt: -1 }, name: 'order_ledger' },
        { key: { status: 1, occurredAt: 1, kind: 1 }, name: 'financial_report' }
      ]
    },
    {
      collection: env.DB_AUDIT_LOGS_COLLECTION || 'audit_logs',
      indexes: [{ key: { entityType: 1, entityId: 1, createdAt: -1 }, name: 'entity_history' }]
    },
    { collection: env.DB_SETTINGS_COLLECTION || 'settings', indexes: [] }
  ]
}

export async function createSchemaIndexes(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  for (const entry of getSchemaIndexPlan(env)) {
    if (entry.indexes.length) await db.collection(entry.collection).createIndexes(entry.indexes)
  }
}
