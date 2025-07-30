import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Edit, ShoppingBag, ClipboardList, Printer, Share } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import QuantityInput from '@/components/QuantityInput';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { BarCodeCreator } from 'expo-barcode-generator';

const QRCodeComponent = ({ value, size = 200, colors }: { value: string; size?: number; colors: any }) => {
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
      <BarCodeCreator
        value={value}
        format="QR"
        width={size - 20}
        height={size - 20}
        color={colors.text}
        background={colors.background}
      />
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
                  <div class="qr-code">QR: ${product.barcode}</div>
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
                  >
                    <Printer size={16} color={colors.primary} />
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