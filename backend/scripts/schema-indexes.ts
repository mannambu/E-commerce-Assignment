import { MongoClient } from 'mongodb'
import { createSchemaIndexes, getSchemaIndexPlan } from '../src/models/schema-indexes'
import { getDatabaseConfig } from '../src/utils/database-config'

class SchemaSetupError extends Error {}

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--apply')) throw new SchemaSetupError('Usage: npm run schema:indexes -- [--apply]')

  const plan = getSchemaIndexPlan()
  if (!args.includes('--apply')) {
    console.log(JSON.stringify(plan, null, 2))
    console.log('Preview only. No database connection was opened. See docs/database_schema.md before applying.')
    return
  }

  // Dùng cùng database với backend và seed; chỉ kiểm tra cấu hình khi có --apply.
  const { uri, dbName } = getDatabaseConfig()

  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db(dbName)
    const collections = await db.listCollections({}, { nameOnly: true }).toArray()
    // Allow a rerun on an empty, partially initialized database; do not migrate existing application data.
    for (const collection of collections) {
      const expected = plan.find((entry) => entry.collection === collection.name)
      if (!expected || (await db.collection(collection.name).findOne({}, { projection: { _id: 1 } }))) {
        throw new SchemaSetupError(
          'Target must be empty and contain only schema-plan collections; existing data needs migration'
        )
      }
      const allowedNames = new Set(['_id_', ...expected.indexes.map((index) => index.name)])
      const indexes = await db.collection(collection.name).listIndexes().toArray()
      if (indexes.some((index) => !allowedNames.has(index.name))) {
        throw new SchemaSetupError('Legacy or unrecognized indexes found; use a new empty database')
      }
    }
    await createSchemaIndexes(db)
    console.log(`Created schema indexes in ${dbName}`)
  } finally {
    await client.close()
  }
}

main().catch((error: unknown) => {
  // Do not print connection strings/credentials embedded in MongoDB errors.
  console.error(
    error instanceof SchemaSetupError
      ? error.message
      : 'Database schema setup failed; check DB_URI, DB_NAME, permissions and the migration guide'
  )
  process.exitCode = 1
})
