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
export function effectivePriceBasisUnit(p: Partial<Product> | Partial<OrderItem>): string {
  const pbu = (p.priceBasisUnit || '').trim();
  if (pbu) return pbu;
  return effectiveStockUnit(p as unknown as Pick<Product, 'stockUnit' | 'unit'>);
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
 * when no purchase price is recorded (a missing price is never treated as $0)
 * or when the product's pricing cannot be resolved honestly (unknown pack
 * quantity, price unit that does not match the stock unit). A misleading
 * total is never produced.
 *
 * Accepts a product (purchasePrice) or an order-item snapshot (unitPrice).
 * Snapshots are trusted as stored: submitted POs never change retroactively.
 */
export function lineTotalExGst(
  p: Partial<Product> & Partial<OrderItem>,
  orderQty: number,
): number | null {
  const isProduct = p.purchasePrice !== undefined && p.purchasePrice !== null;
  const rawPrice = p.purchasePrice ?? p.unitPrice;
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const stockUnits = orderQtyToStockUnits(p as OrderItem, orderQty);
  let basis = effectivePriceBasisQuantity(p as Partial<Product>);
  if (isProduct) {
    const resolved = resolvePricing(p);
    if (!resolved.ok) return null;
    basis = resolved.basisInStockUnits;
  }
  const total = (stockUnits / basis) * price;
  return Math.round(total * 100) / 100;
}

/** Human label for the unit price, e.g. "$12.50 per 100 each" or "$3.20 per Lm". */
export function unitPriceLabel(p: Partial<Product> & Partial<OrderItem>): string | null {
  const price = Number(p.purchasePrice ?? p.unitPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  const basisQty = effectivePriceBasisQuantity(p);
  const basisUnit = effectivePriceBasisUnit(p);
  const basis = basisQty === 1 ? basisUnit : `${formatThousands(basisQty)} ${basisUnit}`;
  return `${formatUnitPrice(price)} per ${basis}`;
}

/**
 * Price of ONE order unit (pack/box/carton) ex GST, or null when there is no
 * price, no distinct order unit, or the pricing is unresolved.
 * KJ example: $0.0177 per each, pack of 1,000 → $17.70 per pack.
 */
export function orderUnitPrice(p: Partial<Product>): number | null {
  const orderUnit = (p.orderUnit || '').trim();
  if (!orderUnit) return null;
  const total = lineTotalExGst(p, 1);
  return total;
}

export interface PurchasingCostParts {
  /** Headline amount, e.g. "$17.70". */
  amount: string;
  /** What the amount buys, e.g. "per pack of 1,000". */
  per: string;
  /** Secondary per-stock-unit price, e.g. "$0.0177 each". */
  detail?: string;
  /** True when shown from the legacy per-unit cost (no purchasing data). */
  legacy?: boolean;
}

/**
 * Supplier purchasing cost for catalogue cards and product detail. Prefers
 * the pack price when the product is ordered in packs; falls back to the
 * legacy per-unit cost; null when nothing is recorded.
 */
export function purchasingCostParts(p: Partial<Product>): PurchasingCostParts | null {
  const price = Number(p.purchasePrice);
  const stockUnit = effectiveStockUnit(p as Pick<Product, 'stockUnit' | 'unit'>);
  if (!Number.isFinite(price) || price <= 0) {
    const cost = Number(p.cost);
    if (Number.isFinite(cost) && cost > 0) return { amount: formatUnitPrice(roundTo(cost, 5)), per: `per ${stockUnit}`, legacy: true };
    return null;
  }
  const basisQty = effectivePriceBasisQuantity(p);
  const basisUnit = effectivePriceBasisUnit(p);
  const plain: PurchasingCostParts = {
    amount: formatUnitPrice(price),
    per: `per ${basisQty === 1 ? basisUnit : `${formatThousands(basisQty)} ${basisUnit}`}`,
  };
  const orderUnit = (p.orderUnit || '').trim();
  const upou = effectiveUnitsPerOrderUnit(p);
  if (!orderUnit || upou <= 1) return plain;
  const resolved = resolvePricing(p);
  if (!resolved.ok) return plain;
  const packPrice = roundTo((price / resolved.basisInStockUnits) * upou, 2);
  const perStock = roundTo(price / resolved.basisInStockUnits, 5);
  const packLabel = /\d/.test(orderUnit) ? orderUnit : `${orderUnit} of ${formatThousands(upou)}`;
  return { amount: formatUnitPrice(packPrice), per: `per ${packLabel}`, detail: `${formatUnitPrice(perStock)} ${stockUnit}` };
}

/**
 * Purchasing cost as one line, e.g. "$17.70 per pack of 1,000 · $0.0177 each"
 * or "$3.20 per Lm". Null when no purchase price is recorded.
 */
export function purchasingCostLabel(p: Partial<Product>): string | null {
  if (!unitPriceLabel(p)) return null;
  const parts = purchasingCostParts(p);
  if (!parts) return null;
  return `${parts.amount} ${parts.per}${parts.detail ? ` · ${parts.detail}` : ''}`;
}

function roundTo(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Pricing guard — resolves whether a product's purchasing data can produce an
// honest line total. Supplier-independent: works on unit words only.
// ---------------------------------------------------------------------------

const UNIT_SYNONYMS: Record<string, string> = {
  each: 'each', ea: 'each', item: 'each', unit: 'each', pc: 'each', pce: 'each', piece: 'each', no: 'each', 'no.': 'each', nos: 'each',
  metre: 'metre', meter: 'metre', m: 'metre', lm: 'metre', mtr: 'metre', 'lineal metre': 'metre', 'linear metre': 'metre', 'lineal meter': 'metre', 'linear meter': 'metre', 'l/m': 'metre',
  kg: 'kg', kilogram: 'kg', kgs: 'kg',
  litre: 'litre', liter: 'litre', l: 'litre', lt: 'litre', ltr: 'litre',
  box: 'box', bx: 'box', boxe: 'box',
  pack: 'pack', pk: 'pack', pkt: 'pack', packet: 'pack',
  carton: 'carton', ctn: 'carton',
  roll: 'roll', rl: 'roll',
  length: 'length', len: 'length',
  case: 'case', bag: 'bag', bundle: 'bundle', bdl: 'bundle', pallet: 'pallet', tub: 'tub', sleeve: 'sleeve', tray: 'tray', dozen: 'dozen', doz: 'dozen',
  sheet: 'sheet', tube: 'tube', bar: 'bar', coil: 'coil', tin: 'tin', can: 'can', bottle: 'bottle', cartridge: 'cartridge',
  pair: 'pair', pr: 'pair', set: 'set', kit: 'kit',
  m2: 'm2', sqm: 'm2', 'sq m': 'm2', 'm²': 'm2',
};

/** Canonical unit word ("Pcs" → "each", "Lm" → "metre", "boxes" → "box"). */
export function normaliseUnit(raw: string | undefined | null): string {
  let u = (raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!u) return '';
  if (UNIT_SYNONYMS[u]) return UNIT_SYNONYMS[u];
  const noDot = u.replace(/\.$/, '');
  if (UNIT_SYNONYMS[noDot]) return UNIT_SYNONYMS[noDot];
  const singular = noDot.replace(/(es|s)$/, '');
  if (UNIT_SYNONYMS[singular]) return UNIT_SYNONYMS[singular];
  const singular2 = noDot.replace(/s$/, '');
  if (UNIT_SYNONYMS[singular2]) return UNIT_SYNONYMS[singular2];
  u = noDot;
  return u;
}

const CONTAINER_UNITS = new Set(['box', 'pack', 'carton', 'case', 'bag', 'bundle', 'pallet', 'tub', 'sleeve', 'tray', 'dozen']);
/** Single discrete items: pricing "per roll" for a product counted "each" is the same thing. */
const DISCRETE_SINGLE = new Set(['each', 'roll', 'sheet', 'tube', 'length', 'bar', 'coil', 'tin', 'can', 'bottle', 'cartridge']);

/** Container noun inside an order unit description ("pack of 1,000" → "pack"), or null. */
export function orderUnitContainer(orderUnit: string | undefined | null): string | null {
  const words = (orderUnit || '').toLowerCase().split(/[^a-z.]+/).filter(Boolean);
  for (const w of words) {
    const n = normaliseUnit(w);
    if (CONTAINER_UNITS.has(n)) return n;
  }
  return null;
}

/** Number written into an order-unit description ("pack of 1,000" → 1000), or null. */
export function quantityInOrderUnit(orderUnit: string | undefined | null): number | null {
  const m = (orderUnit || '').match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function unitsEquivalent(a: string, b: string): boolean {
  if (!a || !b) return true;
  if (a === b) return true;
  return DISCRETE_SINGLE.has(a) && DISCRETE_SINGLE.has(b);
}

export type PricingResolution =
  | { ok: true; basisInStockUnits: number }
  | { ok: false; reason: string };

/**
 * Resolves a product's purchasing data into a price basis expressed in STOCK
 * units, or explains why that cannot be done honestly. Used to block
 * misleading totals and PO submission until the product is corrected.
 */
export function resolvePricing(p: Partial<Product>): PricingResolution {
  const stockRaw = effectiveStockUnit(p as Pick<Product, 'stockUnit' | 'unit'>);
  const stock = normaliseUnit(stockRaw);
  const orderUnit = (p.orderUnit || '').trim();
  const orderNorm = normaliseUnit(orderUnit);
  const container = orderUnitContainer(orderUnit);
  const rawUpou = Number(p.unitsPerOrderUnit);
  const upouSet = Number.isFinite(rawUpou) && rawUpou > 0;
  const upou = upouSet ? rawUpou : 1;

  // --- Pack quantity: a container order unit needs a known contents count.
  if (orderUnit && container && orderNorm !== stock && !CONTAINER_UNITS.has(stock)) {
    const textQty = quantityInOrderUnit(orderUnit);
    if (textQty !== null && textQty > 1) {
      if (!upouSet || upou === 1) {
        return { ok: false, reason: `Pack quantity not set: "${orderUnit}" suggests ${formatThousands(textQty)} ${stockRaw} per ${container}, but the pack quantity is ${upouSet ? '1' : 'empty'}.` };
      }
      if (Math.abs(textQty - upou) > 1e-9) {
        return { ok: false, reason: `Pack quantity conflict: "${orderUnit}" but the pack quantity is ${formatThousands(upou)} ${stockRaw}.` };
      }
    } else if (textQty === null && upou <= 1) {
      return { ok: false, reason: `How many ${stockRaw} are in one ${orderUnit}? Set the pack quantity.` };
    }
  }

  const priceN = Number(p.purchasePrice);
  const hasPrice = Number.isFinite(priceN) && priceN > 0;
  const basisQty = effectivePriceBasisQuantity(p);
  if (!hasPrice) return { ok: true, basisInStockUnits: basisQty };

  // --- Price basis unit must be the stock unit, or the order unit itself.
  const basisRaw = (p.priceBasisUnit || '').trim();
  const basis = normaliseUnit(basisRaw);
  if (!basis || unitsEquivalent(basis, stock)) return { ok: true, basisInStockUnits: basisQty };
  if (orderUnit && (basis === orderNorm || (container && basis === container))) {
    return { ok: true, basisInStockUnits: basisQty * upou };
  }
  return {
    ok: false,
    reason: `Priced per ${basisRaw} but counted in ${stockRaw}. Set how the price converts to ${stockRaw}.`,
  };
}

/** Reason the product's pricing is unresolved, or null when it is safe to total. */
export function purchasingProblem(p: Partial<Product>): string | null {
  const r = resolvePricing(p);
  return r.ok ? null : r.reason;
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
    pricingIssue: purchasingProblem(product) ?? undefined,
  };
}

export interface OrderReadiness {
  /** Items re-snapshotted from the current product data (deleted products keep their snapshot). */
  items: OrderItem[];
  /** Items whose pricing is unresolved — the PO must not be generated until fixed. */
  blocked: { productId: string; name: string; issue: string }[];
}

/**
 * Final check before a PO is generated: every line is rebuilt from the
 * product as it is NOW (so a fix made after adding to the order is picked
 * up), and any line with unresolved pricing blocks submission. A missing
 * price does not block — it simply has no total (never $0).
 */
export function prepareOrderForSubmission(items: OrderItem[], products: Product[]): OrderReadiness {
  const byId = new Map(products.map(p => [p.id, p]));
  const out: OrderItem[] = [];
  const blocked: OrderReadiness['blocked'] = [];
  for (const item of items) {
    const product = byId.get(item.productId);
    const next = product ? buildOrderItem(product, item.orderQuantity ?? item.quantity) : item;
    if (next.pricingIssue) blocked.push({ productId: next.productId, name: next.name, issue: next.pricingIssue });
    out.push(next);
  }
  return { items: out, blocked };
}
