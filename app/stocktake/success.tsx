import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle, Home } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import SmartStockLogo from '@/components/SmartStockLogo';

export default function StocktakeSuccessScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <SmartStockLogo size="large" />
        
        <View style={[styles.iconContainer, { backgroundColor: colors.lightGray }]}>
          <CheckCircle size={80} color={colors.success} />
        </View>
        
        <Text style={[styles.title, { color: colors.text }]}>Stocktake Completed!</Text>
        
        <Text style={[styles.message, { color: colors.inactive }]}>
          Your inventory has been successfully updated based on your stocktake.
          You can view the stocktake history in the inventory reports.
        </Text>
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => router.replace('/stocktake')}
        >
          <Home size={20} color={colors.background} />
          <Text style={[styles.buttonText, { color: colors.background }]}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});