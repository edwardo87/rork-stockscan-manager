import assert from 'node:assert/strict';
import { stocktakeCsv } from '../utils/stocktakeExport';
import type { StocktakeSession } from '../types/inventory';
const session: StocktakeSession = {
  id: 'saved-id', date: '2026-11-08T10:00:00Z', status: 'completed', items: [{
    productId: 'original-id', barcode: '00123', name: 'Sheet, "white"\nlarge',
    expectedQuantity: 4.5, actualQuantity: 0, discrepancy: -4.5,
  }],
};
const original = JSON.stringify(session);
const output = stocktakeCsv(session);
assert.ok(output.startsWith('\uFEFFStocktake ID,'));
assert.ok(output.includes('"00123","Sheet, ""white""\nlarge",4.5,0,-4.5\r\n'));
assert.equal(JSON.stringify(session), original);
for (const name of ['=HYPERLINK("url")', '+SUM(1,2)', '-1+1', '@SUM(1)', '  =1+1', '\tformula']) {
  assert.ok(stocktakeCsv({ ...session, items: [{ ...session.items[0], name }] }).includes('"\''));
}
assert.throws(() => stocktakeCsv({ ...session, items: [{ ...session.items[0], actualQuantity: NaN }] }), /invalid quantity/);
assert.equal(stocktakeCsv({ ...session, items: [] }).split('\r\n').length, 2);
console.log('PASS stocktake CSV: saved values, zero/fraction/negative counts, escaping, formula protection, invalid quantities and empty session');
