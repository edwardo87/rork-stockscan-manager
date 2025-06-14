import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Package } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';

interface LogoProps {
  size?: 'small' | 'large';
}

export default function SmartStockLogo({ size = 'small' }: LogoProps) {
  const { colors } = useThemeStore();
  const isSmall = size === 'small';

  return (
    <View style={styles.container}>
      <Package 
        size={isSmall ? 24 : 32} 
        color={colors.primary}
        style={styles.icon}
      />
      <View>
        <Text style={[
          styles.title,
          { color: colors.text },
          isSmall ? styles.smallTitle : styles.largeTitle
        ]}>
          SmartStock
        </Text>
        {!isSmall && (
          <Text style={[styles.subtitle, { color: colors.inactive }]}>
            Inventory Management
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  smallTitle: {
    fontSize: 18,
  },
  largeTitle: {
    fontSize: 24,
  },
  subtitle: {
    fontSize: 12,
    marginTop: -2,
  },
});