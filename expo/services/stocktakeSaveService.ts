import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getCurrentUser } from '@/lib/supabase';
import { saveCount, stocktakePayload, StocktakeAttempt, StocktakeRejected } from '@/utils/stocktakeSave';
import type { StocktakeItem } from '@/types/inventory';

const key = (userId: string) => `stocktake-save-v1:${userId}`;
export async function pendingStocktake(userId: string): Promise<StocktakeAttempt | null> {
  const raw = await AsyncStorage.getItem(key(userId));
  if (!raw) return null;
  const value = JSON.parse(raw) as StocktakeAttempt;
  stocktakePayload(value.items);
  return value;
}
const active = new Set<string>();
export async function saveStocktakeAtomically(userId: string, items: StocktakeItem[]): Promise<void> {
  if (active.has(userId)) throw new Error('A stocktake save is already running.');
  active.add(userId);
  try {
    await saveCount(items, {
      read: () => pendingStocktake(userId),
      write: attempt => AsyncStorage.setItem(key(userId), JSON.stringify(attempt)),
      clear: () => AsyncStorage.removeItem(key(userId)),
      id: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      }),
      send: async attempt => {
        const user = await getCurrentUser();
        if (!supabase || !user || user.id !== userId) throw new Error('Sign in to the original account to retry this count.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          const { data, error } = await supabase.rpc('save_stocktake_v1', {
            p_request_id: attempt.id, p_items: stocktakePayload(attempt.items),
          }).abortSignal(controller.signal);
          if (error) {
            if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Reliable stocktake saving needs the prepared database update. Your counts are kept for retry.');
            if (['P0001', '22P02', '23514', '42501'].includes(error.code)) {
              throw new StocktakeRejected(`${error.message}. Nothing from this attempt was saved. Refresh products and review the affected counts before submitting again.`);
            }
            throw new Error(`${error.message || 'Save could not be confirmed'}. Your counts are kept; retry the unfinished save.`);
          }
          if (data !== attempt.id) throw new Error('Save was not confirmed. Retry the unfinished save.');
        } finally { clearTimeout(timeout); }
      },
    });
  } finally { active.delete(userId); }
}
