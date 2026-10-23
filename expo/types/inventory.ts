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
  quantity: number;
  supplier: string;
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