import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCart } from '../src/lib/cart.ts';

const line = { _id: 'line-1', itemId: 'food-1', itemName: 'Cơm gà', quantity: 2, unitPrice: 45000, unitCalories: 500, deliveryDate: '2026-10-23', mealSlot: 'Lunch' };
const summary = { cartId: 'cart-1', cartType: 'FOOD', version: 3, items: [line], canCheckout: true, issues: [] };

test('currentCart wins over legacy empty foodCart when using a weekly cart', () => {
  const weekly = { ...summary, cartType: 'COMBO', version: 9 };
  const cart = normalizeCart({ currentCart: weekly, foodCart: { ...summary, items: [] }, comboCart: weekly });
  assert.equal(cart.cartType, 'COMBO');
  assert.equal(cart.version, 9);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.summary.shippingPolicy, 'FIRST_DAY_ONLY');
  assert.equal(cart._id, 'cart-1');
});

test('same food on two days retains separate line identifiers and schedules', () => {
  const cart = normalizeCart({ ...summary, items: [line, { ...line, _id: 'line-2', deliveryDate: '2026-10-24', mealSlot: 'Dinner' }] });
  assert.deepEqual(cart.items.map(item => item.id), ['line-1', 'line-2']);
  assert.deepEqual(cart.items.map(item => item.deliveryDate), ['2026-10-23', '2026-10-24']);
  assert.equal(cart.summary.itemCount, 4);
  assert.equal(cart.summary.subtotal, 180000);
  assert.equal(cart.summary.totalCalories, 2000);
});

test('add, clear and mode responses retain server versions and do not reuse old items', () => {
  const added = normalizeCart(summary);
  const cleared = normalizeCart({ currentCart: { ...summary, version: 4, items: [], canCheckout: false, issues: [{ code: 'EMPTY_CART', message: 'Giỏ rỗng' }] } });
  const switched = normalizeCart({ ...cleared, cartType: 'COMBO', version: 5 });
  assert.deepEqual([added.version, cleared.version, switched.version], [3, 4, 5]);
  assert.equal(cleared.items.length, 0);
  assert.equal(switched.canCheckout, false);
  assert.equal(switched.items.length, 0);
});

test('stock issues and checkout eligibility come from the server, not a positive subtotal', () => {
  const cart = normalizeCart({ ...summary, canCheckout: false, issues: [{ code: 'INSUFFICIENT_STOCK', lineId: 'line-1', message: 'Không đủ hàng' }], items: [{ ...line, availability: { isActive: true, inStock: false, availableQuantity: 1 } }] });
  assert.equal(cart.canCheckout, false);
  assert.equal(cart.issues[0].lineId, 'line-1');
  assert.equal(cart.items[0].availability?.availableQuantity, 1);
  for (const invalid of [null, {}, { ...summary, version: undefined }, { ...summary, items: [{ ...line, _id: undefined }] }]) {
    assert.throws(() => normalizeCart(invalid));
  }
});
