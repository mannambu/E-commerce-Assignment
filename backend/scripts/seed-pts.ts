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

const usersCollectionNameEnv = process.env.DB_USERS_COLLECTION
if (!usersCollectionNameEnv) {
  throw new Error('Missing DB_USERS_COLLECTION in the .env file')
}
const usersCollectionName = usersCollectionNameEnv

const uri = `mongodb+srv://${username}:${password}@studymongodbbasic.nvb8bql.mongodb.net/?appName=StudyMongoDBBasic`

const DEFAULT_PT_PASSWORD = 'Pt123456'

const SAMPLE_PTS = [
  {
    email: 'pt.leanfit@ecommerce.local',
    username: 'pt_leanfit',
    phone: '0900000001',
    ptProfile: {
      experienceYears: 4,
      specialties: ['lose fat', 'fat loss', 'cardio', 'nutrition coaching'],
      rating: 4.7,
      portfolioImages: ['pt-leanfit-1.jpg'],
      approvedByAdmin: true
    }
  },
  {
    email: 'pt.cutpro@ecommerce.local',
    username: 'pt_cutpro',
    phone: '0900000002',
    ptProfile: {
      experienceYears: 6,
      specialties: ['weight loss', 'đốt mỡ', 'HIIT', 'strength endurance'],
      rating: 4.8,
      portfolioImages: ['pt-cutpro-1.jpg'],
      approvedByAdmin: true
    }
  },
  {
    email: 'pt.bulkup@ecommerce.local',
    username: 'pt_bulkup',
    phone: '0900000003',
    ptProfile: {
      experienceYears: 5,
      specialties: ['gain muscle', 'hypertrophy', 'strength', 'progressive overload'],
      rating: 4.9,
      portfolioImages: ['pt-bulkup-1.jpg'],
      approvedByAdmin: true
    }
  },
  {
    email: 'pt.vietmuscle@ecommerce.local',
    username: 'pt_vietmuscle',
    phone: '0900000004',
    ptProfile: {
      experienceYears: 7,
      specialties: ['tăng cơ', 'sức mạnh', 'body recomposition', 'compound lifts'],
      rating: 4.85,
      portfolioImages: ['pt-vietmuscle-1.jpg'],
      approvedByAdmin: true
    }
  },
  {
    email: 'pt.balancecoach@ecommerce.local',
    username: 'pt_balancecoach',
    phone: '0900000005',
    ptProfile: {
      experienceYears: 3,
      specialties: ['maintain', 'wellness', 'mobility', 'general fitness'],
      rating: 4.6,
      portfolioImages: ['pt-balancecoach-1.jpg'],
      approvedByAdmin: true
    }
  },
  {
    email: 'pt.fit360@ecommerce.local',
    username: 'pt_fit360',
    phone: '0900000006',
    ptProfile: {
      experienceYears: 8,
      specialties: ['fitness tổng quát', 'sức khỏe', 'functional training', 'lifestyle coaching'],
      rating: 4.75,
      portfolioImages: ['pt-fit360-1.jpg'],
      approvedByAdmin: true
    }
  }
]

async function runSeed() {
  const client = new MongoClient(uri)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db(dbname)
    const usersCollection = db.collection(usersCollectionName)

    let upsertedCount = 0
    let modifiedCount = 0

    for (const item of SAMPLE_PTS) {
      const user = new User({
        email: item.email.toLowerCase(),
        username: item.username,
        password: hashPassword(DEFAULT_PT_PASSWORD),
        phone: item.phone,
        role: UserRole.PT,
        account_status: AccountStatus.ACTIVE,
        loginAttempts: 0,
        forgot_password_token: '',
        ptProfile: item.ptProfile,
        notifications: [],
        weightTracking: [],
        calorieTracking: []
      })

      const result = await usersCollection.updateOne(
        { email: user.email },
        {
          $set: {
            username: user.username,
            password: user.password,
            phone: user.phone,
            role: user.role,
            account_status: user.account_status,
            loginAttempts: user.loginAttempts,
            forgot_password_token: user.forgot_password_token,
            ptProfile: user.ptProfile,
            notifications: user.notifications,
            weightTracking: user.weightTracking,
            calorieTracking: user.calorieTracking,
            updated_at: new Date()
          },
          $setOnInsert: {
            created_at: new Date()
          }
        },
        { upsert: true }
      )

      upsertedCount += result.upsertedCount
      modifiedCount += result.modifiedCount
    }

    console.log(`✅ PT seed completed. upserted=${upsertedCount}, updated=${modifiedCount}`)
    console.log(`🔐 Default password for seeded PT accounts: ${DEFAULT_PT_PASSWORD}`)
  } catch (error) {
    console.error('❌ Error seeding PT users:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('🔌 Database connection closed')
  }
}

runSeed()
