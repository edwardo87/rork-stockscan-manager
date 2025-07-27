import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { formatDate } from '@/utils/dateUtils';

export interface POData {
  id: string;
  supplierName: string;
  date: string;
  items: Array<{
    barcode: string;
    name: string;
    quantity: number;
    supplier: string;
  }>;
  status: string;
}

// Generate HTML content for the purchase order
function generatePurchaseOrderHTML(poData: POData): string {
  const poNumber = `PO-${String(poData.id).slice(-4).padStart(4, '0')}`;
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
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          color: #333;
          line-height: 1.4;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #3366cc;
          padding-bottom: 20px;
        }
        .company-name {
          font-size: 28px;
          font-weight: bold;
          color: #3366cc;
        }
        .po-title {
          font-size: 24px;
          font-weight: bold;
          color: #333;
        }
        .order-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }
        .order-info {
          font-size: 14px;
        }
        .section-title {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 10px;
          color: #333;
        }
        .supplier-info, .ship-to {
          margin-bottom: 25px;
        }
        .shipping-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
          font-size: 14px;
        }
        .due-date {
          color: #3366cc;
          font-weight: bold;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th {
          background-color: #f0f0f0;
          padding: 12px 8px;
          border: 1px solid #ddd;
          font-weight: bold;
          font-size: 13px;
          text-align: left;
        }
        td {
          padding: 8px;
          border: 1px solid #ddd;
          font-size: 12px;
        }
        .total-section {
          text-align: right;
          margin-bottom: 30px;
          font-size: 14px;
          font-weight: bold;
        }
        .footer {
          margin-top: 40px;
          font-size: 14px;
          color: #3366cc;
        }
        @media print {
          body { margin: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-name">LIFESTYLE WINDOWS</div>
        <div class="po-title">PURCHASE ORDER</div>
      </div>
      
      <div class="order-details">
        <div class="order-info">
          <div><strong>Order Date:</strong> ${orderDate}</div>
        </div>
        <div class="order-info">
          <div><strong>PO Number:</strong> ${poNumber}</div>
          <div><strong>Quote Ref #:</strong> TBD</div>
        </div>
      </div>
      
      <div class="supplier-info">
        <div class="section-title">To:</div>
        <div><strong>${poData.supplierName}</strong></div>
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
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
      
      <div class="total-section">
        Total Items: ${totalItems}
      </div>
      
      <div class="footer">
        Thank you for your business!
      </div>
    </body>
    </html>
  `;
}

export async function generatePurchaseOrderPDF(poData: POData): Promise<string> {
  try {
    const poNumber = `PO-${String(poData.id).slice(-4).padStart(4, '0')}`;
    const fileName = `PO_${poNumber}_${poData.supplierName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    
    if (Platform.OS === 'web') {
      // For web, generate HTML and create a printable version
      const htmlContent = generatePurchaseOrderHTML(poData);
      
      // Create a blob with the HTML content
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      // For now, return the HTML blob URL - user can print to PDF
      return url;
    } else {
      // For mobile, create a simple text-based file
      const textContent = generatePurchaseOrderText(poData);
      const fileUri = `${FileSystem.documentDirectory}${fileName.replace('.pdf', '.txt')}`;
      
      await FileSystem.writeAsStringAsync(fileUri, textContent, {
        encoding: FileSystem.EncodingType.UTF8
      });
      
      return fileUri;
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}

// Generate text version for mobile
function generatePurchaseOrderText(poData: POData): string {
  const poNumber = `PO-${String(poData.id).slice(-4).padStart(4, '0')}`;
  const orderDate = formatDate(new Date(poData.date));
  const totalItems = poData.items.reduce((sum, item) => sum + item.quantity, 0);
  
  const itemsList = poData.items.map((item, index) => 
    `${index + 1}. ${item.name}\n   Code: ${item.barcode}\n   Quantity: ${item.quantity}\n`
  ).join('\n');
  
  return `
LIFESTYLE WINDOWS
PURCHASE ORDER

=====================================

Order Date: ${orderDate}
PO Number: ${poNumber}
Quote Ref #: TBD

To: ${poData.supplierName}

Ship to:
Lifestyle Windows
14-16 Link Crescent
Coolum Beach 4573
Phone: 5351 1858
Fax: 5351 1903

Shipping Method: Road Transport
Due Date: ASAP

=====================================
ITEMS ORDERED:
=====================================

${itemsList}

Total Items: ${totalItems}

Thank you for your business!

=====================================
  `;
}

export async function generateBase64PDF(poData: POData): Promise<string> {
  try {
    // For now, return the HTML content as base64
    const htmlContent = generatePurchaseOrderHTML(poData);
    return btoa(htmlContent);
  } catch (error) {
    console.error('Error generating base64 PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}