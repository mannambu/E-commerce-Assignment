import { MongoClient } from 'mongodb'
import { getDatabaseConfig } from '../src/utils/database-config'
import { hashPassword } from '../src/utils/crypto'
import User, { UserRole } from '../src/models/schemas/User.schema'

export async function seedStaff(role: UserRole.ADMIN | UserRole.MANAGER) {
  const { uri, dbName } = getDatabaseConfig()
  const prefix = role.toUpperCase()
  const email = process.env[`SEED_${prefix}_EMAIL`]?.trim().toLowerCase()
  const username = process.env[`SEED_${prefix}_USERNAME`]?.trim()
  const password = process.env[`SEED_${prefix}_PASSWORD`]
  if (!email || !username || !password)
    throw new Error(`Set SEED_${prefix}_EMAIL, SEED_${prefix}_USERNAME and SEED_${prefix}_PASSWORD`)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || username.length < 3 || username.length > 30) {
    throw new Error('Invalid seed email or username (3–30 characters)')
  }
  const passwordHash = await hashPassword(password)
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db(dbName)
    const users = db.collection<User>(process.env.DB_USERS_COLLECTION || 'users')
    const existing = await users.findOne({ $or: [{ email }, { username }] })
    if (existing) {
      if (existing.email !== email || existing.username !== username || existing.role !== role) {
        throw new Error('Email/username belongs to another account. Seed will not change its role.')
      }
      console.log(`${role} already exists in ${dbName}; password and status were kept.`)
      return
    }
    const session = client.startSession()
    try {
      await session.withTransaction(async () => {
        const user = new User({ email, username, password: passwordHash, role })
        const result = await users.insertOne(user, { session })
        await db.collection(process.env.DB_AUDIT_LOGS_COLLECTION || 'audit_logs').insertOne(
          {
            actorRole: 'System',
            action: 'UserCreated',
            entityType: 'User',
            entityId: result.insertedId,
            after: { email, role },
            reason: 'Initial staff seed',
            createdAt: new Date()
          },
          { session }
        )
      })
    } finally {
      await session.endSession()
    }
    console.log(`Created ${role}: ${email} in ${dbName}`)
  } finally {
    await client.close()
  }
}
