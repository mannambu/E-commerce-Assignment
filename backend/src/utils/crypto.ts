import { config } from 'dotenv'
import { createHash, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'

config()

export function validatePassword(password: string) {
  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 50 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new Error('Mật khẩu cần 8–50 ký tự, tối đa 72 byte UTF-8')
  }
}

export async function hashPassword(password: string) {
  validatePassword(password)
  return bcrypt.hash(password, 12)
}

export function isLegacyPassword(hash: string) {
  return /^[a-f0-9]{64}$/i.test(hash)
}

export async function verifyPassword(password: string, hash: string) {
  if (isLegacyPassword(hash)) {
    // Hỗ trợ tài khoản SHA-256 đã import, nâng cấp sang Bcrypt khi đăng nhập.
    const oldHash = createHash('sha256')
      .update(password + (process.env.PASSWORD_PEPPER || ''))
      .digest()
    return timingSafeEqual(oldHash, Buffer.from(hash, 'hex'))
  }
  if (Buffer.byteLength(password, 'utf8') > 72) return false
  return bcrypt.compare(password, hash)
}

// Token ngẫu nhiên có entropy cao; DB chỉ lưu hash thay vì token dùng được.
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
