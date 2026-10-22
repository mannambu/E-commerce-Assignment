import type { CurrentCart, CartLineItem } from '../context/CartContext.tsx';

/** GET/clear returns an envelope; other mutations return the current summary directly. */
export function normalizeCart(result: any): CurrentCart {
  const raw = result?.currentCart ?? result;
  if (!raw || !Array.isArray(raw.items) || !Number.isSafeInteger(raw.version) || !['FOOD', 'COMBO'].includes(raw.cartType)) {
    throw new Error('Dữ liệu giỏ hàng không hợp lệ. Vui lòng tải lại.');
  }
  const items: CartLineItem[] = raw.items.map((item: any) => {
    if (!item._id || !item.itemId) throw new Error('Dòng giỏ hàng thiếu mã. Vui lòng tải lại.');
    return {
      ...item, id: item._id, name: item.itemName, price: item.unitPrice,
      qty: item.quantity, calories: item.unitCalories,
      image: item.image || '', lineTotal: item.lineTotal ?? item.unitPrice * item.quantity
    };
  });
  return {
    ...raw, _id: raw.cartId || raw._id, items,
    summary: {
      itemCount: raw.summary?.itemCount ?? items.reduce((sum, item) => sum + item.quantity, 0),
      lineCount: raw.summary?.lineCount ?? items.length,
      subtotal: raw.summary?.subtotal ?? items.reduce((sum, item) => sum + item.lineTotal, 0),
      totalCalories: raw.summary?.totalCalories ?? items.reduce((sum, item) => sum + (item.unitCalories || 0) * item.quantity, 0),
      deliveryDates: raw.summary?.deliveryDates || [],
      shippingPolicy: raw.summary?.shippingPolicy || (raw.cartType === 'COMBO' ? 'FIRST_DAY_ONLY' : 'PER_ORDER'),
      shippingFee: raw.summary?.shippingFee ?? null
    },
    canCheckout: raw.canCheckout === true, issues: raw.issues || []
  };
}
