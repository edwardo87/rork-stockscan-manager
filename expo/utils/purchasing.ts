import { Product, OrderItem } from '@/types/inventory';

/**
 * Chapter 3 — universal product and purchasing model.
 *
 * Pure purchasing math shared by the order screen, the store, the PDF and the
 * email. Every function is tolerant of missing/legacy data: products without
 * Chapter 3 fields behave exactly as before (1 stock unit per order unit).
 *
 * Invariants (Decision Log / Roadmap):
 *  - Physical stock is ALWAYS counted in stock units.
 *  - Purchase orders are written in ORDER units (what the supplier ships).
 *  - Ordering never changes physical stock.
 *  - Prices are EXCLUDING GST, quoted per price basis (e.g. per 100 each).
 */

/** Stock unit for display/counting — prefers stockUnit, falls back to legacy unit. */
export function effectiveStockUnit(p: Pick<Product, 'stockUnit' | 'unit'>): string {
  const su = (p.stockUnit || '').trim();
  if (su) return su;
  const u = (p.unit || '').trim();
  // The legacy `unit` field sometimes received pack-size strings ("box of 12").
  // Such values are not honest stock units; report 'each' instead of them.
  if (/\d/.test(u)) return 'each';
  return u || 'each';
}

/** Stock units contained in one order unit (pack quantity). Defaults to 1. */
export function effectiveUnitsPerOrderUnit(
  p: Pick<Product, 'unitsPerOrderUnit'> | Partial<Product> | OrderItem,
): number {
  const n = Number(p.unitsPerOrderUnit);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Price-basis quantity — the purchase price refers to this many stock units. Defaults to 1. */
export function effectivePriceBasisQuantity(
  p: Partial<Pick<Product, 'priceBasisQuantity'>>,
): number {
  const n = Number(p.priceBasisQuantity);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Price-basis unit — defaults to the stock unit (e.g. $3.20 per 1 Lm). */
export function effectivePriceBasisUnit(p: Partial<Product>): string {
  const pbu = (p.priceBasisUnit || '').trim();
  if (pbu) return pbu;
  return effectiveStockUnit(p as Pick<Product, 'stockUnit' | 'unit'>);
}

/** Converts an order quantity (order units) into stock units. */
export function orderQtyToStockUnits(
  p: Partial<Pick<Product, 'unitsPerOrderUnit'>> | OrderItem,
  orderQty: number,
): number {
  const stock = orderQty * effectiveUnitsPerOrderUnit(p);
  // Avoid floating-point noise (e.g. 3 × 5.8 = 17.399999…).
  return Math.round(stock * 10000) / 10000;
}

/**
 * Extended line total EX GST for an order quantity in order units, or null
 * when no purchase price is recorded (a missing price is never treated as $0).
 * Accepts a product (purchasePrice) or an order-item snapshot (unitPrice).
 */
export function lineTotalExGst(
  p: Partial<Product> & Partial<OrderItem>,
  orderQty: number,
): number | null {
  const rawPrice = p.purchasePrice ?? p.unitPrice;
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const stockUnits = orderQtyToStockUnits(p as OrderItem, orderQty);
  const basis = effectivePriceBasisQuantity(p as Partial<Product>);
  const total = (stockUnits / basis) * price;
  return Math.round(total * 100) / 100;
}

/** Human label for the unit price, e.g. "$12.50 per 100 each" or "$3.20 per Lm". */
export function unitPriceLabel(p: Partial<Product>): string | null {
  const price = Number(p.purchasePrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const basisQty = effectivePriceBasisQuantity(p);
  const basisUnit = effectivePriceBasisUnit(p);
  const basis = basisQty === 1 ? basisUnit : `${basisQty} ${basisUnit}`;
  return `${formatUnitPrice(price)} per ${basis}`;
}

/**
 * Money for unit prices: 2 decimals normally, but up to 5 when the supplier
 * quotes finer than cents (e.g. $0.0177 screws) so precision is never lost.
 */
export function formatUnitPrice(price: number): string {
  if (Math.abs(price * 100 - Math.round(price * 100)) < 1e-6) return `$${price.toFixed(2)}`;
  const s = price.toFixed(5).replace(/0+$/, '');
  return `$${(s.split('.')[1] ?? '').length < 2 ? price.toFixed(2) : s}`;
}

export interface OrderQuantityText {
  /** Main purchasing quantity, e.g. "3 boxes of 1,000" or plain "3" when no order unit. */
  main: string;
  /** Stock-unit equivalent, e.g. "3,000 each" — null when identical to main. */
  stockEquivalent: string | null;
}

/** Formats an order quantity for POs, history and confirmations. */
export function formatOrderQuantity(
  p: Partial<Product> | OrderItem,
  orderQty: number,
): OrderQuantityText {
  const orderUnit = (p.orderUnit || '').trim();
  const stockUnit = effectiveStockUnit(p as Pick<Product, 'stockUnit' | 'unit'>);
  if (!orderUnit) {
    return { main: `${trimNum(orderQty)} ${stockUnit}`.trim(), stockEquivalent: null };
  }
  const upou = effectiveUnitsPerOrderUnit(p as OrderItem);
  const stockUnits = orderQtyToStockUnits(p as OrderItem, orderQty);
  return {
    main: `${trimNum(orderQty)} ${orderUnit}`,
    stockEquivalent: upou === 1 ? null : `(= ${formatThousands(stockUnits)} ${stockUnit})`,
  };
}

function trimNum(n: number): string {
  return String(Math.round(n * 10000) / 10000);
}

function formatThousands(n: number): string {
  return n.toLocaleString('en-AU', { maximumFractionDigits: 4 });
}

/**
 * Builds a Chapter 3 order item from a product and an order quantity in
 * ORDER units, snapshotting purchasing details so later product edits never
 * rewrite a submitted PO. `quantity` keeps its stock-unit meaning.
 */
export function buildOrderItem(product: Product, orderQty: number): OrderItem {
  const stockUnits = orderQtyToStockUnits(product, orderQty);
  const total = lineTotalExGst(product, orderQty);
  return {
    productId: product.id,
    barcode: product.barcode,
    name: product.name,
    quantity: stockUnits,
    supplier: product.supplier,
    supplierCode: product.supplierCode?.trim() || undefined,
    orderUnit: product.orderUnit?.trim() || undefined,
    orderQuantity: orderQty,
    unitsPerOrderUnit: effectiveUnitsPerOrderUnit(product),
    unitPrice: Number.isFinite(Number(product.purchasePrice)) && Number(product.purchasePrice) > 0
      ? Number(product.purchasePrice)
      : undefined,
    priceBasisQuantity: effectivePriceBasisQuantity(product),
    priceBasisUnit: effectivePriceBasisUnit(product),
    lineTotal: total ?? undefined,
  };
}
