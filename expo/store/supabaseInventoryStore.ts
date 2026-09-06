import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product, OrderItem, StocktakeItem, PurchaseOrder, Supplier } from '@/types/inventory';
import { suppliers as mockSuppliers } from '@/mocks/suppliers';

/**
 * Derives the supplier list (with emails) from the current product set.
 * Supplier email is sourced from product.supplierEmail so non-technical users
 * can manage suppliers entirely through the CSV import workflow.
 */
function deriveSuppliersFromProducts(products: Product[]): Supplier[] {
  const byName = new Map<string, Supplier>();
  for (const p of products) {
    const name = (p.supplier || '').trim();
    if (!name) continue;
    const existing = byName.get(name);
    const email = (p.supplierEmail || '').trim();
    if (!existing) {
      byName.set(name, {
        id: name,
        name,
        email,
        phone: '',
        address: '',
        contactPerson: '',
      });
    } else if (!existing.email && email) {
      existing.email = email;
    }
  }
  return Array.from(byName.values());
}
import { SupabaseService } from '@/services/supabaseService';
import { supabase, getCurrentUser, isSupabaseConfigured, signOut as signOutFromSupabase } from '@/lib/supabase';

/**
 * Detects Supabase JWT clock-skew errors (PGRST303 "JWT issued at future").
 * Happens when a session token was issued while the auth server clock was
 * offset — e.g. right after a project pause/restore. The token stays invalid
 * until re-authentication, so the app signs the user out with a clear message.
 */
const isStaleTokenError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('JWT issued at future') || message.includes('PGRST303');
};

const STALE_TOKEN_MESSAGE =
  'Your session is out of sync with the server. Please sign in again.';

interface SupabaseInventoryState {
  products: Product[];
  suppliers: Supplier[];
  currentOrderItems: OrderItem[];
  currentStocktakeItems: StocktakeItem[];
  purchaseOrders: PurchaseOrder[];
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  user: any | null;
  isSupabaseEnabled: boolean;
  lastSyncTime: string | null;
  
  // Auth Management
  setUser: (user: any | null) => void;
  setAuthenticated: (authenticated: boolean) => void;
  checkAuthStatus: () => Promise<void>;
  signOut: () => Promise<void>;
  
  // Product Management
  setProducts: (products: Product[]) => void;
  loadProducts: () => Promise<void>;
  loadPurchaseOrders: () => Promise<void>;
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (productId: string, updatedProduct: Partial<Product>) => Promise<void>;
  importProductsFromCSV: (products: Product[]) => Promise<void>;
  getProductByBarcode: (barcode: string) => Product | undefined;
  updateProductStock: (productId: string, newStock: number) => Promise<void>;
  
  // Order Management
  addToOrder: (product: Product, quantity: number) => void;
  updateOrderItemQuantity: (productId: string, quantity: number) => void;
  removeFromOrder: (productId: string) => void;
  submitOrder: () => Promise<void>;
  deletePurchaseOrder: (purchaseOrderId: string) => Promise<void>;
  
  // Stocktake Management
  addToStocktake: (product: Product, quantity: number) => void;
  updateStocktakeItemQuantity: (productId: string, quantity: number) => void;
  removeFromStocktake: (productId: string) => void;
  submitStocktake: () => Promise<void>;
  
  // Error Management
  setError: (error: string | null) => void;
  
  // Data Management
  clearAllData: () => Promise<void>;
  
  // Supabase Status
  checkSupabaseStatus: () => void;
  setupAuthListener: () => any;
}

export const useSupabaseInventoryStore = create<SupabaseInventoryState>()(
  persist(
    (set, get) => ({
      products: [],
      suppliers: mockSuppliers,
      currentOrderItems: [],
      currentStocktakeItems: [],
      purchaseOrders: [],
      isLoading: false,
      error: null,
      isAuthenticated: false,
      user: null,
      isSupabaseEnabled: false,
      lastSyncTime: null,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      
      setAuthenticated: (authenticated) => set({ isAuthenticated: authenticated }),
      
      checkAuthStatus: async () => {
        if (!isSupabaseConfigured()) {
          set({ isSupabaseEnabled: false });
          return;
        }
        
        set({ isSupabaseEnabled: true });
        
        try {
          const user = await getCurrentUser();
          set({ user, isAuthenticated: !!user });
          
          if (user) {
            // Load products and previously-submitted purchase orders so the
            // PO Preview screen and history survive logout/login and reopen.
            await get().loadProducts();
            await get().loadPurchaseOrders();
          }
        } catch (error) {
          console.error('Error checking auth status:', error);
          set({ user: null, isAuthenticated: false });
        }
      },
      
      signOut: async () => {
        try {
          await signOutFromSupabase();
          set({ 
            user: null, 
            isAuthenticated: false, 
            products: [], 
            currentOrderItems: [], 
            currentStocktakeItems: [], 
            purchaseOrders: [],
            lastSyncTime: null 
          });
        } catch (error) {
          console.error('Error signing out:', error);
          throw error;
        }
      },

      setProducts: (products) => set({
        products,
        suppliers: deriveSuppliersFromProducts(products),
        lastSyncTime: new Date().toISOString(),
      }),
      
      loadProducts: async () => {
        const state = get();
        if (!state.isSupabaseEnabled || !state.isAuthenticated) {
          return;
        }
        
        set({ isLoading: true, error: null });
        try {
          const products = await SupabaseService.getProducts();
          set({
            products,
            suppliers: deriveSuppliersFromProducts(products),
            isLoading: false,
            lastSyncTime: new Date().toISOString()
          });
        } catch (error) {
          console.error('Error loading products:', error);
          if (isStaleTokenError(error)) {
            set({ error: STALE_TOKEN_MESSAGE, isLoading: false });
            await get().signOut();
            return;
          }
          const errorMessage = error instanceof Error ? error.message : 'Failed to load products';
          set({ error: errorMessage, isLoading: false });
        }
      },
      
      addProduct: async (product) => {
        const state = get();
        
        if (state.isSupabaseEnabled && state.isAuthenticated) {
          set({ isLoading: true, error: null });
          try {
            const createdProduct = await SupabaseService.createProduct(product);
            set((state) => {
              const next = [...state.products, createdProduct];
              return {
                products: next,
                suppliers: deriveSuppliersFromProducts(next),
                isLoading: false,
                lastSyncTime: new Date().toISOString(),
              };
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to add product';
            set({ error: errorMessage, isLoading: false });
            throw error;
          }
        } else {
          // Fallback to local storage
          set((state) => {
            const next = [...state.products, product];
            return {
              products: next,
              suppliers: deriveSuppliersFromProducts(next),
              lastSyncTime: new Date().toISOString(),
            };
          });
        }
      },
      
      updateProduct: async (productId, updatedProduct) => {
        const state = get();
        
        if (state.isSupabaseEnabled && state.isAuthenticated) {
          set({ isLoading: true, error: null });
          try {
            const updated = await SupabaseService.updateProduct(productId, updatedProduct);
            set((state) => {
              const next = state.products.map(product =>
                product.id === productId ? updated : product
              );
              return {
                products: next,
                suppliers: deriveSuppliersFromProducts(next),
                isLoading: false,
                lastSyncTime: new Date().toISOString(),
              };
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to update product';
            set({ error: errorMessage, isLoading: false });
            throw error;
          }
        } else {
          // Fallback to local storage
          set((state) => {
            const next = state.products.map(product =>
              product.id === productId
                ? { ...product, ...updatedProduct }
                : product
            );
            return {
              products: next,
              suppliers: deriveSuppliersFromProducts(next),
              lastSyncTime: new Date().toISOString(),
            };
          });
        }
      },
      
      importProductsFromCSV: async (products) => {
        const state = get();
        console.log(`Importing ${products.length} products from CSV`);
        
        if (state.isSupabaseEnabled && state.isAuthenticated) {
          set({ isLoading: true, error: null });
          try {
            await SupabaseService.bulkCreateProducts(products);
            await get().loadProducts(); // Reload from database
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to import products';
            set({ error: errorMessage, isLoading: false });
            throw error;
          }
        } else {
          // Fallback to local storage
          set({
            products,
            suppliers: deriveSuppliersFromProducts(products),
            lastSyncTime: new Date().toISOString(),
          });
        }
      },
      
      getProductByBarcode: (barcode) => {
        return get().products.find(p => p.barcode === barcode);
      },

      updateProductStock: async (productId, newStock) => {
        await get().updateProduct(productId, { currentStock: newStock });
      },

      loadPurchaseOrders: async () => {
        const state = get();
        if (!state.isSupabaseEnabled || !state.isAuthenticated) {
          return;
        }
        try {
          const orders = await SupabaseService.getPurchaseOrders();
          set({
            purchaseOrders: orders,
            lastSyncTime: new Date().toISOString(),
          });
        } catch (error) {
          console.error('Error loading purchase orders:', error);
          if (isStaleTokenError(error)) {
            set({ error: STALE_TOKEN_MESSAGE });
            await get().signOut();
            return;
          }
          const errorMessage = error instanceof Error ? error.message : 'Failed to load purchase orders';
          set({ error: errorMessage });
        }
      },

      addToOrder: (product, quantity) => set((state) => {
        const existingItem = state.currentOrderItems.find(item => item.productId === product.id);
        
        if (existingItem) {
          return {
            currentOrderItems: state.currentOrderItems.map(item =>
              item.productId === product.id
                ? { ...item, quantity: item.quantity + quantity }
                : item
            )
          };
        }
        
        return {
          currentOrderItems: [
            ...state.currentOrderItems,
            {
              productId: product.id,
              barcode: product.barcode,
              name: product.name,
              quantity,
              supplier: product.supplier
            }
          ]
        };
      }),

      updateOrderItemQuantity: (productId, quantity) => set((state) => ({
        currentOrderItems: state.currentOrderItems.map(item =>
          item.productId === productId ? { ...item, quantity } : item
        )
      })),

      removeFromOrder: (productId) => set((state) => ({
        currentOrderItems: state.currentOrderItems.filter(item => item.productId !== productId)
      })),

      deletePurchaseOrder: async (purchaseOrderId) => {
        const state = get();
        if (state.isSupabaseEnabled && state.isAuthenticated) {
          await SupabaseService.deletePurchaseOrder(purchaseOrderId);
        }
        set((s) => ({
          purchaseOrders: s.purchaseOrders.filter((o) => o.id !== purchaseOrderId),
          lastSyncTime: new Date().toISOString(),
        }));
      },

      submitOrder: async () => {
        const state = get();
        set({ isLoading: true, error: null });

        try {
          // Group items by supplier
          const itemsBySupplier: Record<string, OrderItem[]> = {};
          
          state.currentOrderItems.forEach(item => {
            if (!itemsBySupplier[item.supplier]) {
              itemsBySupplier[item.supplier] = [];
            }
            itemsBySupplier[item.supplier].push(item);
          });
          
          // Create separate purchase orders for each supplier
          const newOrders: PurchaseOrder[] = Object.entries(itemsBySupplier).map(([supplierName, items]) => {
            const supplier = state.suppliers.find(s => s.name === supplierName);
            
            return {
              id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
              supplierId: supplier?.id || 'unknown',
              supplierName,
              date: new Date().toISOString(),
              items,
              status: 'submitted' as const
            };
          });
          
          // Attach supplier_email snapshot from the current supplier list so
          // historical orders retain the address used at submission time.
          for (const o of newOrders) {
            const sup = state.suppliers.find(s => s.name === o.supplierName);
            o.supplierEmail = sup?.email || undefined;
          }

          // Submit to Supabase if available, then reload from Supabase so the
          // returned database UUIDs replace the local placeholder ids.
          if (state.isSupabaseEnabled && state.isAuthenticated) {
            for (const order of newOrders) {
              await SupabaseService.createPurchaseOrder(order, order.items);
            }
          }

          // Update product stock levels and last ordered date
          const updatedProducts = state.products.map(product => {
            const orderItem = state.currentOrderItems.find(item => item.productId === product.id);
            if (orderItem) {
              const updatedProduct = {
                ...product,
                lastOrdered: new Date().toISOString(),
                currentStock: product.currentStock + orderItem.quantity
              };
              
              // Update in Supabase if available
              if (state.isSupabaseEnabled && state.isAuthenticated) {
                SupabaseService.updateProduct(product.id, {
                  lastOrdered: updatedProduct.lastOrdered,
                  currentStock: updatedProduct.currentStock
                }).catch(error => {
                  console.error('Failed to update product in Supabase:', error);
                });
              }
              
              return updatedProduct;
            }
            return product;
          });

          set({
            purchaseOrders: [...state.purchaseOrders, ...newOrders],
            currentOrderItems: [],
            products: updatedProducts,
            isLoading: false,
            lastSyncTime: new Date().toISOString()
          });

          // Reconcile with Supabase so subsequent reads use real DB UUIDs and
          // any future logout/login surfaces the same records.
          if (state.isSupabaseEnabled && state.isAuthenticated) {
            get().loadPurchaseOrders().catch(err =>
              console.error('Failed to reload purchase orders after submit:', err)
            );
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to submit order';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },

      addToStocktake: (product, quantity) => set((state) => {
        const existingItem = state.currentStocktakeItems.find(item => item.productId === product.id);
        
        if (existingItem) {
          return state;
        }
        
        return {
          currentStocktakeItems: [
            ...state.currentStocktakeItems,
            {
              productId: product.id,
              barcode: product.barcode,
              name: product.name,
              expectedQuantity: product.currentStock,
              actualQuantity: quantity,
              discrepancy: quantity - product.currentStock
            }
          ]
        };
      }),

      updateStocktakeItemQuantity: (productId, quantity) => set((state) => ({
        currentStocktakeItems: state.currentStocktakeItems.map(item =>
          item.productId === productId
            ? {
                ...item,
                actualQuantity: quantity,
                discrepancy: quantity - item.expectedQuantity
              }
            : item
        )
      })),

      removeFromStocktake: (productId) => set((state) => ({
        currentStocktakeItems: state.currentStocktakeItems.filter(item => item.productId !== productId)
      })),

      submitStocktake: async () => {
        const state = get();
        set({ isLoading: true, error: null });
        
        try {
          // Submit to Supabase if available
          if (state.isSupabaseEnabled && state.isAuthenticated) {
            await SupabaseService.createStocktake(state.currentStocktakeItems);
          }
          
          // Update product quantities based on stocktake
          const updatedProducts = state.products.map(product => {
            const stocktakeItem = state.currentStocktakeItems.find(item => item.productId === product.id);
            if (stocktakeItem) {
              const newStock = stocktakeItem.actualQuantity;
              const updatedProduct = {
                ...product,
                currentStock: newStock
              };
              
              // Update in Supabase if available
              if (state.isSupabaseEnabled && state.isAuthenticated) {
                SupabaseService.updateProduct(product.id, {
                  currentStock: newStock
                }).catch(error => {
                  console.error('Failed to update product stock in Supabase:', error);
                });
              }
              
              return updatedProduct;
            }
            return product;
          });
          
          set({
            products: updatedProducts,
            currentStocktakeItems: [],
            isLoading: false,
            lastSyncTime: new Date().toISOString()
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to submit stocktake';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },
      
      setError: (error) => set({ error }),
      
      clearAllData: async () => {
        const state = get();
        console.log('Clearing all inventory data');
        
        if (state.isSupabaseEnabled && state.isAuthenticated) {
          try {
            await SupabaseService.clearAllData();
          } catch (error) {
            console.error('Failed to clear data from Supabase:', error);
          }
        }
        
        set({
          products: [],
          currentOrderItems: [],
          currentStocktakeItems: [],
          purchaseOrders: [],
          lastSyncTime: null,
          error: null
        });
      },
      
      checkSupabaseStatus: () => {
        const isEnabled = isSupabaseConfigured();
        set({ isSupabaseEnabled: isEnabled });
      },
      
      setupAuthListener: () => {
        if (!supabase || !isSupabaseConfigured()) {
          return null;
        }
        
        // Set up auth state listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          const user = session?.user || null;
          set({ user, isAuthenticated: !!user });
          
          if (event === 'SIGNED_IN' && user) {
            get().loadProducts();
            get().loadPurchaseOrders();
          } else if (event === 'SIGNED_OUT') {
            set({ 
              products: [], 
              currentOrderItems: [], 
              currentStocktakeItems: [], 
              purchaseOrders: [],
              lastSyncTime: null 
            });
          }
        });
        
        return subscription;
      },
    }),
    {
      name: 'supabase-inventory-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist non-sensitive data when not using Supabase.
        // NEVER persist isSupabaseEnabled — it must be recomputed from env at every launch,
        // otherwise a previously-persisted `false` will mask freshly-added env vars and
        // the auth screen will never show.
        products: state.isSupabaseEnabled ? [] : state.products,
        purchaseOrders: state.isSupabaseEnabled ? [] : state.purchaseOrders,
        lastSyncTime: state.lastSyncTime,
      })
    }
  )
);