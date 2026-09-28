/** Calendar dates use YYYY-MM-DD in BUSINESS_TIME_ZONE; instants use BSON Date (UTC). */
export type LocalDate = string
export const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh'
export const STOCK_HOLD_MINUTES = 10
export const PAYMENT_TIMEOUT_MINUTES = 15
export type MealSlot = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
export type Currency = 'VND'

/** Money is stored as integer VND; nutrition is per serving, in grams. */
export interface NutritionSnapshot {
  protein: number
  carb: number
  fat: number
}

/** Ngày lịch thuần túy giữ nguyên; timestamp được đổi sang ngày tại Việt Nam. */
export function toLocalDate(value: string | Date): LocalDate {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`)
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return value
    throw new Error('Ngày không hợp lệ')
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Ngày không hợp lệ')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}-${parts.find((part) => part.type === 'day')!.value}`
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}
