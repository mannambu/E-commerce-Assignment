import { nextDeliveryStatus, type AdminOrder, type Delivery } from './admin.ts';

export type CancellationPreview = {
  orderId: string; deliveryId: string; version: number; cutoffAt: string;
  foodCredit: number; shippingCredit: number; creditedAmount: number;
  refundAmount: number; remainingPayable: number;
};

export function weeklyStatusBlockReason(order: AdminOrder, delivery: Delivery, now = new Date()): string | null {
  if (order.packageType !== 'WEEKLY_7D' || ['Completed', 'Cancelled', 'Rejected'].includes(order.status) || !nextDeliveryStatus(delivery.status)) {
    return 'Trạng thái hiện tại không cho phép chuyển tiếp.';
  }
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  if (delivery.date > today) return 'Chưa tới ngày giao theo giờ Việt Nam.';
  if (order.inventoryHold?.status !== 'Committed') return 'Đơn chưa chốt kho, chưa thể chế biến hoặc giao hàng.';
  if (delivery.status === 'Confirmed' && order.payment.method !== 'COD' && !['Paid', 'PartiallyRefunded'].includes(order.payment.status)) {
    return 'Đơn thanh toán online chưa được thanh toán.';
  }
  // The server additionally verifies the payment transaction's IPN source.
  return null;
}

export function cancellationPreviewError(order: AdminOrder, delivery: Delivery, preview: CancellationPreview | null, now = Date.now()): string | null {
  if (!preview) return 'Cần tải bản xem trước trước khi hủy ngày giao.';
  if (preview.orderId !== order._id || preview.deliveryId !== delivery._id || preview.version !== order.version) {
    return 'Bản xem trước không khớp đơn hoặc ngày giao hiện tại. Hãy tải lại chi tiết và chọn lại thao tác.';
  }
  if (!['Pending', 'Confirmed'].includes(order.status) || !['Pending', 'Confirmed'].includes(delivery.status) || !(new Date(preview.cutoffAt).getTime() > now)) {
    return 'Ngày giao không còn đủ điều kiện hủy hoặc đã qua giờ chốt bếp. Hãy tải lại chi tiết.';
  }
  return null;
}
