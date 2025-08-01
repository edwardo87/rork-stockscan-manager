import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Platform, Alert, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Printer, ArrowLeft, Grid, List } from 'lucide-react-native';
import { useThemeStore } from '@/store/themeStore';
import { useInventoryStore } from '@/store/inventoryStore';

import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

interface QRLabelProps {
  product: any;
  colors: any;
  size: number;
}

const QRLabel = ({ product, colors, size }: QRLabelProps) => {
  const qrSize = size * 0.7;
  
  return (
    <View style={[
      styles.qrLabel,
      {
        backgroundColor: colors.background,
        borderColor: colors.border,
        width: size,
        height: size * 1.2, // Slightly taller for text
      }
    ]}>
      <View style={styles.qrCodeContainer}>
        {Platform.OS === 'web' ? (
          <img 
            src={`https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(product.barcode)}&bgcolor=${colors.background.replace('#', '')}&color=${colors.text.replace('#', '')}`}
            alt={`QR Code for ${product.barcode}`}
            style={{
              width: qrSize,
              height: qrSize,
              objectFit: 'contain'
            }}
          />
        ) : (
          <View style={{
            width: qrSize,
            height: qrSize,
            backgroundColor: colors.lightGray,
            borderRadius: 4,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <Text style={{
              color: colors.text,
              fontSize: 8,
              textAlign: 'center',
              fontFamily: 'monospace',
              padding: 4,
            }}>
              QR: {product.barcode}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.labelInfo}>
        <Text style={[styles.productName, { color: colors.text }]} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={[styles.productSku, { color: colors.inactive }]}>
          {product.sku}
        </Text>
        <Text style={[styles.productBarcode, { color: colors.inactive }]} numberOfLines={1}>
          {product.barcode}
        </Text>
      </View>
    </View>
  );
};

export default function QRCodesPrintScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { products } = useInventoryStore();
  const [selectedProducts, setSelectedProducts] = useState<string[]>(products.map(p => p.id));
  const [labelSize, setLabelSize] = useState(120); // Default shelf label size
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredProducts = products.filter(p => selectedProducts.includes(p.id));

  const toggleProduct = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const selectAll = () => {
    setSelectedProducts(products.map(p => p.id));
  };

  const deselectAll = () => {
    setSelectedProducts([]);
  };

  const handlePrintAll = async () => {
    if (filteredProducts.length === 0) {
      Alert.alert('No Products Selected', 'Please select at least one product to print.');
      return;
    }

    try {
      if (Platform.OS === 'web') {
        // Web printing with shelf label format
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          const labelsPerRow = Math.floor(210 / (labelSize * 0.3)); // A4 width estimation
          
          printWindow.document.write(`
            <html>
              <head>
                <title>QR Code Labels - ${filteredProducts.length} Products</title>
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
                    padding: 10px;
                  }
                  .labels-container {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 5mm;
                    justify-content: flex-start;
                  }
                  .qr-label {
                    width: ${labelSize * 0.3}mm;
                    height: ${labelSize * 0.36}mm;
                    border: 1px solid #000;
                    padding: 2mm;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    page-break-inside: avoid;
                    box-sizing: border-box;
                  }
                  .qr-code {
                    width: ${labelSize * 0.2}mm;
                    height: ${labelSize * 0.2}mm;
                    margin-bottom: 1mm;
                    object-fit: contain;
                  }
                  .product-name {
                    font-size: 8px;
                    font-weight: bold;
                    margin-bottom: 1mm;
                    line-height: 1.1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    width: 100%;
                  }
                  .product-sku {
                    font-size: 7px;
                    color: #666;
                    margin-bottom: 1mm;
                  }
                  .product-barcode {
                    font-size: 6px;
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
                <h2 style="margin-bottom: 10mm;">QR Code Labels (${filteredProducts.length} products)</h2>
                <div class="labels-container">
          `);
          
          filteredProducts.forEach(product => {
            const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${Math.floor(labelSize * 0.2 * 3.78)}x${Math.floor(labelSize * 0.2 * 3.78)}&data=${encodeURIComponent(product.barcode)}`;
            printWindow.document.write(`
              <div class="qr-label">
                <img src="${qrCodeUrl}" alt="QR Code for ${product.barcode}" style="width: ${labelSize * 0.2}mm; height: ${labelSize * 0.2}mm; margin-bottom: 1mm;" />
                <div class="product-name">${product.name}</div>
                <div class="product-sku">${product.sku}</div>
                <div class="product-barcode">${product.barcode}</div>
              </div>
            `);
          });
          
          printWindow.document.write(`
                </div>
              </body>
            </html>
          `);
          printWindow.document.close();
          printWindow.print();
        }
      } else {
        // Mobile sharing - create a text file with all product info
        const allProductsData = filteredProducts.map(product => 
          `Product: ${product.name}\nSKU: ${product.sku}\nBarcode: ${product.barcode}\nCategory: ${product.category}\n---`
        ).join('\n\n');
        
        const fileUri = FileSystem.documentDirectory + `qr-codes-${Date.now()}.txt`;
        await FileSystem.writeAsStringAsync(fileUri, allProductsData);
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/plain',
            dialogTitle: `Share QR Codes for ${filteredProducts.length} Products`,
          });
        } else {
          Alert.alert('Sharing not available', 'Sharing is not available on this device.');
        }
      }
    } catch (error) {
      console.error('Print/Share error:', error);
      Alert.alert('Error', 'Failed to print/share QR codes');
    }
  };

  const renderProductItem = ({ item }: { item: any }) => {
    const isSelected = selectedProducts.includes(item.id);
    
    return (
      <TouchableOpacity
        style={[
          styles.productItem,
          {
            backgroundColor: isSelected ? colors.primary + '20' : colors.background,
            borderColor: isSelected ? colors.primary : colors.border,
          }
        ]}
        onPress={() => toggleProduct(item.id)}
      >
        <Text style={[styles.productItemName, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.productItemSku, { color: colors.inactive }]}>{item.sku}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.lightGray }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Print QR Codes</Text>
        <TouchableOpacity 
          style={[styles.printButton, { backgroundColor: colors.primary }]}
          onPress={handlePrintAll}
        >
          <Printer size={20} color={colors.background} />
        </TouchableOpacity>
      </View>

      {/* Controls */}
      <View style={[styles.controls, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.selectionControls}>
          <TouchableOpacity 
            style={[styles.controlButton, { backgroundColor: colors.lightGray }]}
            onPress={selectAll}
          >
            <Text style={[styles.controlButtonText, { color: colors.text }]}>Select All</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.controlButton, { backgroundColor: colors.lightGray }]}
            onPress={deselectAll}
          >
            <Text style={[styles.controlButtonText, { color: colors.text }]}>Deselect All</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.viewControls}>
          <TouchableOpacity 
            style={[
              styles.viewButton,
              {
                backgroundColor: viewMode === 'grid' ? colors.primary : colors.lightGray,
              }
            ]}
            onPress={() => setViewMode('grid')}
          >
            <Grid size={16} color={viewMode === 'grid' ? colors.background : colors.text} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[
              styles.viewButton,
              {
                backgroundColor: viewMode === 'list' ? colors.primary : colors.lightGray,
              }
            ]}
            onPress={() => setViewMode('list')}
          >
            <List size={16} color={viewMode === 'list' ? colors.background : colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Selected count */}
      <View style={[styles.selectedInfo, { backgroundColor: colors.background }]}>
        <Text style={[styles.selectedText, { color: colors.text }]}>
          {selectedProducts.length} of {products.length} products selected
        </Text>
      </View>

      {/* Preview or Product List */}
      <ScrollView style={styles.content}>
        {viewMode === 'grid' ? (
          <View style={styles.previewContainer}>
            <Text style={[styles.previewTitle, { color: colors.text }]}>Preview (Shelf Label Size)</Text>
            <View style={styles.labelsGrid}>
              {filteredProducts.slice(0, 12).map(product => (
                <QRLabel
                  key={product.id}
                  product={product}
                  colors={colors}
                  size={labelSize}
                />
              ))}
              {filteredProducts.length > 12 && (
                <View style={[
                  styles.moreLabels,
                  {
                    backgroundColor: colors.lightGray,
                    borderColor: colors.border,
                    width: labelSize,
                    height: labelSize * 1.2,
                  }
                ]}>
                  <Text style={[styles.moreLabelsText, { color: colors.text }]}>
                    +{filteredProducts.length - 12} more
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            renderItem={renderProductItem}
            contentContainerStyle={styles.productsList}
          />
        )}
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
    padding: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
  },
  printButton: {
    padding: 8,
    borderRadius: 8,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  selectionControls: {
    flexDirection: 'row',
    gap: 8,
  },
  controlButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  controlButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  viewControls: {
    flexDirection: 'row',
    gap: 4,
  },
  viewButton: {
    padding: 8,
    borderRadius: 6,
  },
  selectedInfo: {
    padding: 12,
    alignItems: 'center',
  },
  selectedText: {
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  previewContainer: {
    padding: 16,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  labelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  qrLabel: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCodeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelInfo: {
    alignItems: 'center',
    marginTop: 4,
  },
  productName: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  productSku: {
    fontSize: 8,
    marginBottom: 2,
  },
  productBarcode: {
    fontSize: 7,
    fontFamily: 'monospace',
  },
  moreLabels: {
    borderWidth: 1,
    borderRadius: 4,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLabelsText: {
    fontSize: 12,
    fontWeight: '500',
  },
  productsList: {
    padding: 16,
  },
  productItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  productItemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  productItemSku: {
    fontSize: 14,
  },
});