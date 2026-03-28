import React, { useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ScanBarcode, Save } from 'lucide-react-native';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import Scanner from '@/components/Scanner';
import StocktakeItemCard from '@/components/StocktakeItemCard';
import EmptyState from '@/components/EmptyState';

export default function StocktakeScreen() {
  const router = useRouter();
  const [showScanner, setShowScanner] = useState(false);
  const { colors } = useThemeStore();
  
  const { 
    products, 
    currentStocktakeItems, 
    getProductByBarcode,
    addToStocktake,
    updateStocktakeItemQuantity,
    removeFromStocktake,
    submitStocktake
  } = useInventoryStore();

  const handleBarcodeScan = (barcode: string) => {
    setShowScanner(false);
    
    const product = getProductByBarcode(barcode);
    
    if (product) {
      addToStocktake(product, product.currentStock);
      // Show success feedback
      Alert.alert(
        "Product Added",
        `Added ${product.name} to stocktake`,
        [{ text: "OK" }]
      );
    } else {
      Alert.alert(
        "Product Not Found",
        `No product found with barcode: ${barcode}. Please try scanning again.`,
        [{ 
          text: "Try Again",
          onPress: () => setShowScanner(true)
        }]
      );
    }
  };

  const handleSubmitStocktake = () => {
    if (currentStocktakeItems.length === 0) {
      Alert.alert(
        "Empty Stocktake",
        "Please add items to your stocktake before submitting.",
        [{ text: "OK" }]
      );
      return;
    }

    Alert.alert(
      "Submit Stocktake",
      "Are you sure you want to submit this stocktake? This will update your inventory levels.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Submit", 
          onPress: () => {
            submitStocktake();
            router.push('/stocktake/success');
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.lightGray }]}>
      {showScanner ? (
        <Scanner 
          onBarcodeScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
          mode="stocktake"
        />
      ) : (
        <>
          <View style={[styles.header, { 
            backgroundColor: colors.background,
            borderBottomColor: colors.border
          }]}>
            <Text style={[styles.title, { color: colors.text }]}>Stocktake Items</Text>
            <Text style={[styles.subtitle, { color: colors.inactive }]}>
              {currentStocktakeItems.length} {currentStocktakeItems.length === 1 ? 'item' : 'items'}
            </Text>
          </View>
          
          {currentStocktakeItems.length > 0 ? (
            <FlatList
              data={currentStocktakeItems}
              keyExtractor={(item) => item.productId}
              renderItem={({ item }) => (
                <StocktakeItemCard
                  item={item}
                  onUpdateQuantity={updateStocktakeItemQuantity}
                  onRemove={removeFromStocktake}
                />
              )}
              contentContainerStyle={styles.listContent}
            />
          ) : (
            <EmptyState 
              type="stocktake" 
              onAction={() => setShowScanner(true)} 
            />
          )}
          
          <View style={[styles.actionBar, { 
            backgroundColor: colors.background,
            borderTopColor: colors.border
          }]}>
            <TouchableOpacity 
              style={[styles.scanButton, { backgroundColor: colors.primary }]} 
              onPress={() => setShowScanner(true)}
            >
              <ScanBarcode size={24} color={colors.background} />
              <Text style={[styles.scanButtonText, { color: colors.background }]}>Scan</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.submitButton,
                { backgroundColor: colors.secondary },
                currentStocktakeItems.length === 0 && { backgroundColor: colors.inactive }
              ]} 
              onPress={handleSubmitStocktake}
              disabled={currentStocktakeItems.length === 0}
            >
              <Save size={24} color={colors.background} />
              <Text style={[styles.submitButtonText, { color: colors.background }]}>Submit Stocktake</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  listContent: {
    padding: 16,
  },
  actionBar: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 12,
  },
  scanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});