export const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Returns current date or specified date formatted as YYYY-MM-DD in Vietnam timezone (UTC+7).
 */
export function getVietnamLocalDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Returns date string YYYY-MM-DD in Vietnam timezone with a given day offset (e.g. +1 for tomorrow).
 */
export function getVietnamLocalDateWithOffset(offsetDays: number = 0, baseDate: Date = new Date()): string {
  const baseStr = getVietnamLocalDate(baseDate);
  const [year, month, day] = baseStr.split('-').map(Number);
  const offsetDate = new Date(Date.UTC(year, month - 1, day + offsetDays, 12, 0, 0));
  return getVietnamLocalDate(offsetDate);
}
