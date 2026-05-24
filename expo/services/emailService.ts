import { Linking, Alert, Platform } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { PurchaseOrder } from '@/types/inventory';
import { generatePurchaseOrderPDF, POData } from './pdfService';

/**
 * Copies the freshly-generated native PDF from expo-print's cache location to
 * documentDirectory with an explicit `.pdf` filename, then verifies the file
 * still begins with the `%PDF` magic header. Mail clients (Gmail/Outlook on
 * Android in particular) rely on both the extension AND the file content to
 * pick the correct MIME type for the attachment — if either is wrong the
 * recipient sees a corrupted file.
 *
 * Returns the prepared `file://` URI. Native only.
 */
async function preparePdfForAttachmentNative(
  sourceUri: string,
  poNumber: string,
  supplierName: string
): Promise<string> {
  const safeSupplier = supplierName.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `${poNumber}_${safeSupplier}.pdf`;
  const destDir = (FileSystem as any).documentDirectory ?? (FileSystem as any).cacheDirectory;
  if (!destDir) {
    console.log('[PO email] no documentDirectory available, using source URI as-is');
    return sourceUri;
  }
  const destUri = `${destDir}${fileName}`;

  try {
    const existing = await FileSystem.getInfoAsync(destUri);
    if (existing.exists) {
      await FileSystem.deleteAsync(destUri, { idempotent: true });
    }
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  } catch (e) {
    console.log('[PO email] copy to documentDirectory failed, falling back to source URI', e);
    return sourceUri;
  }

  // Verify the copy still has the %PDF header.
  try {
    const head = await FileSystem.readAsStringAsync(destUri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 8,
    });
    const decoded = (typeof atob === 'function' ? atob(head) : Buffer.from(head, 'base64').toString('binary'));
    console.log('[PO email] attachment header bytes:', JSON.stringify(decoded.substring(0, 5)));
    if (!decoded.startsWith('%PDF')) {
      throw new Error('Attachment is not a valid PDF (missing %PDF header)');
    }
  } catch (e) {
    console.log('[PO email] header verification failed', e);
    throw e;
  }

  return destUri;
}

/**
 * Formats a purchase order into email content
 */
export function formatPurchaseOrderEmail(purchaseOrder: PurchaseOrder): {
  subject: string;
  body: string;
} {
  const { supplierName, date, items, id } = purchaseOrder;
  const poNumber = `PO-${String(id).slice(-4).padStart(4, '0')}`;
  const formattedDate = new Date(date).toLocaleDateString();

  const subject = `Purchase Order ${poNumber} - ${supplierName}`;

  const itemsTable = items.map((item, index) =>
    `${index + 1}. ${item.name}
   Code: ${item.barcode}
   Quantity: ${item.quantity}
   
`).join('');

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
 * Native: generates one real PDF via expo-print, verifies its `%PDF` header,
 * copies it to documentDirectory with a stable `.pdf` filename, and hands
 * THAT exact file URI to MailComposer — no second PDF, no transformation,
 * no base64 round-trip. The email compose screen opens with the attachment
 * already included; the user never sees a download step.
 *
 * Web: generates a real PDF via jsPDF, triggers a single silent browser
 * download (since browsers cannot pre-attach files to a mail client), then
 * opens mailto. The downloaded file IS a valid `application/pdf`.
 */
export async function sendPurchaseOrderEmail(
  purchaseOrder: PurchaseOrder,
  supplierEmail?: string
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

    const poNumber = `PO-${String(purchaseOrder.id).slice(-4).padStart(4, '0')}`;
    const subject = `Purchase Order ${poNumber} - ${purchaseOrder.supplierName}`;
    const body = "Please see attached purchase order. Due ASAP. Thank you.";

    const isMailAvailable = Platform.OS !== 'web' ? await MailComposer.isAvailableAsync() : false;

    if (isMailAvailable && Platform.OS !== 'web') {
      // SAME pipeline as View PDF / Print — generate once, reuse everywhere.
      const generatedUri = await generatePurchaseOrderPDF(poData);
      console.log('[PO email] generated PDF URI:', generatedUri);

      const generatedInfo = await FileSystem.getInfoAsync(generatedUri);
      console.log('[PO email] generated exists:', generatedInfo.exists, 'size:', (generatedInfo as any).size);
      if (!generatedInfo.exists || !(generatedInfo as any).size) {
        throw new Error('Generated PDF is missing or empty');
      }

      const attachmentUri = await preparePdfForAttachmentNative(
        generatedUri,
        poNumber,
        purchaseOrder.supplierName
      );
      const attachmentInfo = await FileSystem.getInfoAsync(attachmentUri);
      console.log('[PO email] attachment URI:', attachmentUri, 'exists:', attachmentInfo.exists, 'size:', (attachmentInfo as any).size);
      if (!attachmentInfo.exists || !(attachmentInfo as any).size) {
        throw new Error('Prepared attachment is missing or empty');
      }

      const emailOptions: MailComposer.MailComposerOptions = {
        recipients: supplierEmail ? [supplierEmail] : [],
        subject,
        body,
        attachments: [attachmentUri],
      };

      const result = await MailComposer.composeAsync(emailOptions);
      return result.status === MailComposer.MailComposerStatus.SENT;

    } else if (Platform.OS === 'web') {
      // jsPDF produces a real application/pdf blob — the download below is a
      // proper PDF, not HTML masquerading as one.
      const pdfUri = await generatePurchaseOrderPDF(poData);
      console.log('[PO email web] blob URL:', pdfUri);

      const link = document.createElement('a');
      link.href = pdfUri;
      link.download = `${poNumber}_${purchaseOrder.supplierName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const encodedSubject = encodeURIComponent(subject);
      const encodedBody = encodeURIComponent(body + "\n\nNote: PDF attachment downloaded — please attach the downloaded file to this email.");
      const encodedEmail = supplierEmail ? encodeURIComponent(supplierEmail) : '';
      const mailtoUrl = `mailto:${encodedEmail}?subject=${encodedSubject}&body=${encodedBody}`;

      try {
        await Linking.openURL(mailtoUrl);
      } catch (e) {
        console.log('Could not open email client:', e);
      }

      // Release the blob URL after a delay so the download has time to start.
      setTimeout(() => {
        try { URL.revokeObjectURL(pdfUri); } catch {}
      }, 5000);

      return true;

    } else {
      // Native fallback (no mail configured): share the same generated PDF.
      const pdfUri = await generatePurchaseOrderPDF(poData);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share Purchase Order ${poNumber}`,
          UTI: 'com.adobe.pdf',
        });
        return true;
      } else {
        setTimeout(() => {
          Alert.alert(
            "Email Not Available",
            "No email client is configured on this device. Please set up an email app to send purchase orders.",
            [{ text: "OK" }]
          );
        }, 100);
        return false;
      }
    }

  } catch (error) {
    console.error('Error sending purchase order email:', error);
    const msg = error instanceof Error ? error.message : 'Failed to generate or send purchase order.';
    setTimeout(() => {
      Alert.alert("Email Error", msg, [{ text: "OK" }]);
    }, 100);
    return false;
  }
}

/**
 * Sends multiple purchase orders via email (one for each supplier)
 */
export async function sendMultiplePurchaseOrders(
  purchaseOrders: PurchaseOrder[]
): Promise<void> {
  if (purchaseOrders.length === 0) {
    setTimeout(() => {
      Alert.alert("No Orders", "No purchase orders to send.", [{ text: "OK" }]);
    }, 100);
    return;
  }

  if (purchaseOrders.length === 1) {
    await sendPurchaseOrderEmail(purchaseOrders[0]);
    return;
  }

  setTimeout(() => {
    Alert.alert(
      "Multiple Suppliers",
      `You have ${purchaseOrders.length} purchase orders for different suppliers. How would you like to send them?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send All",
          onPress: async () => {
            for (const po of purchaseOrders) {
              await sendPurchaseOrderEmail(po);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          },
        },
      ]
    );
  }, 100);
}

/**
 * Preview PDF — uses the SAME generated PDF as the email/print actions.
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
      // Open the real PDF blob in a new tab — the browser's built-in PDF
      // viewer renders it. The user can save it from there using the
      // viewer's download button if they want.
      window.open(pdfUri, '_blank');
    } else {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: `Preview Purchase Order PO-${String(purchaseOrder.id).slice(-4).padStart(4, '0')}`,
        });
      }
    }
  } catch (error) {
    console.error('Error previewing PDF:', error);
    setTimeout(() => {
      Alert.alert(
        "Preview Error",
        error instanceof Error ? error.message : 'Failed to generate PDF preview.',
        [{ text: "OK" }]
      );
    }, 100);
  }
}
