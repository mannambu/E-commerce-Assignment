import { seedStaff } from './seed-staff'
import { UserRole } from '../src/models/schemas/User.schema'

seedStaff(UserRole.ADMIN).catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
