import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product, OrderItem, StocktakeItem, PurchaseOrder } from '@/types/inventory';
import { products as mockProducts } from '@/mocks/products';
import { suppliers as mockSuppliers } from '@/mocks/suppliers';
import { trpcClient } from '@/lib/trpc';


interface InventoryState {
  products: Product[];
  suppliers: typeof mockSuppliers;
  currentOrderItems: OrderItem[];
  currentStocktakeItems: StocktakeItem[];
  purchaseOrders: PurchaseOrder[];
  isLoading: boolean;
  error: string | null;
  isGoogleSheetsEnabled: boolean;
  lastSyncTime: string | null;
  
  // Product Management
  setProducts: (products: Product[]) => void;
  loadProductsFromSheets: () => Promise<void>;
  getProductByBarcode: (barcode: string) => Product | undefined;
  updateProductStock: (productId: string, newStock: number) => void;
  updateProduct: (productId: string, updatedProduct: Product) => void;
  
  // Order Management
  addToOrder: (product: Product, quantity: number) => void;
  updateOrderItemQuantity: (productId: string, quantity: number) => void;
  removeFromOrder: (productId: string) => void;
  submitOrder: () => Promise<void>;
  
  // Stocktake Management
  addToStocktake: (product: Product, quantity: number) => void;
  updateStocktakeItemQuantity: (productId: string, quantity: number) => void;
  removeFromStocktake: (productId: string) => void;
  submitStocktake: () => Promise<void>;
  
  // Google Sheets Integration
  initializeGoogleSheets: () => Promise<void>;
  syncWithGoogleSheets: () => Promise<void>;
  setGoogleSheetsEnabled: (enabled: boolean) => void;
  
  // Error Management
  setError: (error: string | null) => void;
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      products: mockProducts,
      suppliers: mockSuppliers,
      currentOrderItems: [],
      currentStocktakeItems: [],
      purchaseOrders: [],
      isLoading: false,
      error: null,
      isGoogleSheetsEnabled: false,
      lastSyncTime: null,

      setProducts: (products) => set({ products, lastSyncTime: new Date().toISOString() }),
      
      loadProductsFromSheets: async () => {
        const state = get();
        if (!state.isGoogleSheetsEnabled) return;
        
        set({ isLoading: true, error: null });
        try {
          const response = await trpcClient.products.getProducts.query();
          set({ 
            products: response.products, 
            isLoading: false,
            lastSyncTime: new Date().toISOString()
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load products';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },
      
      getProductByBarcode: (barcode) => {
        return get().products.find(p => p.barcode === barcode);
      },

      updateProductStock: (productId, newStock) => set((state) => ({
        products: state.products.map(product =>
          product.id === productId
            ? { ...product, currentStock: newStock }
            : product
        )
      })),

      updateProduct: async (productId, updatedProduct) => {
        const state = get();
        
        // Update locally first
        set({
          products: state.products.map(product =>
            product.id === productId
              ? { ...product, ...updatedProduct }
              : product
          )
        });
        
        // Sync to Google Sheets if enabled
        if (state.isGoogleSheetsEnabled) {
          try {
            await trpcClient.products.updateProduct.mutate(updatedProduct);
            set({ lastSyncTime: new Date().toISOString() });
          } catch (error) {
            console.error('Failed to sync product update to Google Sheets:', error);
            // Don't throw error to avoid breaking local functionality
          }
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
              status: 'submitted'
            };
          });
          
          // Write to Google Sheet via tRPC
          const response = await trpcClient.orders.submitOrder.mutate({
            items: state.currentOrderItems
          });

          // Notification will be handled by the component

          // Update product stock levels
          const updatedProducts = state.products.map(product => {
            const orderItem = state.currentOrderItems.find(item => item.productId === product.id);
            if (orderItem) {
              return {
                ...product,
                lastOrdered: new Date().toISOString(),
                currentStock: product.currentStock + orderItem.quantity
              };
            }
            return product;
          });

          set({
            purchaseOrders: [...state.purchaseOrders, ...newOrders],
            currentOrderItems: [],
            products: updatedProducts,
            isLoading: false
          });

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
          // Update product quantities based on stocktake
          const updatedProducts = state.products.map(product => {
            const stocktakeItem = state.currentStocktakeItems.find(item => item.productId === product.id);
            if (stocktakeItem) {
              const newStock = stocktakeItem.actualQuantity;
              return {
                ...product,
                currentStock: newStock
              };
            }
            return product;
          });
          
          // Sync to Google Sheets if enabled
          if (state.isGoogleSheetsEnabled) {
            await trpcClient.stocktake.submitStocktake.mutate({
              stocktakeItems: state.currentStocktakeItems,
              updatedProducts
            });
          }
          
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

      initializeGoogleSheets: async () => {
        set({ isLoading: true, error: null });
        try {
          await trpcClient.sheets.initialize.mutate();
          set({ 
            isGoogleSheetsEnabled: true, 
            isLoading: false,
            lastSyncTime: new Date().toISOString()
          });
          
          // Load products from sheets after initialization
          await get().loadProductsFromSheets();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to initialize Google Sheets';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },
      
      syncWithGoogleSheets: async () => {
        const state = get();
        if (!state.isGoogleSheetsEnabled) return;
        
        await get().loadProductsFromSheets();
      },
      
      setGoogleSheetsEnabled: (enabled) => set({ isGoogleSheetsEnabled: enabled }),
      
      setError: (error) => set({ error }),
    }),
    {
      name: 'inventory-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        products: state.products,
        purchaseOrders: state.purchaseOrders,
        isGoogleSheetsEnabled: state.isGoogleSheetsEnabled,
        lastSyncTime: state.lastSyncTime
      })
    }
  )
);