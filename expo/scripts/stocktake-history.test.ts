// @ts-expect-error Bun supplies this test-only module at runtime; app dependencies omit Bun's types.
import { test, expect, mock, beforeEach } from 'bun:test';

let calls: { table: string; filters: [string, unknown][]; range?: [number, number] }[] = [];
let failItems = false;
let account = 'owner';
const rows = Array.from({ length: 205 }, (_, i) => ({ product_id: `p${i}`, barcode: `00${i}`, name: `Item ${i}`, expected_quantity: 2, actual_quantity: 1, discrepancy: -1 }));
const session = { id: 's1', date: '2026-11-08', status: 'completed', notes: null };
mock.module('../lib/supabase', () => ({
  getCurrentUser: async () => ({ id: account }),
  supabase: { from(table: string) {
    const call: typeof calls[number] = { table, filters: [] };
    calls.push(call);
    let single = false;
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { call.filters.push([key, value]); return query; },
      order() { return query; },
      range(start: number, end: number) { call.range = [start, end]; return query; },
      single() { single = true; return query; },
      abortSignal() { return query; },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve(resolve(table === 'stocktakes'
          ? { data: single ? session : [session], error: null }
          : failItems ? { data: null, error: { message: 'offline' } }
          : { data: rows.slice(call.range![0], call.range![1] + 1), error: null }));
      },
    };
    return query;
  } },
}));
const { loadStocktake, loadStocktakePage } = await import('../services/stocktakeHistoryService');
beforeEach(() => { calls = []; failItems = false; account = 'owner'; });
test('loads all 205 saved lines across pages, scoped to owner and session', async () => {
  const result = await loadStocktake('s1', new AbortController().signal, 'owner');
  expect(result.items.length).toBe(205);
  expect(result.items[204].barcode).toBe('00204');
  expect(calls[0].filters).toEqual([['user_id', 'owner'], ['id', 's1']]);
  expect(calls.slice(1).map(c => c.range)).toEqual([[0, 199], [200, 399]]);
  expect(calls.slice(1).every(c => c.filters[0][1] === 's1')).toBe(true);
});
test('history uses bounded pages', async () => {
  await loadStocktakePage(2, new AbortController().signal, 'owner');
  expect(calls[0].range).toEqual([40, 59]);
  expect(calls[0].filters).toEqual([['user_id', 'owner']]);
});
test('does not return a partial session after line retrieval failure', async () => {
  failItems = true;
  await expect(loadStocktake('s1', new AbortController().signal, 'owner')).rejects.toThrow('all stocktake lines');
});
test('account switch prevents reading data under another user query key', async () => {
  account = 'other';
  await expect(loadStocktake('s1', new AbortController().signal, 'owner')).rejects.toThrow('account changed');
  expect(calls.length).toBe(0);
});
test('cancelled detail load stops before item paging', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(loadStocktake('s1', controller.signal, 'owner')).rejects.toThrow('cancelled');
  expect(calls.filter(c => c.table === 'stocktake_items').length).toBe(0);
});
