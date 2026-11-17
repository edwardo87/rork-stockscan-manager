import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import { HISTORY_PAGE_SIZE, loadStocktake, loadStocktakePage } from '@/services/stocktakeHistoryService';
import { shareStocktake } from '@/services/stocktakeShareService';

export default function StocktakeHistory() {
  const { colors } = useThemeStore();
  const { user, isAuthenticated } = useInventoryStore();
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const enabled = isAuthenticated && !!user?.id;
  const history = useQuery({
    queryKey: ['stocktake-history', user?.id, page],
    queryFn: ({ signal }) => loadStocktakePage(page, signal, user.id), enabled, retry: false,
  });
  const detail = useQuery({
    queryKey: ['stocktake-detail', user?.id, selected],
    queryFn: ({ signal }) => loadStocktake(selected!, signal, user.id), enabled: enabled && !!selected, retry: false,
  });
  const button = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={[styles.button, { backgroundColor: colors.primary, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={{ color: colors.background, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
  const error = selected ? detail.error : history.error;
  const loading = selected ? detail.isFetching : history.isFetching;
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <Stack.Screen options={{ title: 'Stocktake History' }} />
    {!enabled ? <Text style={{ color: colors.text }}>Sign in to view saved stocktakes.</Text> : <>
      {selected && button('Back to stocktakes', () => setSelected(null))}
      <Text style={{ color: colors.inactive, marginVertical: 12 }}>
        Saved physical counts. Differences compare against the recorded count at that time, not live stock movements.
      </Text>
      {loading && <ActivityIndicator color={colors.primary} />}
      {error && <View>
        <Text accessibilityRole="alert" style={{ color: colors.error }}>{error.message}</Text>
        {button('Retry', () => { selected ? void detail.refetch() : void history.refetch(); }, loading)}
      </View>}
      {selected ? detail.data && !error && <>
        <Text style={[styles.title, { color: colors.text }]}>{new Date(detail.data.date).toLocaleString()}</Text>
        <Text selectable style={{ color: colors.inactive }}>Reference: {detail.data.id}</Text>
        <Text style={{ color: colors.inactive }}>{detail.data.status} · {detail.data.items.length} lines</Text>
        {!!detail.data.notes && <Text style={{ color: colors.text }}>{detail.data.notes}</Text>}
        {button(sharing ? 'Preparing…' : 'Export / share CSV', async () => {
          setSharing(true);
          try { await shareStocktake(detail.data!); }
          catch (err) { Alert.alert('Export unavailable', err instanceof Error ? err.message : 'Please try again.'); }
          finally { setSharing(false); }
        }, sharing || loading || detail.data.items.length === 0)}
        <FlatList data={detail.data.items} keyExtractor={(item, index) => `${item.productId}-${index}`}
          ListEmptyComponent={<Text style={{ color: colors.inactive }}>No saved lines. This record may be incomplete; there is nothing to export.</Text>}
          renderItem={({ item }) => <View style={[styles.row, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
            <Text style={{ color: colors.inactive }}>{item.barcode}</Text>
            <Text style={{ color: colors.text }}>Previous: {item.expectedQuantity} · Counted: {item.actualQuantity} · Difference: {item.discrepancy}</Text>
          </View>} />
      </> : <>
        <FlatList data={history.data || []} keyExtractor={item => item.id}
          refreshing={history.isFetching} onRefresh={() => { void history.refetch(); }}
          ListEmptyComponent={!loading && !error ? <Text style={{ color: colors.inactive }}>No saved stocktakes on this page.</Text> : null}
          renderItem={({ item }) => <TouchableOpacity accessibilityRole="button" onPress={() => setSelected(item.id)} style={[styles.row, { borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>{new Date(item.date).toLocaleString()}</Text>
            <Text style={{ color: colors.inactive }}>{item.status} · View counts and export</Text>
          </TouchableOpacity>} />
        <View style={styles.navigation}>
          {button('Newer', () => setPage(p => p - 1), page === 0 || loading)}
          <Text style={{ color: colors.text }}>Page {page + 1}</Text>
          {button('Older', () => setPage(p => p + 1), loading || (history.data?.length || 0) < HISTORY_PAGE_SIZE)}
        </View>
      </>}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  row: { paddingVertical: 16, borderBottomWidth: 1, gap: 6 },
  title: { fontSize: 18, fontWeight: '600' },
  button: { padding: 12, borderRadius: 8, alignItems: 'center', marginVertical: 8 },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
