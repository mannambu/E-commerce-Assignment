import { config } from 'dotenv'

config({ quiet: true })

// Backend, seed và script tạo index dùng chung cấu hình, không cố định cluster trong code.
export function getDatabaseConfig() {
  const uri = process.env.DB_URI?.trim()
  const dbName = process.env.DB_NAME?.trim()
  if (!uri || !dbName) throw new Error('Please set DB_URI and DB_NAME in backend/.env')
  return { uri, dbName }
}
