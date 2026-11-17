import type { StocktakeItem } from '@/types/inventory';
export type StocktakeAttempt = { id: string; items: StocktakeItem[] };
export class StocktakeRejected extends Error {}
export function stocktakePayload(items: StocktakeItem[]) {
  if (!items.length || items.length > 1000) throw new Error('Count between 1 and 1000 products per stocktake.');
  const ids = new Set<string>();
  return items.map(item => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.productId) || ids.has(item.productId)) throw new Error('Stocktake contains an invalid or duplicate product.');
    ids.add(item.productId);
    for (const n of [item.expectedQuantity, item.actualQuantity]) {
      if (!Number.isFinite(n) || n < 0 || n > Number.MAX_SAFE_INTEGER) throw new Error('Counts must be finite numbers of zero or more.');
    }
    return { productId: item.productId, expectedQuantity: item.expectedQuantity, actualQuantity: item.actualQuantity };
  }).sort((a, b) => a.productId.localeCompare(b.productId));
}
export interface StocktakeSaveDependencies {
  read: () => Promise<StocktakeAttempt | null>;
  write: (attempt: StocktakeAttempt) => Promise<void>;
  clear: () => Promise<void>;
  id: () => string;
  send: (attempt: StocktakeAttempt) => Promise<void>;
}
/** Journal before sending. Keep the same request after timeouts or app restart. */
export async function saveCount(items: StocktakeItem[], deps: StocktakeSaveDependencies): Promise<void> {
  const payload = stocktakePayload(items);
  let attempt = await deps.read();
  if (attempt && JSON.stringify(stocktakePayload(attempt.items)) !== JSON.stringify(payload)) {
    throw new Error('An unfinished save has different counts. Use Retry unfinished save before changing this stocktake.');
  }
  if (!attempt) {
    attempt = { id: deps.id(), items: items.map(i => ({ ...i })) };
    await deps.write(attempt);
  }
  try { await deps.send(attempt); }
  catch (error) {
    // Only a definite database rejection proves that the transaction rolled back.
    // Timeouts/disconnects remain journalled because they may have committed.
    if (error instanceof StocktakeRejected) await deps.clear();
    throw error;
  }
  await deps.clear();
}
