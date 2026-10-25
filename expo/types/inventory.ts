export interface Product {
  id: string;
  barcode: string;
  name: string;
  description: string;
  price: number;
  cost: number;
  sku: string;
  category: string;
  supplier: string;
  /** Optional supplier email — used to auto-fill the PO email recipient. */
  supplierEmail?: string;
  /** Chapter 2: link to a first-class supplier record (public.suppliers.id).
   *  Optional — legacy products keep only the supplier TEXT field. A null
   *  value clears the link when the supplier text no longer matches. */
  supplierId?: string | null;
  minStock: number;
  currentStock: number;
  unit: string;
  /** Chapter 3: unit physical stock is counted in (e.g. each, cartridge, m).
   *  Preferred over the legacy `unit` field, which once also received
   *  pack-size strings — that overload is no longer written. */
  stockUnit?: string;
  /** Chapter 3: the supplier's own product code, shown on purchase orders. */
  supplierCode?: string;
  /** Chapter 3: unit this product is ORDERED in (e.g. "box of 1,000", "carton"). */
  orderUnit?: string;
  /** Chapter 3: how many stock units one order unit contains (pack quantity). */
  unitsPerOrderUnit?: number;
  /** Chapter 3: purchase price EXCLUDING GST, per the price basis. */
  purchasePrice?: number;
  /** Chapter 3: quantity the purchase price refers to (e.g. 100 = priced per 100). */
  priceBasisQuantity?: number;
  /** Chapter 3: unit the price basis refers to (defaults to the stock unit). */
  priceBasisUnit?: string;
  imageUrl?: string;
  lastOrdered?: string; // ISO date string of last order
}

export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
}

/**
 * Chapter 2: the user's business profile (public.businesses row).
 * Ownership fields (created_by, role) are intentionally NOT editable here —
 * membership and role are controlled by the database, never by the app UI.
 */
export interface BusinessProfile {
  id: string;
  name: string;
  contactEmail: string;
  phone: string;
  address: string;
  deliveryAddress: string;
  logoUrl?: string;
}

export interface OrderItem {
  productId: string;
  barcode: string;
  name: string;
  /** Stock-unit equivalent (informational). Ordering never changes stock. */
  quantity: number;
  supplier: string;
  // ---- Chapter 3 purchasing snapshot (captured when the item is added) ----
  /** Supplier's product code for the PO. */
  supplierCode?: string;
  /** Ordering unit (e.g. "box of 1,000", "carton"). */
  orderUnit?: string;
  /** Quantity in ORDER units — what the supplier picks, ships and invoices. */
  orderQuantity?: number;
  /** Stock units per order unit at order time. */
  unitsPerOrderUnit?: number;
  /** Purchase price ex GST per price basis, at order time. */
  unitPrice?: number;
  priceBasisQuantity?: number;
  priceBasisUnit?: string;
  /** Extended line total ex GST for this item. */
  lineTotal?: number;
  /**
   * App-only (never persisted): why this item's pricing cannot be totalled
   * honestly (unknown pack quantity, price-unit mismatch). Blocks PO submission.
   */
  pricingIssue?: string;
}

export interface StocktakeItem {
  productId: string;
  barcode: string;
  name: string;
  expectedQuantity: number;
  actualQuantity: number;
  discrepancy: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  /** Supplier email snapshot at the time the PO was submitted (not derived live from products). */
  supplierEmail?: string;
  /** Chapter 2: link to a first-class supplier record (public.suppliers.id).
   *  App-side only; never overwrites historical snapshots. */
  supplierRecordId?: string;
  date: string;
  items: OrderItem[];
  status: 'draft' | 'submitted' | 'received';
  notes?: string;
}

export interface StocktakeSession {
  id: string;
  date: string;
  items: StocktakeItem[];
  status: 'in-progress' | 'completed';
  notes?: string;
}