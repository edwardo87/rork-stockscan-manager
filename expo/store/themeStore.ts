import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

// "Worksite" identity: ink navy + hi-vis amber on concrete (light) / slate (dark).
// Legacy keys keep their roles: `background` = raised surface (cards, bars),
// `lightGray` = screen canvas, `primary` = tint that works as text AND fill.
// Light theme colors
const lightColors = {
  primary: "#1B2A41",
  secondary: "#2F9E44",
  background: "#FFFFFF",
  card: "#FAF9F6",
  text: "#1B2A41",
  border: "#E4E2DC",
  notification: "#E03131",
  success: "#2F9E44",
  warning: "#F08C00",
  error: "#E03131",
  inactive: "#5C677D",
  lightGray: "#F5F4F1",
  // Worksite tokens
  accent: "#F08C00",
  accentSoft: "#FEF3E2",
  accentText: "#B46600",
  successSoft: "#E9F7EC",
  chip: "#EDF2F7",
  track: "#EDEBE6",
  primaryFill: "#1B2A41",
  onPrimaryFill: "#FFFFFF",
};

// Dark theme colors
const darkColors: typeof lightColors = {
  primary: "#F59E1B",
  secondary: "#3BBF57",
  background: "#1C212B",
  card: "#222834",
  text: "#F0EDE6",
  border: "#2A3140",
  notification: "#FF6B6B",
  success: "#3BBF57",
  warning: "#F59E1B",
  error: "#FF6B6B",
  inactive: "#9AA3B5",
  lightGray: "#11141B",
  // Worksite tokens
  accent: "#F59E1B",
  accentSoft: "#382711",
  accentText: "#FFB454",
  successSoft: "#16321F",
  chip: "#262D3A",
  track: "#2C3444",
  primaryFill: "#243046",
  onPrimaryFill: "#F0EDE6",
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

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: getSystemTheme(),
      colors: getSystemTheme() === 'dark' ? darkColors : lightColors,
      
      toggleTheme: () => {
        const currentState = get();
        const newTheme = currentState.theme === 'light' ? 'dark' : 'light';
        set({
          theme: newTheme,
          colors: newTheme === 'dark' ? darkColors : lightColors,
        });
      },
      
      setTheme: (theme) => {
        const currentState = get();
        if (currentState.theme !== theme) {
          set({
            theme,
            colors: theme === 'dark' ? darkColors : lightColors,
          });
        }
      },
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Ensure colors are set correctly after rehydration
          state.colors = state.theme === 'dark' ? darkColors : lightColors;
        }
      },
    }
  )
);