import { config } from 'dotenv'
import { MongoClient } from 'mongodb'
import { hashPassword } from '../src/utils/crypto'
import User, { AccountStatus, UserRole } from '../src/models/schemas/User.schema'

config()

const username = process.env.DB_USERNAME
const password = process.env.DB_PASSWORD
const dbname = process.env.DB_NAME

if (!username || !password) {
  throw new Error('Missing DB_USERNAME or DB_PASSWORD in the .env file')
}

const usersCollectionName = process.env.DB_USERS_COLLECTION
if (!usersCollectionName) {
  throw new Error('Missing DB_USERS_COLLECTION in the .env file')
}

const usersCollectionNameSafe = usersCollectionName

const uri = `mongodb+srv://${username}:${password}@studymongodbbasic.nvb8bql.mongodb.net/?appName=StudyMongoDBBasic`

const ADMIN_EMAIL = 'admin@ecommerce.local'
const ADMIN_USERNAME = 'admin_root'
const ADMIN_PHONE = '0900000000'
const ADMIN_PASSWORD = 'Admin123456'

async function runSeedAdmin() {
  const client = new MongoClient(uri)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db(dbname)
    const usersCollection = db.collection<User>(usersCollectionNameSafe)

    const admin = new User({
      email: ADMIN_EMAIL,
      username: ADMIN_USERNAME,
      password: hashPassword(ADMIN_PASSWORD),
      phone: ADMIN_PHONE,
      role: UserRole.ADMIN,
      account_status: AccountStatus.ACTIVE,
      loginAttempts: 0,
      forgot_password_token: '',
      notifications: [],
      weightTracking: [],
      calorieTracking: [],
      registeredPTServices: []
    })

    const result = await usersCollection.updateOne(
      { email: ADMIN_EMAIL.toLowerCase() },
      {
        $set: {
          username: admin.username,
          password: admin.password,
          phone: admin.phone,
          role: admin.role,
          account_status: admin.account_status,
          loginAttempts: admin.loginAttempts,
          forgot_password_token: admin.forgot_password_token,
          notifications: admin.notifications,
          weightTracking: admin.weightTracking,
          calorieTracking: admin.calorieTracking,
          registeredPTServices: admin.registeredPTServices,
          updated_at: new Date()
        },
        $setOnInsert: {
          created_at: new Date()
        }
      },
      { upsert: true }
    )

    if (result.upsertedCount > 0) {
      console.log('✅ Created new Admin user successfully')
    } else {
      console.log('✅ Admin user already existed, updated latest profile/password')
    }

    console.log(`📧 Admin email: ${ADMIN_EMAIL}`)
    console.log(`👤 Admin username: ${ADMIN_USERNAME}`)
    console.log(`🔐 Admin password: ${ADMIN_PASSWORD}`)
  } catch (error) {
    console.error('❌ Error seeding admin user:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('🔌 Database connection closed')
  }
}

runSeedAdmin()
