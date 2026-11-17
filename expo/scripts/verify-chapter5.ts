import assert from 'node:assert/strict';
import { parseOrderQuantity, recentProductOrder, supplierOrderGroups, getPoNumber } from '../utils/orderReview';
import type { OrderItem, PurchaseOrder } from '../types/inventory';

const line = (productId: string, supplier = 'General Hardware'): OrderItem => ({
  productId, supplier, barcode: 'shared-code', name: 'Material', quantity: 200,
  orderQuantity: 2, orderUnit: 'cartons', unitsPerOrderUnit: 100,
});
const po = (id: string, date: string, items: OrderItem[], status: PurchaseOrder['status'] = 'submitted'): PurchaseOrder => ({
  id, date, items, status, supplierId: 'supplier', supplierName: 'General Hardware',
});
const orders = [
  po('old1', '2026-10-01', [line('a')]),
  po('new2', '2026-11-01', [line('a'), { ...line('a'), orderQuantity: 3, orderUnit: 'metres' }], 'received'),
  po('draft', '2026-11-07', [line('a')], 'draft'),
  po('other', '2026-11-08', [line('b')]),
  po('bad-date', 'invalid', [line('a')]),
];
const before = JSON.stringify(orders);
assert.deepEqual(recentProductOrder(orders, 'a'), {
  date: '2026-11-01', reference: 'PO-new2', quantities: ['2 cartons', '3 metres'],
});
assert.equal(recentProductOrder(orders, 'missing'), null);
assert.equal(recentProductOrder([], 'a'), null);
assert.equal(JSON.stringify(orders), before, 'History must not be mutated');
assert.deepEqual(recentProductOrder([po('legacy', '2026-11-01', [{ ...line('a'), orderQuantity: undefined }])], 'a')?.quantities, ['200 recorded stock units']);
assert.equal(getPoNumber('1'), 'PO-0001');

const items = [line('a'), line('b', 'Electrical Supplies'), line('c'), line('d', '__proto__')];
const groups = supplierOrderGroups(items);
assert.deepEqual(groups.map(g => [g.supplier, g.data.map(i => i.productId)]), [
  ['General Hardware', ['a', 'c']], ['Electrical Supplies', ['b']], ['__proto__', ['d']],
]);
assert.equal(items.length, 4);
assert.deepEqual(supplierOrderGroups([]), []);
for (const invalid of ['', ' ', '0', '-2', 'NaN', 'Infinity', '1e3', '2 boxes', '1.12345', '1,000,000', '9007199254740992']) {
  assert.equal(parseOrderQuantity(invalid), null, `Reject ${JSON.stringify(invalid)}`);
}
for (const [input, expected] of [['1', 1], [' 12 ', 12], ['0.25', 0.25], ['2,5', 2.5], ['1.1234', 1.1234]] as const) {
  assert.equal(parseOrderQuantity(input), expected);
}
console.log('PASS Chapter 5: latest matching history, historical quantities, supplier grouping and quantity validation');
