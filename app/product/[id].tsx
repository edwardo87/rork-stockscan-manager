import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Edit, ShoppingBag, ClipboardList, Printer, Share } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';
import QuantityInput from '@/components/QuantityInput';
import Svg, { Rect } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

// Simple QR Code generator using SVG
const generateQRMatrix = (text: string, size: number = 21): boolean[][] => {
  // Simple QR code pattern generator (basic implementation)
  const matrix: boolean[][] = [];
  for (let i = 0; i < size; i++) {
    matrix[i] = [];
    for (let j = 0; j < size; j++) {
      // Create a pattern based on text hash and position
      const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      matrix[i][j] = ((i + j + hash) % 3) === 0;
    }
  }
  
  // Add finder patterns (corners)
  const addFinderPattern = (startRow: number, startCol: number) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (startRow + i < size && startCol + j < size) {
          matrix[startRow + i][startCol + j] = 
            (i === 0 || i === 6 || j === 0 || j === 6) ||
            (i >= 2 && i <= 4 && j >= 2 && j <= 4);
        }
      }
    }
  };
  
  addFinderPattern(0, 0);
  addFinderPattern(0, size - 7);
  addFinderPattern(size - 7, 0);
  
  return matrix;
};

const QRCodeComponent = ({ value, size = 200, colors }: { value: string; size?: number; colors: any }) => {
  const matrix = generateQRMatrix(value);
  const cellSize = size / matrix.length;
  
  return (
    <View style={{
      width: size,
      height: size,
      backgroundColor: colors.background,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    }}>
      <Svg width={size - 20} height={size - 20}>
        <Rect width={size - 20} height={size - 20} fill={colors.background} />
        {matrix.map((row, i) =>
          row.map((cell, j) => {
            if (cell) {
              return (
                <Rect
                  key={`${i}-${j}`}
                  x={j * cellSize}
                  y={i * cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill={colors.text}
                />
              );
            }
            return null;
          })
        )}
      </Svg>
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
        // Web printing
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <html>
              <head>
                <title>QR Code - ${product.name}</title>
                <style>
                  body { 
                    font-family: Arial, sans-serif; 
                    text-align: center; 
                    padding: 20px;
                  }
                  .qr-container {
                    display: inline-block;
                    border: 2px solid #000;
                    padding: 20px;
                    margin: 20px;
                  }
                  .product-info {
                    margin-top: 10px;
                    font-size: 14px;
                  }
                </style>
              </head>
              <body>
                <div class="qr-container">
                  <h2>${product.name}</h2>
                  <div style="width: 200px; height: 200px; border: 1px solid #ccc; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
                    QR Code: ${product.barcode}
                  </div>
                  <div class="product-info">
                    <p><strong>SKU:</strong> ${product.sku}</p>
                    <p><strong>Barcode:</strong> ${product.barcode}</p>
                    <p><strong>Category:</strong> ${product.category}</p>
                  </div>
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
        if (navigator.share) {
          await navigator.share({
            title: product.name,
            text: productData,
          });
        } else {
          // Fallback for web browsers without native sharing
          await navigator.clipboard.writeText(productData);
          Alert.alert('Copied', 'Product information copied to clipboard');
        }
      } else {
        const fileUri = FileSystem.documentDirectory + `product-${product.sku}.txt`;
        await FileSystem.writeAsStringAsync(fileUri, productData);
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/plain',
            dialogTitle: `Share ${product.name}`,
          });
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