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
  /** True until the user picks a theme in Settings; then system changes are ignored. */
  followSystem: boolean;
  toggleTheme: () => void;
  /** Explicit user choice (Settings). Stops following the system theme. */
  setTheme: (theme: ThemeType) => void;
  /** System appearance change — only applied while following the system. */
  applySystemTheme: (theme: ThemeType) => void;
}

// Get the system theme safely
const getSystemTheme = (): ThemeType => {
  try {
    return (Appearance.getColorScheme() as ThemeType) || 'light';
  } catch {
    return 'light';
  }
};

const paletteFor = (theme: ThemeType) => (theme === 'dark' ? darkColors : lightColors);

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: getSystemTheme(),
      colors: paletteFor(getSystemTheme()),
      followSystem: true,

      toggleTheme: () => {
        const newTheme: ThemeType = get().theme === 'light' ? 'dark' : 'light';
        set({ theme: newTheme, colors: paletteFor(newTheme), followSystem: false });
      },

      setTheme: (theme) => {
        set({ theme, colors: paletteFor(theme), followSystem: false });
      },

      applySystemTheme: (theme) => {
        const state = get();
        if (!state.followSystem || state.theme === theme) return;
        set({ theme, colors: paletteFor(theme) });
      },
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist only the choice — colours always come from the current palette,
      // so older saved palettes can never override the app's colours.
      partialize: (state) => ({ theme: state.theme, followSystem: state.followSystem }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Pick<ThemeState, 'theme' | 'followSystem'>>;
        const theme: ThemeType = saved.theme === 'dark' || saved.theme === 'light' ? saved.theme : current.theme;
        // Saves from before this flag existed were a deliberate pick only if the user toggled;
        // treat them as manual so the user's last choice is kept.
        const followSystem = typeof saved.followSystem === 'boolean' ? saved.followSystem : saved.theme ? false : true;
        return { ...current, theme, followSystem, colors: paletteFor(theme) };
      },
    }
  )
);
