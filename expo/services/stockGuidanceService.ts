import { supabase, getCurrentUser } from '@/lib/supabase';

export async function saveStockGuidance(productId: string, userId: string, enabled: boolean, quantity: number | null): Promise<void> {
  if (enabled && (quantity == null || !Number.isFinite(quantity) || quantity < 0 || quantity > Number.MAX_SAFE_INTEGER)) {
    throw new Error('Enter a valid desired quantity of zero or more.');
  }
  const user = await getCurrentUser();
  if (!supabase || !user || user.id !== userId) throw new Error('Sign in to the same account and try again.');
  const { error } = await supabase.from('products').update({
    desired_stock_enabled: enabled,
    desired_stock_quantity: enabled ? quantity : null,
  }).eq('id', productId).eq('user_id', user.id).select('id').single();
  if (error) throw new Error('Could not save stock guidance. Your previous setting has not been replaced locally.');
}
