import { readFile } from 'node:fs/promises'
import { MongoClient } from 'mongodb'
import { getDatabaseConfig } from '../src/utils/database-config'
import { applyReviewMigration, inspectReviewMigration, ReviewMigrationError } from '../src/migrations/review-deliveries'

async function main() {
  const args = process.argv.slice(2)
  const mappingArg = args.find((arg) => arg.startsWith('--mapping='))
  if (args.some((arg) => !['--apply', '--offline'].includes(arg) && arg !== mappingArg))
    throw new ReviewMigrationError('Usage: npm run reviews:migrate -- [--mapping=path.json] [--apply --offline]')
  if (args.includes('--apply') && !args.includes('--offline'))
    throw new ReviewMigrationError(
      'Stop all application/job writers and back up the database, then pass --apply --offline'
    )
  const mapping = mappingArg ? JSON.parse(await readFile(mappingArg.slice('--mapping='.length), 'utf8')) : {}
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping))
    throw new ReviewMigrationError('Mapping must be a JSON object: { "reviewId": "deliveryId" }')
  const { uri, dbName } = getDatabaseConfig()
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db(dbName)
    const preview = await inspectReviewMigration(db, mapping)
    console.log(JSON.stringify(preview, null, 2))
    if (preview.issues.length) {
      process.exitCode = 1
      console.log('Blocked. No data or indexes were changed.')
    } else if (args.includes('--apply')) {
      console.log(JSON.stringify(await applyReviewMigration(client, db, mapping), null, 2))
    } else {
      console.log('Read-only preview. No data or indexes were changed.')
    }
  } finally {
    await client.close()
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof ReviewMigrationError
      ? error.message
      : 'Review migration failed; check configuration and permissions. Preview again before retrying.'
  )
  process.exitCode = 1
})
