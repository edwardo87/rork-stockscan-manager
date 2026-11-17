import React from "react";
import { Tabs } from "expo-router";
import { ShoppingCart, ClipboardList, Package, Settings } from 'lucide-react-native';
import { useThemeStore } from "@/store/themeStore";
import { Platform, View, StyleSheet, ColorValue } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

function TabIcon({ Icon, color, size, focused, dot }: { Icon: LucideIcon; color: ColorValue; size: number; focused: boolean; dot: string }) {
  return (
    <View style={styles.iconWrap}>
      <Icon size={size - 2} color={color as string} strokeWidth={focused ? 2.4 : 1.9} />
      <View style={[styles.dot, { backgroundColor: focused ? dot : 'transparent' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
});

export default function TabLayout() {
  const { colors, theme } = useThemeStore();
  const activeTint = theme === 'dark' ? colors.text : colors.primary;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: colors.inactive,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: Platform.OS === 'ios' ? 90 : 70,
          paddingBottom: Platform.OS === 'ios' ? 28 : 12,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerStyle: {
          backgroundColor: colors.lightGray,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTitleStyle: {
          color: colors.text,
          fontSize: 22,
          fontWeight: '800',
        },
        headerTitleAlign: 'left',
        headerShadowVisible: false,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 0,
          paddingBottom: Platform.OS === 'ios' ? 0 : 4,
        },
        tabBarIconStyle: {
          marginBottom: -4,
        },
        headerTitle: 'SmartStock',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: "Order",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={ShoppingCart} size={size} color={color} focused={focused} dot={colors.accent} />
          ),
        }}
      />
      <Tabs.Screen
        name="stocktake"
        options={{
          tabBarLabel: "Stocktake",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={ClipboardList} size={size} color={color} focused={focused} dot={colors.accent} />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          tabBarLabel: "Products",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={Package} size={size} color={color} focused={focused} dot={colors.accent} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: "Settings", 
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon Icon={Settings} size={size} color={color} focused={focused} dot={colors.accent} />
          ),
        }}
      />
    </Tabs>
  );
}