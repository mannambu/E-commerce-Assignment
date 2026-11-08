import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ObjectId } from 'mongodb'
import type Order from '../src/models/schemas/Order.schema'
import type Transaction from '../src/models/schemas/Transaction.schema'
import { buildCODFinance, financeRange } from '../src/utils/cod-finance'
import { costSnapshot, withoutOrderCosts } from '../src/utils/food-cost'

export function financeFixture() {
  const completed = new Date('2026-10-01T12:00:00+07:00')
  const order: Order = {
    _id: new ObjectId(),
    userId: new ObjectId(),
    orderCode: 'FINANCE',
    packageType: 'WEEKLY_7D',
    status: 'Ready',
    statusHistory: [],
    deliveries: [
      {
        _id: new ObjectId(),
        date: '2026-10-01',
        scheduledAt: completed,
        status: 'Completed',
        statusHistory: [{ status: 'Completed', changedAt: completed }],
        items: [
          {
            _id: new ObjectId(),
            foodId: new ObjectId(),
            foodName: 'Rice',
            price: 50000,
            quantity: 2,
            costPrice: 20000,
            costEstimated: false,
            calories: 400,
            nutrition: { protein: 30, carb: 40, fat: 13 }
          }
        ],
        subtotal: 100000,
        shipping: { totalFee: 20000, baseFee: 20000, extraFee: 0, distanceKm: 6 },
        waivedShippingFee: 0,
        refundedAmount: 0
      }
    ],
    subtotal: 100000,
    shippingFee: 20000,
    grandTotal: 120000,
    deliveryAddress: 'Test',
    note: '',
    payment: { method: 'COD', status: 'Pending', paidAmount: 0, refundedAmount: 0 },
    inventoryHold: { status: 'Committed', items: [] },
    version: 0,
    createdAt: completed,
    updatedAt: completed
  }
  const receipt = (amount: number, time: string, kind: 'Payment' | 'Refund' = 'Payment'): Transaction => ({
    _id: new ObjectId(),
    kind,
    status: 'Succeeded',
    amount,
    orderId: order._id,
    deliveryId: order.deliveries[0]._id,
    method: 'COD',
    source: 'Reconciliation',
    idempotencyKey: String(new ObjectId()),
    occurredAt: new Date(time),
    description: 'Real receipt'
  })
  return { order, receipt }
}

test('finance dates use Vietnam midnight, reject impossible/reversed/oversized ranges and return zero days', () => {
  const range = financeRange('2026-10-01', '2026-10-02')
  assert.equal(range.start.toISOString(), '2026-09-30T17:00:00.000Z')
  assert.equal(range.end.toISOString(), '2026-10-02T17:00:00.000Z')
  for (const [from, to] of [
    ['2026-02-30', '2026-03-01'],
    ['2026-10-02', '2026-10-01'],
    ['2024-01-01', '2026-01-01'],
    ['bad', '2026-01-01']
  ])
    assert.throws(() => financeRange(from, to), { status: 400 })
  const result = buildCODFinance([], [], range)
  assert.equal(result.daily.length, 2)
  assert.ok(Object.values(result.summary).every((value) => value === 0))
})

test('partial COD is cash only; full collection recognizes the entire delivered food on the actual top-up day', () => {
  const { order, receipt } = financeFixture()
  const receipts = [receipt(70000, '2026-10-01T12:00:00+07:00'), receipt(50000, '2026-10-02T10:00:00+07:00')]
  const first = buildCODFinance([order], receipts, financeRange('2026-10-01', '2026-10-01'))
  assert.equal(first.summary.foodRevenue, 0)
  assert.equal(first.summary.cost, 0)
  assert.equal(first.summary.cashCollected, 70000)
  assert.equal(first.rows[0].balanceAsOfEnd, 50000)
  const second = buildCODFinance([order], receipts, financeRange('2026-10-02', '2026-10-02'))
  assert.equal(second.summary.foodRevenue, 100000)
  assert.equal(second.summary.shippingRevenue, 20000)
  assert.equal(second.summary.cost, 40000)
  assert.equal(second.summary.grossProfit, 60000)
  assert.equal(second.summary.cashCollected, 50000)
  assert.equal(second.summary.recognizedDeliveryCount, 1)
  assert.equal(second.summary.recognizedOrderCount, 1)
  assert.equal(second.byFood[0].quantity, 2)
  const full = buildCODFinance([order], receipts, financeRange('2026-10-01', '2026-10-02'))
  assert.equal(full.summary.foodRevenue, first.summary.foodRevenue + second.summary.foodRevenue)
  assert.equal(full.summary.netCash, first.summary.netCash + second.summary.netCash)
})

test('overpayment is not food revenue and returning surplus affects cash only on the actual refund day', () => {
  const { order, receipt } = financeFixture()
  const receipts = [receipt(150000, '2026-10-01T12:00:00+07:00'), receipt(30000, '2026-10-02T10:00:00+07:00', 'Refund')]
  const first = buildCODFinance([order], receipts, financeRange('2026-10-01', '2026-10-01'))
  assert.equal(first.summary.foodRevenue, 100000)
  assert.equal(first.summary.cashCollected, 150000)
  assert.equal(first.rows[0].balanceAsOfEnd, -30000)
  const second = buildCODFinance([order], receipts, financeRange('2026-10-02', '2026-10-02'))
  assert.equal(second.summary.foodRevenue, 0)
  assert.equal(second.summary.cost, 0)
  assert.equal(second.summary.netCash, -30000)
  assert.equal(second.rows[0].balanceAsOfEnd, 0)
  assert.equal(second.rows[0].recognizedAt!.toISOString(), '2026-10-01T05:00:00.000Z')
})

test('a payment before completion waits for completion; incomplete/cancelled days do not create sales', () => {
  const { order, receipt } = financeFixture()
  const entries = [receipt(120000, '2026-09-30T10:00:00+07:00')]
  assert.equal(buildCODFinance([order], entries, financeRange('2026-09-30', '2026-09-30')).summary.foodRevenue, 0)
  assert.equal(buildCODFinance([order], entries, financeRange('2026-10-01', '2026-10-01')).summary.foodRevenue, 100000)
  for (const status of ['Failed', 'Cancelled', 'Rejected', 'Delivering'] as const) {
    order.deliveries[0].status = status
    const result = buildCODFinance([order], entries, financeRange('2026-09-30', '2026-10-01'))
    assert.equal(result.summary.foodRevenue, 0)
    assert.equal(result.summary.cost, 0)
    assert.equal(result.summary.netCash, 120000)
  }
})

test('missing snapshots estimate original unit sale price at 60%; zero true cost remains zero and redaction does not mutate DB objects', () => {
  const { order, receipt } = financeFixture()
  const item = order.deliveries[0].items[0]
  item.costPrice = 0
  let result = buildCODFinance(
    [order],
    [receipt(120000, '2026-10-01T12:00:00+07:00')],
    financeRange('2026-10-01', '2026-10-01')
  )
  assert.equal(result.summary.cost, 0)
  assert.equal(result.summary.estimatedCostDeliveryCount, 0)
  const redacted = withoutOrderCosts(order)
  assert.equal(redacted.deliveries[0].items[0].costPrice, undefined)
  assert.equal(item.costPrice, 0)
  delete item.costPrice
  delete item.costEstimated
  result = buildCODFinance(
    [order],
    [receipt(120000, '2026-10-01T12:00:00+07:00')],
    financeRange('2026-10-01', '2026-10-01')
  )
  assert.equal(result.summary.cost, 60000)
  assert.equal(result.summary.estimatedCostDeliveryCount, 1)
  assert.equal(result.rows[0].legacyCostEstimate, true)
  assert.deepEqual(costSnapshot(101), { costPrice: 61, costEstimated: true })
})

test('missing completion time is flagged, inconsistent snapshots and refunds beyond surplus are rejected', () => {
  const { order, receipt } = financeFixture()
  const entries = [receipt(120000, '2026-10-01T12:00:00+07:00')]
  assert.throws(
    () =>
      buildCODFinance(
        [order],
        [...entries, receipt(10000, '2026-10-02T10:00:00+07:00', 'Refund')],
        financeRange('2026-10-01', '2026-10-02')
      ),
    { status: 409 }
  )
  order.deliveries[0].statusHistory = []
  const result = buildCODFinance([order], entries, financeRange('2026-10-01', '2026-10-01'))
  assert.equal(result.summary.foodRevenue, 0)
  assert.equal(result.warnings[0].code, 'MISSING_COMPLETION_TIME')
  order.deliveries[0].items[0].price++
  assert.throws(() => buildCODFinance([order], entries, financeRange('2026-10-01', '2026-10-01')), { status: 409 })
})

test('weekly days are recognized independently while distinct order count stays one', () => {
  const { order, receipt } = financeFixture()
  const first = order.deliveries[0]
  const second = { ...first, _id: new ObjectId(), date: '2026-10-02' }
  const failed = { ...first, _id: new ObjectId(), status: 'Failed' as const }
  order.deliveries.push(second, failed)
  const entries = [
    receipt(120000, '2026-10-01T12:00:00+07:00'),
    { ...receipt(120000, '2026-10-02T12:00:00+07:00'), deliveryId: second._id },
    { ...receipt(120000, '2026-10-02T12:00:00+07:00'), deliveryId: failed._id }
  ]
  const result = buildCODFinance([order], entries, financeRange('2026-10-01', '2026-10-02'))
  assert.equal(result.summary.recognizedDeliveryCount, 2)
  assert.equal(result.summary.recognizedOrderCount, 1)
  assert.equal(result.summary.foodRevenue, 200000)
  assert.equal(result.summary.cost, 80000)
  assert.equal(result.summary.cashCollected, 360000)
  assert.equal(result.byFood[0].quantity, 4)
})

test('Vietnam midnight is exclusive at the upper boundary and pending refunds never reduce cash', () => {
  const { order, receipt } = financeFixture()
  const payment = receipt(120000, '2026-10-01T17:00:00Z') // October 2 in Vietnam.
  const pending = { ...receipt(20000, '2026-10-02T11:00:00+07:00', 'Refund'), status: 'Pending' as const }
  assert.equal(
    buildCODFinance([order], [payment, pending], financeRange('2026-10-01', '2026-10-01')).summary.foodRevenue,
    0
  )
  const result = buildCODFinance([order], [payment, pending], financeRange('2026-10-02', '2026-10-02'))
  assert.equal(result.summary.foodRevenue, 100000)
  assert.equal(result.summary.cashRefunded, 0)
})
