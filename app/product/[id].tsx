import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Edit, ShoppingBag, ClipboardList, QrCode } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import QuantityInput from '@/components/QuantityInput';
// @ts-ignore - expo-barcode-generator doesn't have TypeScript declarations
import { BarCodeCreator } from 'expo-barcode-generator';

export default function ProductDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useThemeStore();
  const { products, addToOrder, addToStocktake } = useInventoryStore();
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [stocktakeQuantity, setStocktakeQuantity] = useState(0);

  const product = products.find(p => p.id === id);

  if (!product) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Product not found</Text>
      </View>
    );
  }

  const handleEdit = () => {
    router.push(`/product/edit/${id}`);
  };

  const handleAddToOrder = () => {
    addToOrder(product, orderQuantity);
    router.back();
  };

  const handleAddToStocktake = () => {
    addToStocktake(product, stocktakeQuantity);
    router.back();
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.scrollView}>
          <View style={styles.content}>
            {/* Header Section */}
            <View style={styles.header}>
              <View>
                <Text style={[styles.name, { color: colors.text }]}>{product.name}</Text>
                <Text style={[styles.sku, { color: colors.inactive }]}>{product.sku}</Text>
              </View>
              <TouchableOpacity 
                style={[styles.editButton, { backgroundColor: colors.lightGray }]}
                onPress={handleEdit}
              >
                <Edit size={20} color={colors.primary} />
                <Text style={[styles.editButtonText, { color: colors.primary }]}>Edit</Text>
              </TouchableOpacity>
            </View>

            {/* Details Section */}
            <View style={[styles.section, { borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Details</Text>
              <View style={styles.detailRow}>
                <Text style={[styles.label, { color: colors.inactive }]}>Category:</Text>
                <Text style={[styles.value, { color: colors.text }]}>{product.category}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.label, { color: colors.inactive }]}>Supplier:</Text>
                <Text style={[styles.value, { color: colors.text }]}>{product.supplier}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.label, { color: colors.inactive }]}>Barcode:</Text>
                <Text style={[styles.value, { color: colors.text }]}>{product.barcode}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.label, { color: colors.inactive }]}>Current Stock:</Text>
                <Text style={[
                  styles.value, 
                  { color: product.currentStock < product.minStock ? colors.error : colors.success }
                ]}>
                  {product.currentStock} {product.unit}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={[styles.label, { color: colors.inactive }]}>Min Stock:</Text>
                <Text style={[styles.value, { color: colors.text }]}>{product.minStock} {product.unit}</Text>
              </View>
            </View>

            {/* Order Section */}
            <View style={[styles.section, { borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Add to Order</Text>
              <QuantityInput
                value={orderQuantity}
                onChange={setOrderQuantity}
                min={1}
              />
              <TouchableOpacity 
                style={[styles.actionButton, { backgroundColor: colors.primary }]}
                onPress={handleAddToOrder}
              >
                <ShoppingBag size={20} color={colors.background} />
                <Text style={[styles.actionButtonText, { color: colors.background }]}>
                  Add to Order
                </Text>
              </TouchableOpacity>
            </View>

            {/* Stocktake Section */}
            <View style={[styles.section, { borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Add to Stocktake</Text>
              <QuantityInput
                value={stocktakeQuantity}
                onChange={setStocktakeQuantity}
                min={0}
              />
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

            {/* QR Code Section */}
            <View style={[styles.section, { borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>QR Code</Text>
              <Text style={[styles.qrDescription, { color: colors.inactive }]}>
                Scan this QR code to quickly access this product
              </Text>
              <View style={styles.qrContainer}>
                <BarCodeCreator
                  value={product.barcode}
                  format="QR"
                  width={200}
                  height={200}
                  background={colors.background}
                  color={colors.text}
                />
              </View>
              <Text style={[styles.qrCodeText, { color: colors.inactive }]}>
                Code: {product.barcode}
              </Text>
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
    alignItems: 'center',
    marginBottom: 24,
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
  section: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  label: {
    width: 100,
    fontSize: 14,
  },
  value: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
  },
  qrDescription: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 16,
    padding: 16,
  },
  qrCodeText: {
    fontSize: 12,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
});