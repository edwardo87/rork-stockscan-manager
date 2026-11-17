import assert from 'node:assert/strict';
import { suggestedOrder, parsePhysicalCount } from '../utils/stockGuidance';
import type { Product } from '../types/inventory';
const p: Product = { id: 'p', barcode: 'x', name: 'Cartridges', description: '', price: 0, cost: 0, sku: '', category: '', supplier: 'Any supplier', minStock: 999, currentStock: 999,
  unit: 'each', stockUnit: 'each', orderUnit: 'carton', unitsPerOrderUnit: 12,
  desiredStockAvailable: true, desiredStockEnabled: true, desiredStockQuantity: 30 };
assert.equal(suggestedOrder(p, 5), 3);
assert.equal(suggestedOrder(p, 6), 2);
assert.equal(suggestedOrder(p, 30), 0);
assert.equal(suggestedOrder(p, 40), 0);
assert.equal(suggestedOrder({ ...p, desiredStockQuantity: 0 }, 0), 0);
assert.equal(suggestedOrder(p, null), null, 'Never use stale currentStock');
assert.equal(suggestedOrder({ ...p, desiredStockEnabled: false }, 0), null);
assert.equal(suggestedOrder({ ...p, desiredStockAvailable: false }, 0), null);
assert.equal(suggestedOrder({ ...p, unitsPerOrderUnit: undefined }, 0), null);
assert.equal(suggestedOrder({ ...p, unitsPerOrderUnit: 1 }, 0), null, 'Unresolved carton must not be treated as single');
assert.equal(suggestedOrder(p, -1), null);
assert.equal(suggestedOrder(p, NaN), null);
assert.equal(suggestedOrder({ ...p, desiredStockQuantity: Infinity }, 0), null);
assert.equal(suggestedOrder({ ...p, orderUnit: 'length', stockUnit: 'm', unit: 'm', unitsPerOrderUnit: 0.1, desiredStockQuantity: 0.3 }, 0), 3);
assert.equal(parsePhysicalCount('0'), 0);
assert.equal(parsePhysicalCount('2,5'), 2.5);
for (const invalid of ['', ' ', '-1', '1e2', 'NaN', '1.23456']) assert.equal(parsePhysicalCount(invalid), null);
console.log('PASS stock guidance: explicit opt-in, fresh count only, pack rounding, zero target, missing packs, invalid inputs and decimal precision');
