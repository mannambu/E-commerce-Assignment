import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foodToForm, foodPayload, type FoodItem } from '../src/lib/admin-food.ts';
import { nextDeliveryStatus, orderStatuses, statusLabels, validatePassword, apiError } from '../src/lib/admin.ts';

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
