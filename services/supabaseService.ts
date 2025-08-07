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
      console.error('Error bulk creating products:', error);
      throw new Error('Failed to create products');
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

    // Create purchase order
    const { data: orderData, error: orderError } = await supabase
      .from('purchase_orders')
      .insert({
        id: order.id,
        user_id: user.id,
        supplier_id: order.supplierId,
        supplier_name: order.supplierName,
        date: order.date,
        status: order.status,
        notes: order.notes || null,
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating purchase order:', orderError);
      throw new Error('Failed to create purchase order');
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
      console.error('Error creating order items:', itemsError);
      throw new Error('Failed to create order items');
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
      console.error('Error creating reorder log entries:', reorderError);
      // Don't throw error for reorder log as it's not critical
    }
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

    // Create stocktake session
    const stocktakeId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    
    const { data: stocktakeData, error: stocktakeError } = await supabase
      .from('stocktakes')
      .insert({
        id: stocktakeId,
        user_id: user.id,
        date: new Date().toISOString(),
        status: 'completed',
      })
      .select()
      .single();

    if (stocktakeError) {
      console.error('Error creating stocktake:', stocktakeError);
      throw new Error('Failed to create stocktake');
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
      console.error('Error creating stocktake items:', itemsError);
      throw new Error('Failed to create stocktake items');
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

    // Delete in order to respect foreign key constraints
    await supabase.from('order_items').delete().in('purchase_order_id', 
      supabase.from('purchase_orders').select('id').eq('user_id', user.id)
    );
    
    await supabase.from('stocktake_items').delete().in('stocktake_id',
      supabase.from('stocktakes').select('id').eq('user_id', user.id)
    );
    
    await supabase.from('reorder_log').delete().eq('user_id', user.id);
    await supabase.from('purchase_orders').delete().eq('user_id', user.id);
    await supabase.from('stocktakes').delete().eq('user_id', user.id);
    await supabase.from('products').delete().eq('user_id', user.id);
  }
}