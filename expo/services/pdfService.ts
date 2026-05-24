import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import { formatDate } from '@/utils/dateUtils';

// jsPDF depends on browser globals (window, btoa, etc.) and Metro can't
// resolve it inside Expo Go on iOS/Android. The loader is split into
// `jspdfLoader.ts` (native stub) and `jspdfLoader.web.ts` (real import) so
// the native bundle never references the jspdf module at all.
import { loadJsPDF } from './jspdfLoader';

type JsPDFCtor = new (...args: any[]) => any;
let _JsPDF: JsPDFCtor | null = null;
async function getJsPDF(): Promise<JsPDFCtor> {
  if (_JsPDF) return _JsPDF;
  _JsPDF = (await loadJsPDF()) as JsPDFCtor;
  return _JsPDF;
}

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

// HTML used only for the native expo-print pipeline.
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
 * Builds a real PDF binary using jsPDF.
 * Used on web (where expo-print isn't available) so the downloaded/attached
 * file is an actual `application/pdf` document — NOT an HTML blob renamed to
 * `.pdf`, which was the previous bug causing recipients to see corrupted
 * attachments.
 */
async function buildPdfWithJsPdf(poData: POData): Promise<any> {
  const JsPDF = await getJsPDF();
  const poNumber = getPoNumber(poData.id);
  const orderDate = formatDate(new Date(poData.date));
  const totalItems = poData.items.reduce((sum, item) => sum + item.quantity, 0);

  const doc = new JsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(51, 102, 204);
  doc.text('LIFESTYLE WINDOWS', margin, y + 16);
  doc.setTextColor(51, 51, 51);
  doc.setFontSize(18);
  doc.text('PURCHASE ORDER', pageWidth - margin, y + 16, { align: 'right' });
  y += 32;
  doc.setDrawColor(51, 102, 204);
  doc.setLineWidth(1.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  // Order details
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(51, 51, 51);
  doc.text(`Order Date: ${orderDate}`, margin, y);
  doc.text(`PO Number: ${poNumber}`, pageWidth - margin, y, { align: 'right' });
  y += 16;
  doc.text(`Quote Ref #: TBD`, pageWidth - margin, y, { align: 'right' });
  y += 28;

  // Supplier
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('To:', margin, y);
  y += 16;
  doc.setFontSize(11);
  doc.text(poData.supplierName, margin, y);
  y += 14;
  if (poData.supplierEmail) {
    doc.setFont('helvetica', 'normal');
    doc.text(poData.supplierEmail, margin, y);
    y += 14;
  }
  y += 8;

  // Ship to
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Ship to:', margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const shipLines = [
    'Lifestyle Windows',
    '14-16 Link Crescent',
    'Coolum Beach 4573',
    'Phone: 5351 1858',
    'Fax: 5351 1903',
  ];
  for (const line of shipLines) {
    doc.text(line, margin, y);
    y += 14;
  }
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Shipping Method: Road Transport', margin, y);
  doc.setTextColor(51, 102, 204);
  doc.text('Due Date: ASAP', pageWidth - margin, y, { align: 'right' });
  doc.setTextColor(51, 51, 51);
  y += 24;

  // Table header
  const colCode = margin;
  const colDesc = margin + 90;
  const colQty = pageWidth - margin - 40;
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y - 12, pageWidth - margin * 2, 20, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Code', colCode + 4, y + 2);
  doc.text('Description', colDesc, y + 2);
  doc.text('Qty', colQty, y + 2, { align: 'right' });
  y += 14;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const item of poData.items) {
    if (y > pageHeight - margin - 60) {
      doc.addPage();
      y = margin;
    }
    const desc = item.name.length > 60 ? item.name.substring(0, 57) + '...' : item.name;
    doc.text(String(item.barcode), colCode + 4, y + 12);
    doc.text(desc, colDesc, y + 12);
    doc.text(String(item.quantity), colQty, y + 12, { align: 'right' });
    y += 18;
    doc.setDrawColor(240, 240, 240);
    doc.line(margin, y, pageWidth - margin, y);
  }

  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Total Items: ${totalItems}`, pageWidth - margin, y, { align: 'right' });

  y += 32;
  doc.setTextColor(51, 102, 204);
  doc.setFont('helvetica', 'normal');
  doc.text('Thank you for your business!', margin, y);

  return doc;
}

/**
 * Verifies the first bytes of the file at `uri` start with the PDF magic
 * header (`%PDF`). Logs everything useful for debugging attachment issues.
 * Returns true on success, false otherwise. Native only.
 */
async function verifyPdfHeaderNative(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    console.log('[PDF verify] uri:', uri, 'exists:', info.exists, 'size:', (info as any).size);
    if (!info.exists || !(info as any).size) return false;
    // Read first 8 bytes as base64 then decode the first 4 to verify "%PDF".
    const base64Head = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 8,
    });
    // Decode base64 head to ASCII for the first 4 bytes.
    // jsPDF/expo-print output ALWAYS begins with "%PDF-".
    const decoded = (typeof atob === 'function' ? atob(base64Head) : Buffer.from(base64Head, 'base64').toString('binary'));
    const header = decoded.substring(0, 5);
    console.log('[PDF verify] header bytes:', JSON.stringify(header));
    return header.startsWith('%PDF');
  } catch (e) {
    console.log('[PDF verify] failed to read header', e);
    return false;
  }
}

/**
 * Generates a real, valid PDF binary for a purchase order.
 *
 * - Web: uses jsPDF and returns an `application/pdf` blob URL (real PDF bytes).
 * - Native: uses `expo-print`'s `printToFileAsync` and returns a `file://` URI
 *   to a real `.pdf` file on disk. We verify the `%PDF` magic header before
 *   handing the URI back so a corrupted output is caught early.
 *
 * The returned URI is the SAME file/object used by View PDF, Print, and the
 * email attachment — never regenerated, never converted.
 */
export async function generatePurchaseOrderPDF(poData: POData): Promise<string> {
  try {
    if (Platform.OS === 'web') {
      const doc = await buildPdfWithJsPdf(poData);
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      console.log('[PDF generate web] blob size:', blob.size, 'type:', blob.type, 'url:', url);
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
      const doc = await buildPdfWithJsPdf(poData);
      // jsPDF outputs base64 of the real PDF.
      const dataUri = doc.output('datauristring');
      const base64 = dataUri.split(',')[1] || '';
      return base64;
    }
    const htmlContent = generatePurchaseOrderHTML(poData);
    const { base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
    return base64 || '';
  } catch (error) {
    console.error('Error generating base64 PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}
