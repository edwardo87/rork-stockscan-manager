import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { Product } from '@/types/inventory';
import { useThemeStore } from '@/store/themeStore';
import { AlertTriangle, Info, Clock, Edit } from 'lucide-react-native';
import { formatDistanceToNow } from '@/utils/dateUtils';
import { useRouter } from 'expo-router';

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
  onEdit?: () => void;
}

export default function ProductCard({ product, onPress, onEdit }: ProductCardProps) {
  const { colors } = useThemeStore();
  const router = useRouter();
  const isLowStock = product.currentStock < product.minStock;

  const handleEdit = () => {
    if (onEdit) {
      onEdit();
    } else {
      router.push(`/product/edit/${product.id}`);
    }
  };

  return (
    <TouchableOpacity 
      style={[styles.container, { 
        backgroundColor: colors.background,
        borderColor: colors.border,
        shadowColor: colors.text,
      }]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{product.name}</Text>
          <Text style={[styles.sku, { color: colors.inactive }]}>{product.sku}</Text>
        </View>
        <TouchableOpacity 
          style={[styles.editButton, { backgroundColor: colors.lightGray }]}
          onPress={handleEdit}
        >
          <Edit size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={[styles.label, { color: colors.inactive }]}>QR Code:</Text>
          <Text style={[styles.value, { color: colors.text }]}>{product.barcode}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={[styles.label, { color: colors.inactive }]}>Supplier:</Text>
          <Text style={[styles.value, { color: colors.text }]}>{product.supplier}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={[styles.label, { color: colors.inactive }]}>Category:</Text>
          <Text style={[styles.value, { color: colors.text }]}>{product.category}</Text>
        </View>
        
        <View style={styles.stockContainer}>
          <View style={styles.detailRow}>
            <Text style={[styles.label, { color: colors.inactive }]}>Current Stock:</Text>
            <Text style={[
              styles.stockValue, 
              isLowStock ? { color: colors.warning } : { color: colors.success }
            ]}>
              {product.currentStock} {product.unit}
            </Text>
          </View>
          
          {isLowStock && (
            <View style={styles.warningContainer}>
              <AlertTriangle size={16} color={colors.warning} />
              <Text style={[styles.warningText, { color: colors.warning }]}>Low stock</Text>
            </View>
          )}
        </View>

        {product.lastOrdered && (
          <View style={styles.lastOrderedContainer}>
            <Clock size={14} color={colors.inactive} />
            <Text style={[styles.lastOrderedText, { color: colors.inactive }]}>
              Last ordered: {formatDistanceToNow(new Date(product.lastOrdered))}
            </Text>
          </View>
        )}
      </View>
      
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.priceContainer}>
          <Text style={[styles.priceLabel, { color: colors.inactive }]}>Price:</Text>
          <Text style={[styles.price, { color: colors.text }]}>${product.price.toFixed(2)}</Text>
        </View>
        
        <TouchableOpacity 
          style={[styles.infoButton, { backgroundColor: colors.lightGray }]}
          onPress={onPress}
        >
          <Info size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: Platform.OS === 'ios' ? 1 : 0,
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
  },
  sku: {
    fontSize: 14,
    fontWeight: '500',
  },
  details: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    width: 100,
  },
  value: {
    fontSize: 14,
    flex: 1,
    fontWeight: '500',
  },
  stockContainer: {
    marginTop: 8,
  },
  stockValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  warningText: {
    fontSize: 14,
    marginLeft: 4,
    fontWeight: '600',
  },
  lastOrderedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  lastOrderedText: {
    fontSize: 13,
    marginLeft: 6,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 14,
    marginRight: 4,
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
  },
  infoButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});