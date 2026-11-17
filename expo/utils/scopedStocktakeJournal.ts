import { stocktakePayload, type StocktakeAttempt } from './stocktakeSave';
export interface StocktakeScope { userId: string; businessId: string }
export interface JournalStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function scopedStocktakeKey(scope: StocktakeScope): string {
  if (!uuid.test(scope.userId) || !uuid.test(scope.businessId)) throw new Error('Stocktake business identity is invalid.');
  return `stocktake-save-v2:${scope.userId.toLowerCase()}:${scope.businessId.toLowerCase()}`;
}
function validateAttempt(value: StocktakeAttempt): void {
  if (!value || !uuid.test(value.id) || !Array.isArray(value.items)) throw new Error('Unfinished stocktake is invalid. Keep the saved record for recovery.');
  stocktakePayload(value.items);
}
/** Prepared adapter, not wired to v1 RPC. Caller retains single-writer save coordination.
 * Legacy user-only journals are never assigned to the currently selected business.
 */
export function scopedStocktakeJournal(scope: StocktakeScope, storage: JournalStorage) {
  const identity = { userId: scope.userId.toLowerCase(), businessId: scope.businessId.toLowerCase() };
  const key = scopedStocktakeKey(identity);
  async function legacyGuard() {
    if (await storage.getItem(`stocktake-save-v1:${identity.userId}`) !== null)
      throw new Error('An older unfinished stocktake needs recovery in its original business before switching save formats.');
  }
  async function read(): Promise<StocktakeAttempt | null> {
    await legacyGuard();
    const raw = await storage.getItem(key);
    if (raw === null) return null;
    const record = JSON.parse(raw);
    if (!record || record.version !== 2 || record.userId !== identity.userId || record.businessId !== identity.businessId)
      throw new Error('Unfinished stocktake belongs to a different account or business. Keep it for recovery.');
    validateAttempt(record.attempt);
    return record.attempt;
  }
  return {
    key,
    read,
    async write(attempt: StocktakeAttempt): Promise<void> {
      validateAttempt(attempt);
      const old = await read();
      if (old && (old.id !== attempt.id || JSON.stringify(stocktakePayload(old.items)) !== JSON.stringify(stocktakePayload(attempt.items))))
        throw new Error('Finish the existing stocktake before saving different counts.');
      await storage.setItem(key, JSON.stringify({ version: 2, ...identity, attempt }));
    },
    async clear(requestId: string): Promise<void> {
      const old = await read();
      if (!old) return;
      if (old.id !== requestId) throw new Error('A different unfinished stocktake must not be cleared.');
      await storage.removeItem(key);
    },
  };
}
