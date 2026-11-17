import { OrderItem, PurchaseOrder } from '@/types/inventory';

/** Stable reference shared with PDFs, email and order history. */
export function getPoNumber(id: string): string {
  return `PO-${String(id).slice(-4).padStart(4, '0')}`;
}

/** Match identity, never a reused barcode or a similar product name. */
export function recentProductOrder(orders: PurchaseOrder[], productId: string) {
  const order = orders.filter(o => o.status !== 'draft' &&
    Number.isFinite(Date.parse(o.date)) && o.items.some(i => i.productId === productId))
    .reduce<PurchaseOrder | null>((latest, o) =>
      !latest || Date.parse(o.date) > Date.parse(latest.date) ? o : latest, null);
  if (!order) return null;
  return {
    date: order.date,
    reference: getPoNumber(order.id),
    // Preserve each line's historical unit. Never reinterpret using today's pack size.
    quantities: order.items.filter(i => i.productId === productId).map(i =>
      i.orderQuantity != null && Number.isFinite(i.orderQuantity) && i.orderQuantity > 0
        ? `${i.orderQuantity.toLocaleString()} ${i.orderUnit || 'order units'}`
        : `${i.quantity.toLocaleString()} recorded stock units`),
  };
}

/** Same grouping used in review and submission, without object-key collisions. */
export function supplierOrderGroups(items: OrderItem[]) {
  const groups = new Map<string, OrderItem[]>();
  for (const item of items) {
    const group = groups.get(item.supplier) || [];
    group.push(item);
    groups.set(item.supplier, group);
  }
  return Array.from(groups, ([supplier, data]) => ({ supplier, data }));
}

export function parseOrderQuantity(value: string): number | null {
  const text = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,4})?$/.test(text)) return null;
  const quantity = Number(text);
  return Number.isFinite(quantity) && quantity > 0 && quantity <= Number.MAX_SAFE_INTEGER
    ? quantity : null;
}
