import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foodToForm, foodPayload, type FoodItem } from '../src/lib/admin-food.ts';
import { nextDeliveryStatus, orderStatuses, statusLabels, validatePassword, apiError, type AdminOrder, type Delivery } from '../src/lib/admin.ts';
import { cancellationPreviewError, weeklyStatusBlockReason, type CancellationPreview } from '../src/lib/admin-orders.ts';

const food: FoodItem = {
  _id: 'food-1', name: 'Cơm gà', description: 'Cơm với rau', images: ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
  price: 45000, calories: 500, stock: 10, reservedStock: 3, isActive: false,
  nutrition: { protein: 35, carb: 50, fat: 0 },
  ingredients: [{ name: 'Gà', allergyTags: [] }, { name: 'Sốt đậu', allergyTags: ['Soy', 'Peanut'] }],
  tags: ['Lunch'], goalTags: ['GainMuscle', 'MaintainWeight']
};

test('editing an existing food preserves every image, ingredient, allergen and goal', () => {
  const form = foodToForm(food);
  form.price = '49000';
  const payload = foodPayload(form);
  assert.equal(payload.price, 49000);
  assert.deepEqual(payload.images, food.images);
  assert.deepEqual(payload.ingredients, food.ingredients);
  assert.deepEqual(payload.goalTags, food.goalTags);
  assert.deepEqual(payload.nutrition, food.nutrition);
  assert.ok(!('details' in payload));
  assert.ok(!('isCombo' in payload));
  assert.ok(!('isActive' in payload)); // Editing price must not reopen a hidden food.
  assert.ok(!('reservedStock' in payload));
});

test('food editor rejects invalid values rather than silently clamping or inventing data', () => {
  for (const patch of [{ price: '0' }, { price: '-1' }, { stock: '1.2' }, { calories: '' }, { protein: 'NaN' }, { fat: 'Infinity' }, { images: '' }, { ingredients: [] }, { ingredients: [{ name: ' ', allergyTags: '' }] }]) {
    assert.throws(() => foodPayload({ ...foodToForm(food), ...patch }));
  }
  assert.equal(foodPayload({ ...foodToForm(food), stock: '0' }).stock, 0);
});

test('admin status progression includes Ready and cannot confirm/reopen terminal orders', () => {
  assert.equal(nextDeliveryStatus('Confirmed'), 'Cooking');
  assert.equal(nextDeliveryStatus('Cooking'), 'Ready');
  assert.equal(nextDeliveryStatus('Ready'), 'Delivering');
  assert.equal(nextDeliveryStatus('Delivering'), 'Completed');
  for (const status of ['Pending', 'Failed', 'Rejected', 'Cancelled', 'Completed']) assert.equal(nextDeliveryStatus(status), undefined);
  for (const status of orderStatuses) assert.ok(statusLabels[status]);
  assert.equal(orderStatuses.length, 9);
});

test('internal account password respects backend length, UTF-8 bytes and confirmation', () => {
  assert.equal(validatePassword('abcdefgh', 'abcdefgh'), null); // No extra uppercase/number requirement.
  assert.ok(validatePassword('short', 'short'));
  assert.ok(validatePassword('a'.repeat(51), 'a'.repeat(51)));
  assert.ok(validatePassword('ế'.repeat(25), 'ế'.repeat(25)));
  assert.equal(validatePassword('ế'.repeat(24), 'ế'.repeat(24)), null);
  assert.ok(validatePassword('abcdefgh', 'different'));
});

test('API field validation and business conflicts remain visible to the administrator', () => {
  assert.equal(apiError({ response: { data: { message: 'Validation error', errors: { email: { msg: 'Email đã tồn tại' }, username: { msg: 'Tên đã tồn tại' } } } } }), 'Email đã tồn tại · Tên đã tồn tại');
  assert.equal(apiError({ response: { status: 409, data: { message: 'Không thể khóa Admin cuối cùng' } } }), 'Không thể khóa Admin cuối cùng');
});

test('editing food stock cannot consume quantities already reserved for pending orders', () => {
  assert.throws(() => foodPayload({ ...foodToForm(food), stock: '2' }, 3), /đang giữ/);
  assert.equal(foodPayload({ ...foodToForm(food), stock: '3' }, 3).stock, 3);
  assert.equal(foodPayload({ ...foodToForm(food), stock: '0' }, 0).stock, 0);
});

const delivery: Delivery = {
  _id: 'day-1', date: '2026-10-22', status: 'Confirmed',
  cutoffAt: '2026-10-22T02:00:00.000Z', subtotal: 45000, shipping: { totalFee: 10000 }, items: []
};
const order: AdminOrder = {
  _id: 'order-1', orderCode: 'ORD-1', userId: 'customer-1', status: 'Confirmed', version: 3,
  packageType: 'WEEKLY_7D', createdAt: '2026-10-20T00:00:00.000Z', deliveryAddress: 'Địa chỉ giao hàng',
  subtotal: 45000, shippingFee: 10000, grandTotal: 55000, deliveries: [delivery],
  payment: { method: 'COD', status: 'Pending' }, inventoryHold: { status: 'Committed' }
};
const quote: CancellationPreview = {
  orderId: order._id, deliveryId: delivery._id, version: order.version, cutoffAt: delivery.cutoffAt!,
  foodCredit: 45000, shippingCredit: 10000, creditedAmount: 55000, refundAmount: 0, remainingPayable: 0
};
const beforeCutoff = Date.parse('2026-10-22T01:00:00.000Z');

test('weekly status changes use the Vietnam date, including the UTC midnight boundary', () => {
  assert.match(weeklyStatusBlockReason(order, delivery, new Date('2026-10-21T16:59:59Z'))!, /Chưa tới ngày/);
  assert.equal(weeklyStatusBlockReason(order, delivery, new Date('2026-10-21T17:00:00Z')), null);
  assert.equal(weeklyStatusBlockReason(order, delivery, new Date('2026-10-23T00:00:00Z')), null);
});

test('weekly status changes require committed stock and paid online orders before cooking', () => {
  const now = new Date(beforeCutoff);
  for (const status of ['NotReserved', 'Held', 'Released'] as const) {
    assert.match(weeklyStatusBlockReason({ ...order, inventoryHold: { status } }, delivery, now)!, /chưa chốt kho/);
  }
  assert.ok(weeklyStatusBlockReason({ ...order, payment: { method: 'VNPAY', status: 'Pending' } }, delivery, now));
  for (const status of ['Paid', 'PartiallyRefunded']) {
    assert.equal(weeklyStatusBlockReason({ ...order, payment: { method: 'VNPAY', status } }, delivery, now), null);
  }
  assert.equal(weeklyStatusBlockReason(order, delivery, now), null); // COD remains payable on delivery.
  assert.ok(weeklyStatusBlockReason({ ...order, status: 'Cancelled' }, delivery, now));
  assert.ok(weeklyStatusBlockReason(order, { ...delivery, status: 'Pending' }, now));
});

test('cancellation rejects missing previews and previews from another order, day or version', () => {
  assert.ok(cancellationPreviewError(order, delivery, null, beforeCutoff));
  for (const patch of [{ orderId: 'other-order' }, { deliveryId: 'other-day' }, { version: 2 }, { version: 4 }]) {
    assert.match(cancellationPreviewError(order, delivery, { ...quote, ...patch }, beforeCutoff)!, /không khớp/);
  }
  assert.equal(cancellationPreviewError(order, delivery, quote, beforeCutoff), null);
});

test('cancellation preview expires at cutoff and cannot authorize an ineligible delivery', () => {
  assert.ok(cancellationPreviewError(order, delivery, quote, Date.parse(quote.cutoffAt)));
  assert.ok(cancellationPreviewError(order, delivery, { ...quote, cutoffAt: 'invalid' }, beforeCutoff));
  assert.ok(cancellationPreviewError({ ...order, status: 'Cooking' }, delivery, quote, beforeCutoff));
  assert.ok(cancellationPreviewError(order, { ...delivery, status: 'Cancelled' }, quote, beforeCutoff));
});
