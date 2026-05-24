import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
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

function getPoNumber(id: string): string {
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
 * Verifies the first bytes of the file at `uri` start with the PDF magic
 * header (`%PDF`). Returns true on success, false otherwise. Native only.
 */
async function verifyPdfHeaderNative(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    console.log('[PDF verify] uri:', uri, 'exists:', info.exists, 'size:', (info as any).size);
    if (!info.exists || !(info as any).size) return false;
    const base64Head = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 8,
    });
    const decoded = (typeof atob === 'function'
      ? atob(base64Head)
      : Buffer.from(base64Head, 'base64').toString('binary'));
    const header = decoded.substring(0, 5);
    console.log('[PDF verify] header bytes:', JSON.stringify(header));
    return header.startsWith('%PDF');
  } catch (e) {
    console.log('[PDF verify] failed to read header', e);
    return false;
  }
}

/**
 * Generates a real, valid PDF binary for a purchase order on native using
 * `expo-print`'s `printToFileAsync`. The returned URI points at a real
 * `.pdf` file on disk and is the SAME file used for View PDF, Print and the
 * email attachment.
 *
 * Web has no native PDF binary writer available in this project — we return
 * an `application/pdf` blob URL built from the HTML by handing it off to
 * the browser's print dialog (user saves as PDF). The returned URL is only
 * used for preview; the email flow takes the web fallback path.
 */
export async function generatePurchaseOrderPDF(poData: POData): Promise<string> {
  try {
    if (Platform.OS === 'web') {
      // Web preview: open the HTML in a new window so the browser's built-in
      // "Save as PDF" handles the conversion. We return a blob URL of the
      // HTML so callers can still use window.open(url).
      const htmlContent = generatePurchaseOrderHTML(poData);
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      console.log('[PDF generate web] html blob url:', url);
      return url;
    }

    const htmlContent = generatePurchaseOrderHTML(poData);
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false,
    });
    console.log('[PDF generate native] printToFileAsync uri:', uri);
    const ok = await verifyPdfHeaderNative(uri);
    if (!ok) {
      throw new Error('Generated file is not a valid PDF (missing %PDF header)');
    }
    return uri;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to generate PDF');
  }
}

export async function generateBase64PDF(poData: POData): Promise<string> {
  try {
    if (Platform.OS === 'web') {
      // Not used on web; return empty to keep API stable.
      return '';
    }
    const htmlContent = generatePurchaseOrderHTML(poData);
    const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
    return base64 || '';
  } catch (error) {
    console.error('Error generating base64 PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}
