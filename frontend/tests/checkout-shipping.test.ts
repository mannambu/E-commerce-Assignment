import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutDeliveryPayload, readShippingQuote, deliveryScheduleError } from '../src/lib/checkout-shipping.ts';

test('quote and create send address only; distance, coordinates and fees stay server-owned', () => {
  for (const cartType of ['FOOD', 'COMBO'] as const) {
    const input = { address: '  123 Nguyễn Trãi, TP.HCM  ', deliveryDate: '2026-10-25', deliveryTime: '18:30', cartType, paymentMethod: 'COD' as const, distanceKm: 0, shippingFee: 0, lat: 0, lon: 0 };
    assert.deepEqual(checkoutDeliveryPayload(input), {
      deliveryAddress: '123 Nguyễn Trãi, TP.HCM', deliveryDate: '2026-10-25', deliveryTime: '18:30',
      packageType: cartType === 'COMBO' ? 'WEEKLY_7D' : 'ONE_DAY', cartType, paymentMethod: 'COD'
    });
  }
});

test('delivery time validation uses Vietnam time, not the browser timezone', () => {
  const now = Date.parse('2026-10-25T10:00:00Z'); // 17:00 in Vietnam.
  assert.equal(deliveryScheduleError('2026-10-25', '17:01', now), null);
  assert.ok(deliveryScheduleError('2026-10-25', '17:00', now));
  assert.ok(deliveryScheduleError('2026-10-25', '16:59', now));
  assert.equal(deliveryScheduleError('2026-10-26', '00:00', now), null);
  for (const time of ['', '24:00', '12:60', '9:00', '12:30:00']) assert.ok(deliveryScheduleError('2026-10-26', time, now));
  assert.ok(deliveryScheduleError('2026-02-30', '12:00', now));
});

test('invalid selected time never silently falls back to noon in the order request', () => {
  const input = { address: 'TP.HCM', deliveryDate: '2026-10-25', cartType: 'FOOD' as const, paymentMethod: 'COD' as const };
  for (const time of ['', '24:00', '12:60']) assert.throws(() => checkoutDeliveryPayload({ ...input, deliveryTime: time }));
  for (const time of ['00:00', '09:15', '23:59']) assert.equal(checkoutDeliveryPayload({ ...input, deliveryTime: time }).deliveryTime, time);
});

test('quote uses server fee and total, including free shipping and rounded display distance', () => {
  for (const fee of [0, 5000, 20000]) {
    const quote = readShippingQuote({ cart: { version: 4 }, pricing: { subtotal: 90000, shippingFee: fee, grandTotal: 90000 + fee, shippingBreakdowns: [{ distanceKm: 2 }] } });
    assert.equal(quote.shippingFee, fee); // Do not recompute the fee from a rounded 2 km display.
    assert.equal(quote.grandTotal, 90000 + fee);
    assert.equal(quote.version, 4);
  }
});

test('incomplete or invalid quote cannot unlock checkout', () => {
  const valid = { cart: { version: 1 }, pricing: { subtotal: 45000, shippingFee: 0, grandTotal: 45000, shippingBreakdowns: [{ distanceKm: 0 }] } };
  assert.throws(() => readShippingQuote({}));
  assert.throws(() => readShippingQuote({ ...valid, cart: { version: -1 } }));
  assert.throws(() => readShippingQuote({ ...valid, pricing: { ...valid.pricing, grandTotal: NaN } }));
  assert.throws(() => readShippingQuote({ ...valid, pricing: { ...valid.pricing, shippingBreakdowns: [] } }));
});
