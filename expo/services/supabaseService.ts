import { supabase, getCurrentUser, isSupabaseConfigured } from '@/lib/supabase';
import { Product, OrderItem, StocktakeItem, PurchaseOrder } from '@/types/inventory';
import { Database } from '@/types/supabase';

type SupabaseProduct = Database['public']['Tables']['products']['Row'];
type SupabaseProductInsert = Database['public']['Tables']['products']['Insert'];
type SupabaseProductUpdate = Database['public']['Tables']['products']['Update'];

// Helper functions to convert between app types and Supabase types
const convertSupabaseProductToApp = (supabaseProduct: SupabaseProduct): Product => ({
  id: supabaseProduct.id,
  barcode: supabaseProduct.barcode,
  name: supabaseProduct.name,
  description: supabaseProduct.description,
  price: supabaseProduct.price,
  cost: supabaseProduct.cost,
  sku: supabaseProduct.sku,
  category: supabaseProduct.category,
  supplier: supabaseProduct.supplier,
  supplierEmail: supabaseProduct.supplier_email || undefined,
  minStock: supabaseProduct.min_stock,
  currentStock: supabaseProduct.current_stock,
  unit: supabaseProduct.unit,
  imageUrl: supabaseProduct.image_url || undefined,
  lastOrdered: supabaseProduct.last_ordered || undefined,
});

const convertAppProductToSupabase = (product: Product, userId: string): SupabaseProductInsert => ({
  id: product.id,
  user_id: userId,
  barcode: product.barcode,
  name: product.name,
  description: product.description,
  price: product.price,
  cost: product.cost,
  sku: product.sku,
  category: product.category,
  supplier: product.supplier,
  supplier_email: product.supplierEmail || null,
  min_stock: product.minStock,
  current_stock: product.currentStock,
  unit: product.unit,
  image_url: product.imageUrl || null,
  last_ordered: product.lastOrdered || null,
});

export class SupabaseService {
  // Check if service is available
  static isAvailable(): boolean {
    return isSupabaseConfigured() && supabase !== null;
  }

  // Products
  static async getProducts(): Promise<Product[]> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }

    const user = await getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (error) {
      console.error('Error fetching products:', error);
      throw new Error('Failed to fetch products');
    }

    return data.map(convertSupabaseProductToApp);
  }

  static async createProduct(product: Product): Promise<Product> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }

    const user = await getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const supabaseProduct = convertAppProductToSupabase(product, user.id);
    
    const { data, error } = await supabase
      .from('products')
      .insert(supabaseProduct)
      .select()
      .single();

    if (error) {
      console.error('Error creating product:', error);
      throw new Error('Failed to create product');
    }

    return convertSupabaseProductToApp(data);
  }

  static async updateProduct(productId: string, updates: Partial<Product>): Promise<Product> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }

    const user = await getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Convert app updates to Supabase format
    const supabaseUpdates: SupabaseProductUpdate = {};
    if (updates.barcode !== undefined) supabaseUpdates.barcode = updates.barcode;
    if (updates.name !== undefined) supabaseUpdates.name = updates.name;
    if (updates.description !== undefined) supabaseUpdates.description = updates.description;
    if (updates.price !== undefined) supabaseUpdates.price = updates.price;
    if (updates.cost !== undefined) supabaseUpdates.cost = updates.cost;
    if (updates.sku !== undefined) supabaseUpdates.sku = updates.sku;
    if (updates.category !== undefined) supabaseUpdates.category = updates.category;
    if (updates.supplier !== undefined) supabaseUpdates.supplier = updates.supplier;
    if (updates.supplierEmail !== undefined) supabaseUpdates.supplier_email = updates.supplierEmail || null;
    if (updates.minStock !== undefined) supabaseUpdates.min_stock = updates.minStock;
    if (updates.currentStock !== undefined) supabaseUpdates.current_stock = updates.currentStock;
    if (updates.unit !== undefined) supabaseUpdates.unit = updates.unit;
    if (updates.imageUrl !== undefined) supabaseUpdates.image_url = updates.imageUrl || null;
    if (updates.lastOrdered !== undefined) supabaseUpdates.last_ordered = updates.lastOrdered || null;

    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const { data, error } = await supabase
      .from('products')
      .update(supabaseUpdates)
      .eq('id', productId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating product:', error);
      throw new Error('Failed to update product');
    }

    return convertSupabaseProductToApp(data);
  }

  static async deleteProduct(productId: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }

    const user = await getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting product:', error);
      throw new Error('Failed to delete product');
    }
  }

  static async bulkCreateProducts(products: Product[]): Promise<Product[]> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }

    const user = await getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const supabaseProducts = products.map(product => 
      convertAppProductToSupabase(product, user.id)
    );

    const { data, error } = await supabase
      .from('products')
      .insert(supabaseProducts)
      .select();

    if (error) {
      // Surface the real Postgres error so users see *why* the insert failed
      // (e.g. invalid UUID, RLS violation, missing column) instead of `[object Object]`.
      console.error('Error bulk creating products:', JSON.stringify(error, null, 2));
      const detail = error.message || error.details || error.hint || 'Unknown database error';
      throw new Error(`Failed to create products: ${detail}`);
    }

    return data.map(convertSupabaseProductToApp);
  }

  // Purchase Orders
  static async createPurchaseOrder(order: PurchaseOrder, items: OrderItem[]): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }

    const user = await getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    // Create purchase order. We do NOT pass `id` — Supabase generates a UUID,
    // because purchase_orders.id is a `uuid` column and the app's locally-generated
    // ids (Date.now()+random) are not valid UUIDs.
    const { data: orderData, error: orderError } = await supabase
      .from('purchase_orders')
      .insert({
        user_id: user.id,
        supplier_id: order.supplierId,
        supplier_name: order.supplierName,
        // Snapshot the supplier email at the moment the PO is submitted, so
        // historical orders keep the address used at the time even if the
        // underlying product is later edited.
        supplier_email: order.supplierEmail || null,
        date: order.date,
        status: order.status,
        notes: order.notes || null,
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating purchase order:', JSON.stringify(orderError, null, 2));
      const detail = orderError.message || orderError.details || orderError.hint || 'Unknown database error';
      throw new Error(`Failed to create purchase order: ${detail}`);
    }

    // Create order items
    const orderItems = items.map(item => ({
      purchase_order_id: orderData.id,
      product_id: item.productId,
      barcode: item.barcode,
      name: item.name,
      quantity: item.quantity,
      supplier: item.supplier,
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Error creating order items:', JSON.stringify(itemsError, null, 2));
      const detail = itemsError.message || itemsError.details || itemsError.hint || 'Unknown database error';
      throw new Error(`Failed to create order items: ${detail}`);
    }

    // Log reorder entries
    const reorderEntries = items.map(item => ({
      user_id: user.id,
      product_id: item.productId,
      product_name: item.name,
      quantity_ordered: item.quantity,
      supplier: item.supplier,
      order_date: order.date,
    }));

    const { error: reorderError } = await supabase
      .from('reorder_log')
      .insert(reorderEntries);

    if (reorderError) {
      console.error('Error creating reorder log entries:', JSON.stringify(reorderError, null, 2));
      // Don't throw error for reorder log as it's not critical
    }
  }

  /**
   * Fetches all purchase orders (with their items) belonging to the current user.
   * Returns them in app-shaped `PurchaseOrder` objects, newest first.
   */
  static async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }

    const user = await getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const { data: orders, error: ordersError } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: true });

    if (ordersError) {
      console.error('Error fetching purchase orders:', JSON.stringify(ordersError, null, 2));
      const detail = ordersError.message || ordersError.details || ordersError.hint || 'Unknown database error';
      throw new Error(`Failed to fetch purchase orders: ${detail}`);
    }

    if (!orders || orders.length === 0) {
      return [];
    }

    const orderIds = orders.map(o => o.id);
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .in('purchase_order_id', orderIds);

    if (itemsError) {
      console.error('Error fetching order items:', JSON.stringify(itemsError, null, 2));
      const detail = itemsError.message || itemsError.details || itemsError.hint || 'Unknown database error';
      throw new Error(`Failed to fetch order items: ${detail}`);
    }

    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const it of items || []) {
      const arr = itemsByOrder.get(it.purchase_order_id) || [];
      arr.push({
        productId: it.product_id,
        barcode: it.barcode,
        name: it.name,
        quantity: Number(it.quantity),
        supplier: it.supplier,
      });
      itemsByOrder.set(it.purchase_order_id, arr);
    }

    return orders.map(o => ({
      id: o.id,
      supplierId: o.supplier_id,
      supplierName: o.supplier_name,
      supplierEmail: (o as any).supplier_email || undefined,
      date: o.date,
      status: o.status as PurchaseOrder['status'],
      notes: o.notes || undefined,
      items: itemsByOrder.get(o.id) || [],
    }));
  }

  // Stocktakes
  static async createStocktake(stocktakeItems: StocktakeItem[]): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }

    const user = await getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    // Create stocktake session. Do NOT pass `id` — `stocktakes.id` is a uuid
    // column with `gen_random_uuid()` default. Passing a non-UUID fails RLS
    // with `invalid input syntax for type uuid`.
    const { data: stocktakeData, error: stocktakeError } = await supabase
      .from('stocktakes')
      .insert({
        user_id: user.id,
        date: new Date().toISOString(),
        status: 'completed',
      })
      .select()
      .single();

    if (stocktakeError) {
      console.error('Error creating stocktake:', JSON.stringify(stocktakeError, null, 2));
      const detail = stocktakeError.message || stocktakeError.details || stocktakeError.hint || 'Unknown database error';
      throw new Error(`Failed to create stocktake: ${detail}`);
    }

    // Create stocktake items
    const items = stocktakeItems.map(item => ({
      stocktake_id: stocktakeData.id,
      product_id: item.productId,
      barcode: item.barcode,
      name: item.name,
      expected_quantity: item.expectedQuantity,
      actual_quantity: item.actualQuantity,
      discrepancy: item.discrepancy,
    }));

    const { error: itemsError } = await supabase
      .from('stocktake_items')
      .insert(items);

    if (itemsError) {
      console.error('Error creating stocktake items:', JSON.stringify(itemsError, null, 2));
      const detail = itemsError.message || itemsError.details || itemsError.hint || 'Unknown database error';
      throw new Error(`Failed to create stocktake items: ${detail}`);
    }
  }

  /**
   * Deletes a purchase order and its linked order_items (via FK cascade).
   * Scoped by user_id so RLS rejects cross-user deletions.
   */
  static async deletePurchaseOrder(purchaseOrderId: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }

    const user = await getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    // order_items has `on delete cascade` against purchase_orders, so a single
    // delete here removes both. We also defensively delete order_items first
    // in case the FK cascade is missing on older databases.
    await supabase
      .from('order_items')
      .delete()
      .eq('purchase_order_id', purchaseOrderId);

    const { error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', purchaseOrderId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting purchase order:', JSON.stringify(error, null, 2));
      const detail = error.message || error.details || error.hint || 'Unknown database error';
      throw new Error(`Failed to delete purchase order: ${detail}`);
    }
  }

  // Clear all user data
  static async clearAllData(): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }

    const user = await getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    try {
      // Delete in order to respect foreign key constraints
      // First get the IDs we need to delete
      const { data: purchaseOrderIds, error: poError } = await supabase
        .from('purchase_orders')
        .select('id')
        .eq('user_id', user.id);
      
      if (poError) {
        console.error('Error fetching purchase order IDs:', poError);
      }
      
      const { data: stocktakeIds, error: stError } = await supabase
        .from('stocktakes')
        .select('id')
        .eq('user_id', user.id);
      
      if (stError) {
        console.error('Error fetching stocktake IDs:', stError);
      }
      
      // Delete related records
      if (purchaseOrderIds && purchaseOrderIds.length > 0) {
        const orderIds = purchaseOrderIds.map(po => po.id);
        const { error: orderItemsError } = await supabase
          .from('order_items')
          .delete()
          .in('purchase_order_id', orderIds);
        
        if (orderItemsError) {
          console.error('Error deleting order items:', orderItemsError);
        }
      }
      
      if (stocktakeIds && stocktakeIds.length > 0) {
        const stockIds = stocktakeIds.map(st => st.id);
        const { error: stocktakeItemsError } = await supabase
          .from('stocktake_items')
          .delete()
          .in('stocktake_id', stockIds);
        
        if (stocktakeItemsError) {
          console.error('Error deleting stocktake items:', stocktakeItemsError);
        }
      }
      
      // Delete main records
      const { error: reorderError } = await supabase
        .from('reorder_log')
        .delete()
        .eq('user_id', user.id);
      
      if (reorderError) {
        console.error('Error deleting reorder log:', reorderError);
      }
      
      const { error: purchaseOrdersError } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('user_id', user.id);
      
      if (purchaseOrdersError) {
        console.error('Error deleting purchase orders:', purchaseOrdersError);
      }
      
      const { error: stocktakesError } = await supabase
        .from('stocktakes')
        .delete()
        .eq('user_id', user.id);
      
      if (stocktakesError) {
        console.error('Error deleting stocktakes:', stocktakesError);
      }
      
      const { error: productsError } = await supabase
        .from('products')
        .delete()
        .eq('user_id', user.id);
      
      if (productsError) {
        console.error('Error deleting products:', productsError);
        throw new Error('Failed to delete products');
      }
    } catch (error) {
      console.error('Error clearing user data:', error);
      throw new Error('Failed to clear user data');
    }
  }
}