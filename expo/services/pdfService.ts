import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { formatDate } from '@/utils/dateUtils';

export interface POData {
  id: string;
  supplierName: string;
  /** Supplier email snapshot stored on the PO at submission time. */
  supplierEmail?: string;
  date: string;
  items: Array<{
    barcode: string;
    name: string;
    quantity: number;
    supplier: string;
  }>;
  status: string;
}

/**
 * Derives the stable PO reference (PO-XXXX) from the purchase order's stored
 * database id. This is the single shared derivation used by the PDF, the
 * email flow and the Order History screen so the reference shown in history
 * always exactly matches the reference on the generated/emailed PO.
 */
export function getPoNumber(id: string): string {
  return `PO-${String(id).slice(-4).padStart(4, '0')}`;
}

/**
 * HTML template used by expo-print to produce a real PDF on native, and by
 * the browser print dialog on web.
 */
function generatePurchaseOrderHTML(poData: POData): string {
  const poNumber = getPoNumber(poData.id);
  const orderDate = formatDate(new Date(poData.date));
  const totalItems = poData.items.reduce((sum, item) => sum + item.quantity, 0);

  const itemsRows = poData.items.map((item, index) => `
    <tr style="${index % 2 === 1 ? 'background-color: #f8f8f8;' : ''}">
      <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px;">${item.barcode}</td>
      <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px;">${item.name.length > 50 ? item.name.substring(0, 47) + '...' : item.name}</td>
      <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px;"></td>
      <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px; text-align: center;">${item.quantity}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Purchase Order ${poNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; line-height: 1.4; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #3366cc; padding-bottom: 20px; }
        .company-name { font-size: 28px; font-weight: bold; color: #3366cc; }
        .po-title { font-size: 24px; font-weight: bold; color: #333; }
        .order-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .order-info { font-size: 14px; }
        .section-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #333; }
        .supplier-info, .ship-to { margin-bottom: 25px; }
        .shipping-details { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; }
        .due-date { color: #3366cc; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background-color: #f0f0f0; padding: 12px 8px; border: 1px solid #ddd; font-weight: bold; font-size: 13px; text-align: left; }
        td { padding: 8px; border: 1px solid #ddd; font-size: 12px; }
        .total-section { text-align: right; margin-bottom: 30px; font-size: 14px; font-weight: bold; }
        .footer { margin-top: 40px; font-size: 14px; color: #3366cc; }
        @media print { body { margin: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-name">LIFESTYLE WINDOWS</div>
        <div class="po-title">PURCHASE ORDER</div>
      </div>
      <div class="order-details">
        <div class="order-info"><div><strong>Order Date:</strong> ${orderDate}</div></div>
        <div class="order-info">
          <div><strong>PO Number:</strong> ${poNumber}</div>
          <div><strong>Quote Ref #:</strong> TBD</div>
        </div>
      </div>
      <div class="supplier-info">
        <div class="section-title">To:</div>
        <div><strong>${poData.supplierName}</strong></div>
        ${poData.supplierEmail ? `<div>${poData.supplierEmail}</div>` : ''}
      </div>
      <div class="ship-to">
        <div class="section-title">Ship to:</div>
        <div>Lifestyle Windows</div>
        <div>14-16 Link Crescent</div>
        <div>Coolum Beach 4573</div>
        <div>Phone: 5351 1858</div>
        <div>Fax: 5351 1903</div>
      </div>
      <div class="shipping-details">
        <div><strong>Shipping Method:</strong> Road Transport</div>
        <div class="due-date"><strong>Due Date: ASAP</strong></div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 20%;">Code</th>
            <th style="width: 50%;">Description</th>
            <th style="width: 20%;">Size/Thickness/Colour</th>
            <th style="width: 10%;">Quantity</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>
      <div class="total-section">Total Items: ${totalItems}</div>
      <div class="footer">Thank you for your business!</div>
    </body>
    </html>
  `;
}

/**
 * Generates a PDF for a purchase order.
 *
 * Native: uses `expo-print`'s `printToFileAsync` — this returns a real
 * application/pdf file. We do NOT byte-verify it; expo-print is the
 * platform-blessed PDF generator and adding our own header reads has only
 * caused crashes in Expo Go (Buffer undefined, partial-read APIs varying
 * between SDK versions). If expo-print fails it throws, and we surface
 * that error directly.
 *
 * Web: returns an HTML blob URL for preview/print only — the email path
 * has its own web fallback that does not depend on this URL being a PDF.
 */
export async function generatePurchaseOrderPDF(poData: POData): Promise<string> {
  const htmlContent = generatePurchaseOrderHTML(poData);

  if (Platform.OS === 'web') {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    console.log('[PDF] web html blob url:', url);
    return url;
  }

  const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
  console.log('[PDF] native printToFileAsync uri:', uri);

  // Sanity check only: file exists and has size. No byte reads.
  const info = await FileSystem.getInfoAsync(uri);
  const size = (info as { exists: boolean; size?: number }).size;
  console.log('[PDF] native file exists:', info.exists, 'size:', size);
  if (!info.exists || !size || size <= 0) {
    throw new Error('expo-print returned an empty or missing file');
  }

  return uri;
}
