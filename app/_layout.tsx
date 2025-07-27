import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useThemeStore } from "@/store/themeStore";
import { Appearance } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient } from "@/lib/trpc";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Create a client outside of component to avoid recreation
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });
  
  useEffect(() => {
    if (error) {
      console.error('Font loading error:', error);
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <RootLayoutNav />
      </trpc.Provider>
    </QueryClientProvider>
  );
}

function RootLayoutNav() {
  const { theme, colors, setTheme } = useThemeStore();
  
  // Initialize theme and listen for system theme changes
  useEffect(() => {
    // Set initial theme based on system preference
    const currentScheme = Appearance.getColorScheme();
    if (currentScheme) {
      setTheme(currentScheme as 'light' | 'dark');
    }
    
    // Listen for system theme changes
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme) {
        setTheme(colorScheme as 'light' | 'dark');
      }
    });

    return () => subscription?.remove();
  }, [setTheme]);
  
  return (
    <>
      <StatusBar style={theme === 'dark' ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerBackTitle: "Back",
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.primary,
          headerTitleStyle: {
            fontWeight: '600',
            color: colors.text,
          },
          contentStyle: {
            backgroundColor: colors.lightGray,
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="product/[id]" 
          options={{ 
            title: "Product Details",
            presentation: "card",
          }} 
        />
        <Stack.Screen 
          name="order/success" 
          options={{ 
            title: "Order Submitted",
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="stocktake/success" 
          options={{ 
            title: "Stocktake Completed",
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="setup-guide" 
          options={{ 
            title: "Setup Guide",
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="po-preview" 
          options={{ 
            title: "PO Preview",
            presentation: "card",
          }} 
        />
      </Stack>
    </>
  );
}