import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { ScanBarcode, ClipboardList, Package } from 'lucide-react-native';

interface EmptyStateProps {
  type: 'order' | 'stocktake' | 'products';
  onAction?: () => void;
}

export default function EmptyState({ type, onAction }: EmptyStateProps) {
  const { colors } = useThemeStore();
  
  let icon;
  let title;
  let message;
  let actionText;

  switch (type) {
    case 'order':
      icon = <ScanBarcode size={64} color={colors.primary} />;
      title = "No Items in Order";
      message = "Scan a product barcode to add it to your order.";
      break;
    case 'stocktake':
      icon = <ClipboardList size={64} color={colors.primary} />;
      title = "No Items in Stocktake";
      message = "Scan product barcodes to start counting your inventory.";
      break;
    case 'products':
      icon = <Package size={64} color={colors.primary} />;
      title = "No Products Found";
      message = "Your product catalog is empty. Upload a CSV file, add products manually, or set up Google Sheets integration to get started.";
      actionText = "Upload Stock";
      break;
    default:
      icon = <Package size={64} color={colors.primary} />;
      title = "Nothing Here Yet";
      message = "Get started by adding some items.";
      actionText = "Take Action";
  }

  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: colors.lightGray }]}>
        {icon}
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.inactive }]}>{message}</Text>
      {actionText && onAction && (
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: colors.primary }]} 
          onPress={onAction}
        >
          <Text style={[styles.buttonText, { color: colors.background }]}>{actionText}</Text>
        </TouchableOpacity>
      )}
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
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});