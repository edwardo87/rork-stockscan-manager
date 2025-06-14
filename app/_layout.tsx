import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useThemeStore } from "@/store/themeStore";
import { Appearance } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "@/lib/trpc";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Create a client
const queryClient = new QueryClient();

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${process.env.EXPO_PUBLIC_RORK_API_BASE_URL}/api/trpc`,
    }),
  ],
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });
  
  const { theme, colors, setTheme } = useThemeStore();

  // Listen for system theme changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme) {
        setTheme(colorScheme as 'light' | 'dark');
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (error) {
      console.error(error);
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
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <RootLayoutNav />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

function RootLayoutNav() {
  const { theme, colors } = useThemeStore();
  
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