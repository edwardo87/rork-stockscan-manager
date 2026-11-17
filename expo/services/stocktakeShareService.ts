import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { StocktakeSession } from '@/types/inventory';
import { stocktakeCsv } from '@/utils/stocktakeExport';

export async function shareStocktake(session: StocktakeSession): Promise<void> {
  const csv = stocktakeCsv(session);
  const filename = `stocktake-${session.id.replace(/[^a-zA-Z0-9-]/g, '')}.csv`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!FileSystem.cacheDirectory || !await Sharing.isAvailableAsync()) {
    throw new Error('File sharing is not available on this device.');
  }
  const path = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(path, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Share stocktake' });
}
