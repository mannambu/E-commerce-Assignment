import { config } from 'dotenv'
import { Collection, MongoClient, ObjectId } from 'mongodb'
import { hashPassword } from '../src/utils/crypto'
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
const ptServicesCollectionName = process.env.DB_PT_SERVICES_COLLECTION

if (!usersCollectionName || !ptServicesCollectionName) {
  throw new Error('Missing DB_USERS_COLLECTION or DB_PT_SERVICES_COLLECTION in the .env file')
}

const usersCollectionNameSafe = usersCollectionName
const ptServicesCollectionNameSafe = ptServicesCollectionName

const uri = `mongodb+srv://${username}:${password}@studymongodbbasic.nvb8bql.mongodb.net/?appName=StudyMongoDBBasic`

const DEFAULT_PT_PASSWORD = 'Pt123456'

const SAMPLE_PT_USERS = [
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
  }
]

const SAMPLE_PT_SERVICES = [
  {
    ptUsername: 'pt_leanfit',
    title: 'Gói Giảm Mỡ 30 Ngày - LeanFit',
    description: 'Theo sát 1-1, tối ưu chế độ ăn và lịch cardio/kháng lực trong 30 ngày.',
    price: 1800000,
    sessions: 12,
    durationDays: 30,
    isActive: true
  },
  {
    ptUsername: 'pt_cutpro',
    title: 'Gói Đốt Mỡ Cấp Tốc 6 Tuần - CutPro',
    description: 'Lịch tập HIIT + gym cá nhân hóa, review form mỗi tuần.',
    price: 2400000,
    sessions: 18,
    durationDays: 42,
    isActive: true
  },
  {
    ptUsername: 'pt_bulkup',
    title: 'Gói Tăng Cơ Nền Tảng 8 Tuần - BulkUp',
    description: 'Lộ trình hypertrophy, progressive overload và theo dõi chỉ số hàng tuần.',
    price: 3200000,
    sessions: 24,
    durationDays: 56,
    isActive: true
  }
]

type PTUserSeed = (typeof SAMPLE_PT_USERS)[number]

async function ensurePTUser(usersCollection: Collection<User>, data: PTUserSeed): Promise<ObjectId> {
  const existing = await usersCollection.findOne({
    $or: [{ email: data.email.toLowerCase() }, { username: data.username }],
    role: UserRole.PT
  })

  if (existing?._id) {
    await usersCollection.updateOne(
      { _id: existing._id },
      {
        $set: {
          phone: data.phone,
          ptProfile: data.ptProfile,
          account_status: AccountStatus.ACTIVE,
          updated_at: new Date()
        }
      }
    )
    return existing._id as ObjectId
  }

  const newPT = new User({
    email: data.email.toLowerCase(),
    username: data.username,
    password: hashPassword(DEFAULT_PT_PASSWORD),
    phone: data.phone,
    role: UserRole.PT,
    account_status: AccountStatus.ACTIVE,
    loginAttempts: 0,
    forgot_password_token: '',
    ptProfile: data.ptProfile,
    notifications: [],
    weightTracking: [],
    calorieTracking: [],
    registeredPTServices: []
  })

  const inserted = await usersCollection.insertOne(newPT)
  return inserted.insertedId
}

async function runSeedPTServices() {
  const client = new MongoClient(uri)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db(dbname)
    const usersCollection = db.collection<User>(usersCollectionNameSafe)
    const ptServicesCollection = db.collection<PTService>(ptServicesCollectionNameSafe)

    const ptUserMap = new Map<string, ObjectId>()

    for (const ptUser of SAMPLE_PT_USERS) {
      const ptId = await ensurePTUser(usersCollection, ptUser)
      ptUserMap.set(ptUser.username, ptId)
    }

    let insertedCount = 0
    let modifiedCount = 0

    for (const serviceSeed of SAMPLE_PT_SERVICES) {
      const ptId = ptUserMap.get(serviceSeed.ptUsername)
      if (!ptId) continue

      const service = new PTService({
        ptId,
        title: serviceSeed.title,
        description: serviceSeed.description,
        price: serviceSeed.price,
        sessions: serviceSeed.sessions,
        durationDays: serviceSeed.durationDays,
        isActive: serviceSeed.isActive
      })

      const result = await ptServicesCollection.updateOne(
        { ptId, title: service.title },
        {
          $set: {
            description: service.description,
            price: service.price,
            sessions: service.sessions,
            durationDays: service.durationDays,
            isActive: service.isActive,
            updatedAt: new Date()
          },
          $setOnInsert: {
            ptId: service.ptId,
            title: service.title,
            createdAt: new Date()
          }
        },
        { upsert: true }
      )

      insertedCount += result.upsertedCount
      modifiedCount += result.modifiedCount
    }

    console.log(`✅ Seed PT services completed. inserted=${insertedCount}, updated=${modifiedCount}`)
    console.log(`🔐 Default password for seeded PT accounts: ${DEFAULT_PT_PASSWORD}`)
  } catch (error) {
    console.error('❌ Error seeding PT services:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('🔌 Database connection closed')
  }
}

runSeedPTServices()
