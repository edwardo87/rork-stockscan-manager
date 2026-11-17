import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Product } from '@/types/inventory';
import { useThemeStore } from '@/store/themeStore';
import { AlertTriangle, Clock, Pencil } from 'lucide-react-native';
import { formatDistanceToNow } from '@/utils/dateUtils';
import { useRouter } from 'expo-router';
import { effectiveStockUnit, purchasingCostParts, purchasingProblem } from '@/utils/purchasing';

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
  onEdit?: () => void;
}

export default function ProductCard({ product, onPress, onEdit }: ProductCardProps) {
  const { colors } = useThemeStore();
  const router = useRouter();
  const isLowStock = product.currentStock < product.minStock;
  // Supplier purchasing cost (ex GST) with its pricing unit; the sell price is
  // a separate field and only shown when one is actually recorded.
  const cost = purchasingCostParts(product);
  const pricingIssue = purchasingProblem(product);
  const stockUnit = effectiveStockUnit(product);

  const handleEdit = () => {
    if (onEdit) {
      onEdit();
    } else {
      router.push(`/product/edit/${product.id}`);
    }
  };

  const code = product.supplierCode?.trim() || product.barcode;
  // Stock bar: current vs a "comfortable" level of 2× the minimum.
  const target = product.minStock > 0 ? product.minStock * 2 : Math.max(product.currentStock, 1);
  const fill = Math.max(0, Math.min(1, product.currentStock / target));
  const barColor = isLowStock ? colors.accent : colors.success;

  return (
    <TouchableOpacity 
      style={[styles.container, { 
        backgroundColor: colors.background,
        borderColor: isLowStock ? colors.accent : colors.border,
        borderWidth: isLowStock ? 1.5 : 1,
      }]} 
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.top}>
        <View style={styles.left}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>{product.name}</Text>
          <View style={styles.chips}>
            {product.supplier ? (
              <View style={[styles.chip, { backgroundColor: colors.chip }]}>
                <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>{product.supplier}</Text>
              </View>
            ) : null}
            {code ? (
              <View style={[styles.chip, { backgroundColor: colors.chip }]}>
                <Text style={[styles.chipText, styles.mono, { color: colors.inactive }]} numberOfLines={1}>{code}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.right} testID={`product-cost-${product.id}`}>
          {cost ? (
            <>
              <Text style={[styles.price, { color: colors.text }]}>{cost.amount}</Text>
              <Text style={[styles.costPer, { color: colors.inactive }]} numberOfLines={2}>{cost.per}</Text>
              {cost.detail ? (
                <Text style={[styles.costDetail, { color: colors.inactive }]} numberOfLines={1}>{cost.detail}</Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.costMissing, { color: colors.inactive }]}>No cost</Text>
          )}
          {product.price > 0 ? (
            <Text style={[styles.costDetail, { color: colors.inactive }]}>sell ${product.price.toFixed(2)}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.stockRow}>
        <View style={[styles.track, { backgroundColor: colors.track }]}>
          <View style={[styles.bar, { width: `${fill * 100}%`, backgroundColor: barColor }]} />
        </View>
        {isLowStock ? (
          <View style={[styles.lowChip, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.lowChipText, { color: colors.accentText }]}>
              LOW · {product.currentStock} of {product.minStock} min
            </Text>
          </View>
        ) : (
          <Text style={[styles.stockText, { color: colors.text }]}>
            {product.currentStock} <Text style={{ color: colors.inactive, fontWeight: '500' }}>{stockUnit}</Text>
          </Text>
        )}
        <TouchableOpacity
          style={styles.editButton}
          onPress={handleEdit}
          hitSlop={8}
          accessibilityLabel="Edit product"
        >
          <Pencil size={15} color={colors.inactive} />
        </TouchableOpacity>
      </View>

      {pricingIssue ? (
        <View style={styles.costIssue}>
          <AlertTriangle size={13} color={colors.warning} />
          <Text style={[styles.costIssueText, { color: colors.accentText }]} numberOfLines={2}>{pricingIssue}</Text>
        </View>
      ) : null}

      {product.lastOrdered ? (
        <View style={styles.lastOrderedContainer}>
          <Clock size={12} color={colors.inactive} />
          <Text style={[styles.lastOrderedText, { color: colors.inactive }]}>
            Last ordered {formatDistanceToNow(new Date(product.lastOrdered))}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  top: { flexDirection: 'row', gap: 12 },
  left: { flex: 1 },
  right: { alignItems: 'flex-end', maxWidth: '42%' },
  name: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, maxWidth: '100%' },
  chipText: { fontSize: 11, fontWeight: '600' },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 0.3 },
  price: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  costPer: { fontSize: 11, fontWeight: '500', textAlign: 'right' },
  costDetail: { fontSize: 11, marginTop: 1, textAlign: 'right' },
  costMissing: { fontSize: 13, fontStyle: 'italic' },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  stockText: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  lowChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  lowChipText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  editButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  costIssue: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 8 },
  costIssueText: { fontSize: 12, fontWeight: '600', flex: 1 },
  lastOrderedContainer: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  lastOrderedText: { fontSize: 12 },
});
