import { MongoClient } from 'mongodb'
import { getDatabaseConfig } from '../src/utils/database-config'
import { seedSettings } from './seed-settings'
import { seedStaff } from './seed-staff'
import { UserRole } from '../src/models/schemas/User.schema'
import { seedTracking } from './seed-tracking'
import { seedOrdersTransactions } from './seed-orders-transactions'
import { seedMealPlans } from './seed-meal-plans'
import { seedNotifications } from './seed-notifications'
import { config } from 'dotenv'

config()

async function printSummary() {
  const { uri, dbName } = getDatabaseConfig()
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db(dbName)
    const collections = await db.listCollections().toArray()

    console.log('\n==================================================')
    console.log(`DATABASE POPULATION SUMMARY (${dbName})`)
    console.log('==================================================')
    for (const c of collections.sort((a, b) => a.name.localeCompare(b.name))) {
      const count = await db.collection(c.name).countDocuments()
      console.log(`  ${c.name.padEnd(24)} : ${count} documents`)
    }
    console.log('==================================================\n')
  } finally {
    await client.close()
  }
}

async function runMasterSeed() {
  console.log('[Master Seed] Starting full database seeding...\n')

  try {
    console.log('--- Seeding Settings ---')
    await seedSettings()

    console.log('\n--- Seeding Staff Accounts ---')
    try {
      await seedStaff(UserRole.ADMIN)
    } catch (e: any) {
      console.log(`Admin: ${e.message}`)
    }
    try {
      await seedStaff(UserRole.MANAGER)
    } catch (e: any) {
      console.log(`Manager: ${e.message}`)
    }

    console.log('\n--- Seeding Health Profile & Daily Logs ---')
    await seedTracking()

    console.log('\n--- Seeding 7-Day Meal Plans ---')
    await seedMealPlans()

    console.log('\n--- Seeding Orders, Transactions & Reviews ---')
    await seedOrdersTransactions()

    console.log('\n--- Seeding User Notifications ---')
    await seedNotifications()

    await printSummary()
    console.log('[Master Seed] All seed tasks completed successfully!')
  } catch (error) {
    console.error('[Master Seed] Seeding failed with error:', error)
    process.exitCode = 1
  }
}

runMasterSeed()
