import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { BSON, ObjectId } from 'mongodb'
import { hashPassword } from '../src/utils/crypto'
import User, { AccountStatus, UserRole } from '../src/models/schemas/User.schema'

async function generate() {
  const accounts = [
    {
      id: '66f100000000000000000001',
      email: 'admin@fitbite.test',
      username: 'admin_demo',
      password: 'Admin123456!',
      role: UserRole.ADMIN
    },
    {
      id: '66f100000000000000000002',
      email: 'manager@fitbite.test',
      username: 'manager_demo',
      password: 'Manager123456!',
      role: UserRole.MANAGER
    },
    {
      id: '66f100000000000000000003',
      email: 'customer@fitbite.test',
      username: 'customer_demo',
      password: 'Customer123456!',
      role: UserRole.CUSTOMER
    },
    {
      id: '66f100000000000000000004',
      email: 'locked@fitbite.test',
      username: 'customer_locked',
      password: 'Customer123456!',
      role: UserRole.CUSTOMER
    }
  ]
  const users = await Promise.all(
    accounts.map(
      async (account) =>
        new User({
          _id: new ObjectId(account.id),
          email: account.email,
          username: account.username,
          password: await hashPassword(account.password),
          role: account.role,
          account_status: account.username === 'customer_locked' ? AccountStatus.LOCKED : AccountStatus.ACTIVE
        })
    )
  )
  const file = resolve('data/import/users.json')
  await mkdir(resolve('data/import'), { recursive: true })
  const documents = users.map((user) =>
    Object.fromEntries(Object.entries(user).filter(([, value]) => value !== undefined))
  )
  await writeFile(file, BSON.EJSON.stringify(documents, undefined, 2) + '\n')
  console.log(`Created ${users.length} development accounts: ${file}. No database connection was made.`)
}

generate().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
