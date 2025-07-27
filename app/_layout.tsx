import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useThemeStore } from "@/store/themeStore";
import { Appearance } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";

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
  const { theme, colors } = useThemeStore();
  
  // Listen for system theme changes
  useEffect(() => {
    let isMounted = true;
    
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme && isMounted) {
        // Use requestAnimationFrame to avoid state update during render
        requestAnimationFrame(() => {
          if (isMounted) {
            useThemeStore.getState().setTheme(colorScheme as 'light' | 'dark');
          }
        });
      }
    });

    return () => {
      isMounted = false;
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
            title: "PO Preview",
            presentation: "card",
          }} 
        />
      </Stack>
    </>
  );
}