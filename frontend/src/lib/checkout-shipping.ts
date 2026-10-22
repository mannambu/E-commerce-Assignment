const deliveryTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function deliveryScheduleError(date: string, time: string, now = Date.now()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Vui lòng chọn ngày giao hàng hợp lệ.';
  const calendarDate = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== date) return 'Ngày giao hàng không hợp lệ.';
  if (!deliveryTimePattern.test(time)) return 'Vui lòng chọn giờ giao hàng hợp lệ (HH:mm).';
  if (new Date(`${date}T${time}:00+07:00`).getTime() <= now) return 'Giờ giao đã qua. Vui lòng chọn ngày hoặc giờ muộn hơn theo giờ Việt Nam.';
  return null;
}

// Both quote and create let the backend geocode and route from its configured store.
export function checkoutDeliveryPayload(input: {
  address: string; deliveryDate: string; deliveryTime: string; cartType: 'FOOD' | 'COMBO'; paymentMethod: 'COD' | 'VNPay' | 'MoMo';
}) {
  if (!deliveryTimePattern.test(input.deliveryTime)) throw new Error('Vui lòng chọn giờ giao hàng hợp lệ (HH:mm).');
  return {
    deliveryAddress: input.address.trim(),
    deliveryDate: input.deliveryDate,
    deliveryTime: input.deliveryTime,
    packageType: input.cartType === 'COMBO' ? 'WEEKLY_7D' : 'ONE_DAY',
    cartType: input.cartType,
    paymentMethod: input.paymentMethod
  };
}

export function readShippingQuote(result: {
  cart?: { version?: number };
  pricing?: { subtotal?: number; shippingFee?: number; grandTotal?: number; shippingBreakdowns?: { distanceKm?: number }[] };
}) {
  const { subtotal, shippingFee, grandTotal, shippingBreakdowns } = result?.pricing || {};
  const version = result?.cart?.version;
  const distanceKm = shippingBreakdowns?.[0]?.distanceKm;
  if (!Number.isSafeInteger(version) || version! < 0 ||
    [subtotal, shippingFee, grandTotal, distanceKm].some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new Error('Chưa nhận được báo giá vận chuyển hợp lệ. Vui lòng tính lại phí.');
  }
  return { subtotal: subtotal!, shippingFee: shippingFee!, grandTotal: grandTotal!, version: version!, distanceKm: distanceKm! };
}
