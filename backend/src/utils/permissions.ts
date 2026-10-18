import { ErrorWithStatus } from '~/models/Errors'
import { UserRole } from '~/models/schemas/User.schema'

// Admin is not a daily operator. Existing mutations require an explicit reason.
export function adminExceptionReason(role: UserRole, reason?: string) {
  if (role !== UserRole.ADMIN) return undefined
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
    throw new ErrorWithStatus({
      status: 403,
      message: 'Admin chỉ can thiệp ngoại lệ; cần exceptionReason từ 1 đến 500 ký tự'
    })
  }
  return reason.trim()
}
