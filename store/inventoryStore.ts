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
  
  // Product Management
  setProducts: (products: Product[]) => void;
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
  submitStocktake: () => void;
  
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

      setProducts: (products) => set({ products }),
      
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

      updateProduct: (productId, updatedProduct) => set((state) => ({
        products: state.products.map(product =>
          product.id === productId
            ? { ...product, ...updatedProduct }
            : product
        )
      })),

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

      submitStocktake: () => set((state) => {
        // Update product quantities based on stocktake
        const updatedProducts = state.products.map(product => {
          const stocktakeItem = state.currentStocktakeItems.find(item => item.productId === product.id);
          if (stocktakeItem) {
            // Low stock alert will be handled by the component
            const newStock = stocktakeItem.actualQuantity;
            return {
              ...product,
              currentStock: newStock
            };
          }
          return product;
        });
        
        return {
          products: updatedProducts,
          currentStocktakeItems: []
        };
      }),

      setError: (error) => set({ error }),
    }),
    {
      name: 'inventory-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        products: state.products,
        purchaseOrders: state.purchaseOrders
      })
    }
  )
);