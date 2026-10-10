import { ClientSession, ObjectId } from 'mongodb'
import { ErrorWithStatus } from '~/models/Errors'
import Settings from '~/models/schemas/Settings.schema'
import { UserRole } from '~/models/schemas/User.schema'
import database from './database.services'

export type CommerceRules = Pick<Settings, 'kitchenCutoffTime' | 'kitchenCutoffDaysBefore' | 'cancellationPolicy'>

export const DEFAULT_COMMERCE_RULES: CommerceRules = {
  kitchenCutoffTime: '20:00',
  kitchenCutoffDaysBefore: 1,
  cancellationPolicy: {
    description:
      'Đổi/hủy trước giờ chốt bếp. Hoàn 100% tiền món và phí giao đã thu của ngày hủy; các ngày còn lại giữ ưu đãi ship.',
    refundBeforeCutoffPercent: 100,
    refundAfterCutoffPercent: 0,
    refundShippingFee: true
  }
}

class SettingsService {
  async getCommerceRules(session?: ClientSession): Promise<CommerceRules> {
    const settings = await database.settings.findOne({ _id: 'commerce' }, { session })
    const rules = settings || DEFAULT_COMMERCE_RULES
    return {
      kitchenCutoffTime: rules.kitchenCutoffTime,
      kitchenCutoffDaysBefore: rules.kitchenCutoffDaysBefore,
      cancellationPolicy: { ...rules.cancellationPolicy }
    }
  }

  async updateCommerceRules(
    adminId: string,
    payload: Pick<CommerceRules, 'kitchenCutoffTime' | 'kitchenCutoffDaysBefore'>
  ) {
    return database.withTransaction(async (session) => {
      const admin = await database.users.findOne({ _id: new ObjectId(adminId), role: UserRole.ADMIN }, { session })
      if (!admin) throw new ErrorWithStatus({ message: 'Chỉ Admin được cấu hình giờ chốt bếp', status: 403 })
      const before = await database.settings.findOne({ _id: 'commerce' }, { session })
      // MVP cố định chính sách hoàn 100% trước giờ chốt; chưa thu phí hủy hay xử lý hủy muộn.
      const rules: CommerceRules = {
        kitchenCutoffTime: payload.kitchenCutoffTime,
        kitchenCutoffDaysBefore: payload.kitchenCutoffDaysBefore,
        cancellationPolicy: { ...DEFAULT_COMMERCE_RULES.cancellationPolicy }
      }
      await database.settings.updateOne(
        { _id: 'commerce' },
        {
          $set: { ...rules, updatedBy: admin._id, updatedAt: new Date() }
        },
        { upsert: true, session }
      )
      await database.auditLogs.insertOne(
        {
          actorId: admin._id,
          actorRole: UserRole.ADMIN,
          action: 'SettingsUpdated',
          entityType: 'Settings',
          entityId: 'commerce',
          before: before ? { ...before } : { ...DEFAULT_COMMERCE_RULES },
          after: { ...rules },
          reason: 'Cập nhật giờ chốt bếp cho các đơn mới',
          createdAt: new Date()
        },
        { session }
      )
      return rules
    })
  }
}

export default new SettingsService()
