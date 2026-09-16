import { config } from 'dotenv'
import { createHash } from 'crypto'

config()

export const hashPassword = (password: string) => {
  const pepper = process.env.PASSWORD_PEPPER || ''
  return createHash('sha256').update(`${password}${pepper}`).digest('hex')
}
  