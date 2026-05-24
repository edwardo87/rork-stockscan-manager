import { Linking, Alert, Platform } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { PurchaseOrder } from '@/types/inventory';
import { generatePurchaseOrderPDF, POData } from './pdfService';

/**
 * Copies the freshly-generated PDF from expo-print's cache location to a stable
 * path inside documentDirectory with an explicit `.pdf` filename. Some mail
 * clients (notably Gmail/Outlook on Android) attach by reading the file at the
 * provided URI at send-time; if the cache file has been evicted or the
 * filename lacks a `.pdf` extension the attachment is delivered with the wrong
 * MIME type and appears corrupted to the recipient.
 *
 * Returns the new file URI (file://) that exists on disk with size > 0.
 */
async function preparePdfForAttachment(
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
    // Remove any stale copy from a previous send so we never attach an old file.
    const existing = await FileSystem.getInfoAsync(destUri);
    if (existing.exists) {
      await FileSystem.deleteAsync(destUri, { idempotent: true });
    }
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  } catch (e) {
    console.log('[PO email] copy to documentDirectory failed, falling back to source URI', e);
    return sourceUri;
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
 * Opens email client with purchase order PDF attachment
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
      status: purchaseOrder.status
    };

    const poNumber = `PO-${String(purchaseOrder.id).slice(-4).padStart(4, '0')}`;
    const subject = `Purchase Order ${poNumber} - ${purchaseOrder.supplierName}`;
    const body = "Please see attached purchase order. Due ASAP. Thank you.";

    // Check if MailComposer is available (mobile)
    const isMailAvailable = await MailComposer.isAvailableAsync();
    
    if (isMailAvailable && Platform.OS !== 'web') {
      // Generate PDF file for mobile — this is the SAME pipeline used by
      // "View PDF" so we know the file itself opens cleanly. We then copy it
      // to documentDirectory with a stable .pdf filename so mail clients
      // attach the right bytes with the right MIME type.
      const generatedUri = await generatePurchaseOrderPDF(poData);
      console.log('[PO email] generated PDF URI:', generatedUri);

      const generatedInfo = await FileSystem.getInfoAsync(generatedUri);
      console.log('[PO email] generated PDF exists:', generatedInfo.exists, 'size:', (generatedInfo as any).size);
      if (!generatedInfo.exists || !(generatedInfo as any).size) {
        throw new Error('Generated PDF is missing or empty');
      }

      const attachmentUri = await preparePdfForAttachment(
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
      // For web, generate PDF and offer download/share
      const pdfUri = await generatePurchaseOrderPDF(poData);
      
      // Create a download link
      const link = document.createElement('a');
      link.href = pdfUri;
      link.download = `PO_${poNumber}_${purchaseOrder.supplierName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Also try to open email client with mailto
      const encodedSubject = encodeURIComponent(subject);
      const encodedBody = encodeURIComponent(body + "\n\nNote: PDF attachment downloaded separately.");
      const encodedEmail = supplierEmail ? encodeURIComponent(supplierEmail) : '';
      const mailtoUrl = `mailto:${encodedEmail}?subject=${encodedSubject}&body=${encodedBody}`;
      
      try {
        await Linking.openURL(mailtoUrl);
      } catch (e) {
        console.log('Could not open email client:', e);
      }
      
      // Show alert after a brief delay to avoid state update during render
      setTimeout(() => {
        Alert.alert(
          "PDF Downloaded",
          "The purchase order PDF has been downloaded. Please attach it to your email manually.",
          [{ text: "OK" }]
        );
      }, 100);
      
      return true;
      
    } else {
      // Fallback to sharing the PDF
      const pdfUri = await generatePurchaseOrderPDF(poData);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share Purchase Order ${poNumber}`
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
    setTimeout(() => {
      Alert.alert(
        "Email Error",
        "Failed to generate or send purchase order. Please try again.",
        [{ text: "OK" }]
      );
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
      Alert.alert(
        "No Orders",
        "No purchase orders to send.",
        [{ text: "OK" }]
      );
    }, 100);
    return;
  }

  if (purchaseOrders.length === 1) {
    await sendPurchaseOrderEmail(purchaseOrders[0]);
    return;
  }

  // Multiple suppliers - ask user how they want to proceed
  setTimeout(() => {
    Alert.alert(
      "Multiple Suppliers",
      `You have ${purchaseOrders.length} purchase orders for different suppliers. How would you like to send them?`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Send All",
          onPress: async () => {
            for (const po of purchaseOrders) {
              await sendPurchaseOrderEmail(po);
              // Small delay between emails to prevent overwhelming the email client
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
      ]
    );
  }, 100);
}

/**
 * Preview PDF in browser or share (for testing/preview purposes)
 */
export async function previewPurchaseOrderPDF(purchaseOrder: PurchaseOrder): Promise<void> {
  try {
    const poData: POData = {
      id: purchaseOrder.id,
      supplierName: purchaseOrder.supplierName,
      supplierEmail: purchaseOrder.supplierEmail,
      date: purchaseOrder.date,
      items: purchaseOrder.items,
      status: purchaseOrder.status
    };

    const pdfUri = await generatePurchaseOrderPDF(poData);
    
    if (Platform.OS === 'web') {
      // Open the printable HTML in a new tab so the user can use the browser's
      // "Save as PDF" / Print dialog.
      window.open(pdfUri, '_blank');
    } else {
      // expo-print returns a real .pdf file URI on native; share it so the
      // user can open it in any PDF viewer or save it to Files.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: `Preview Purchase Order PO-${String(purchaseOrder.id).slice(-4).padStart(4, '0')}`
        });
      }
    }
  } catch (error) {
    console.error('Error previewing PDF:', error);
    setTimeout(() => {
      Alert.alert(
        "Preview Error",
        "Failed to generate PDF preview. Please try again.",
        [{ text: "OK" }]
      );
    }, 100);
  }
}