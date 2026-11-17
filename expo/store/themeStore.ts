import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

// Original SmartStock palette (blue, iOS green) — restored at the owner's
// request after a graphite restyle was tried and rejected. The layout refresh
// (compact cards, scan hero, docket-style history) is kept. Legacy keys keep
// their roles: `background` = raised surface (cards, bars), `lightGray` =
// screen canvas, `primary` = tint that works as text AND fill. The added
// tokens map onto the original colours (accent = the original warning amber).
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
  // Original-family tokens (accent = original warning amber)
  accent: "#FF9500",
  accentSoft: "#FFF4E5",
  accentText: "#C77800",
  successSoft: "#EAF8EC",
  chip: "#EFF3F7",
  track: "#EDEFF2",
  primaryFill: "#0A4D90",
  onPrimaryFill: "#FFFFFF",
};

// Dark theme colors
const darkColors: typeof lightColors = {
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
  // Original-family tokens (accent = original dark warning amber)
  accent: "#FFD60A",
  accentSoft: "#3A2E0A",
  accentText: "#FFD60A",
  successSoft: "#16321F",
  chip: "#252528",
  track: "#2C2C2C",
  primaryFill: "#2E7DD1",
  onPrimaryFill: "#FFFFFF",
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
