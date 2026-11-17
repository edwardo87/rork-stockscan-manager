import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { prepareQrLabel, prepareQrLabelBatch, QrLabelProduct } from '@/utils/qrLabel';

async function loadPng(url: string): Promise<string> {
  if (!FileSystem.cacheDirectory) throw new Error('Temporary storage is unavailable.');
  const imageFile = `${FileSystem.cacheDirectory}product-qr-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  const task = FileSystem.createDownloadResumable(url, imageFile);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      task.downloadAsync(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          void task.pauseAsync().catch(() => {});
          reject(new Error('QR download timed out. Check your connection and retry.'));
        }, 20000);
      }),
    ]);
    if (!result || result.status !== 200) throw new Error('QR image could not be downloaded. Check your connection and retry.');
    return await FileSystem.readAsStringAsync(imageFile, { encoding: FileSystem.EncodingType.Base64 });
  } finally { if (timeout) clearTimeout(timeout); }
}
const pdfIO = { loadPng, renderPdf: async (html: string) => (await Print.printToFileAsync({ html })).uri };

export async function shareProductQrLabel(product: QrLabelProduct): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available on this device.');
  const pdf = await prepareQrLabel(product, pdfIO);
  await Sharing.shareAsync(pdf, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Print or share label for ${product.name}` });
}

export async function shareProductQrLabels(products: ReadonlyArray<QrLabelProduct & { category?: string }>, labelSize: number): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is not available on this device.');
  const pdf = await prepareQrLabelBatch(products, labelSize, pdfIO);
  await Sharing.shareAsync(pdf, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Print or share ${products.length} QR labels` });
}