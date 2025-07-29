import React, { useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ScanBarcode, Send } from 'lucide-react-native';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import Scanner from '@/components/Scanner';
import OrderItemCard from '@/components/OrderItemCard';
import EmptyState from '@/components/EmptyState';

export default function OrderScreen() {
  const router = useRouter();
  const [showScanner, setShowScanner] = useState(false);
  const { colors } = useThemeStore();
  
  const { 
    products, 
    currentOrderItems, 
    getProductByBarcode,
    addToOrder,
    updateOrderItemQuantity,
    removeFromOrder,
    submitOrder
  } = useInventoryStore();

  const handleBarcodeScan = (barcode: string, quantity: number = 1) => {
    setShowScanner(false);
    
    const product = getProductByBarcode(barcode);
    
    if (product) {
      addToOrder(product, quantity);
      // Show success feedback
      Alert.alert(
        "Product Added",
        `Added ${quantity} ${product.name} to order`,
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

  const handleSubmitOrder = () => {
    if (currentOrderItems.length === 0) {
      Alert.alert(
        "Empty Order",
        "Please add items to your order before submitting.",
        [{ text: "OK" }]
      );
      return;
    }

    Alert.alert(
      "Submit Order",
      "Are you sure you want to submit this order?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Submit", 
          onPress: () => {
            submitOrder();
            router.push('/order/success');
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
          mode="order"
        />
      ) : (
        <>
          <View style={[styles.header, { 
            backgroundColor: colors.background,
            borderBottomColor: colors.border
          }]}>
            <Text style={[styles.title, { color: colors.text }]}>Order Items</Text>
            <Text style={[styles.subtitle, { color: colors.inactive }]}>
              {currentOrderItems.length} {currentOrderItems.length === 1 ? 'item' : 'items'}
            </Text>
          </View>
          
          {currentOrderItems.length > 0 ? (
            <FlatList
              data={currentOrderItems}
              keyExtractor={(item) => item.productId}
              renderItem={({ item }) => (
                <OrderItemCard
                  item={item}
                  onUpdateQuantity={updateOrderItemQuantity}
                  onRemove={removeFromOrder}
                />
              )}
              contentContainerStyle={styles.listContent}
            />
          ) : (
            <EmptyState 
              type="order" 
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
                currentOrderItems.length === 0 && { backgroundColor: colors.inactive }
              ]} 
              onPress={handleSubmitOrder}
              disabled={currentOrderItems.length === 0}
            >
              <Send size={24} color={colors.background} />
              <Text style={[styles.submitButtonText, { color: colors.background }]}>Submit Order</Text>
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