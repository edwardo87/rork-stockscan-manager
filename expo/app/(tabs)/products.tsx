import React, { useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, Plus, X, FileText, QrCode, FileSpreadsheet } from 'lucide-react-native';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import ProductCard from '@/components/ProductCard';
import EmptyState from '@/components/EmptyState';
import * as DocumentPicker from 'expo-document-picker';
import { parseCSVWithSummary, validateCSVFormat, generateCSVTemplate } from '@/services/csvImportService';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export default function ProductsScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const { colors } = useThemeStore();
  
  const { products, importProductsFromCSV, isLoading, error, setError } = useInventoryStore();

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
        
        // Parse CSV with summary
        const summary = parseCSVWithSummary(csvContent);
        const warningTail = summary.warnings.length > 0
          ? `\n\nSkipped ${summary.skipped} row(s):\n${summary.warnings.slice(0, 5).join('\n')}${summary.warnings.length > 5 ? `\n…and ${summary.warnings.length - 5} more` : ''}`
          : '';

        Alert.alert(
          'Import Preview',
          `Ready to import ${summary.imported} products. Existing products are matched and protected — genuine new products are added; duplicates and conflicting rows are skipped and reported. Nothing is replaced or overwritten.${warningTail}`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Import',
              onPress: async () => {
                try {
                  // Chapter 3: the store matches against the existing catalogue
                  // and skips duplicates/conflicts instead of duplicating.
                  const outcome = await importProductsFromCSV(summary.products);
                  setShowUploadOptions(false);
                  const skippedLines = outcome.details.slice(0, 5).join('\n');
                  Alert.alert(
                    'Import Complete',
                    `Added ${outcome.toAdd.length} new product${outcome.toAdd.length === 1 ? '' : 's'}.\n` +
                      `Skipped ${outcome.duplicates} duplicate${outcome.duplicates === 1 ? '' : 's'}` +
                      (outcome.conflicts > 0 ? ` and ${outcome.conflicts} conflicting row${outcome.conflicts === 1 ? '' : 's'}.` : '.') +
                      (outcome.details.length > 0 ? `\n\n${skippedLines}${outcome.details.length > 5 ? `\n…and ${outcome.details.length - 5} more` : ''}` : ''),
                    [{ text: 'OK' }],
                  );
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'Failed to save imported products';
                  Alert.alert('Import Failed', msg, [{ text: 'OK' }]);
                }
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

      if (Platform.OS === 'web') {
        // Web: trigger a real browser download via Blob + <a download>
        const blob = new Blob([csvTemplate], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setShowUploadOptions(false);
        return;
      }

      const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!baseDir) {
        Alert.alert('Download Failed', 'No writable directory available on this device.', [{ text: 'OK' }]);
        return;
      }
      const fileUri = baseDir + fileName;
      await FileSystem.writeAsStringAsync(fileUri, csvTemplate);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Download CSV Template',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert(
          'Template Ready',
          `CSV template has been saved to: ${fileUri}`,
          [{ text: 'OK' }]
        );
      }
      setShowUploadOptions(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to generate CSV template';
      Alert.alert('Download Failed', msg, [{ text: 'OK' }]);
    }
  };

  const handlePrintQRCodes = () => {
    router.push('/qr-codes-print');
  };

  const supplierCount = new Set(products.map(p => p.supplier?.trim()).filter(Boolean)).size;

  return (
    <View style={[styles.container, { backgroundColor: colors.lightGray }]}>
      <View style={styles.headerContainer}>
        <View style={styles.titleRow}>
          <Text style={[styles.countText, { color: colors.inactive }]}>
            {products.length} {products.length === 1 ? 'item' : 'items'}
            {supplierCount > 0 ? ` · ${supplierCount} ${supplierCount === 1 ? 'supplier' : 'suppliers'}` : ''}
          </Text>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={handlePrintQRCodes}
            accessibilityLabel="Print QR codes"
          >
            <QrCode size={18} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.uploadButton, { backgroundColor: colors.primaryFill }]}
            onPress={() => setShowUploadOptions(!showUploadOptions)}
            testID="products-import-menu"
          >
            {showUploadOptions ? <X size={18} color={colors.onPrimaryFill} /> : <Plus size={18} color={colors.onPrimaryFill} />}
            <Text style={[styles.uploadButtonText, { color: colors.onPrimaryFill }]}>{showUploadOptions ? 'Close' : 'Add / Import'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.searchInputContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Search size={18} color={colors.inactive} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search name, code or barcode"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.inactive}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={18} color={colors.inactive} />
            </TouchableOpacity>
          )}
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
              onPress={() => {
                setShowUploadOptions(false);
                router.push('/catalogue-import');
              }}
              testID="import-supplier-catalogue"
            >
              <FileSpreadsheet size={20} color={colors.accent} />
              <View style={styles.uploadOptionText}>
                <Text style={[styles.uploadOptionTitle, { color: colors.text }]}>Import Supplier Catalogue</Text>
                <Text style={[styles.uploadOptionDescription, { color: colors.inactive }]}>Price list as CSV, Excel or PDF — review before anything is added</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.uploadOption, { borderBottomColor: colors.border }]}
              onPress={handleCSVImport}
            >
              <FileText size={20} color={colors.text} />
              <View style={styles.uploadOptionText}>
                <Text style={[styles.uploadOptionTitle, { color: colors.text }]}>Import SmartStock Template CSV</Text>
                <Text style={[styles.uploadOptionDescription, { color: colors.inactive }]}>Upload a CSV filled in from the SmartStock template</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.uploadOption}
              onPress={handleDownloadTemplate}
            >
              <FileText size={20} color={colors.text} />
              <View style={styles.uploadOptionText}>
                <Text style={[styles.uploadOptionTitle, { color: colors.text }]}>Download CSV Template</Text>
                <Text style={[styles.uploadOptionDescription, { color: colors.inactive }]}>Get a sample CSV file to fill out</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      {error && (
        <TouchableOpacity
          style={[styles.errorBanner, { backgroundColor: colors.error }]}
          onPress={() => setError(null)}
          activeOpacity={0.8}
        >
          <Text style={[styles.errorBannerText, { color: colors.background }]} numberOfLines={3}>
            {error}
          </Text>
        </TouchableOpacity>
      )}

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
          onAction={() => setShowUploadOptions(true)} 
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  countText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
  },
  errorBannerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 6,
  },
  uploadButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  uploadOptionsContainer: {
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
  uploadOptionText: {
    marginLeft: 12,
    flex: 1,
  },
  uploadOptionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  uploadOptionDescription: {
    fontSize: 13,
  },
});
