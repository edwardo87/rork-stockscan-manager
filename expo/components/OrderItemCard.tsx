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

  const code = item.supplierCode?.trim() || item.barcode;
  const equivalent = qtyText.stockEquivalent ? qtyText.stockEquivalent.replace(/[()]/g, '').trim() : null;

  return (
    <View style={[styles.container, {
      backgroundColor: colors.background,
      borderColor: issue ? colors.error + '66' : colors.border,
    }]}>
      <View style={styles.header}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => onRemove(item.productId)}
          hitSlop={8}
          accessibilityLabel="Remove from order"
        >
          <Trash2 size={18} color={colors.inactive} />
        </TouchableOpacity>
      </View>

      <View style={styles.chips}>
        {item.supplier ? (
          <View style={[styles.chip, { backgroundColor: colors.chip }]}>
            <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>{item.supplier}</Text>
          </View>
        ) : null}
        {code ? (
          <View style={[styles.chip, { backgroundColor: colors.chip }]}>
            <Text style={[styles.chipText, styles.mono, { color: colors.inactive }]} numberOfLines={1}>{code}</Text>
          </View>
        ) : null}
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

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.stepper}>
          <QuantityInput
            value={orderQty}
            onChange={(value) => onUpdateQuantity(item.productId, value)}
            min={1}
            label=""
          />
        </View>
        <View style={styles.qtySummary}>
          <Text style={[styles.qtyMain, { color: colors.text }]} numberOfLines={1}>
            {qtyText.main}
          </Text>
          {equivalent ? (
            <Text style={[styles.qtyEq, { color: colors.inactive }]} numberOfLines={1}>{equivalent}</Text>
          ) : null}
          {lineTotal != null ? (
            <Text style={[styles.lineTotal, { color: colors.text }]}>${lineTotal.toFixed(2)}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    flex: 1,
  },
  removeButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, maxWidth: '60%' },
  chipText: { fontSize: 12, fontWeight: '600' },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 0.3 },
  issue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
  },
  issueText: {
    fontSize: 13,
    lineHeight: 18,
  },
  issueLink: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  stepper: { width: 150 },
  qtySummary: { flex: 1, alignItems: 'flex-end' },
  qtyMain: { fontSize: 14, fontWeight: '700' },
  qtyEq: { fontSize: 12, marginTop: 1 },
  lineTotal: { fontSize: 17, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },
});
