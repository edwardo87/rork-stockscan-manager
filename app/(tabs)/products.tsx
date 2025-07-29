import React, { useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, Filter, Plus, Upload, FileText } from 'lucide-react-native';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import ProductCard from '@/components/ProductCard';
import EmptyState from '@/components/EmptyState';
import * as DocumentPicker from 'expo-document-picker';
import { parseCSV, validateCSVFormat, generateCSVTemplate } from '@/services/csvImportService';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

export default function ProductsScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const { colors } = useThemeStore();
  
  const { products, setProducts, isLoading } = useInventoryStore();

  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.barcode.includes(searchQuery) ||
    product.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleProductPress = (productId: string) => {
    router.push(`/product/${productId}`);
  };

  const handleAddProduct = () => {
    router.push('/product/add');
  };

  const handleCSVImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/csv',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        
        // Read file content
        const response = await fetch(file.uri);
        const csvContent = await response.text();
        
        // Validate CSV format first
        const validation = validateCSVFormat(csvContent);
        if (!validation.isValid) {
          Alert.alert(
            'Invalid CSV Format',
            `Please fix the following issues:\n\n${validation.errors.join('\n')}`,
            [{ text: 'OK' }]
          );
          return;
        }
        
        // Parse CSV
        const importedProducts = parseCSV(csvContent);
        
        Alert.alert(
          'Import Successful',
          `Successfully imported ${importedProducts.length} products. This will replace your current product list.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Import',
              onPress: () => {
                setProducts(importedProducts);
                setShowUploadOptions(false);
              }
            }
          ]
        );
      }
    } catch (error) {
      Alert.alert(
        'Import Failed',
        error instanceof Error ? error.message : 'Failed to import CSV file',
        [{ text: 'OK' }]
      );
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const csvTemplate = generateCSVTemplate();
      const fileName = 'smartstock_template.csv';
      const fileUri = FileSystem.documentDirectory + fileName;
      
      await FileSystem.writeAsStringAsync(fileUri, csvTemplate);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Download CSV Template'
        });
      } else {
        Alert.alert(
          'Template Ready',
          `CSV template has been saved to: ${fileUri}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Download Failed',
        'Failed to generate CSV template',
        [{ text: 'OK' }]
      );
    }
  };

  const handleGoogleSheetsSetup = () => {
    router.push('/(tabs)/settings');
    setShowUploadOptions(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.lightGray }]}>
      <View style={[styles.headerContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.searchContainer, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchInputContainer, { backgroundColor: colors.lightGray }]}>
          <Search size={20} color={colors.inactive} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search products..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.inactive}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={[styles.clearButton, { color: colors.primary }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        
        <TouchableOpacity style={[styles.filterButton, { backgroundColor: colors.lightGray }]}>
          <Filter size={20} color={colors.text} />
        </TouchableOpacity>
        </View>
        
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity 
            style={[styles.uploadButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowUploadOptions(!showUploadOptions)}
          >
            <Upload size={20} color={colors.background} />
            <Text style={[styles.uploadButtonText, { color: colors.background }]}>Upload Stock</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={handleAddProduct}
          >
            <Plus size={20} color={colors.background} />
          </TouchableOpacity>
        </View>
        
        {showUploadOptions && (
          <View style={[styles.uploadOptionsContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <TouchableOpacity 
              style={[styles.uploadOption, { borderBottomColor: colors.border }]}
              onPress={handleAddProduct}
            >
              <Plus size={20} color={colors.text} />
              <View style={styles.uploadOptionText}>
                <Text style={[styles.uploadOptionTitle, { color: colors.text }]}>Add Product Manually</Text>
                <Text style={[styles.uploadOptionDescription, { color: colors.inactive }]}>Create a new product entry</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.uploadOption, { borderBottomColor: colors.border }]}
              onPress={handleCSVImport}
            >
              <FileText size={20} color={colors.text} />
              <View style={styles.uploadOptionText}>
                <Text style={[styles.uploadOptionTitle, { color: colors.text }]}>Import from CSV</Text>
                <Text style={[styles.uploadOptionDescription, { color: colors.inactive }]}>Upload a CSV file with your products</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.uploadOption, { borderBottomColor: colors.border }]}
              onPress={handleDownloadTemplate}
            >
              <FileText size={20} color={colors.text} />
              <View style={styles.uploadOptionText}>
                <Text style={[styles.uploadOptionTitle, { color: colors.text }]}>Download CSV Template</Text>
                <Text style={[styles.uploadOptionDescription, { color: colors.inactive }]}>Get a sample CSV file to fill out</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.uploadOption}
              onPress={handleGoogleSheetsSetup}
            >
              <Upload size={20} color={colors.text} />
              <View style={styles.uploadOptionText}>
                <Text style={[styles.uploadOptionTitle, { color: colors.text }]}>Google Sheets Integration</Text>
                <Text style={[styles.uploadOptionDescription, { color: colors.inactive }]}>Sync with Google Sheets</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      {filteredProducts.length > 0 ? (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onPress={() => handleProductPress(item.id)}
            />
          )}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState 
          type="products" 
          onAction={handleAddProduct} 
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    borderBottomWidth: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
  },
  clearButton: {
    fontSize: 14,
    fontWeight: '500',
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOptionsContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  uploadOptionText: {
    marginLeft: 12,
    flex: 1,
  },
  uploadOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  uploadOptionDescription: {
    fontSize: 14,
  },
});