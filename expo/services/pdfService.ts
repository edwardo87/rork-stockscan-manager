import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { formatDate } from '@/utils/dateUtils';
import { getCachedBusinessProfile } from './businessProfileService';
import { BusinessProfile } from '@/types/inventory';
import { formatOrderQuantity, unitPriceLabel } from '@/utils/purchasing';

export interface POItemData {
  barcode: string;
  name: string;
  /** Stock-unit equivalent (informational). */
  quantity: number;
  supplier: string;
  // ---- Chapter 3 purchasing snapshot (optional; absent on legacy rows) ----
  supplierCode?: string;
  orderUnit?: string;
  orderQuantity?: number;
  unitPrice?: number;
  priceBasisQuantity?: number;
  priceBasisUnit?: string;
  lineTotal?: number;
}

export interface POData {
  id: string;
  supplierName: string;
  /** Supplier email snapshot stored on the PO at submission time. */
  supplierEmail?: string;
  date: string;
  items: POItemData[];
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
 * Escapes user-profile text for safe embedding in the PDF HTML.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds the ship-to block from the business profile. Every field is
 * optional — missing profile fields are simply omitted instead of breaking
 * PDF generation. No hardcoded business details remain.
 */
function generateShipToHtml(business: BusinessProfile | null): string {
  const name = business?.name?.trim();
  const street = (business?.deliveryAddress?.trim() || business?.address?.trim() || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const phone = business?.phone?.trim();

  const lines: string[] = [];
  if (name) lines.push(`<div><strong>${escapeHtml(name)}</strong></div>`);
  for (const line of street) lines.push(`<div>${escapeHtml(line)}</div>`);
  if (phone) lines.push(`<div>Phone: ${escapeHtml(phone)}</div>`);

  // Truly empty profile: show a neutral placeholder rather than wrong data.
  if (lines.length === 0) {
    return '<div><em>Delivery address — complete your business profile in Settings.</em></div>';
  }
  return lines.join('\n');
}

/**
 * HTML template used by expo-print to produce a real PDF on native, and by
 * the browser print dialog on web.
 *
 * Chapter 2: the buyer block comes from the authenticated user's business
 * profile (fetched via the cached profile service). When no profile exists
 * or fields are missing, the PDF still generates with graceful fallbacks —
 * one customer's business details are never shown for another.
 */
function generatePurchaseOrderHTML(poData: POData, business: BusinessProfile | null): string {
  const poNumber = getPoNumber(poData.id);
  const orderDate = formatDate(new Date(poData.date));
  const totalItems = poData.items.reduce((sum, item) => sum + item.quantity, 0);
  const companyName = business?.name?.trim();

  // Chapter 3: POs show supplier product codes and order quantities in
  // purchasing units, with ex-GST pricing when recorded. Rows for legacy
  // items (no purchasing snapshot) render exactly as before.
  const itemsRows = poData.items.map((item, index) => {
    const code = item.supplierCode?.trim() || item.barcode;
    const qtyText = item.orderQuantity !== undefined
      ? formatOrderQuantity(item, item.orderQuantity)
      : null;
    const quantityCell = qtyText
      ? `${escapeHtml(qtyText.main)}${qtyText.stockEquivalent ? ` <span style="color:#777;">${escapeHtml(qtyText.stockEquivalent)}</span>` : ''}`
      : String(item.quantity);
    const priceLabel = item.unitPrice !== undefined ? unitPriceLabel(item) : null;
    const priceCell = priceLabel ? escapeHtml(priceLabel) : '';
    const lineTotalCell =
      item.lineTotal !== undefined && item.lineTotal !== null
        ? `$${item.lineTotal.toFixed(2)}`
        : '';

    return `
    <tr style="${index % 2 === 1 ? 'background-color: #f8f8f8;' : ''}">
      <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px;">${escapeHtml(code)}</td>
      <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px;">${escapeHtml(item.name.length > 50 ? item.name.substring(0, 47) + '...' : item.name)}</td>
      <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px; text-align: center;">${quantityCell}</td>
      <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px; text-align: right;">${priceCell}</td>
      <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px; text-align: right;">${escapeHtml(lineTotalCell)}</td>
    </tr>
  `;
  }).join('');

  const orderTotal = poData.items.reduce(
    (sum, item) => (item.lineTotal != null ? sum + item.lineTotal : sum),
    0,
  );

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
        ${companyName ? `<div class="company-name">${escapeHtml(companyName.toUpperCase())}</div>` : ''}
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
        ${generateShipToHtml(business)}
      </div>
      <div class="shipping-details">
        <div><strong>Shipping Method:</strong> Road Transport</div>
        <div class="due-date"><strong>Due Date: ASAP</strong></div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 18%;">Code</th>
            <th style="width: 42%;">Description</th>
            <th style="width: 16%; text-align: center;">Order Quantity</th>
            <th style="width: 12%; text-align: right;">Unit Price (ex GST)</th>
            <th style="width: 12%; text-align: right;">Line Total (ex GST)</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>
      ${orderTotal > 0 ? `<div class="total-section">Order Total: $${orderTotal.toFixed(2)} (ex GST)<br/><span style="font-size: 12px; color: #777;">Total Items: ${totalItems}</span></div>` : `<div class="total-section">Total Items: ${totalItems}</div>`}
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
  // Chapter 2: buyer details come from the signed-in user's business profile.
  // Never throws — missing/failing profiles degrade gracefully.
  const business = await getCachedBusinessProfile();
  const htmlContent = generatePurchaseOrderHTML(poData, business);

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
