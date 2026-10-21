export const roles = ['Customer', 'Manager', 'Kitchen Staff', 'Delivery Staff', 'Admin'] as const;
export type AccountRole = typeof roles[number];
export const roleLabels: Record<AccountRole, string> = {
  Customer: 'Khách hàng', Manager: 'Quản lý vận hành', 'Kitchen Staff': 'Nhân viên bếp',
  'Delivery Staff': 'Nhân viên giao hàng', Admin: 'Quản trị viên'
};
export const orderStatuses = ['Pending', 'Confirmed', 'Cooking', 'Ready', 'Delivering', 'Completed', 'Failed', 'Cancelled', 'Rejected'] as const;
export type OrderStatus = typeof orderStatuses[number];
export const statusLabels: Record<OrderStatus, string> = {
  Pending: 'Chờ xác nhận', Confirmed: 'Đã xác nhận', Cooking: 'Đang chế biến', Ready: 'Sẵn sàng giao',
  Delivering: 'Đang giao', Completed: 'Hoàn tất', Failed: 'Giao thất bại', Cancelled: 'Đã hủy', Rejected: 'Đã từ chối'
};
export const paymentLabels: Record<string, string> = {
  Pending: 'Chờ thanh toán', Paid: 'Đã thanh toán', Failed: 'Thất bại',
  PartiallyRefunded: 'Đã hoàn một phần', Refunded: 'Đã hoàn tiền'
};
export const money = (value?: number) => `${Number(value ?? 0).toLocaleString('vi-VN')} đ`;
export const dateTime = (value?: string) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
export const localDate = (value: string) => value.split('-').reverse().join('/');
export const csv = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);
export function apiError(error: unknown): string {
  const data = (error as { response?: { data?: { message?: string; errors?: Record<string, { msg?: string; }>; }; }; })?.response?.data;
  const fields = data?.errors ? Object.values(data.errors).map(field => field.msg).filter(Boolean) : [];
  return fields.length ? fields.join(' · ') : data?.message || (error instanceof Error ? error.message : 'Không thể thực hiện. Vui lòng thử lại.');
}
export function nextDeliveryStatus(status: string): OrderStatus | undefined {
  return ({ Confirmed: 'Cooking', Cooking: 'Ready', Ready: 'Delivering', Delivering: 'Completed' } as Record<string, OrderStatus>)[status];
}
export function validatePassword(password: string, confirmation: string): string | null {
  if (password.length < 8 || password.length > 50 || new TextEncoder().encode(password).length > 72) return 'Mật khẩu từ 8–50 ký tự, tối đa 72 byte UTF-8.';
  if (password !== confirmation) return 'Mật khẩu xác nhận không khớp.';
  return null;
}
export type DashboardStats = {
  users: { customers: number; }; products: { foods: number; };
  orders: { total: number; byStatus: Partial<Record<OrderStatus, number>>; };
};
export type Delivery = {
  _id: string; date: string; status: OrderStatus; cutoffAt?: string; canCancel?: boolean;
  subtotal: number; shipping: { totalFee: number; }; waivedShippingFee?: number; refundedAmount?: number;
  kitchenStaffIds?: string[]; assignedShipperId?: string;
  items: { _id: string; foodId: string; foodName: string; quantity: number; price: number; calories: number; mealSlot?: string; }[];
  statusHistory?: { status: OrderStatus; changedAt: string; reason?: string; }[];
  deliveryResult?: { reason?: string; codCollectedAmount?: number; codExpectedAmount?: number; codDifference?: number; evidenceUrls?: string[]; };
  cancellation?: { reason: string; refundAmount?: number; creditedAmount?: number; };
};
export type AdminOrder = {
  _id: string; orderCode: string; userId: string; status: OrderStatus; version: number;
  packageType: 'ONE_DAY' | 'WEEKLY_7D'; createdAt: string; deliveryAddress: string; note?: string;
  subtotal: number; shippingFee: number; grandTotal: number; deliveries: Delivery[];
  payment: { method: string; status: string; paidAmount?: number; refundedAmount?: number; };
  inventoryHold?: { status: 'NotReserved' | 'Held' | 'Committed' | 'Released'; };
  amounts?: { payableTotal: number; paidAmount: number; refundedAmount: number; pendingRefundAmount: number; amountDue: number; };
};
