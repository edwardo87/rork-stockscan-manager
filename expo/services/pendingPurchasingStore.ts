/**
 * Chapter 3/4 compatibility — on-device holding area for purchasing details.
 *
 * Until the owner runs chapter3-migration.sql, the products table has no
 * columns for supplier code, order unit, pack quantity, purchase price or
 * price basis. Rather than silently dropping those values (from catalogue
 * imports or product edits), they are kept here, keyed by product id,
 * overlaid onto products when the catalogue loads, and written to the
 * database automatically the first time the columns exist.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product } from '@/types/inventory';

const KEY = 'smartstock.pendingPurchasing.v1';

export const PURCHASING_FIELDS = [
  'supplierCode',
  'stockUnit',
  'orderUnit',
  'unitsPerOrderUnit',
  'purchasePrice',
  'priceBasisQuantity',
  'priceBasisUnit',
] as const;

export type PurchasingField = (typeof PURCHASING_FIELDS)[number];
export type PurchasingDetails = Partial<Pick<Product, PurchasingField>>;
export type PendingPurchasingMap = Record<string, PurchasingDetails>;

/** Purchasing fields that carry a real value (undefined/empty are dropped). */
export function pickPurchasing(p: Partial<Product>): PurchasingDetails {
  const out: PurchasingDetails = {};
  for (const f of PURCHASING_FIELDS) {
    const v = p[f];
    if (v === undefined || v === null || v === '') continue;
    (out as Record<string, unknown>)[f] = v;
  }
  return out;
}

export function hasPurchasing(p: Partial<Product>): boolean {
  return Object.keys(pickPurchasing(p)).length > 0;
}

export async function loadPendingPurchasing(): Promise<PendingPurchasingMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as PendingPurchasingMap) : {};
  } catch {
    return {};
  }
}

async function save(map: PendingPurchasingMap): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

/** Merges details into the pending map (later values win per field). */
export async function savePendingPurchasing(entries: PendingPurchasingMap): Promise<void> {
  const ids = Object.keys(entries);
  if (ids.length === 0) return;
  const map = await loadPendingPurchasing();
  for (const id of ids) {
    const merged = { ...(map[id] || {}), ...entries[id] };
    // Explicitly-cleared fields (empty string) are removed.
    for (const f of PURCHASING_FIELDS) {
      const v = entries[id][f];
      if (v === '' || (typeof v === 'number' && !Number.isFinite(v))) delete merged[f];
    }
    map[id] = merged;
  }
  await save(map);
}

export async function removePendingPurchasing(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const map = await loadPendingPurchasing();
  ids.forEach(id => { delete map[id]; });
  await save(map);
}

/** Overlays pending details onto products; DB values win where already set. */
export function overlayPendingPurchasing(products: Product[], map: PendingPurchasingMap): Product[] {
  if (Object.keys(map).length === 0) return products;
  return products.map(p => {
    const pending = map[p.id];
    if (!pending) return p;
    const next: Product = { ...p };
    for (const f of PURCHASING_FIELDS) {
      const current = p[f];
      if ((current === undefined || current === null || current === '') && pending[f] !== undefined) {
        (next as unknown as Record<string, unknown>)[f] = pending[f];
      }
    }
    return next;
  });
}

export function pendingCount(map: PendingPurchasingMap): number {
  return Object.keys(map).length;
}
