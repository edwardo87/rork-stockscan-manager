import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Edit, ArrowLeft, Package, AlertTriangle, Clock } from 'lucide-react-native';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import { formatDistanceToNow } from '@/utils/dateUtils';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useThemeStore();
  const { products } = useInventoryStore();
  
  const product = products.find(p => p.id === id);
  
  if (!product) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Product not found</Text>
      </View>
    );
  }

  const isLowStock = product.currentStock < product.minStock;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Product Details</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <View style={styles.titleContainer}>
            <Package size={24} color={colors.primary} style={styles.titleIcon} />
            <Text style={[styles.title, { color: colors.text }]}>{product.name}</Text>
          </View>
          <Text style={[styles.description, { color: colors.inactive }]}>{product.description}</Text>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.lightGray }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.inactive }]}>SKU:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{product.sku}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.inactive }]}>Barcode:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{product.barcode}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.inactive }]}>Category:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{product.category}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.inactive }]}>Supplier:</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{product.supplier}</Text>
          </View>
        </View>

        <View style={[styles.stockCard, { backgroundColor: colors.lightGray }]}>
          <View style={styles.stockInfo}>
            <Text style={[styles.stockLabel, { color: colors.inactive }]}>Current Stock:</Text>
            <Text style={[
              styles.stockValue, 
              { color: isLowStock ? colors.error : colors.success }
            ]}>
              {product.currentStock} {product.unit}
            </Text>
          </View>
          
          {isLowStock && (
            <View style={styles.warningContainer}>
              <AlertTriangle size={16} color={colors.warning} />
              <Text style={[styles.warningText, { color: colors.warning }]}>
                Below minimum ({product.minStock} {product.unit})
              </Text>
            </View>
          )}
          
          {product.lastOrdered && (
            <View style={styles.lastOrderedContainer}>
              <Clock size={14} color={colors.inactive} />
              <Text style={[styles.lastOrderedText, { color: colors.inactive }]}>
                Last ordered: {formatDistanceToNow(new Date(product.lastOrdered))}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.priceCard, { backgroundColor: colors.lightGray }]}>
          <View style={styles.priceRow}>
            <Text style={[styles.priceLabel, { color: colors.inactive }]}>Cost Price:</Text>
            <Text style={[styles.priceValue, { color: colors.text }]}>
              ${product.cost.toFixed(2)}
            </Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={[styles.priceLabel, { color: colors.inactive }]}>Selling Price:</Text>
            <Text style={[styles.priceValue, { color: colors.text }]}>
              ${product.price.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.adminActionsContainer}>
          <TouchableOpacity 
            style={[styles.adminActionButton, { 
              backgroundColor: colors.lightGray, 
              borderColor: colors.border 
            }]}
            onPress={() => router.push(`/product/edit/${id}`)}
          >
            <Edit size={20} color={colors.text} />
            <Text style={[styles.adminActionText, { color: colors.text }]}>Edit</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleIcon: {
    marginRight: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  infoCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoLabel: {
    width: 80,
    fontSize: 14,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  stockCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  stockInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stockLabel: {
    fontSize: 16,
    marginRight: 8,
  },
  stockValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  warningText: {
    fontSize: 14,
    marginLeft: 6,
    fontWeight: '500',
  },
  lastOrderedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  lastOrderedText: {
    fontSize: 13,
    marginLeft: 6,
  },
  priceCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 16,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  adminActionsContainer: {
    flexDirection: 'row',
    marginBottom: 32,
  },
  adminActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  adminActionText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
  },
});