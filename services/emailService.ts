import { Linking, Alert, Platform } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { PurchaseOrder } from '@/types/inventory';
import { generatePurchaseOrderPDF, generateBase64PDF, POData } from './pdfService';

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
  let isProcessing = true;
  
  try {
    const poData: POData = {
      id: purchaseOrder.id,
      supplierName: purchaseOrder.supplierName,
      date: purchaseOrder.date,
      items: purchaseOrder.items,
      status: purchaseOrder.status
    };

    const poNumber = `PO-${String(purchaseOrder.id).slice(-4).padStart(4, '0')}`;
    const subject = `Purchase Order ${poNumber} - ${purchaseOrder.supplierName}`;
    const body = "Please see attached purchase order. Due ASAP. Thank you.";

    // Check if MailComposer is available (mobile)
    const isMailAvailable = await MailComposer.isAvailableAsync();
    
    if (!isProcessing) return false;
    
    if (isMailAvailable && Platform.OS !== 'web') {
      // Generate PDF file for mobile
      const pdfUri = await generatePurchaseOrderPDF(poData);
      
      if (!isProcessing) return false;
      
      const emailOptions: MailComposer.MailComposerOptions = {
        recipients: supplierEmail ? [supplierEmail] : [],
        subject,
        body,
        attachments: [pdfUri]
      };
      
      const result = await MailComposer.composeAsync(emailOptions);
      return result.status === MailComposer.MailComposerStatus.SENT;
      
    } else if (Platform.OS === 'web') {
      // For web, generate PDF and offer download/share
      const pdfUri = await generatePurchaseOrderPDF(poData);
      
      if (!isProcessing) return false;
      
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
      
      if (isProcessing) {
        Alert.alert(
          "PDF Downloaded",
          "The purchase order PDF has been downloaded. Please attach it to your email manually.",
          [{ text: "OK" }]
        );
      }
      
      return true;
      
    } else {
      // Fallback to sharing the PDF
      const pdfUri = await generatePurchaseOrderPDF(poData);
      
      if (!isProcessing) return false;
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share Purchase Order ${poNumber}`
        });
        return true;
      } else {
        if (isProcessing) {
          Alert.alert(
            "Email Not Available",
            "No email client is configured on this device. Please set up an email app to send purchase orders.",
            [{ text: "OK" }]
          );
        }
        return false;
      }
    }
    
  } catch (error) {
    console.error('Error sending purchase order email:', error);
    if (isProcessing) {
      Alert.alert(
        "Email Error",
        "Failed to generate or send purchase order. Please try again.",
        [{ text: "OK" }]
      );
    }
    return false;
  } finally {
    isProcessing = false;
  }
}

/**
 * Sends multiple purchase orders via email (one for each supplier)
 */
export async function sendMultiplePurchaseOrders(
  purchaseOrders: PurchaseOrder[]
): Promise<void> {
  if (purchaseOrders.length === 0) {
    Alert.alert(
      "No Orders",
      "No purchase orders to send.",
      [{ text: "OK" }]
    );
    return;
  }

  if (purchaseOrders.length === 1) {
    await sendPurchaseOrderEmail(purchaseOrders[0]);
    return;
  }

  // Multiple suppliers - ask user how they want to proceed
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
}

/**
 * Preview PDF in browser or share (for testing/preview purposes)
 */
export async function previewPurchaseOrderPDF(purchaseOrder: PurchaseOrder): Promise<void> {
  let isProcessing = true;
  
  try {
    const poData: POData = {
      id: purchaseOrder.id,
      supplierName: purchaseOrder.supplierName,
      date: purchaseOrder.date,
      items: purchaseOrder.items,
      status: purchaseOrder.status
    };

    const pdfUri = await generatePurchaseOrderPDF(poData);
    
    if (!isProcessing) return;
    
    if (Platform.OS === 'web') {
      // Open PDF in new tab
      window.open(pdfUri, '_blank');
    } else {
      // Share PDF on mobile
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: `Preview Purchase Order PO-${String(purchaseOrder.id).slice(-4).padStart(4, '0')}`
        });
      }
    }
  } catch (error) {
    console.error('Error previewing PDF:', error);
    if (isProcessing) {
      Alert.alert(
        "Preview Error",
        "Failed to generate PDF preview. Please try again.",
        [{ text: "OK" }]
      );
    }
  } finally {
    isProcessing = false;
  }
}