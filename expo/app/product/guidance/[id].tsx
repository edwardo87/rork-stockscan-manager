import React, { useState } from 'react';
import { View, Text, Switch, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import { effectiveStockUnit } from '@/utils/purchasing';
import { parsePhysicalCount } from '@/utils/stockGuidance';
import { saveStockGuidance } from '@/services/stockGuidanceService';

export default function StockGuidanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { products, user, loadProducts } = useInventoryStore();
  const product = products.find(p => p.id === id);
  const { colors } = useThemeStore();
  const router = useRouter();
  const [enabled, setEnabled] = useState(product?.desiredStockEnabled ?? false);
  const [quantity, setQuantity] = useState(product?.desiredStockQuantity?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const parsed = parsePhysicalCount(quantity);
  if (!product?.desiredStockAvailable) return <View style={{ padding: 20 }}><Text>Stock guidance is unavailable for this product. You can still enter order quantities manually.</Text></View>;
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: 20, gap: 16, backgroundColor: colors.background }}>
    <Stack.Screen options={{ title: 'Optional stock guidance' }} />
    <Text style={{ color: colors.text, fontSize: 20, fontWeight: '600' }}>{product.name}</Text>
    <Text style={{ color: colors.inactive }}>Choose how much you want to hold. During scanning, enter a fresh physical count to see a suggestion rounded up to whole order units. You can always choose a different order quantity.</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: colors.text }}>Enable suggestions for this product</Text>
      <Switch value={enabled} onValueChange={setEnabled} disabled={saving} accessibilityLabel="Enable stock guidance" />
    </View>
    {enabled && <>
      <Text style={{ color: colors.text }}>Desired quantity ({effectiveStockUnit(product)})</Text>
      <TextInput value={quantity} onChangeText={setQuantity} editable={!saving} keyboardType="decimal-pad" accessibilityLabel="Desired stock quantity"
        style={{ padding: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, borderRadius: 8 }} />
      {parsed == null && <Text style={{ color: colors.error }}>Enter zero or more, with up to four decimal places.</Text>}
    </>}
    <TouchableOpacity accessibilityRole="button" disabled={saving || enabled && parsed == null}
      style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 8, opacity: saving || enabled && parsed == null ? 0.5 : 1 }}
      onPress={async () => {
        setSaving(true);
        try { await saveStockGuidance(product.id, user?.id, enabled, parsed); await loadProducts(); router.back(); }
        catch (err) { Alert.alert('Not saved', err instanceof Error ? err.message : 'Please try again.'); }
        finally { setSaving(false); }
      }}>
      <Text style={{ color: colors.background, textAlign: 'center', fontWeight: '600' }}>{saving ? 'Saving…' : 'Save guidance'}</Text>
    </TouchableOpacity>
  </KeyboardAvoidingView>;
}
