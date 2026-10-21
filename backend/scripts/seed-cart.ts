import { getDatabaseConfig } from '../src/utils/database-config'
import { config } from 'dotenv'
import { MongoClient, ObjectId } from 'mongodb'
import { hashPassword } from '../src/utils/crypto'
import Cart from '../src/models/schemas/Cart.schema'
import Food from '../src/models/schemas/Food.schema'
import User, { AccountStatus, UserRole } from '../src/models/schemas/User.schema'

config()

const { uri, dbName: dbname } = getDatabaseConfig()
const usersCollectionNameSafe = process.env.DB_USERS_COLLECTION || 'users'
const foodsCollectionNameSafe = process.env.DB_FOODS_COLLECTION || 'foods'
const cartsCollectionNameSafe = process.env.DB_CARTS_COLLECTION || 'carts'

const CUSTOMER_EMAIL = 'seed.customer@ecommerce.local'
const CUSTOMER_PASSWORD = 'Customer123!'

async function ensureCustomer(db: ReturnType<MongoClient['db']>) {
  const users = db.collection(usersCollectionNameSafe)

  const existing = await users.findOne({ email: CUSTOMER_EMAIL })
  if (existing?._id) {
    if (existing.role !== UserRole.CUSTOMER) throw new Error('Seed email belongs to a non-Customer account')
    return existing._id as ObjectId
  }

  const customer = new User({
    email: CUSTOMER_EMAIL,
    username: 'seed_customer',
    password: await hashPassword(CUSTOMER_PASSWORD),
    phone: '0909999999',
    role: UserRole.CUSTOMER,
    account_status: AccountStatus.ACTIVE,
    loginAttempts: 0,
    forgot_password_token: ''
  })

  const result = await users.insertOne(customer)
  return result.insertedId
}

async function ensureFood(db: ReturnType<MongoClient['db']>) {
  const foods = db.collection<Food>(foodsCollectionNameSafe)
  const food = await foods.findOne({ isActive: true, stock: { $gte: 2 } })
  if (!food) {
    throw new Error('No active food with enough stock found. Please run seed-foods.ts first.')
  }
  return food
}

async function seedCart() {
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db(dbname)

    const food = await ensureFood(db)
    const customersToSeed = ['customer@fitbite.test', CUSTOMER_EMAIL]
    const carts = db.collection<Cart>(cartsCollectionNameSafe)

    for (const email of customersToSeed) {
      const user = await db.collection(usersCollectionNameSafe).findOne({ email })
      if (!user) continue

      const cart = new Cart({
        userId: user._id as ObjectId,
        cartType: 'FOOD',
        items: [
          {
            itemId: food._id as ObjectId,
            quantity: 2
          }
        ]
      })

      await carts.updateOne(
        { userId: user._id as ObjectId },
        {
          $setOnInsert: { ...cart, createdAt: new Date(), updatedAt: new Date() }
        },
        { upsert: true }
      )
      console.log(`Cart items seeded for: ${email}`)
    }

    console.log('Seed cart completed successfully')
  } catch (error) {
    console.error('Error seeding cart:', error)
    process.exitCode = 1
  } finally {
    await client.close()
    console.log('Database connection closed')
  }
}

seedCart()
