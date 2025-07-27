import React from "react";
import { Tabs } from "expo-router";
import { ShoppingCart, ClipboardList, Package, Settings, ScanLine } from 'lucide-react-native';
import { useThemeStore } from "@/store/themeStore";
import { Platform, StyleSheet, View } from 'react-native';
import SmartStockLogo from "@/components/SmartStockLogo";

export default function TabLayout() {
  const { theme, colors } = useThemeStore();
  
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inactive,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingBottom: Platform.OS === 'ios' ? 28 : 12,
          paddingTop: 8,
          elevation: 8,
          shadowColor: colors.text,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        headerStyle: {
          backgroundColor: colors.background,
          elevation: 0,
          shadowColor: colors.text,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        headerTitleStyle: {
          color: colors.text,
          fontSize: 24,
          fontWeight: '700',
        },
        headerTitleAlign: 'left',
        headerShadowVisible: false,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          marginTop: -2,
          paddingBottom: Platform.OS === 'ios' ? 0 : 4,
        },
        tabBarIconStyle: {
          marginBottom: -4,
        },
        headerTitle: () => <SmartStockLogo />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: "Order",
          tabBarIcon: ({ color, size }) => (
            <ShoppingCart size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stocktake"
        options={{
          tabBarLabel: "Stocktake",
          tabBarIcon: ({ color, size }) => (
            <ClipboardList size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          tabBarLabel: "Scanner",
          tabBarIcon: ({ color, size }) => (
            <ScanLine size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          tabBarLabel: "Products",
          tabBarIcon: ({ color, size }) => (
            <Package size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: "Settings", 
          tabBarIcon: ({ color, size }) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}