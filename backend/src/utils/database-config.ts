import { config } from 'dotenv'
import dns from 'dns'

config({ quiet: true })

try {
  dns.setServers(['8.8.8.8', '1.1.1.1'])
} catch {
  // Bỏ qua nếu môi trường không hỗ trợ thay đổi DNS
}

// Backend, seed và script tạo index dùng chung cấu hình, không cố định cluster trong code.
export function getDatabaseConfig() {
  const uri = process.env.DB_URI?.trim()
  const dbName = process.env.DB_NAME?.trim()
  if (!uri || !dbName) throw new Error('Please set DB_URI and DB_NAME in backend/.env')
  return { uri, dbName }
}
