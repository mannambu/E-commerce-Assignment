import { MongoClient, Collection, ClientSession } from 'mongodb'
import { config } from 'dotenv'
import User from '~/models/schemas/User.schema'
import Session from '~/models/schemas/Session.schema'
import Food from '~/models/schemas/Food.schema'
import Cart from '~/models/schemas/Cart.schema'
import Order from '~/models/schemas/Order.schema'
import MealPlan from '~/models/schemas/MealPlan.schema'
import DailyHealthLog from '~/models/schemas/DailyHealthLog.schema'
import Review from '~/models/schemas/Review.schema'
import Notification from '~/models/schemas/Notification.schema'
import Transaction from '~/models/schemas/Transaction.schema'
import AuditLog from '~/models/schemas/AuditLog.schema'
import Settings from '~/models/schemas/Settings.schema'

config()
const username = process.env.DB_USERNAME
const password = process.env.DB_PASSWORD
if (!process.env.DB_URI && (!username || !password)) {
  throw new Error('Missing DB_URI or DB_USERNAME/DB_PASSWORD')
}
const uri = process.env.DB_URI || `mongodb+srv://${username}:${password}@studymongodbbasic.nvb8bql.mongodb.net/`

class DatabaseService {
  private client = new MongoClient(uri)
  private db = this.client.db(process.env.DB_NAME)

  async connect() {
    await this.db.command({ ping: 1 })
    console.log('Connected to MongoDB')
  }

  async withTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = this.client.startSession()
    try {
      return await session.withTransaction(() => operation(session))
    } finally {
      await session.endSession()
    }
  }

  get users(): Collection<User> {
    return this.db.collection(process.env.DB_USERS_COLLECTION || 'users')
  }
  get sessions(): Collection<Session> {
    return this.db.collection(process.env.DB_SESSIONS_COLLECTION || 'sessions')
  }
  get foods(): Collection<Food> {
    return this.db.collection(process.env.DB_FOODS_COLLECTION || 'foods')
  }
  get carts(): Collection<Cart> {
    return this.db.collection(process.env.DB_CARTS_COLLECTION || 'carts')
  }
  get orders(): Collection<Order> {
    return this.db.collection(process.env.DB_ORDERS_COLLECTION || 'orders')
  }
  get mealPlans(): Collection<MealPlan> {
    return this.db.collection(process.env.DB_MEAL_PLANS_COLLECTION || 'meal_plans')
  }
  get dailyHealthLogs(): Collection<DailyHealthLog> {
    return this.db.collection(process.env.DB_DAILY_HEALTH_LOGS_COLLECTION || 'daily_health_logs')
  }
  get reviews(): Collection<Review> {
    return this.db.collection(process.env.DB_REVIEWS_COLLECTION || 'reviews')
  }
  get notifications(): Collection<Notification> {
    return this.db.collection(process.env.DB_NOTIFICATIONS_COLLECTION || 'notifications')
  }
  get transactions(): Collection<Transaction> {
    return this.db.collection(process.env.DB_TRANSACTIONS_COLLECTION || 'transactions')
  }
  get auditLogs(): Collection<AuditLog> {
    return this.db.collection(process.env.DB_AUDIT_LOGS_COLLECTION || 'audit_logs')
  }
  get settings(): Collection<Settings> {
    return this.db.collection(process.env.DB_SETTINGS_COLLECTION || 'settings')
  }
}

export default new DatabaseService()
