import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Edit, ShoppingBag, ClipboardList, AlertTriangle, Clock } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { formatDistanceToNow } from '@/utils/dateUtils';

export default function ProductScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useThemeStore();
  const { products, getProductByBarcode, addToOrder, addToStocktake } = useInventoryStore();
  
  const product = products.find(p => p.id === id);
  
  if (!product) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Product not found</Text>
      </View>
    );
  }

  const isLowStock = product.currentStock < product.minStock;

  const handleAddToOrder = () => {
    addToOrder(product, 1);
    Alert.alert(
      "Added to Order",
      `Added 1 ${product.name} to your order.`,
      [
        { 
          text: "View Order", 
          onPress: () => router.push('/')
        },
        { text: "OK" }
      ]
    );
  };

  const handleAddToStocktake = () => {
    addToStocktake(product, product.currentStock);
    Alert.alert(
      "Added to Stocktake",
      `Added ${product.name} to your stocktake.`,
      [
        { 
          text: "View Stocktake", 
          onPress: () => router.push('/stocktake')
        },
        { text: "OK" }
      ]
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView 
          style={[styles.scrollView, { backgroundColor: colors.background }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {/* Header Section */}
            <View style={styles.header}>
              <View>
                <Text style={[styles.name, { color: colors.text }]}>{product.name}</Text>
                <Text style={[styles.sku, { color: colors.inactive }]}>{product.sku}</Text>
              </View>
              <TouchableOpacity 
                style={[styles.editButton, { backgroundColor: colors.lightGray }]}
                onPress={() => router.push(`/product/edit/${id}`)}
              >
                <Edit size={20} color={colors.primary} />
                <Text style={[styles.editButtonText, { color: colors.primary }]}>Edit</Text>
              </TouchableOpacity>
            </View>

            {/* Stock Status */}
            <View style={[styles.stockStatus, { backgroundColor: colors.lightGray }]}>
              <View style={styles.stockInfo}>
                <Text style={[styles.stockLabel, { color: colors.inactive }]}>Current Stock:</Text>
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
                  <Text style={[styles.warningText, { color: colors.warning }]}>
                    Below minimum ({product.minStock})
                  </Text>
                </View>
              )}
            </View>

            {/* Details Section */}
            <View style={[styles.section, { borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Details</Text>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.inactive }]}>Category:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{product.category}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.inactive }]}>Supplier:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{product.supplier}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.inactive }]}>Barcode:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{product.barcode}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.inactive }]}>Price:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  ${product.price.toFixed(2)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.inactive }]}>Cost:</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>
                  ${product.cost.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Description Section */}
            <View style={[styles.section, { borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Description</Text>
              <Text style={[styles.description, { color: colors.text }]}>
                {product.description}
              </Text>
            </View>

            {/* Last Ordered Info */}
            {product.lastOrdered && (
              <View style={styles.lastOrdered}>
                <Clock size={14} color={colors.inactive} />
                <Text style={[styles.lastOrderedText, { color: colors.inactive }]}>
                  Last ordered: {formatDistanceToNow(new Date(product.lastOrdered))}
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={[styles.actionButton, { backgroundColor: colors.primary }]}
                onPress={handleAddToOrder}
              >
                <ShoppingBag size={20} color={colors.background} />
                <Text style={[styles.actionButtonText, { color: colors.background }]}>
                  Add to Order
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.actionButton, { backgroundColor: colors.secondary }]}
                onPress={handleAddToStocktake}
              >
                <ClipboardList size={20} color={colors.background} />
                <Text style={[styles.actionButtonText, { color: colors.background }]}>
                  Add to Stocktake
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  sku: {
    fontSize: 14,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
  },
  editButtonText: {
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '600',
  },
  stockStatus: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
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
    fontSize: 18,
    fontWeight: '700',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    borderTopWidth: 1,
    paddingVertical: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailLabel: {
    width: 100,
    fontSize: 16,
  },
  detailValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  lastOrdered: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  lastOrderedText: {
    marginLeft: 6,
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
  },
  actionButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
  },
});