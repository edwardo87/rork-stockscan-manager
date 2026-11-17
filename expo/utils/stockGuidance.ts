import type { Product } from '@/types/inventory';
import { purchasingProblem } from '@/utils/purchasing';

export function parsePhysicalCount(text: string): number | null {
  const value = text.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER ? number : null;
}

/** Fresh count supplied by the user; never use cached currentStock or PO totals. */
export function suggestedOrder(product: Product, countedNow: number | null): number | null {
  if (!product.desiredStockAvailable || !product.desiredStockEnabled || countedNow == null ||
      !Number.isFinite(countedNow) || countedNow < 0 || !Number.isFinite(product.desiredStockQuantity) ||
      product.desiredStockQuantity! < 0 || purchasingProblem(product)) return null;
  const pack = product.unitsPerOrderUnit;
  // No assumptions about an unknown pack size, including legacy unit fallbacks.
  if (pack == null || !Number.isFinite(pack) || pack <= 0) return null;
  const missing = Math.max(0, product.desiredStockQuantity! - countedNow);
  const raw = missing / pack;
  // Whole order units, rounding floating-point noise only at integer boundaries.
  const rounded = Math.round(raw);
  const result = Math.abs(raw - rounded) <= Number.EPSILON * Math.max(1, raw) * 4 ? rounded : Math.ceil(raw);
  return Number.isSafeInteger(result) ? result : null;
}
