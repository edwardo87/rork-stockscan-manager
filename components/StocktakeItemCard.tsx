import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { StocktakeItem } from '@/types/inventory';
import { useThemeStore } from '@/store/themeStore';
import { Trash2 } from 'lucide-react-native';
import QuantityInput from './QuantityInput';

interface StocktakeItemCardProps {
  item: StocktakeItem;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

export default function StocktakeItemCard({ 
  item, 
  onUpdateQuantity, 
  onRemove 
}: StocktakeItemCardProps) {
  const { colors } = useThemeStore();
  
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
          <Text style={[styles.label, { color: colors.inactive }]}>Barcode:</Text>
          <Text style={[styles.value, { color: colors.text }]}>{item.barcode}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={[styles.label, { color: colors.inactive }]}>Expected:</Text>
          <Text style={[styles.value, { color: colors.text }]}>{item.expectedQuantity}</Text>
        </View>
      </View>
      
      <View style={styles.quantityContainer}>
        <QuantityInput 
          label="Actual Quantity"
          value={item.actualQuantity} 
          onChange={(value) => onUpdateQuantity(item.productId, value)}
          min={0}
        />
      </View>
      
      <View style={[styles.discrepancyContainer, { borderTopColor: colors.border }]}>
        <Text style={[styles.discrepancyLabel, { color: colors.text }]}>Discrepancy:</Text>
        <Text style={[
          styles.discrepancyValue,
          item.discrepancy === 0 ? { color: colors.text } :
          item.discrepancy > 0 ? { color: colors.success } : { color: colors.error }
        ]}>
          {item.discrepancy > 0 ? '+' : ''}{item.discrepancy}
        </Text>
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
  quantityContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  discrepancyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  discrepancyLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginRight: 8,
  },
  discrepancyValue: {
    fontSize: 18,
    fontWeight: '600',
  },
});