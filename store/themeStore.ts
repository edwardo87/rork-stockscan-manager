import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

// Light theme colors
const lightColors = {
  primary: "#0A4D90",
  secondary: "#34C759",
  background: "#FFFFFF",
  card: "#F7F9FC",
  text: "#1C1C1E",
  border: "#E4E9F2",
  notification: "#FF3B30",
  success: "#34C759",
  warning: "#FF9500",
  error: "#FF3B30",
  inactive: "#8E8E93",
  lightGray: "#F2F4F7",
};

// Dark theme colors
const darkColors = {
  primary: "#2E7DD1",
  secondary: "#30D158",
  background: "#121212",
  card: "#1E1E1E",
  text: "#F7F9FC",
  border: "#2C2C2C",
  notification: "#FF453A",
  success: "#30D158",
  warning: "#FFD60A",
  error: "#FF453A",
  inactive: "#6C6C70",
  lightGray: "#1C1C1E",
};

type ThemeType = 'light' | 'dark';

interface ThemeState {
  theme: ThemeType;
  colors: typeof lightColors;
  toggleTheme: () => void;
  setTheme: (theme: ThemeType) => void;
}

// Get the system theme safely
const getSystemTheme = (): ThemeType => {
  try {
    return (Appearance.getColorScheme() as ThemeType) || 'light';
  } catch {
    return 'light';
  }
};

const systemTheme = getSystemTheme();

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: systemTheme,
      colors: systemTheme === 'dark' ? darkColors : lightColors,
      
      toggleTheme: () => set((state) => {
        const newTheme = state.theme === 'light' ? 'dark' : 'light';
        return {
          theme: newTheme,
          colors: newTheme === 'dark' ? darkColors : lightColors,
        };
      }),
      
      setTheme: (theme) => set({
        theme,
        colors: theme === 'dark' ? darkColors : lightColors,
      }),
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);