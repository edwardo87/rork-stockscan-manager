import { supabase, getCurrentUser } from '@/lib/supabase';
import type { StocktakeItem, StocktakeSession } from '@/types/inventory';

export type StocktakeSummary = Omit<StocktakeSession, 'items'>;
export const HISTORY_PAGE_SIZE = 20;

async function currentClient(expectedUserId: string) {
  if (!supabase) throw new Error('Connect your account to view saved stocktakes.');
  const user = await getCurrentUser();
  if (!user || user.id !== expectedUserId) throw new Error('Your account changed. Reopen stocktake history.');
  return { client: supabase, user };
}

export async function loadStocktakePage(page: number, signal: AbortSignal, userId: string): Promise<StocktakeSummary[]> {
  const { client, user } = await currentClient(userId);
  const { data, error } = await client.from('stocktakes').select('id,date,status,notes')
    .eq('user_id', user.id).order('date', { ascending: false }).order('id', { ascending: false })
    .range(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE - 1).abortSignal(signal);
  if (error) throw new Error('Could not load stocktake history. Please try again.');
  return (data || []).map(row => ({ ...row, notes: row.notes || undefined }));
}

export async function loadStocktake(id: string, signal: AbortSignal, userId: string): Promise<StocktakeSession> {
  const { client, user } = await currentClient(userId);
  // Explicit ownership scope matches current app behaviour; RLS still applies.
  const { data: session, error } = await client.from('stocktakes').select('id,date,status,notes')
    .eq('user_id', user.id).eq('id', id).abortSignal(signal).single();
  if (error || !session) throw new Error('This stocktake is unavailable. Refresh history and try again.');
  const items: StocktakeItem[] = [];
  // Fetch every line rather than silently exporting only the server's first page.
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    if (signal.aborted) throw new Error('Loading cancelled.');
    const { data, error: itemError } = await client.from('stocktake_items')
      .select('product_id,barcode,name,expected_quantity,actual_quantity,discrepancy')
      .eq('stocktake_id', id).order('id').range(offset, offset + pageSize - 1).abortSignal(signal);
    if (itemError) throw new Error('Could not load all stocktake lines. Please try again.');
    for (const row of data || []) items.push({
      productId: row.product_id, barcode: row.barcode, name: row.name,
      expectedQuantity: Number(row.expected_quantity), actualQuantity: Number(row.actual_quantity),
      discrepancy: Number(row.discrepancy),
    });
    if ((data || []).length < pageSize) break;
  }
  return { ...session, notes: session.notes || undefined, items };
}
