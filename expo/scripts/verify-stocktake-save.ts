import assert from 'node:assert/strict';
import { saveCount, stocktakePayload, StocktakeAttempt, StocktakeRejected } from '../utils/stocktakeSave';
const items = [{ productId: '11111111-1111-4111-8111-111111111111', name: 'Item', barcode: '01', expectedQuantity: 4, actualQuantity: 2, discrepancy: -2 }];
let journal: StocktakeAttempt | null = null;
let sends = 0, ids = 0;
const deps = {
  read: async () => journal,
  write: async (value: StocktakeAttempt) => { journal = value; },
  clear: async () => { journal = null; },
  id: () => `request-${++ids}`,
  send: async (attempt: StocktakeAttempt) => { sends++; assert.equal(attempt.id, 'request-1'); if (sends === 1) throw new Error('lost response'); },
};
await assert.rejects(saveCount(items, deps), /lost response/);
assert.ok(journal, 'Ambiguous outcome remains recoverable after restart');
await assert.rejects(saveCount([{ ...items[0], actualQuantity: 3 }], deps), /unfinished save/);
assert.equal(sends, 1, 'Different draft must not send while original outcome unknown');
await saveCount(items, deps);
assert.equal(ids, 1, 'Retry must reuse request id');
assert.equal(journal, null);
let sent = false;
await assert.rejects(saveCount(items, { ...deps, write: async () => { throw new Error('disk full'); }, send: async () => { sent = true; } }), /disk full/);
assert.equal(sent, false, 'Never send if journal could not be saved');
await assert.rejects(saveCount(items, { ...deps, send: async () => { throw new StocktakeRejected('count changed'); } }), /count changed/);
assert.equal(journal, null, 'Confirmed rollback permits correcting the draft');
for (const actualQuantity of [-1, NaN, Infinity]) assert.throws(() => stocktakePayload([{ ...items[0], actualQuantity }]));
assert.throws(() => stocktakePayload([...items, ...items]), /duplicate/);
assert.throws(() => stocktakePayload([]));
assert.equal(stocktakePayload([{ ...items[0], actualQuantity: 0 }])[0].actualQuantity, 0);
console.log('PASS stocktake save: durable retry identity, changed-draft protection, local-storage failure, invalid/duplicate counts and zero count');
