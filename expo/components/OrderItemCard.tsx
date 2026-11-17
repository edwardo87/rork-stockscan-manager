import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { OrderItem } from '@/types/inventory';
import { useThemeStore } from '@/store/themeStore';
import { Trash2, AlertTriangle, ChevronRight } from 'lucide-react-native';
import QuantityInput from './QuantityInput';
import { formatOrderQuantity } from '@/utils/purchasing';

interface OrderItemCardProps {
  item: OrderItem;
  /** Why this line's pricing can't be totalled (blocks sending the PO). */
  pricingIssue?: string;
  onFixPricing?: () => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

export default function OrderItemCard({ 
  item, 
  pricingIssue,
  onFixPricing,
  onUpdateQuantity, 
  onRemove 
}: OrderItemCardProps) {
  const { colors } = useThemeStore();

  // Chapter 3: quantity edits are in ORDER units (packs/boxes/cartons); the
  // card also shows the stock-unit equivalent and the ex-GST line total.
  const orderQty = item.orderQuantity ?? item.quantity;
  const qtyText = formatOrderQuantity(item, orderQty);
  // The line total is the item's own snapshot (built from the product by the
  // pricing guard) — never recomputed here, and hidden when unresolved.
  const issue = pricingIssue ?? item.pricingIssue;
  const lineTotal = issue ? null : item.lineTotal ?? null;

  return (
    <View style={[styles.container, { 
      backgroundColor: colors.background,
      borderColor: colors.border,
      shadowColor: colors.text,
    }]}>
      <View style={styles.header}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <TouchableOpacity 
          style={[styles.removeButton, { backgroundColor: colors.lightGray }]}
          onPress={() => onRemove(item.productId)}
        >
          <Trash2 size={20} color={colors.error} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={[styles.label, { color: colors.inactive }]}>
            {item.supplierCode ? 'Supplier code:' : 'Barcode:'}
          </Text>
          <Text style={[styles.value, { color: colors.text }]}>
            {item.supplierCode?.trim() || item.barcode}
          </Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={[styles.label, { color: colors.inactive }]}>Supplier:</Text>
          <Text style={[styles.value, { color: colors.text }]}>{item.supplier}</Text>
        </View>

        {(qtyText.stockEquivalent || lineTotal != null) && (
          <View style={styles.detailRow}>
            <Text style={[styles.label, { color: colors.inactive }]}>Equates to:</Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {qtyText.stockEquivalent ? `${qtyText.stockEquivalent.replace(/[()=]/g, '').trim()}` : ''}
              {lineTotal != null ? `${qtyText.stockEquivalent ? '  •  ' : ''}$${lineTotal.toFixed(2)} ex GST` : ''}
            </Text>
          </View>
        )}
      </View>

      {issue ? (
        <TouchableOpacity
          style={[styles.issue, { backgroundColor: colors.error + '12', borderColor: colors.error + '50' }]}
          onPress={onFixPricing}
          disabled={!onFixPricing}
          testID={`order-item-issue-${item.productId}`}
        >
          <AlertTriangle size={16} color={colors.error} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.issueText, { color: colors.text }]}>{issue}</Text>
            {onFixPricing ? <Text style={[styles.issueLink, { color: colors.primary }]}>Fix purchasing details</Text> : null}
          </View>
          {onFixPricing ? <ChevronRight size={18} color={colors.inactive} /> : null}
        </TouchableOpacity>
      ) : null}
      
      <View style={styles.quantityContainer}>
        <Text style={[styles.orderQtyLabel, { color: colors.inactive }]}>
          Order quantity{item.orderUnit ? ` (${item.orderUnit})` : ''}
        </Text>
        <QuantityInput 
          value={orderQty} 
          onChange={(value) => onUpdateQuantity(item.productId, value)}
          min={1}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  details: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    width: 80,
  },
  value: {
    fontSize: 14,
    flex: 1,
  },
  issue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  issueText: {
    fontSize: 13,
    lineHeight: 18,
  },
  issueLink: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  quantityContainer: {
    marginTop: 8,
  },
  orderQtyLabel: {
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '500',
  },
});