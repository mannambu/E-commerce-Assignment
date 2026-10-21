import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staffActions, staffUpdate, type StaffTask } from '../src/lib/staff-workspace.ts';

const now = new Date('2026-10-22T03:00:00Z');
const task: StaffTask = {
  orderId: 'order-1', orderCode: 'ORD-1', deliveryId: 'day-1', date: '2026-10-22',
  status: 'Confirmed', packageType: 'ONE_DAY', version: 7,
  items: [{ name: 'Cơm gà', quantity: 2, mealSlot: 'Lunch' }], paymentMethod: 'COD', codExpectedAmount: 90000
};
const form = { amount: '', reason: '', evidence: '' };

test('kitchen uses assigned delivery endpoint and whole-order version, never skips cooking', () => {
  const request = staffUpdate('Kitchen Staff', task, 'Cooking', form, now);
  assert.equal(request.path, '/orders/order-1/deliveries/day-1/kitchen-status');
  assert.deepEqual(request.body, { status: 'Cooking', version: 7 });
  assert.throws(() => staffUpdate('Kitchen Staff', task, 'Ready', form, now));
  assert.deepEqual(staffActions('Kitchen Staff', { ...task, status: 'Cooking' }, now), ['Ready']);
  assert.deepEqual(staffActions('Kitchen Staff', { ...task, status: 'Ready' }, now), []);
});

test('future days remain blocked until Vietnam midnight for both staff roles', () => {
  const before = new Date('2026-10-21T16:59:59Z');
  const midnight = new Date('2026-10-21T17:00:00Z');
  assert.deepEqual(staffActions('Kitchen Staff', task, before), []);
  assert.deepEqual(staffActions('Kitchen Staff', task, midnight), ['Cooking']);
  assert.deepEqual(staffActions('Delivery Staff', { ...task, status: 'Ready' }, before), []);
  assert.deepEqual(staffActions('Delivery Staff', { ...task, status: 'Ready' }, midnight), ['Delivering']);
});

test('shipper cannot complete before departure or reopen Failed/Completed', () => {
  for (const status of ['Confirmed', 'Cooking', 'Failed', 'Completed', 'Cancelled', 'Rejected']) {
    assert.deepEqual(staffActions('Delivery Staff', { ...task, status }, now), []);
  }
  assert.throws(() => staffUpdate('Delivery Staff', { ...task, status: 'Ready' }, 'Completed', { ...form, amount: '90000' }, now));
  assert.deepEqual(staffActions('Delivery Staff', { ...task, status: 'Delivering' }, now), ['Completed', 'Failed']);
});

test('COD requires explicit nonnegative integer actual collection, including zero and discrepancies', () => {
  const run = { ...task, status: 'Delivering' };
  for (const amount of ['', ' ', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) {
    assert.throws(() => staffUpdate('Delivery Staff', run, 'Completed', { ...form, amount }, now));
  }
  for (const amount of ['0', '80000', '90000', '100000']) {
    const request = staffUpdate('Delivery Staff', run, 'Completed', { ...form, amount }, now);
    assert.equal(request.path, '/orders/order-1/deliveries/day-1/shipper-status');
    assert.deepEqual(request.body, { status: 'Completed', version: 7, codCollectedAmount: Number(amount) });
  }
  assert.deepEqual(staffUpdate('Delivery Staff', { ...run, paymentMethod: 'VNPAY' }, 'Completed', form, now).body, { status: 'Completed', version: 7 });
});

test('failed delivery requires a reason, optional safe evidence, and never records COD', () => {
  const run = { ...task, status: 'Delivering' };
  for (const reason of ['', ' ', 'a'.repeat(501)]) assert.throws(() => staffUpdate('Delivery Staff', run, 'Failed', { ...form, reason }, now));
  const failedForm = { amount: '90000', reason: ' Khách vắng nhà ', evidence: '' };
  assert.deepEqual(staffUpdate('Delivery Staff', run, 'Failed', failedForm, now).body, { status: 'Failed', version: 7, reason: 'Khách vắng nhà', evidenceUrls: [] });
  for (const evidence of ['http://example.com/image.jpg', 'https://user:pass@example.com/image.jpg', 'invalid', Array(11).fill('https://example.com/image.jpg').join('\n')]) {
    assert.throws(() => staffUpdate('Delivery Staff', run, 'Failed', { ...failedForm, evidence }, now));
  }
  assert.deepEqual(staffUpdate('Delivery Staff', run, 'Failed', { ...failedForm, evidence: 'https://example.com/image.jpg' }, now).body.evidenceUrls, ['https://example.com/image.jpg']);
});
