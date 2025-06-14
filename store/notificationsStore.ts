import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface NotificationsState {
  lowStockAlerts: boolean;
  orderUpdates: boolean;
  recentlyOrdered: boolean;
  toggleLowStockAlerts: () => void;
  toggleOrderUpdates: () => void;
  toggleRecentlyOrdered: () => void;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      lowStockAlerts: true,
      orderUpdates: true,
      recentlyOrdered: true,
      
      toggleLowStockAlerts: () => set((state) => ({ 
        lowStockAlerts: !state.lowStockAlerts 
      })),
      
      toggleOrderUpdates: () => set((state) => ({ 
        orderUpdates: !state.orderUpdates 
      })),
      
      toggleRecentlyOrdered: () => set((state) => ({ 
        recentlyOrdered: !state.recentlyOrdered 
      })),
    }),
    {
      name: 'notifications-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);