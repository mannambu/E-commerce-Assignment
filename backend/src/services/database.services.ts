import { MongoClient, Db, Collection } from 'mongodb'
import { config } from 'dotenv'
import User from '~/models/schemas/User.schema'
import RefreshToken from '~/models/schemas/RefreshToken.schema'
import Food from '~/models/schemas/Food.schema'
import PTService from '~/models/schemas/PTService.schema'
import Order from '~/models/schemas/Order.schema'
import Cart from '~/models/schemas/Cart.schema'
import Review from '~/models/schemas/Review.schema'
import ChatRoom from '~/models/schemas/ChatRoom.schema'
import Analytics from '~/models/schemas/Analytic.schema'
import CalorieLog from '~/models/schemas/CalorieLog.schema'

config()

const username = process.env.DB_USERNAME
const password = process.env.DB_PASSWORD
const dbname = process.env.DB_NAME

if (!username || !password) {
  throw new Error('Missing DB_USERNAME or DB_PASSWORD in the .env file')
}
// const uri = `mongodb+srv://${username}:${password}@studymongodbbasic.nvb8bql.mongodb.net/?appName=StudyMongoDBBasic`
const uri = `mongodb+srv://${username}:${password}@studymongodbbasic.nvb8bql.mongodb.net/`

class DatabaseService {
  private client: MongoClient
  private db: Db

  constructor() {
    this.client = new MongoClient(uri)
    this.db = this.client.db(dbname)
  }

  async connect() {
    try {
      await this.db.command({ ping: 1 })
      console.log('Pinged your deployment. You successfully connected to MongoDB!')
    } catch (error) {
      console.log('Error', error)
      throw error
    }
  }

  async indexUsers() {
    const exists = await this.users.indexExists(['email_1_password_1', 'email_1', 'username_1'])

    if (!exists) {
      await this.users.createIndex({ email: 1, password: 1 })
      await this.users.createIndex({ email: 1 }, { unique: true })
      await this.users.createIndex({ username: 1 }, { unique: true })
    }
  }

  async indexRefreshTokens() {
    const exists = await this.refreshTokens.indexExists(['exp_1', 'token_1'])

    if (!exists) {
      await this.refreshTokens.createIndex({ token: 1 })
      await this.refreshTokens.createIndex(
        { exp: 1 },
        {
          expireAfterSeconds: 0
        }
      )
    }
  }

  async indexCarts() {
    const oldIndexExists = await this.carts.indexExists('userId_1')
    if (oldIndexExists) {
      await this.carts.dropIndex('userId_1')
    }

    const exists = await this.carts.indexExists('userId_1_cartType_1')
    if (!exists) {
      await this.carts.createIndex({ userId: 1, cartType: 1 }, { unique: true })
    }
  }

  async indexOrders() {
    const exists = await this.orders.indexExists(['userId_1_createdAt_-1', 'status_1_createdAt_-1'])
    if (!exists) {
      this.orders.createIndex({ userId: 1, createdAt: -1 })
      this.orders.createIndex({ status: 1, createdAt: -1 })
    }
  }

  async indexCalorieLogs() {
    const calorieLogsCollectionName = process.env.DB_CALORIE_LOGS_COLLECTION as string

    const collectionExists = await this.db.listCollections({ name: calorieLogsCollectionName }).hasNext()

    if (!collectionExists) {
      await this.db.createCollection(calorieLogsCollectionName)
    }

    const exists = await this.calorieLogs.indexExists(['userId_1_date_-1', 'sourceType_1_sourceId_1'])
    if (!exists) {
      await this.calorieLogs.createIndex({ userId: 1, date: -1 })
      await this.calorieLogs.createIndex({ userId: 1, sourceType: 1, sourceId: 1 })
    }
  }

  get users(): Collection<User> {
    return this.db.collection(process.env.DB_USERS_COLLECTION as string)
  }

  get refreshTokens(): Collection<RefreshToken> {
    return this.db.collection(process.env.DB_REFRESH_TOKENS_COLLECTION as string)
  }

  get foods(): Collection<Food> {
    return this.db.collection(process.env.DB_FOODS_COLLECTION as string)
  }

  get ptServices(): Collection<PTService> {
    return this.db.collection(process.env.DB_PT_SERVICES_COLLECTION as string)
  }

  get orders(): Collection<Order> {
    return this.db.collection(process.env.DB_ORDERS_COLLECTION as string)
  }

  get carts(): Collection<Cart> {
    return this.db.collection(process.env.DB_CARTS_COLLECTION as string)
  }

  get reviews(): Collection<Review> {
    return this.db.collection(process.env.DB_REVIEWS_COLLECTION as string)
  }

  get chatrooms(): Collection<ChatRoom> {
    return this.db.collection(process.env.DB_CHATS_COLLECTION as string)
  }

  get analytics(): Collection<Analytics> {
    return this.db.collection(process.env.DB_ANALYTICS_COLLECTION as string)
  }

  get calorieLogs(): Collection<CalorieLog> {
    return this.db.collection(process.env.DB_CALORIE_LOGS_COLLECTION as string)
  }
}

const databaseService = new DatabaseService()
export default databaseService
