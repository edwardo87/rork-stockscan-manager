import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useThemeStore } from "@/store/themeStore";
import { Appearance, TouchableOpacity } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import AppWrapper from "@/components/AppWrapper";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

// Prevent the splash screen from auto-hiding before the root layout mounts.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Splash may already be hidden in preview/runtime refreshes.
});

// Create a client outside of component to avoid recreation
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_RORK_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
  }
  throw new Error("No base url found, please set EXPO_PUBLIC_RORK_API_BASE_URL");
};

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
    }),
  ],
});

export default function RootLayout() {
  useEffect(() => {
    const hideSplash = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Ignore if the splash screen has already been hidden.
      }
    };

    hideSplash();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <AppWrapper>
          <RootLayoutNav />
        </AppWrapper>
      </trpc.Provider>
    </QueryClientProvider>
  );
}

// Visible "Back to Order" control for Order History. It always draws its own
// chevron (the platform back button is not reliably rendered on web), uses the
// router history when there is one, and falls back to the Order tab when the
// screen was opened directly.
function OrderHistoryBackButton() {
  const router = useRouter();
  const colors = useThemeStore((state) => state.colors);
  const backToOrder = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };
  return (
    <TouchableOpacity
      onPress={backToOrder}
      accessibilityRole="button"
      accessibilityLabel="Back to Order"
      accessibilityHint="Returns to the Order tab"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={{ padding: 4 }}
    >
      <ArrowLeft size={24} color={colors.primary} />
    </TouchableOpacity>
  );
}

function RootLayoutNav() {
  const { theme, colors } = useThemeStore();
  // Listen for system theme changes
  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme && isMounted) {
        // Clear any pending timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // Use setTimeout to ensure state update happens after current render cycle
        timeoutId = setTimeout(() => {
          if (isMounted) {
            // Follows the system only until the user picks a theme in Settings.
            useThemeStore.getState().applySystemTheme(colorScheme as 'light' | 'dark');
          }
        }, 0);
      }
    });

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      subscription?.remove();
    };
  }, []);
  
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
            title: "Order History",
            presentation: "card",
            headerLeft: () => <OrderHistoryBackButton />,
          }} 
        />
        <Stack.Screen 
          name="product/edit/[id]" 
          options={{ 
            title: "Edit Product",
            presentation: "card",
          }} 
        />
        <Stack.Screen 
          name="product/add" 
          options={{ 
            title: "Add Product",
            presentation: "card",
          }} 
        />
        <Stack.Screen 
          name="qr-codes-print" 
          options={{ 
            title: "Print QR Codes",
            presentation: "card",
          }} 
        />
        <Stack.Screen 
          name="about" 
          options={{ 
            title: "About",
            presentation: "card",
          }} 
        />
        <Stack.Screen 
          name="how-to-use" 
          options={{ 
            title: "How to Use",
            presentation: "card",
          }} 
        />
        <Stack.Screen
          name="catalogue-import"
          options={{
            title: "Import Catalogue",
            presentation: "card",
          }}
        />
        <Stack.Screen 
          name="coming-soon" 
          options={{ 
            title: "Coming Soon",
            presentation: "card",
          }} 
        />
      </Stack>
    </>
  );
}