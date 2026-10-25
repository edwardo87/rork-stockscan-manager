import React, { useMemo, useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ScanBarcode, Send, ClipboardList, AlertTriangle } from 'lucide-react-native';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import Scanner from '@/components/Scanner';
import OrderItemCard from '@/components/OrderItemCard';
import EmptyState from '@/components/EmptyState';
import { buildOrderItem, formatOrderQuantity, prepareOrderForSubmission } from '@/utils/purchasing';
import { OrderItem } from '@/types/inventory';

export default function OrderScreen() {
  const router = useRouter();
  const [showScanner, setShowScanner] = useState(false);
  const { colors } = useThemeStore();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { 
    products, 
    currentOrderItems, 
    getProductByBarcode,
    addToOrder,
    updateOrderItemQuantity,
    removeFromOrder,
    submitOrder
  } = useInventoryStore();

  // Pricing guard: lines are checked against the products as they are now,
  // so fixing a product's purchasing details unblocks the order immediately.
  const readiness = useMemo(
    () => prepareOrderForSubmission(currentOrderItems, products),
    [currentOrderItems, products],
  );
  const issueById = useMemo(
    () => new Map(readiness.blocked.map(b => [b.productId, b.issue])),
    [readiness],
  );
  const blockedCount = readiness.blocked.length;
  const orderTotal = useMemo(() => {
    const priced = readiness.items.filter(i => i.lineTotal != null);
    if (priced.length === 0) return null;
    return { total: priced.reduce((n, i) => n + (i.lineTotal ?? 0), 0), unpriced: readiness.items.length - priced.length };
  }, [readiness]);

  const handleBarcodeScan = (barcode: string, quantity?: number) => {
    const finalQuantity = quantity ?? 1;
    setShowScanner(false);
    
    const product = getProductByBarcode(barcode);
    
    if (product) {
      addToOrder(product, finalQuantity);
      // Show success feedback — Chapter 3: quantity is in ORDER units, with
      // the stock-unit equivalent spelled out for pack-ordered products.
      const preview: OrderItem = buildOrderItem(product, finalQuantity);
      const qty = formatOrderQuantity(preview, finalQuantity);
      const qtyText = qty.stockEquivalent ? `${qty.main} ${qty.stockEquivalent}` : qty.main;
      Alert.alert(
        "Product Added",
        `Added ${qtyText} of ${product.name} to order`,
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
    if (blockedCount > 0) {
      Alert.alert(
        "Purchasing details needed",
        `${blockedCount} ${blockedCount === 1 ? 'item needs' : 'items need'} pack or price details fixed before this order can be sent:\n\n${readiness.blocked.map(b => `• ${b.name}`).join('\n')}`,
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
          onPress: async () => {
            try {
              setIsSubmitting(true);
              await submitOrder();
              router.push('/order/success');
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Failed to submit order';
              Alert.alert('Submit Failed', msg, [{ text: 'OK' }]);
            } finally {
              setIsSubmitting(false);
            }
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
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.text }]}>Order Items</Text>
              <Text style={[styles.subtitle, { color: colors.inactive }]}>
                {currentOrderItems.length} {currentOrderItems.length === 1 ? 'item' : 'items'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.historyButton}
              onPress={() => router.push('/po-preview')}
            >
              <ClipboardList size={18} color={colors.primary} />
              <Text style={[styles.historyButtonText, { color: colors.primary }]}>History</Text>
            </TouchableOpacity>
          </View>
          
          {blockedCount > 0 && (
            <View style={[styles.blockBanner, { backgroundColor: colors.error + '14', borderColor: colors.error + '55' }]} testID="order-pricing-blocked">
              <AlertTriangle size={18} color={colors.error} />
              <Text style={[styles.blockBannerText, { color: colors.text }]}>
                {blockedCount === 1 ? '1 item has' : `${blockedCount} items have`} unresolved pack or price details. Fix {blockedCount === 1 ? 'it' : 'them'} before sending — totals are hidden rather than guessed.
              </Text>
            </View>
          )}

          {currentOrderItems.length > 0 ? (
            <FlatList
              data={readiness.items}
              keyExtractor={(item) => item.productId}
              renderItem={({ item }) => (
                <OrderItemCard
                  item={item}
                  pricingIssue={issueById.get(item.productId)}
                  onFixPricing={() => router.push(`/product/edit/${item.productId}`)}
                  onUpdateQuantity={updateOrderItemQuantity}
                  onRemove={removeFromOrder}
                />
              )}
              ListFooterComponent={orderTotal ? (
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: colors.inactive }]}>
                    Order total (ex GST){orderTotal.unpriced > 0 ? ` · ${orderTotal.unpriced} without price` : ''}
                  </Text>
                  <Text style={[styles.totalValue, { color: colors.text }]}>${orderTotal.total.toFixed(2)}</Text>
                </View>
              ) : null}
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
                (currentOrderItems.length === 0 || blockedCount > 0) && { backgroundColor: colors.inactive }
              ]} 
              onPress={handleSubmitOrder}
              disabled={currentOrderItems.length === 0 || isSubmitting}
              accessibilityState={{ disabled: currentOrderItems.length === 0 || blockedCount > 0 || isSubmitting }}
            >
              <Send size={24} color={colors.background} />
              <Text style={[styles.submitButtonText, { color: colors.background }]}>{isSubmitting ? 'Submitting…' : 'Submit Order'}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerText: {
    flex: 1,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  historyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
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
  blockBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  blockBannerText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
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