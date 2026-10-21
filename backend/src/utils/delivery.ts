import Order, { DeliveryPeriod } from '~/models/schemas/Order.schema'
import { ErrorWithStatus } from '~/models/Errors'
import { toLocalDate } from '~/models/schemas/common'
import { CommerceRules } from '~/services/settings.services'

export function parseDeliveryStart(value: string, time?: string): Date {
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      toLocalDate(value) // Kiểm tra ngày có thật, ví dụ loại 30/02.
      const localTime = time ?? '12:00'
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) throw new Error('Giờ không hợp lệ')
      return new Date(`${value}T${localTime}:00+07:00`)
    }
    if (
      time !== undefined ||
      !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)
    ) {
      throw new Error('Timestamp cần có múi giờ; không gửi thêm deliveryTime')
    }
    toLocalDate(value.slice(0, 10))
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new Error('Ngày không hợp lệ')
    return date
  } catch {
    throw new ErrorWithStatus({
      message: 'Dùng deliveryDate YYYY-MM-DD và deliveryTime HH:mm, hoặc timestamp có múi giờ',
      status: 400
    })
  }
}

export function getKitchenCutoff(scheduledAt: Date, rules: CommerceRules): Date {
  const cutoff = new Date(`${toLocalDate(scheduledAt)}T${rules.kitchenCutoffTime}:00+07:00`)
  cutoff.setUTCDate(cutoff.getUTCDate() - rules.kitchenCutoffDaysBefore)
  if (Number.isNaN(cutoff.getTime()) || cutoff >= scheduledAt) {
    throw new ErrorWithStatus({ message: 'Giờ giao phải sau giờ chốt bếp, hãy chọn lại giờ giao', status: 400 })
  }
  return cutoff
}

export function validEvidenceUrls(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 10 &&
    value.every((entry) => {
      if (typeof entry !== 'string' || entry.length > 2048) return false
      try {
        const url = new URL(entry)
        return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
      } catch {
        return false
      }
    })
  )
}

// Each COD delivery collects its own charge, never another day's shortage or surplus.
export function deliveryCodExpected(order: Order, day: DeliveryPeriod): number {
  return order.payment.method === 'COD'
    ? Math.max(0, day.subtotal + day.shipping.totalFee - (day.cancellation?.creditedAmount || 0))
    : 0
}
