import { getDatabaseConfig } from '../src/utils/database-config'
import { config } from 'dotenv'
import { MongoClient, ObjectId } from 'mongodb'
import { hashPassword } from '../src/utils/crypto'
import User, { AccountStatus, HealthProfile, UserRole } from '../src/models/schemas/User.schema'
import { calculateHealthMetrics } from '../src/utils/health'

config()

const { uri, dbName } = getDatabaseConfig()
const usersCollectionName = process.env.DB_USERS_COLLECTION || 'users'

const TEST_EMAIL = 'phuc.nguyen28102005p@hcmut.edu.vn'
const TEST_USERNAME = 'Huy Phúc'
const TEST_PASSWORD = '123456Phuc!'

export async function seedCustomer() {
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db(dbName)
    const users = db.collection(usersCollectionName)

    const normalizedEmail = TEST_EMAIL.trim().toLowerCase()
    const passwordHash = await hashPassword(TEST_PASSWORD)

    const healthInput = {
      gender: 'Male' as const,
      age: 21,
      heightCm: 175,
      weightKg: 68,
      activityLevel: 'Moderate' as const,
      goal: 'MaintainWeight' as const
    }
    const metrics = calculateHealthMetrics(healthInput)

    const healthProfile: HealthProfile = {
      ...healthInput,
      allergies: [],
      dietaryRestrictions: [],
      targetWeightKg: 68,
      ...metrics,
      version: 1,
      calculatedAt: new Date()
    }

    const defaultAddress = {
      _id: new ObjectId().toString(),
      name: 'Huy Phúc',
      phone: '0901234567',
      address: '268 Lý Thường Kiệt, Phường 14, Quận 10, TP. Hồ Chí Minh',
      isDefault: true
    }

    const existingUser = await users.findOne({
      $or: [{ email: normalizedEmail }, { username: TEST_USERNAME }]
    })

    if (existingUser) {
      await users.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            email: normalizedEmail,
            username: TEST_USERNAME,
            password: passwordHash,
            phone: '0901234567',
            role: UserRole.CUSTOMER,
            account_status: AccountStatus.ACTIVE,
            loginAttempts: 0,
            tokenVersion: existingUser.tokenVersion ?? 0,
            healthProfile: healthProfile,
            addresses: existingUser.addresses && existingUser.addresses.length > 0 ? existingUser.addresses : [defaultAddress],
            updated_at: new Date()
          },
          $unset: {
            locked_until: '',
            forgot_password_token: '',
            forgot_password_expires_at: '',
            forgot_password_requested_at: ''
          }
        }
      )
      console.log(`Updated test customer [${normalizedEmail}] / [${TEST_USERNAME}] in database ${dbName}`)
    } else {
      const newUser = new User({
        email: normalizedEmail,
        username: TEST_USERNAME,
        password: passwordHash,
        phone: '0901234567',
        role: UserRole.CUSTOMER,
        account_status: AccountStatus.ACTIVE,
        loginAttempts: 0,
        forgot_password_token: '',
        healthProfile: healthProfile
      })
      const userDoc = {
        ...newUser,
        addresses: [defaultAddress]
      }
      await users.insertOne(userDoc)
      console.log(`Created test customer [${normalizedEmail}] / [${TEST_USERNAME}] in database ${dbName}`)
    }
  } finally {
    await client.close()
  }
}

if (process.argv[1]?.includes('seed-customer')) {
  seedCustomer()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed error:', err)
      process.exit(1)
    })
}
