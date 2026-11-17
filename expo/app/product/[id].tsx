import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Edit, ShoppingBag, ClipboardList, Printer, Share, AlertTriangle } from 'lucide-react-native';
import { effectiveStockUnit, effectiveUnitsPerOrderUnit, formatOrderQuantity, purchasingCostParts, purchasingProblem, unitPriceLabel } from '@/utils/purchasing';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import QuantityInput from '@/components/QuantityInput';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

const QRCodeComponent = ({ value, size = 200, colors }: { value: string; size?: number; colors: any }) => {
  // Use external QR code service for both web and mobile for better compatibility
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size-20}x${size-20}&data=${encodeURIComponent(value)}&bgcolor=${colors.background.replace('#', '')}&color=${colors.text.replace('#', '')}`;
  
  if (Platform.OS === 'web') {
    return (
      <View style={{
        width: size,
        height: size,
        backgroundColor: colors.background,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <img 
          src={qrUrl} 
          alt={`QR Code for ${value}`}
          style={{
            width: size - 20,
            height: size - 20,
            objectFit: 'contain'
          }}
        />
      </View>
    );
  }
  
  // Mobile implementation using expo-image for better compatibility
  return (
    <View style={{
      width: size,
      height: size,
      backgroundColor: colors.background,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <View style={{
        width: size - 20,
        height: size - 20,
        backgroundColor: colors.lightGray,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
      }}>
        <Text style={{
          color: colors.text,
          fontSize: 10,
          textAlign: 'center',
          fontFamily: 'monospace',
          padding: 8,
        }}>
          QR: {value}
        </Text>
      </View>
    </View>
  );
};

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

  const handlePrintQR = async () => {
    try {
      if (Platform.OS === 'web') {
        // Web printing with shelf label format
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <html>
              <head>
                <title>QR Code Label - ${product.name}</title>
                <style>
                  @media print {
                    @page {
                      margin: 10mm;
                      size: A4;
                    }
                  }
                  body { 
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 20px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                  }
                  .qr-label {
                    width: 60mm;
                    height: 40mm;
                    border: 2px solid #000;
                    padding: 5mm;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    box-sizing: border-box;
                  }
                  .qr-code {
                    width: 30mm;
                    height: 30mm;
                    border: 1px solid #ccc;
                    margin-bottom: 2mm;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 8px;
                    background: #f9f9f9;
                  }
                  .product-name {
                    font-size: 10px;
                    font-weight: bold;
                    margin-bottom: 1mm;
                    line-height: 1.1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    width: 100%;
                  }
                  .product-sku {
                    font-size: 8px;
                    color: #666;
                    margin-bottom: 1mm;
                  }
                  .product-barcode {
                    font-size: 7px;
                    color: #888;
                    font-family: monospace;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    width: 100%;
                  }
                </style>
              </head>
              <body>
                <div class="qr-label">
                  <img src="https://api.qrserver.com/v1/create-qr-code/?size=113x113&data=${encodeURIComponent(product.barcode)}&bgcolor=ffffff&color=000000" alt="QR Code for ${product.barcode}" style="width: 30mm; height: 30mm; margin-bottom: 2mm;" />
                  <div class="product-name">${product.name}</div>
                  <div class="product-sku">${product.sku}</div>
                  <div class="product-barcode">${product.barcode}</div>
                </div>
              </body>
            </html>
          `);
          printWindow.document.close();
          printWindow.print();
        }
      } else {
        // Mobile sharing
        const qrData = `Product: ${product.name}\nSKU: ${product.sku}\nBarcode: ${product.barcode}\nCategory: ${product.category}`;
        
        const fileUri = FileSystem.documentDirectory + `qr-${product.sku}.txt`;
        await FileSystem.writeAsStringAsync(fileUri, qrData);
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/plain',
            dialogTitle: `Share QR Code for ${product.name}`,
          });
        } else {
          Alert.alert('Sharing not available', 'Sharing is not available on this device.');
        }
      }
    } catch (error) {
      console.error('Print/Share error:', error);
      Alert.alert('Error', 'Failed to print/share QR code');
    }
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

  const stockUnitLabel = effectiveStockUnit(product);
  const isLow = product.currentStock < product.minStock;
  const stockTarget = product.minStock > 0 ? product.minStock * 2 : Math.max(product.currentStock, 1);
  const stockFill = Math.max(0, Math.min(1, product.currentStock / stockTarget));
  const cardStyle = { backgroundColor: colors.background, borderColor: colors.border };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.lightGray }]}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.scrollView}>
          <View style={styles.content}>
            {/* Header Section */}
            <View style={styles.header}>
              <View style={styles.headerContent}>
                <Text style={[styles.name, { color: colors.text }]}>{product.name}</Text>
                <View style={styles.chips}>
                  {product.supplier ? (
                    <View style={[styles.chip, { backgroundColor: colors.chip }]}>
                      <Text style={[styles.chipText, { color: colors.text }]}>{product.supplier}</Text>
                    </View>
                  ) : null}
                  {product.barcode ? (
                    <View style={[styles.chip, { backgroundColor: colors.chip }]}>
                      <Text style={[styles.chipText, styles.mono, { color: colors.inactive }]}>{product.barcode}</Text>
                    </View>
                  ) : null}
                  {product.category?.trim() ? (
                    <View style={[styles.chip, { backgroundColor: colors.chip }]}>
                      <Text style={[styles.chipText, { color: colors.inactive }]}>{product.category}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity 
                style={[styles.editButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={handleEdit}
              >
                <Edit size={16} color={colors.text} />
                <Text style={[styles.editButtonText, { color: colors.text }]}>Edit</Text>
              </TouchableOpacity>
            </View>

            {/* On hand */}
            <View style={[styles.section, cardStyle, isLow && { borderColor: colors.accent, borderWidth: 1.5 }]}>
              <View style={styles.onHandTop}>
                <View>
                  <Text style={[styles.overline, { color: colors.inactive }]}>ON HAND</Text>
                  <Text style={[styles.bigNumber, { color: colors.text }]}>
                    {product.currentStock}
                    <Text style={[styles.bigUnit, { color: colors.inactive }]}> {stockUnitLabel}</Text>
                  </Text>
                </View>
                {isLow ? (
                  <View style={[styles.lowChip, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.lowChipText, { color: colors.accentText }]}>LOW STOCK</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.track, { backgroundColor: colors.track }]}>
                <View style={[styles.bar, { width: `${stockFill * 100}%`, backgroundColor: isLow ? colors.accent : colors.success }]} />
              </View>
              <Text style={[styles.minText, { color: colors.inactive }]}>Minimum {product.minStock} {stockUnitLabel}</Text>
            </View>

            {/* Purchasing Section — supplier cost and how this product is ordered */}
            <View style={[styles.section, cardStyle]} testID="product-purchasing-section">
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
                  ['Order unit', orderUnit || `${stockUnit} (ordered singly)`],
                  ['Pack quantity', orderUnit ? `${upou.toLocaleString('en-AU')} ${stockUnit} per ${orderUnit}` : '—'],
                  ['Price ex GST', priceLabel ?? 'Not recorded'],
                ];
                if (example?.stockEquivalent) rows.push(['1 order', `${example.main} ${example.stockEquivalent}`]);
                rows.push(['Sell price', product.price > 0 ? `$${product.price.toFixed(2)}` : 'Not set']);
                rows.push(['Supplier code', product.supplierCode?.trim() || '—']);
                rows.push(['Stock unit', stockUnit]);
                return (
                  <>
                    {cost ? (
                      <View style={[styles.costBlock, { backgroundColor: colors.accentSoft }]}>
                        <Text style={[styles.overline, { color: colors.accentText }]}>COST (EX GST)</Text>
                        <Text style={[styles.costAmount, { color: colors.text }]}>
                          {cost.amount}
                          <Text style={[styles.costPer, { color: colors.inactive }]}> {cost.per}</Text>
                        </Text>
                        {cost.detail ? (
                          <Text style={[styles.costDetail, { color: colors.accentText }]}>= {cost.detail}</Text>
                        ) : null}
                      </View>
                    ) : null}
                    {rows.map(([label, value], i) => (
                      <View
                        style={[styles.detailRow, { borderTopColor: colors.border }, i === 0 && !cost && { borderTopWidth: 0 }]}
                        key={label}
                      >
                        <Text style={[styles.label, { color: colors.inactive }]}>{label}</Text>
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
            <View style={[styles.section, cardStyle]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Add to order{product.orderUnit?.trim() ? ` (${product.orderUnit.trim()})` : ''}
              </Text>
              <QuantityInput
                value={orderQuantity}
                onChange={setOrderQuantity}
                min={1}
                label=""
              />
              <TouchableOpacity 
                style={[styles.actionButton, { backgroundColor: colors.primaryFill }]}
                onPress={handleAddToOrder}
              >
                <ShoppingBag size={20} color={colors.onPrimaryFill} />
                <Text style={[styles.actionButtonText, { color: colors.onPrimaryFill }]}>
                  Add to Order
                </Text>
              </TouchableOpacity>
            </View>

            {/* Stocktake Section */}
            <View style={[styles.section, cardStyle]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Count for stocktake</Text>
              <QuantityInput
                value={stocktakeQuantity}
                onChange={setStocktakeQuantity}
                min={0}
                label=""
              />
              <TouchableOpacity 
                style={[styles.actionButton, styles.outlineButton, { borderColor: colors.border }]}
                onPress={handleAddToStocktake}
              >
                <ClipboardList size={20} color={colors.text} />
                <Text style={[styles.actionButtonText, { color: colors.text }]}>
                  Add to Stocktake
                </Text>
              </TouchableOpacity>
            </View>

            {/* QR Code Section */}
            <View style={[styles.section, cardStyle]}>
              <View style={styles.qrHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>QR Code</Text>
                <View style={styles.qrActions}>
                  <TouchableOpacity 
                    style={[styles.qrActionButton, { backgroundColor: colors.chip }]}
                    onPress={handleShareProduct}
                  >
                    <Share size={16} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.qrActionButton, { backgroundColor: colors.chip }]}
                    onPress={handlePrintQR}
                  >
                    <Printer size={16} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[styles.qrDescription, { color: colors.inactive }]}>
                Scan this QR code to quickly access this product
              </Text>
              <View style={styles.qrContainer}>
                <QRCodeComponent value={product.barcode} colors={colors} />
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
    marginBottom: 16,
    gap: 12,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 29,
  },
  headerContent: {
    flex: 1,
    minWidth: 0,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  chipText: { fontSize: 12, fontWeight: '600' },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 0.3 },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
    gap: 6,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  overline: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  onHandTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bigNumber: { fontSize: 40, fontWeight: '800', letterSpacing: -1.2, fontVariant: ['tabular-nums'], marginTop: 2 },
  bigUnit: { fontSize: 16, fontWeight: '600', letterSpacing: 0 },
  lowChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  lowChipText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
  bar: { height: 8, borderRadius: 4 },
  minText: { fontSize: 13, marginTop: 8, fontWeight: '500' },
  costBlock: { borderRadius: 14, padding: 14, marginBottom: 6 },
  costAmount: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, marginTop: 4, fontVariant: ['tabular-nums'] },
  costPer: { fontSize: 14, fontWeight: '600', letterSpacing: 0 },
  costDetail: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  detailRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  purchasingIssue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  purchasingIssueText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    width: 112,
    fontSize: 14,
  },
  value: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 14,
    marginTop: 12,
  },
  outlineButton: { borderWidth: 1 },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
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