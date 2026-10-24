import { supabase, getCurrentUser, isSupabaseConfigured } from '@/lib/supabase';
import { Product, OrderItem, StocktakeItem, PurchaseOrder, Supplier, BusinessProfile } from '@/types/inventory';
import { Database } from '@/types/supabase';
import {
  effectiveUnitsPerOrderUnit,
  effectivePriceBasisQuantity,
  effectivePriceBasisUnit,
} from '@/utils/purchasing';

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
  supplierId: supabaseProduct.supplier_id || undefined,
  minStock: supabaseProduct.min_stock,
  currentStock: supabaseProduct.current_stock,
  unit: supabaseProduct.unit,
  // ---- Chapter 3 (runtime-guarded: absent until the migration is run) ----
  supplierCode: supabaseProduct.supplier_code || undefined,
  stockUnit: supabaseProduct.stock_unit || undefined,
  orderUnit: supabaseProduct.order_unit || undefined,
  unitsPerOrderUnit: supabaseProduct.units_per_order_unit ?? undefined,
  purchasePrice:
    supabaseProduct.purchase_price !== null && supabaseProduct.purchase_price !== undefined
      ? Number(supabaseProduct.purchase_price)
      : undefined,
  priceBasisQuantity: supabaseProduct.price_basis_quantity ?? undefined,
  priceBasisUnit: supabaseProduct.price_basis_unit || undefined,
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
  // Chapter 2: link to the first-class supplier record when known. The
  // business_id column is intentionally NOT set — the BEFORE INSERT
  // ownership trigger fills it from the user's membership.
  supplier_id: product.supplierId || null,
  min_stock: product.minStock,
  current_stock: product.currentStock,
  unit: product.unit,
  image_url: product.imageUrl || null,
  last_ordered: product.lastOrdered || null,
});

// ===========================================================================
// Chapter 3 — universal product and purchasing model
// ===========================================================================

/**
 * Chapter 3 columns exist only after the owner runs chapter3-migration.sql on
 * production. The app detects their availability once per session and omits
 * the new columns from writes while absent — so the current build keeps
 * working BEFORE the migration and gains purchasing fields AFTER it, with no
 * failing inserts in either state.
 */
let chapter3ColumnsPromise: Promise<boolean> | null = null;

async function hasChapter3Columns(): Promise<boolean> {
  if (!supabase) return false;
  if (!chapter3ColumnsPromise) {
    chapter3ColumnsPromise = (async () => {
      try {
        const { error } = await supabase!
          .from('products')
          .select('supplier_code, stock_unit, order_unit, units_per_order_unit, purchase_price, price_basis_quantity, price_basis_unit')
          .limit(1);
        if (error) {
          console.log('Chapter 3 columns not available yet:', error.message);
          return false;
        }
        return true;
      } catch (err) {
        console.log('Chapter 3 column detection failed:', err);
        return false;
      }
    })();
  }
  return chapter3ColumnsPromise;
}

/** Chapter 3 product fields for inserts — spread in only when the DB has them. */
function chapter3ProductInsertFields(product: Product): Partial<SupabaseProductInsert> {
  return {
    supplier_code: product.supplierCode?.trim() || '',
    stock_unit: product.stockUnit?.trim() || '',
    order_unit: product.orderUnit?.trim() || '',
    units_per_order_unit: effectiveUnitsPerOrderUnit(product),
    purchase_price:
      Number.isFinite(Number(product.purchasePrice)) && Number(product.purchasePrice) > 0
        ? Number(product.purchasePrice)
        : null,
    price_basis_quantity: effectivePriceBasisQuantity(product),
    price_basis_unit: effectivePriceBasisUnit(product),
  };
}

/** Chapter 3 order-item fields for inserts — spread in only when the DB has them. */
function chapter3OrderItemFields(item: OrderItem): Record<string, unknown> {
  return {
    supplier_code: item.supplierCode?.trim() || '',
    order_unit: item.orderUnit?.trim() || '',
    units_per_order_unit:
      item.unitsPerOrderUnit !== undefined ? effectiveUnitsPerOrderUnit(item) : null,
    order_quantity: item.orderQuantity !== undefined ? item.orderQuantity : null,
    unit_price: item.unitPrice !== undefined ? item.unitPrice : null,
    price_basis_quantity: item.priceBasisQuantity !== undefined ? item.priceBasisQuantity : null,
    price_basis_unit: item.priceBasisUnit?.trim() || '',
    line_total: item.lineTotal !== undefined ? item.lineTotal : null,
  };
}

export class SupabaseService {
  // Check if service is available
  static isAvailable(): boolean {
    return isSupabaseConfigured() && supabase !== null;
  }

  /**
   * True once chapter3-migration.sql has run (purchasing columns exist).
   * Until then purchasing details are held on the device, never dropped.
   */
  static hasPurchasingColumns(): Promise<boolean> {
    return hasChapter3Columns();
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
    // Chapter 3 fields only when the database has them (see hasChapter3Columns).
    const includeChapter3 = await hasChapter3Columns();

    const { data, error } = await supabase
      .from('products')
      .insert(
        includeChapter3
          ? { ...supabaseProduct, ...chapter3ProductInsertFields(product) }
          : supabaseProduct,
      )
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
    if (updates.supplierId !== undefined) supabaseUpdates.supplier_id = updates.supplierId || null;
    if (updates.minStock !== undefined) supabaseUpdates.min_stock = updates.minStock;
    if (updates.currentStock !== undefined) supabaseUpdates.current_stock = updates.currentStock;
    if (updates.unit !== undefined) supabaseUpdates.unit = updates.unit;
    if (updates.imageUrl !== undefined) supabaseUpdates.image_url = updates.imageUrl || null;
    if (updates.lastOrdered !== undefined) supabaseUpdates.last_ordered = updates.lastOrdered || null;

    // Chapter 3 fields only when the database has them (see hasChapter3Columns).
    if (await hasChapter3Columns()) {
      if (updates.supplierCode !== undefined) supabaseUpdates.supplier_code = updates.supplierCode.trim();
      if (updates.stockUnit !== undefined) supabaseUpdates.stock_unit = updates.stockUnit.trim();
      if (updates.orderUnit !== undefined) supabaseUpdates.order_unit = updates.orderUnit.trim();
      if (updates.unitsPerOrderUnit !== undefined) supabaseUpdates.units_per_order_unit = effectiveUnitsPerOrderUnit(updates);
      if (updates.purchasePrice !== undefined) {
        supabaseUpdates.purchase_price =
          Number.isFinite(Number(updates.purchasePrice)) && Number(updates.purchasePrice) > 0
            ? Number(updates.purchasePrice)
            : null;
      }
      if (updates.priceBasisQuantity !== undefined) supabaseUpdates.price_basis_quantity = effectivePriceBasisQuantity(updates);
      if (updates.priceBasisUnit !== undefined) supabaseUpdates.price_basis_unit = updates.priceBasisUnit.trim();
    }

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
    // Chapter 3 fields only when the database has them (checked once per call).
    const includeChapter3 = await hasChapter3Columns();
    const payload = includeChapter3
      ? supabaseProducts.map((p, i) => ({ ...p, ...chapter3ProductInsertFields(products[i]) }))
      : supabaseProducts;

    const { data, error } = await supabase
      .from('products')
      .insert(payload)
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
        // Chapter 2: link to the first-class supplier record when one matches.
        // The supplier_name/email TEXT snapshots above are preserved unchanged.
        supplier_record_id: order.supplierRecordId || null,
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

    // Create order items. Chapter 3 purchasing snapshots included only when
    // the database has the columns; historical quantity semantics unchanged.
    const includeChapter3 = await hasChapter3Columns();
    const orderItems = items.map(item => ({
      purchase_order_id: orderData.id,
      product_id: item.productId,
      barcode: item.barcode,
      name: item.name,
      quantity: item.quantity,
      supplier: item.supplier,
      ...(includeChapter3 ? chapter3OrderItemFields(item) : {}),
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
        // ---- Chapter 3 purchasing snapshots (absent on historical rows) ----
        supplierCode: it.supplier_code || undefined,
        orderUnit: it.order_unit || undefined,
        orderQuantity: it.order_quantity !== null && it.order_quantity !== undefined ? Number(it.order_quantity) : undefined,
        unitsPerOrderUnit: it.units_per_order_unit !== null && it.units_per_order_unit !== undefined ? Number(it.units_per_order_unit) : undefined,
        unitPrice: it.unit_price !== null && it.unit_price !== undefined ? Number(it.unit_price) : undefined,
        priceBasisQuantity: it.price_basis_quantity !== null && it.price_basis_quantity !== undefined ? Number(it.price_basis_quantity) : undefined,
        priceBasisUnit: it.price_basis_unit || undefined,
        lineTotal: it.line_total !== null && it.line_total !== undefined ? Number(it.line_total) : undefined,
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

  // ==========================================================================
  // Chapter 2 — Business profile
  // ==========================================================================

  /**
   * Inserts the user's first business (created_by = self, required by RLS)
   * and establishes membership via the trusted claim_my_business() RPC.
   * The RPC is atomic: membership + business_id backfill of the user's
   * records happen in one database transaction. Never called for users who
   * already have a business.
   */
  static async createAndClaimBusiness(name: string, contactEmail: string): Promise<BusinessProfile> {
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

    const { data: business, error: insertError } = await supabase
      .from('businesses')
      .insert({
        name: name.trim(),
        contact_email: contactEmail.trim(),
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating business:', JSON.stringify(insertError, null, 2));
      throw new Error(`Failed to create business: ${insertError.message || 'Unknown database error'}`);
    }

    // Establishes membership; rejected if this account already has one or if
    // the business was not created by this user (guard trigger + RPC checks).
    const { data: claimedId, error: claimError } = await supabase.rpc('claim_my_business', {
      p_business_id: business.id,
    });

    if (claimError) {
      console.error('Error claiming business:', JSON.stringify(claimError, null, 2));
      throw new Error(`Failed to claim business: ${claimError.message || 'Unknown database error'}`);
    }
    if (claimedId !== business.id) {
      throw new Error('Unexpected business id returned by claim');
    }

    return {
      id: business.id,
      name: business.name ?? '',
      contactEmail: business.contact_email ?? '',
      phone: business.phone ?? '',
      address: business.address ?? '',
      deliveryAddress: business.delivery_address ?? '',
      logoUrl: business.logo_url || undefined,
    };
  }

  /**
   * Updates ONLY the profile columns (the database grants allow nothing else
   * — id / created_by / created_at are not updatable via the API).
   */
  static async updateBusinessProfile(
    businessId: string,
    updates: Partial<Pick<BusinessProfile, 'name' | 'contactEmail' | 'phone' | 'address' | 'deliveryAddress' | 'logoUrl'>>,
  ): Promise<BusinessProfile> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }
    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const payload: Database['public']['Tables']['businesses']['Update'] = {};
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.contactEmail !== undefined) payload.contact_email = updates.contactEmail.trim();
    if (updates.phone !== undefined) payload.phone = updates.phone.trim();
    if (updates.address !== undefined) payload.address = updates.address.trim();
    if (updates.deliveryAddress !== undefined) payload.delivery_address = updates.deliveryAddress.trim();
    if (updates.logoUrl !== undefined) payload.logo_url = updates.logoUrl.trim() || null;

    const { data, error } = await supabase
      .from('businesses')
      .update(payload)
      .eq('id', businessId)
      .select()
      .single();

    if (error) {
      console.error('Error updating business profile:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to save business profile: ${error.message || 'Unknown database error'}`);
    }

    return {
      id: data.id,
      name: data.name ?? '',
      contactEmail: data.contact_email ?? '',
      phone: data.phone ?? '',
      address: data.address ?? '',
      deliveryAddress: data.delivery_address ?? '',
      logoUrl: data.logo_url || undefined,
    };
  }

  // ==========================================================================
  // Chapter 2 — Supplier records (public.suppliers)
  // ==========================================================================

  static async getSupplierRecords(): Promise<Supplier[]> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }
    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    // RLS scopes rows to the caller's own business.
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error fetching suppliers:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to load suppliers: ${error.message || 'Unknown database error'}`);
    }

    return (data || []).map(s => ({
      id: s.id,
      name: s.name ?? '',
      email: s.ordering_email ?? '',
      phone: s.phone ?? '',
      address: s.address ?? '',
      contactPerson: s.contact_person ?? '',
    }));
  }

  static async createSupplierRecord(businessId: string, supplier: Supplier): Promise<Supplier> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }
    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        business_id: businessId,
        name: supplier.name.trim(),
        ordering_email: supplier.email.trim(),
        phone: supplier.phone.trim(),
        contact_person: supplier.contactPerson.trim(),
        address: supplier.address.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating supplier:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to create supplier: ${error.message || 'Unknown database error'}`);
    }

    return {
      id: data.id,
      name: data.name ?? '',
      email: data.ordering_email ?? '',
      phone: data.phone ?? '',
      address: data.address ?? '',
      contactPerson: data.contact_person ?? '',
    };
  }

  static async updateSupplierRecord(supplierId: string, supplier: Supplier): Promise<Supplier> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }
    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const { data, error } = await supabase
      .from('suppliers')
      .update({
        name: supplier.name.trim(),
        ordering_email: supplier.email.trim(),
        phone: supplier.phone.trim(),
        contact_person: supplier.contactPerson.trim(),
        address: supplier.address.trim(),
      })
      .eq('id', supplierId)
      .select()
      .single();

    if (error) {
      console.error('Error updating supplier:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to save supplier: ${error.message || 'Unknown database error'}`);
    }

    return {
      id: data.id,
      name: data.name ?? '',
      email: data.ordering_email ?? '',
      phone: data.phone ?? '',
      address: data.address ?? '',
      contactPerson: data.contact_person ?? '',
    };
  }

  /**
   * Deletes a supplier record with safeguards:
   * - supplier links on products are cleared first (the FK would otherwise
   *   block the delete); the product supplier TEXT fields are untouched;
   * - deletion is REFUSED when historical purchase orders reference the
   *   record, so order history always keeps a valid supplier link.
   */
  static async deleteSupplierRecord(supplierId: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Supabase is not configured');
    }
    if (!supabase) {
      throw new Error('Supabase client not available');
    }

    const poCount = await this.getSupplierPurchaseOrderCount(supplierId);
    if (poCount > 0) {
      throw new Error(
        `This supplier is used by ${poCount} purchase order${poCount === 1 ? '' : 's'} in your history. ` +
        'Historical orders are never modified, so the supplier record cannot be deleted.',
      );
    }

    // Unlink products (keeps their supplier TEXT snapshot fields unchanged).
    const { error: unlinkError } = await supabase
      .from('products')
      .update({ supplier_id: null })
      .eq('supplier_id', supplierId);

    if (unlinkError) {
      console.error('Error unlinking products from supplier:', JSON.stringify(unlinkError, null, 2));
      throw new Error(`Failed to unlink products: ${unlinkError.message || 'Unknown database error'}`);
    }

    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', supplierId);

    if (error) {
      console.error('Error deleting supplier:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to delete supplier: ${error.message || 'Unknown database error'}`);
    }
  }

  static async getSupplierPurchaseOrderCount(supplierId: string): Promise<number> {
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    const { count, error } = await supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_record_id', supplierId);

    if (error) {
      console.error('Error counting supplier purchase orders:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to check purchase order history: ${error.message || 'Unknown database error'}`);
    }
    return count ?? 0;
  }

  /**
   * Best-effort product linking: sets supplier_id on the caller's products
   * whose supplier TEXT matches the record name (case-insensitive). Never
   * touches any other column.
   */
  static async linkProductsToSupplierRecord(supplierName: string, supplierId: string): Promise<void> {
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    const user = await getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    // Escape LIKE wildcards in the supplier name.
    const pattern = supplierName.trim().replace(/[\\%_]/g, '\\$&');
    const { error } = await supabase
      .from('products')
      .update({ supplier_id: supplierId })
      .eq('user_id', user.id)
      .ilike('supplier', pattern);

    if (error) {
      // Linking is an enhancement; log but never break the flow.
      console.error('Error linking products to supplier record:', JSON.stringify(error, null, 2));
    }
  }
}