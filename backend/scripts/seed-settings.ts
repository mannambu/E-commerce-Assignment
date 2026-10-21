import { MongoClient, ObjectId } from 'mongodb'
import { getDatabaseConfig } from '../src/utils/database-config'
import Settings from '../src/models/schemas/Settings.schema'
import { config } from 'dotenv'

config()

export async function seedSettings(): Promise<void> {
  const { uri, dbName } = getDatabaseConfig()
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db(dbName)
    const settingsCollection = db.collection<Settings>(process.env.DB_SETTINGS_COLLECTION || 'settings')
    const usersCollection = db.collection(process.env.DB_USERS_COLLECTION || 'users')

    const admin = await usersCollection.findOne({ role: 'Admin' })
    const adminId = (admin?._id as ObjectId) || new ObjectId()

    const defaultSettings: Settings = {
      _id: 'commerce',
      kitchenCutoffTime: '10:00',
      kitchenCutoffDaysBefore: 1,
      cancellationPolicy: {
        description: 'Hủy trước 10:00 sáng ngày trước giao hoàn 100%, sau giờ chốt hoàn 50%',
        refundBeforeCutoffPercent: 100,
        refundAfterCutoffPercent: 50,
        refundShippingFee: true
      },
      updatedBy: adminId,
      updatedAt: new Date()
    }

    await settingsCollection.updateOne(
      { _id: 'commerce' },
      { $setOnInsert: defaultSettings },
      { upsert: true }
    )

    console.log(`[Settings] Commerce configuration initialized in ${dbName}`)
  } finally {
    await client.close()
  }
}

if (process.argv[1]?.endsWith('seed-settings.ts')) {
  seedSettings().catch((err) => {
    console.error('[Settings] Error seeding settings:', err)
    process.exitCode = 1
  })
}
