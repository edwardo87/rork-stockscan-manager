import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Platform, Alert, FlatList, Image } from 'react-native';
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
          <Image 
            source={{
              uri: `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(product.barcode)}&bgcolor=ffffff&color=000000`
            }}
            style={{
              width: qrSize,
              height: qrSize,
              borderRadius: 4,
            }}
            resizeMode="contain"
          />
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
  const [showAllInPreview, setShowAllInPreview] = useState(false);

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
        // Mobile sharing - create HTML file with QR codes for better viewing
        const htmlContent = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>QR Code Labels - ${filteredProducts.length} Products</title>
              <style>
                body { 
                  font-family: Arial, sans-serif;
                  margin: 10px;
                  padding: 0;
                  background: #f5f5f5;
                }
                .header {
                  text-align: center;
                  margin-bottom: 20px;
                  padding: 15px;
                  background: white;
                  border-radius: 8px;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .labels-container {
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                  gap: 15px;
                  padding: 10px;
                }
                .qr-label {
                  background: white;
                  border: 2px solid #ddd;
                  border-radius: 8px;
                  padding: 15px;
                  text-align: center;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .qr-code {
                  width: 120px;
                  height: 120px;
                  margin: 0 auto 10px;
                  border: 1px solid #eee;
                  border-radius: 4px;
                }
                .product-name {
                  font-size: 14px;
                  font-weight: bold;
                  margin-bottom: 5px;
                  color: #333;
                  word-wrap: break-word;
                }
                .product-sku {
                  font-size: 12px;
                  color: #666;
                  margin-bottom: 3px;
                }
                .product-barcode {
                  font-size: 11px;
                  color: #888;
                  font-family: monospace;
                  background: #f8f8f8;
                  padding: 2px 4px;
                  border-radius: 3px;
                  word-break: break-all;
                }
                .product-category {
                  font-size: 10px;
                  color: #999;
                  margin-top: 5px;
                  font-style: italic;
                }
                @media print {
                  body { background: white; }
                  .labels-container {
                    grid-template-columns: repeat(3, 1fr);
                  }
                  .qr-label {
                    break-inside: avoid;
                    box-shadow: none;
                  }
                }
              </style>
            </head>
            <body>
              <div class="header">
                <h1>QR Code Labels</h1>
                <p>${filteredProducts.length} Products • Generated ${new Date().toLocaleDateString()}</p>
              </div>
              <div class="labels-container">
        `;
        
        let labelsHtml = '';
        filteredProducts.forEach(product => {
          const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(product.barcode)}&bgcolor=ffffff&color=000000`;
          labelsHtml += `
            <div class="qr-label">
              <img src="${qrCodeUrl}" alt="QR Code for ${product.barcode}" class="qr-code" />
              <div class="product-name">${product.name}</div>
              <div class="product-sku">SKU: ${product.sku}</div>
              <div class="product-barcode">${product.barcode}</div>
              <div class="product-category">${product.category}</div>
            </div>
          `;
        });
        
        const finalHtml = htmlContent + labelsHtml + `
              </div>
            </body>
          </html>
        `;
        
        const fileUri = FileSystem.documentDirectory + `qr-codes-${Date.now()}.html`;
        await FileSystem.writeAsStringAsync(fileUri, finalHtml);
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/html',
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
              {(showAllInPreview ? filteredProducts : filteredProducts.slice(0, 12)).map(product => (
                <QRLabel
                  key={product.id}
                  product={product}
                  colors={colors}
                  size={labelSize}
                />
              ))}
              {filteredProducts.length > 12 && !showAllInPreview && (
                <TouchableOpacity 
                  style={[
                    styles.moreLabels,
                    {
                      backgroundColor: colors.lightGray,
                      borderColor: colors.border,
                      width: labelSize,
                      height: labelSize * 1.2,
                    }
                  ]}
                  onPress={() => setShowAllInPreview(true)}
                >
                  <Text style={[styles.moreLabelsText, { color: colors.text }]}>
                    See {filteredProducts.length - 12} more
                  </Text>
                </TouchableOpacity>
              )}
              {showAllInPreview && filteredProducts.length > 12 && (
                <TouchableOpacity 
                  style={[
                    styles.moreLabels,
                    {
                      backgroundColor: colors.primary + '20',
                      borderColor: colors.primary,
                      width: labelSize,
                      height: labelSize * 1.2,
                    }
                  ]}
                  onPress={() => setShowAllInPreview(false)}
                >
                  <Text style={[styles.moreLabelsText, { color: colors.primary }]}>
                    Show less
                  </Text>
                </TouchableOpacity>
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