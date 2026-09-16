import { config } from 'dotenv'
import { MongoClient, ObjectId } from 'mongodb'
import { hashPassword } from '../src/utils/crypto'
import Cart from '../src/models/schemas/Cart.schema'
import Food from '../src/models/schemas/Food.schema'
import PTService from '../src/models/schemas/PTService.schema'
import User, { AccountStatus, UserRole } from '../src/models/schemas/User.schema'

config()

const username = process.env.DB_USERNAME
const password = process.env.DB_PASSWORD
const dbname = process.env.DB_NAME

if (!username || !password) {
  throw new Error('Missing DB_USERNAME or DB_PASSWORD in the .env file')
}

const usersCollectionName = process.env.DB_USERS_COLLECTION
const foodsCollectionName = process.env.DB_FOODS_COLLECTION
const ptServicesCollectionName = process.env.DB_PT_SERVICES_COLLECTION
const cartsCollectionName = process.env.DB_CARTS_COLLECTION

if (!usersCollectionName || !foodsCollectionName || !ptServicesCollectionName || !cartsCollectionName) {
  throw new Error(
    'Missing one of DB_USERS_COLLECTION, DB_FOODS_COLLECTION, DB_PT_SERVICES_COLLECTION, DB_CARTS_COLLECTION'
  )
}

const usersCollectionNameSafe = usersCollectionName
const foodsCollectionNameSafe = foodsCollectionName
const ptServicesCollectionNameSafe = ptServicesCollectionName
const cartsCollectionNameSafe = cartsCollectionName

const uri = `mongodb+srv://${username}:${password}@studymongodbbasic.nvb8bql.mongodb.net/?appName=StudyMongoDBBasic`

const CUSTOMER_EMAIL = 'seed.customer@ecommerce.local'
const CUSTOMER_PASSWORD = 'Customer123!'

const SAMPLE_PT_SERVICE = {
  title: 'PT 1 kèm 1 - 4 buổi/tháng',
  description: 'Gói tập 1 kèm 1 dành cho khách cần theo sát lịch tập và chế độ dinh dưỡng.',
  price: 1800000,
  sessions: 4,
  durationDays: 30,
  isActive: true
}

async function ensureCustomer(db: ReturnType<MongoClient['db']>) {
  const users = db.collection(usersCollectionNameSafe)

  const existing = await users.findOne({ email: CUSTOMER_EMAIL })
  if (existing?._id) {
    return existing._id as ObjectId
  }

  const customer = new User({
    email: CUSTOMER_EMAIL,
    username: 'seed_customer',
    password: hashPassword(CUSTOMER_PASSWORD),
    phone: '0909999999',
    role: UserRole.CUSTOMER,
    account_status: AccountStatus.ACTIVE,
    loginAttempts: 0,
    forgot_password_token: '',
    notifications: [],
    weightTracking: [],
    calorieTracking: [],
    registeredPTServices: []
  })

  const result = await users.insertOne(customer)
  return result.insertedId
}

async function ensureFoodAndPTService(db: ReturnType<MongoClient['db']>) {
  const foods = db.collection<Food>(foodsCollectionNameSafe)
  const ptServices = db.collection<PTService>(ptServicesCollectionNameSafe)
  const users = db.collection<User>(usersCollectionNameSafe)

  const food = await foods.findOne({ isActive: true })
  if (!food?._id) {
    throw new Error('No active food found. Please run seed-foods.ts first.')
  }

  let ptUserId = (await users.findOne({ role: UserRole.PT, 'ptProfile.approvedByAdmin': true }))?._id
  if (!ptUserId) {
    const pt = new User({
      email: 'seed.pt@ecommerce.local',
      username: 'seed_pt',
      password: hashPassword('Pt123456!'),
      phone: '0908888888',
      role: UserRole.PT,
      account_status: AccountStatus.ACTIVE,
      loginAttempts: 0,
      forgot_password_token: '',
      ptProfile: {
        experienceYears: 5,
        specialties: ['weight loss', 'nutrition coaching'],
        rating: 4.8,
        portfolioImages: [],
        approvedByAdmin: true
      },
      notifications: [],
      weightTracking: [],
      calorieTracking: [],
      registeredPTServices: []
    })

    const insertedPT = await users.insertOne(pt)
    ptUserId = insertedPT.insertedId
  }

  const existingService = await ptServices.findOne({ title: SAMPLE_PT_SERVICE.title })
  let ptServiceId = existingService?._id

  if (!ptServiceId) {
    const service = new PTService({
      ptId: ptUserId,
      ...SAMPLE_PT_SERVICE
    })

    const inserted = await ptServices.insertOne(service)
    ptServiceId = inserted.insertedId
  }

  return {
    foodId: food._id as ObjectId,
    food,
    ptServiceId: ptServiceId as ObjectId
  }
}

async function seedCart() {
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db(dbname)

    const customerId = await ensureCustomer(db)
    const { foodId, food, ptServiceId } = await ensureFoodAndPTService(db)

    const carts = db.collection<Cart>(cartsCollectionNameSafe)
    const cart = new Cart({
      userId: customerId,
      items: [
        {
          itemId: foodId,
          quantity: 2,
          priceAtOrder: Number(food.price || 0)
        }
      ]
    })

    await carts.updateOne(
      { userId: customerId },
      {
        $set: {
          userId: customerId,
          items: cart.items,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    )

    console.log('✅ Seed cart completed successfully')
    console.log(`👤 Customer email: ${CUSTOMER_EMAIL}`)
    console.log(`🍽️ Food item seeded from: ${food.name}`)
    console.log(`🏋️ PT service seeded with id: ${ptServiceId.toString()}`)
    console.log('🛒 Cart items: Food x2 + PTService x1')
    console.log(`🔐 Customer password: ${CUSTOMER_PASSWORD}`)
  } catch (error) {
    console.error('❌ Error seeding cart:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('🔌 Database connection closed')
  }
}

seedCart()
