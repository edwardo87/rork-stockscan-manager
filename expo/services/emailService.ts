import { Linking, Alert, Platform } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { PurchaseOrder } from '@/types/inventory';
import { generatePurchaseOrderPDF, POData, getPoNumber } from './pdfService';

/**
 * Copies the PDF returned by expo-print (which lives in the cache dir with a
 * random UUID filename) into documentDirectory under a stable
 * `PO-XXXX-Supplier.pdf` name. Mail clients use the filename + extension to
 * pick the MIME type — a stable, dot-pdf filename in the document directory
 * is the most reliable way to get Gmail/Outlook to deliver the attachment
 * as application/pdf.
 */
async function copyPdfForAttachment(
  sourceUri: string,
  poNumber: string,
  supplierName: string,
): Promise<string> {
  const safeSupplier = supplierName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Supplier';
  const fileName = `${poNumber}-${safeSupplier}.pdf`;
  const destDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!destDir) throw new Error('No writable directory available for PDF attachment');
  const destUri = `${destDir}${fileName}`;

  const existing = await FileSystem.getInfoAsync(destUri);
  if (existing.exists) {
    await FileSystem.deleteAsync(destUri, { idempotent: true });
  }
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });

  const info = await FileSystem.getInfoAsync(destUri);
  const size = (info as { exists: boolean; size?: number }).size;
  console.log('[PO email] copied attachment uri:', destUri, 'exists:', info.exists, 'size:', size);
  if (!info.exists || !size || size <= 0) {
    throw new Error('Copied PDF is empty or missing');
  }
  return destUri;
}

export function formatPurchaseOrderEmail(purchaseOrder: PurchaseOrder): {
  subject: string;
  body: string;
} {
  const { supplierName, date, items, id } = purchaseOrder;
  const poNumber = getPoNumber(id);
  const formattedDate = new Date(date).toLocaleDateString();
  const subject = `Purchase Order ${poNumber} - ${supplierName}`;
  const itemsTable = items
    .map((item, index) => `${index + 1}. ${item.name}\n   Code: ${item.barcode}\n   Quantity: ${item.quantity}\n`)
    .join('');
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const body = `Dear ${supplierName},

Please see attached purchase order. Due ASAP. Thank you.

Purchase Order: ${poNumber}
Date: ${formattedDate}
Supplier: ${supplierName}

ITEMS ORDERED:
${itemsTable}
Total Items: ${totalQuantity}

Best regards,
Lifestyle Windows
14-16 Link Crescent, Coolum Beach 4573
Phone: 5351 1858 | Fax: 5351 1903`;

  return { subject, body };
}

/**
 * Opens email client with purchase order PDF attachment.
 *
 * Native: generates one PDF via expo-print, copies it to documentDirectory
 * under `PO-XXXX-Supplier.pdf`, and hands that URI to MailComposer. The
 * mail compose screen opens with the PDF visibly attached — no download
 * step, no second PDF.
 *
 * Web: cannot pre-attach files to a mail client. Downloads the HTML
 * preview and opens mailto with a note. (Web is a fallback; the spec
 * targets native field testing.)
 */
export async function sendPurchaseOrderEmail(
  purchaseOrder: PurchaseOrder,
  supplierEmail?: string,
): Promise<boolean> {
  try {
    const poData: POData = {
      id: purchaseOrder.id,
      supplierName: purchaseOrder.supplierName,
      supplierEmail: purchaseOrder.supplierEmail || supplierEmail,
      date: purchaseOrder.date,
      items: purchaseOrder.items,
      status: purchaseOrder.status,
    };

    const poNumber = getPoNumber(purchaseOrder.id);
    const subject = `Purchase Order ${poNumber} - ${purchaseOrder.supplierName}`;
    const body = 'Please see attached purchase order. Due ASAP. Thank you.';

    if (Platform.OS !== 'web') {
      const mailAvailable = await MailComposer.isAvailableAsync();
      const generatedUri = await generatePurchaseOrderPDF(poData);
      console.log('[PO email] generated PDF URI:', generatedUri);
      const attachmentUri = await copyPdfForAttachment(generatedUri, poNumber, purchaseOrder.supplierName);

      if (mailAvailable) {
        const result = await MailComposer.composeAsync({
          recipients: supplierEmail ? [supplierEmail] : [],
          subject,
          body,
          attachments: [attachmentUri],
        });
        console.log('[PO email] MailComposer result status:', result.status);
        return result.status === MailComposer.MailComposerStatus.SENT;
      }

      // No mail client configured — fall back to native share sheet so the
      // user can pick Gmail/Outlook/etc. and the attachment still comes
      // through correctly.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(attachmentUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share Purchase Order ${poNumber}`,
          UTI: 'com.adobe.pdf',
        });
        return true;
      }

      setTimeout(() => {
        Alert.alert(
          'Email Not Available',
          'No email client is configured on this device. Please set up an email app to send purchase orders.',
          [{ text: 'OK' }],
        );
      }, 100);
      return false;
    }

    // Web fallback — no real PDF generation available; download the HTML
    // preview and open mailto. Web is not the target for field testing.
    const previewUrl = await generatePurchaseOrderPDF(poData);
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `${poNumber}_${purchaseOrder.supplierName.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const mailtoUrl = `mailto:${supplierEmail ? encodeURIComponent(supplierEmail) : ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + '\n\nNote: PO downloaded — please attach the downloaded file to this email.')}`;
    try {
      await Linking.openURL(mailtoUrl);
    } catch (e) {
      console.log('Could not open email client:', e);
    }
    setTimeout(() => {
      try { URL.revokeObjectURL(previewUrl); } catch {}
    }, 5000);
    return true;
  } catch (error) {
    console.error('Error sending purchase order email:', error);
    const msg = error instanceof Error ? error.message : 'Failed to generate or send purchase order.';
    setTimeout(() => {
      Alert.alert('Email Error', msg, [{ text: 'OK' }]);
    }, 100);
    return false;
  }
}

/**
 * Sends multiple purchase orders via email (one for each supplier)
 */
export async function sendMultiplePurchaseOrders(
  purchaseOrders: PurchaseOrder[],
): Promise<void> {
  if (purchaseOrders.length === 0) {
    setTimeout(() => {
      Alert.alert('No Orders', 'No purchase orders to send.', [{ text: 'OK' }]);
    }, 100);
    return;
  }

  if (purchaseOrders.length === 1) {
    await sendPurchaseOrderEmail(purchaseOrders[0]);
    return;
  }

  setTimeout(() => {
    Alert.alert(
      'Multiple Suppliers',
      `You have ${purchaseOrders.length} purchase orders for different suppliers. How would you like to send them?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send All',
          onPress: async () => {
            for (const po of purchaseOrders) {
              await sendPurchaseOrderEmail(po);
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          },
        },
      ],
    );
  }, 100);
}

/**
 * Preview PDF — opens the same PDF that the email flow would attach.
 * Native: share sheet with the file (lets the user View / Save / Open in).
 * Web: opens the HTML preview in a new tab.
 */
export async function previewPurchaseOrderPDF(purchaseOrder: PurchaseOrder): Promise<void> {
  try {
    const poData: POData = {
      id: purchaseOrder.id,
      supplierName: purchaseOrder.supplierName,
      supplierEmail: purchaseOrder.supplierEmail,
      date: purchaseOrder.date,
      items: purchaseOrder.items,
      status: purchaseOrder.status,
    };

    const pdfUri = await generatePurchaseOrderPDF(poData);
    console.log('[PO preview] pdf URI:', pdfUri);

    if (Platform.OS === 'web') {
      window.open(pdfUri, '_blank');
      return;
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(pdfUri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: `Preview Purchase Order ${getPoNumber(purchaseOrder.id)}`,
      });
    } else {
      Alert.alert('Preview Unavailable', 'Sharing is not available on this device.');
    }
  } catch (error) {
    console.error('Error previewing PDF:', error);
    setTimeout(() => {
      Alert.alert(
        'Preview Error',
        error instanceof Error ? error.message : 'Failed to generate PDF preview.',
        [{ text: 'OK' }],
      );
    }, 100);
  }
}
