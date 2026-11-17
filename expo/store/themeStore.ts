import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

// "Graphite" identity: near-black charcoal + signal red on warm concrete (light)
// / graphite slate (dark). Legacy keys keep their roles: `background` = raised
// surface (cards, bars), `lightGray` = screen canvas, `primary` = tint that
// works as text AND fill.
// Light theme colors
const lightColors = {
  primary: "#23262B",
  secondary: "#2F9E44",
  background: "#FFFFFF",
  card: "#FAFAF9",
  text: "#23262B",
  border: "#E5E4E0",
  notification: "#C92A2A",
  success: "#2F9E44",
  warning: "#E8930C",
  error: "#C92A2A",
  inactive: "#5E6570",
  lightGray: "#F4F4F2",
  // Graphite tokens
  accent: "#D64545",
  accentSoft: "#FCECEC",
  accentText: "#B02E2E",
  successSoft: "#E9F7EC",
  chip: "#EEF0F2",
  track: "#E9E8E5",
  primaryFill: "#23262B",
  onPrimaryFill: "#FFFFFF",
};

// Dark theme colors
const darkColors: typeof lightColors = {
  primary: "#F0EEEA",
  secondary: "#3BBF57",
  background: "#1D2024",
  card: "#24282D",
  text: "#F0EEEA",
  border: "#2C3138",
  notification: "#FF7B7B",
  success: "#3BBF57",
  warning: "#F0A020",
  error: "#FF7B7B",
  inactive: "#9AA1AC",
  lightGray: "#131518",
  // Graphite tokens
  accent: "#E45A5A",
  accentSoft: "#341D1D",
  accentText: "#FF8A8A",
  successSoft: "#16321F",
  chip: "#272C33",
  track: "#2E343C",
  primaryFill: "#31363F",
  onPrimaryFill: "#F0EEEA",
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
