import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product, OrderItem, StocktakeItem, PurchaseOrder } from '@/types/inventory';
import { products as mockProducts } from '@/mocks/products';
import { suppliers as mockSuppliers } from '@/mocks/suppliers';
import { trpcClient } from '@/lib/trpc';
import { Alert } from 'react-native';

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
          
          // Create purchase orders for each supplier
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

          // Show detailed response for debugging
          Alert.alert(
            "Order Submission Result",
            `Backend Response:
${JSON.stringify(response, null, 2)}`,
            [
              { 
                text: "OK", 
                onPress: () => {
                  if (response.success) {
                    // Only update state and navigate if successful
                    const now = new Date().toISOString();
                    const updatedProducts = state.products.map(product => {
                      const isInOrder = state.currentOrderItems.some(item => item.productId === product.id);
                      return isInOrder ? { ...product, lastOrdered: now } : product;
                    });
                    
                    set({
                      purchaseOrders: [...state.purchaseOrders, ...newOrders],
                      currentOrderItems: [],
                      products: updatedProducts,
                      isLoading: false
                    });
                  }
                }
              }
            ]
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to submit order';
          
          // Show detailed error for debugging
          Alert.alert(
            "Order Submission Error",
            `Error Details:
${errorMessage}

Full Error:
${JSON.stringify(error, null, 2)}`,
            [{ text: "OK" }]
          );
          
          set({ 
            error: errorMessage,
            isLoading: false
          });
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
            return {
              ...product,
              currentStock: stocktakeItem.actualQuantity
            };
          }
          return product;
        });
        
        return {
          products: updatedProducts,
          currentStocktakeItems: [] // Clear stocktake after submission
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