import { Linking, Alert, Platform } from 'react-native';
import { PurchaseOrder } from '@/types/inventory';

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

Please find our purchase order details below:

Purchase Order: ${poNumber}
Date: ${formattedDate}
Supplier: ${supplierName}

ITEMS ORDERED:
${itemsTable}
Total Items: ${totalQuantity}

Please confirm receipt of this order and provide delivery timeframe.

Thank you for your service.

Best regards,
SmartStock Inventory Management`;

  return { subject, body };
}

/**
 * Opens email client with purchase order details
 */
export async function sendPurchaseOrderEmail(
  purchaseOrder: PurchaseOrder,
  supplierEmail?: string
): Promise<boolean> {
  try {
    const { subject, body } = formatPurchaseOrderEmail(purchaseOrder);
    
    // Create mailto URL
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    const encodedEmail = supplierEmail ? encodeURIComponent(supplierEmail) : '';
    
    const mailtoUrl = `mailto:${encodedEmail}?subject=${encodedSubject}&body=${encodedBody}`;
    
    // Check if email can be opened
    const canOpen = await Linking.canOpenURL(mailtoUrl);
    
    if (canOpen) {
      await Linking.openURL(mailtoUrl);
      return true;
    } else {
      Alert.alert(
        "Email Not Available",
        "No email client is configured on this device. Please set up an email app to send purchase orders.",
        [{ text: "OK" }]
      );
      return false;
    }
  } catch (error) {
    console.error('Error opening email client:', error);
    Alert.alert(
      "Email Error",
      "Failed to open email client. Please try again.",
      [{ text: "OK" }]
    );
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