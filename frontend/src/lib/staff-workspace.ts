import { getVietnamLocalDate } from './date.ts';

export type StaffRole = 'Kitchen Staff' | 'Delivery Staff';
export type StaffStatus = 'Cooking' | 'Ready' | 'Delivering' | 'Completed' | 'Failed';
export type StaffTask = {
  orderId: string; orderCode: string; deliveryId: string; date: string; status: string;
  packageType: string; version: number;
  items: { name: string; quantity: number; mealSlot?: string }[];
  deliveryAddress?: string; paymentMethod?: string; codExpectedAmount?: number;
  deliveryResult?: { reason?: string; evidenceUrls?: string[]; codCollectedAmount?: number; codDifference?: number };
};

export function staffActions(role: StaffRole, task: StaffTask, now = new Date()): StaffStatus[] {
  if (task.date > getVietnamLocalDate(now)) return [];
  if (role === 'Kitchen Staff') return task.status === 'Confirmed' ? ['Cooking'] : task.status === 'Cooking' ? ['Ready'] : [];
  return task.status === 'Ready' ? ['Delivering'] : task.status === 'Delivering' ? ['Completed', 'Failed'] : [];
}

export function staffUpdate(role: StaffRole, task: StaffTask, status: StaffStatus, form: { amount: string; reason: string; evidence: string }, now = new Date()) {
  if (!staffActions(role, task, now).includes(status)) throw new Error('Thao tác không phù hợp với trạng thái hoặc ngày giao. Hãy tải lại danh sách.');
  const body: { status: StaffStatus; version: number; codCollectedAmount?: number; reason?: string; evidenceUrls?: string[] } = { status, version: task.version };
  if (status === 'Completed' && task.paymentMethod === 'COD') {
    const amount = Number(form.amount);
    if (!form.amount.trim() || !Number.isSafeInteger(amount) || amount < 0) throw new Error('Nhập số tiền thực thu nguyên VND, không âm.');
    body.codCollectedAmount = amount;
  }
  if (status === 'Failed') {
    const reason = form.reason.trim();
    if (!reason || reason.length > 500) throw new Error('Lý do giao thất bại phải từ 1 đến 500 ký tự.');
    const urls = form.evidence.split('\n').map(value => value.trim()).filter(Boolean);
    if (urls.length > 10 || urls.some(value => {
      try { const url = new URL(value); return value.length > 2048 || url.protocol !== 'https:' || !!url.username || !!url.password; }
      catch { return true; }
    })) throw new Error('Minh chứng gồm tối đa 10 URL HTTPS, mỗi URL tối đa 2048 ký tự và không chứa thông tin đăng nhập.');
    body.reason = reason;
    body.evidenceUrls = urls;
  }
  return { path: `/orders/${task.orderId}/deliveries/${task.deliveryId}/${role === 'Kitchen Staff' ? 'kitchen-status' : 'shipper-status'}`, body };
}
