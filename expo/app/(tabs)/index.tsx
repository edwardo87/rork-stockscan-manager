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

  const sendDisabled = currentOrderItems.length === 0 || blockedCount > 0 || isSubmitting;
  const supplierCount = new Set(currentOrderItems.map(i => i.supplier).filter(Boolean)).size;

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
          <View style={styles.topArea}>
            <TouchableOpacity
              style={[styles.scanHero, { backgroundColor: colors.primaryFill }]}
              onPress={() => setShowScanner(true)}
              activeOpacity={0.85}
              testID="order-scan-hero"
            >
              <View style={[styles.scanTile, { backgroundColor: colors.accent }]}>
                <ScanBarcode size={26} color="#1B2A41" strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.scanTitle, { color: colors.onPrimaryFill }]}>Scan to add</Text>
                <Text style={[styles.scanSub, { color: colors.onPrimaryFill }]}>Barcode or supplier code</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.overline, { color: colors.accentText }]}>CURRENT ORDER</Text>
                <Text style={[styles.subtitle, { color: colors.inactive }]}>
                  {currentOrderItems.length} {currentOrderItems.length === 1 ? 'item' : 'items'}
                  {supplierCount > 0 ? ` · ${supplierCount} ${supplierCount === 1 ? 'supplier' : 'suppliers'}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.historyButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => router.push('/po-preview')}
              >
                <ClipboardList size={16} color={colors.text} />
                <Text style={[styles.historyButtonText, { color: colors.text }]}>History</Text>
              </TouchableOpacity>
            </View>
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
              contentContainerStyle={styles.listContent}
            />
          ) : (
            <EmptyState type="order" />
          )}
          
          {currentOrderItems.length > 0 && (
            <View style={[styles.actionBar, { 
              backgroundColor: colors.background,
              borderTopColor: colors.border
            }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.totalLabel, { color: colors.inactive }]}>
                  Order total ex GST{orderTotal && orderTotal.unpriced > 0 ? ` · ${orderTotal.unpriced} unpriced` : ''}
                </Text>
                <Text style={[styles.totalValue, { color: colors.text }]}>
                  {orderTotal ? `$${orderTotal.total.toFixed(2)}` : '—'}
                </Text>
              </View>
              <TouchableOpacity 
                style={[
                  styles.submitButton,
                  { backgroundColor: colors.primaryFill },
                  sendDisabled && { opacity: 0.45 }
                ]} 
                onPress={handleSubmitOrder}
                disabled={currentOrderItems.length === 0 || isSubmitting}
                accessibilityState={{ disabled: sendDisabled }}
              >
                <Send size={18} color={colors.onPrimaryFill} />
                <Text style={[styles.submitButtonText, { color: colors.onPrimaryFill }]}>{isSubmitting ? 'Sending…' : 'Send order'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  scanHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
  },
  scanTile: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  scanSub: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 4,
  },
  overline: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
    fontWeight: '500',
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    gap: 6,
  },
  historyButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingTop: 10,
  },
  blockBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  blockBannerText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
