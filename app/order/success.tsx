import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckCircle, Home } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';


export default function OrderSuccessScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.logoText, { color: colors.primary }]}>SmartStock</Text>
        
        <View style={[styles.iconContainer, { backgroundColor: colors.lightGray }]}>
          <CheckCircle size={80} color={colors.success} />
        </View>
        
        <Text style={[styles.title, { color: colors.text }]}>Order Submitted!</Text>
        
        <Text style={[styles.message, { color: colors.inactive }]}>
          Your purchase order has been successfully submitted to your suppliers.
          You can track the status of your orders in the order history.
        </Text>
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => router.replace('/')}
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
  logoText: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
  },
});