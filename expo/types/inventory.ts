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