import { printBrowserQrLabel } from '@/services/browserQrLabelService';
import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Edit, ShoppingBag, ClipboardList, Printer, Share, AlertTriangle } from 'lucide-react-native';
import { effectiveStockUnit, effectiveUnitsPerOrderUnit, formatOrderQuantity, purchasingCostParts, purchasingProblem, unitPriceLabel } from '@/utils/purchasing';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import QuantityInput from '@/components/QuantityInput';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import ProductQrCode from '@/components/ProductQrCode';
import { shareProductQrLabel } from '@/services/qrLabelService';

export default function ProductDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useThemeStore();
  const { products, addToOrder, addToStocktake } = useInventoryStore();
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [stocktakeQuantity, setStocktakeQuantity] = useState(0);
  const [isPreparingQr, setIsPreparingQr] = useState(false);

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

  const handlePrintQR = async () => {
    if (isPreparingQr) return;
    setIsPreparingQr(true);
    try {
      if (Platform.OS === 'web') {
        await printBrowserQrLabel(product);
      } else {
        await shareProductQrLabel(product);
      }
    } catch (error) {
      console.error('Print/Share error:', error);
      Alert.alert('QR label unavailable', error instanceof Error ? error.message : 'Failed to prepare QR label');
    } finally { setIsPreparingQr(false); }
  };

  const handleShareProduct = async () => {
    try {
      const productData = `${product.name}\nSKU: ${product.sku}\nBarcode: ${product.barcode}\nCategory: ${product.category}\nSupplier: ${product.supplier}\nCurrent Stock: ${product.currentStock} ${product.unit}`;
      
      if (Platform.OS === 'web') {
        // Check if Web Share API is available and supported
        if (navigator.share && navigator.canShare && navigator.canShare({ text: productData })) {
          try {
            await navigator.share({
              title: product.name,
              text: productData,
            });
          } catch (shareError: any) {
            // If share fails, fall back to clipboard
            if (shareError.name === 'NotAllowedError' || shareError.name === 'AbortError') {
              await navigator.clipboard.writeText(productData);
              Alert.alert('Copied', 'Product information copied to clipboard');
            } else {
              throw shareError;
            }
          }
        } else {
          // Fallback for web browsers without native sharing
          try {
            await navigator.clipboard.writeText(productData);
            Alert.alert('Copied', 'Product information copied to clipboard');
          } catch (clipboardError) {
            // Final fallback - create a downloadable text file
            const blob = new Blob([productData], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `product-${product.sku}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            Alert.alert('Downloaded', 'Product information downloaded as text file');
          }
        }
      } else {
        const fileUri = FileSystem.documentDirectory + `product-${product.sku}.txt`;
        await FileSystem.writeAsStringAsync(fileUri, productData);
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/plain',
            dialogTitle: `Share ${product.name}`,
          });
        } else {
          Alert.alert('Sharing not available', 'Sharing is not available on this device.');
        }
      }
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Failed to share product information');
    }
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
              <View style={styles.headerContent}>
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

            {/* Purchasing Section — supplier cost and how this product is ordered */}
            <View style={[styles.section, { borderColor: colors.border }]} testID="product-purchasing-section">
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Purchasing</Text>
              {(() => {
                const stockUnit = effectiveStockUnit(product);
                const cost = purchasingCostParts(product);
                const issue = purchasingProblem(product);
                const priceLabel = unitPriceLabel(product);
                const orderUnit = (product.orderUnit || '').trim();
                const upou = effectiveUnitsPerOrderUnit(product);
                const example = orderUnit ? formatOrderQuantity(product, 1) : null;
                const rows: [string, string][] = [
                  ['Supplier code', product.supplierCode?.trim() || '—'],
                  ['Stock unit', stockUnit],
                  ['Order unit', orderUnit || `${stockUnit} (ordered singly)`],
                  ['Pack quantity', orderUnit ? `${upou.toLocaleString('en-AU')} ${stockUnit} per ${orderUnit}` : '—'],
                  ['Price ex GST', priceLabel ?? 'Not recorded'],
                ];
                if (cost && !cost.legacy && cost.detail) rows.push(['Cost per order', `${cost.amount} ${cost.per}`], ['Cost per unit', cost.detail]);
                if (cost?.legacy) rows.push(['Unit cost', `${cost.amount} ${cost.per}`]);
                if (example?.stockEquivalent) rows.push(['1 order', `${example.main} ${example.stockEquivalent}`]);
                rows.push(['Sell price', product.price > 0 ? `$${product.price.toFixed(2)}` : 'Not set']);
                return (
                  <>
                    {rows.map(([label, value]) => (
                      <View style={styles.detailRow} key={label}>
                        <Text style={[styles.label, { color: colors.inactive }]}>{label}:</Text>
                        <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
                      </View>
                    ))}
                    {issue ? (
                      <TouchableOpacity
                        style={[styles.purchasingIssue, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '66' }]}
                        onPress={handleEdit}
                        testID="product-purchasing-issue"
                      >
                        <AlertTriangle size={16} color={colors.warning} />
                        <Text style={[styles.purchasingIssueText, { color: colors.text }]}>
                          {issue} Orders show no total and can't be sent until this is fixed. Tap to edit.
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                );
              })()}
            </View>

            {/* Order Section */}
            {product.desiredStockAvailable && <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary }]}
              onPress={() => router.push(`/product/guidance/${product.id}`)}>
              <Text style={{ color: colors.background }}>Optional stock guidance: {product.desiredStockEnabled ? 'On' : 'Off'}</Text>
            </TouchableOpacity>}
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
              <View style={styles.qrHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>QR Code</Text>
                <View style={styles.qrActions}>
                  <TouchableOpacity 
                    style={[styles.qrActionButton, { backgroundColor: colors.lightGray }]}
                    onPress={handleShareProduct}
                  >
                    <Share size={16} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.qrActionButton, { backgroundColor: colors.lightGray }]}
                    onPress={handlePrintQR}
                    disabled={isPreparingQr}
                    accessibilityRole="button"
                    accessibilityLabel={isPreparingQr ? 'Preparing QR label' : 'Print or share QR label'}
                    accessibilityState={{ busy: isPreparingQr, disabled: isPreparingQr }}
                  >
                    {isPreparingQr ? <ActivityIndicator size="small" color={colors.primary} /> : <Printer size={16} color={colors.primary} />}
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[styles.qrDescription, { color: colors.inactive }]}>
                Scan this QR code to quickly access this product
              </Text>
              <View style={styles.qrContainer}>
                <ProductQrCode key={product.barcode} value={product.barcode} />
              </View>
              <Text style={[styles.qrCodeText, { color: colors.inactive }]}>
                Code: {product.barcode}
              </Text>
              <Text style={[styles.printNote, { color: colors.inactive }]}>
                {Platform.OS === 'web' ? 'Click print to open print dialog' : 'Tap print to share QR code'}
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
    alignItems: 'flex-start',
    marginBottom: 24,
    gap: 12,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  sku: {
    fontSize: 14,
  },
  headerContent: {
    flex: 1,
    minWidth: 0,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    flexShrink: 0,
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
  purchasingIssue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  purchasingIssueText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    width: 116,
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
  qrHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  qrActions: {
    flexDirection: 'row',
    gap: 8,
  },
  qrActionButton: {
    padding: 8,
    borderRadius: 6,
  },
  printNote: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
