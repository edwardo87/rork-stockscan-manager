import * as tslib from 'tslib';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
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

export async function generatePurchaseOrderPDF(poData: POData): Promise<string> {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size in points
    const { width, height } = page.getSize();
    
    // Load fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Colors
    const primaryColor = rgb(0.2, 0.4, 0.8); // Blue
    const textColor = rgb(0.1, 0.1, 0.1); // Dark gray
    const lightGrayColor = rgb(0.9, 0.9, 0.9);
    
    let yPosition = height - 60;
    
    // Header - Company Logo and Title
    page.drawText('LIFESTYLE WINDOWS', {
      x: 50,
      y: yPosition,
      size: 24,
      font: helveticaBoldFont,
      color: primaryColor,
    });
    
    page.drawText('PURCHASE ORDER', {
      x: width - 200,
      y: yPosition,
      size: 20,
      font: helveticaBoldFont,
      color: textColor,
    });
    
    yPosition -= 40;
    
    // Order details section
    const poNumber = `PO-${String(poData.id).slice(-4).padStart(4, '0')}`;
    const orderDate = formatDate(new Date(poData.date));
    
    page.drawText(`Order Date: ${orderDate}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaFont,
      color: textColor,
    });
    
    page.drawText(`PO Number: ${poNumber}`, {
      x: width - 200,
      y: yPosition,
      size: 12,
      font: helveticaBoldFont,
      color: textColor,
    });
    
    yPosition -= 20;
    
    page.drawText('Quote Ref #: TBD', {
      x: width - 200,
      y: yPosition,
      size: 12,
      font: helveticaFont,
      color: textColor,
    });
    
    yPosition -= 40;
    
    // Supplier section
    page.drawText('To:', {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBoldFont,
      color: textColor,
    });
    
    yPosition -= 20;
    
    page.drawText(poData.supplierName, {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaBoldFont,
      color: textColor,
    });
    
    yPosition -= 40;
    
    // Ship to section
    page.drawText('Ship to:', {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBoldFont,
      color: textColor,
    });
    
    yPosition -= 20;
    
    const shipToLines = [
      'Lifestyle Windows',
      '14-16 Link Crescent',
      'Coolum Beach 4573',
      'Phone: 5351 1858',
      'Fax: 5351 1903'
    ];
    
    shipToLines.forEach(line => {
      page.drawText(line, {
        x: 50,
        y: yPosition,
        size: 12,
        font: helveticaFont,
        color: textColor,
      });
      yPosition -= 15;
    });
    
    yPosition -= 20;
    
    // Shipping details
    page.drawText('Shipping Method: Road Transport', {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaFont,
      color: textColor,
    });
    
    page.drawText('Due Date: ASAP', {
      x: width - 200,
      y: yPosition,
      size: 12,
      font: helveticaBoldFont,
      color: primaryColor,
    });
    
    yPosition -= 40;
    
    // Table header
    const tableStartY = yPosition;
    const rowHeight = 25;
    const colWidths = [80, 250, 120, 80]; // Code, Description, Size/Thickness/Colour, Quantity
    const colPositions = [50, 130, 380, 500];
    
    // Draw header background
    page.drawRectangle({
      x: 45,
      y: yPosition - 5,
      width: width - 90,
      height: rowHeight,
      color: lightGrayColor,
    });
    
    // Header text
    const headers = ['Code', 'Description', 'Size/Thickness/Colour', 'Quantity'];
    headers.forEach((header, index) => {
      page.drawText(header, {
        x: colPositions[index],
        y: yPosition + 5,
        size: 11,
        font: helveticaBoldFont,
        color: textColor,
      });
    });
    
    yPosition -= rowHeight;
    
    // Table rows
    poData.items.forEach((item, index) => {
      // Alternate row background
      if (index % 2 === 1) {
        page.drawRectangle({
          x: 45,
          y: yPosition - 5,
          width: width - 90,
          height: rowHeight,
          color: rgb(0.98, 0.98, 0.98),
        });
      }
      
      // Row data
      const rowData = [
        item.barcode,
        item.name.length > 35 ? item.name.substring(0, 32) + '...' : item.name,
        '', // Size/Thickness/Colour - empty for now
        item.quantity.toString()
      ];
      
      rowData.forEach((data, colIndex) => {
        page.drawText(data, {
          x: colPositions[colIndex],
          y: yPosition + 5,
          size: 10,
          font: helveticaFont,
          color: textColor,
        });
      });
      
      yPosition -= rowHeight;
    });
    
    // Draw table borders
    const tableHeight = (poData.items.length + 1) * rowHeight;
    
    // Vertical lines
    colPositions.forEach((x, index) => {
      if (index > 0) {
        page.drawLine({
          start: { x: x - 5, y: tableStartY + 20 },
          end: { x: x - 5, y: tableStartY - tableHeight + 20 },
          thickness: 1,
          color: rgb(0.7, 0.7, 0.7),
        });
      }
    });
    
    // Horizontal lines
    page.drawLine({
      start: { x: 45, y: tableStartY + 20 },
      end: { x: width - 45, y: tableStartY + 20 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    
    page.drawLine({
      start: { x: 45, y: tableStartY - 5 },
      end: { x: width - 45, y: tableStartY - 5 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    
    page.drawLine({
      start: { x: 45, y: tableStartY - tableHeight + 20 },
      end: { x: width - 45, y: tableStartY - tableHeight + 20 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    
    // Outer border
    page.drawRectangle({
      x: 45,
      y: tableStartY - tableHeight + 20,
      width: width - 90,
      height: tableHeight,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 1,
    });
    
    yPosition -= 40;
    
    // Total items
    const totalItems = poData.items.reduce((sum, item) => sum + item.quantity, 0);
    page.drawText(`Total Items: ${totalItems}`, {
      x: width - 150,
      y: yPosition,
      size: 12,
      font: helveticaBoldFont,
      color: textColor,
    });
    
    yPosition -= 60;
    
    // Footer
    page.drawText('Thank you for your business!', {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaFont,
      color: primaryColor,
    });
    
    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    // Save to file system
    const fileName = `PO_${poNumber}_${poData.supplierName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;
    
    if (Platform.OS === 'web') {
      // For web, create a blob URL
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      return URL.createObjectURL(blob);
    } else {
      // For mobile, save to file system
      // Convert Uint8Array to base64 string
      const base64String = btoa(String.fromCharCode(...Array.from(pdfBytes)));
      await FileSystem.writeAsStringAsync(fileUri, base64String, {
        encoding: FileSystem.EncodingType.Base64
      });
      return fileUri;
    }
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}

export async function generateBase64PDF(poData: POData): Promise<string> {
  try {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const primaryColor = rgb(0.2, 0.4, 0.8);
    const textColor = rgb(0.1, 0.1, 0.1);
    const lightGrayColor = rgb(0.9, 0.9, 0.9);
    
    let yPosition = height - 60;
    
    // Header
    page.drawText('LIFESTYLE WINDOWS', {
      x: 50,
      y: yPosition,
      size: 24,
      font: helveticaBoldFont,
      color: primaryColor,
    });
    
    page.drawText('PURCHASE ORDER', {
      x: width - 200,
      y: yPosition,
      size: 20,
      font: helveticaBoldFont,
      color: textColor,
    });
    
    yPosition -= 40;
    
    const poNumber = `PO-${String(poData.id).slice(-4).padStart(4, '0')}`;
    const orderDate = formatDate(new Date(poData.date));
    
    page.drawText(`Order Date: ${orderDate}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaFont,
      color: textColor,
    });
    
    page.drawText(`PO Number: ${poNumber}`, {
      x: width - 200,
      y: yPosition,
      size: 12,
      font: helveticaBoldFont,
      color: textColor,
    });
    
    yPosition -= 20;
    page.drawText('Quote Ref #: TBD', {
      x: width - 200,
      y: yPosition,
      size: 12,
      font: helveticaFont,
      color: textColor,
    });
    
    yPosition -= 40;
    
    // Supplier
    page.drawText('To:', {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBoldFont,
      color: textColor,
    });
    
    yPosition -= 20;
    page.drawText(poData.supplierName, {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaBoldFont,
      color: textColor,
    });
    
    yPosition -= 40;
    
    // Ship to
    page.drawText('Ship to:', {
      x: 50,
      y: yPosition,
      size: 14,
      font: helveticaBoldFont,
      color: textColor,
    });
    
    yPosition -= 20;
    const shipToLines = [
      'Lifestyle Windows',
      '14-16 Link Crescent',
      'Coolum Beach 4573',
      'Phone: 5351 1858',
      'Fax: 5351 1903'
    ];
    
    shipToLines.forEach(line => {
      page.drawText(line, {
        x: 50,
        y: yPosition,
        size: 12,
        font: helveticaFont,
        color: textColor,
      });
      yPosition -= 15;
    });
    
    yPosition -= 20;
    
    page.drawText('Shipping Method: Road Transport', {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaFont,
      color: textColor,
    });
    
    page.drawText('Due Date: ASAP', {
      x: width - 200,
      y: yPosition,
      size: 12,
      font: helveticaBoldFont,
      color: primaryColor,
    });
    
    yPosition -= 40;
    
    // Table
    const tableStartY = yPosition;
    const rowHeight = 25;
    const colPositions = [50, 130, 380, 500];
    
    // Header background
    page.drawRectangle({
      x: 45,
      y: yPosition - 5,
      width: width - 90,
      height: rowHeight,
      color: lightGrayColor,
    });
    
    const headers = ['Code', 'Description', 'Size/Thickness/Colour', 'Quantity'];
    headers.forEach((header, index) => {
      page.drawText(header, {
        x: colPositions[index],
        y: yPosition + 5,
        size: 11,
        font: helveticaBoldFont,
        color: textColor,
      });
    });
    
    yPosition -= rowHeight;
    
    // Rows
    poData.items.forEach((item, index) => {
      if (index % 2 === 1) {
        page.drawRectangle({
          x: 45,
          y: yPosition - 5,
          width: width - 90,
          height: rowHeight,
          color: rgb(0.98, 0.98, 0.98),
        });
      }
      
      const rowData = [
        item.barcode,
        item.name.length > 35 ? item.name.substring(0, 32) + '...' : item.name,
        '',
        item.quantity.toString()
      ];
      
      rowData.forEach((data, colIndex) => {
        page.drawText(data, {
          x: colPositions[colIndex],
          y: yPosition + 5,
          size: 10,
          font: helveticaFont,
          color: textColor,
        });
      });
      
      yPosition -= rowHeight;
    });
    
    // Table borders
    const tableHeight = (poData.items.length + 1) * rowHeight;
    
    colPositions.forEach((x, index) => {
      if (index > 0) {
        page.drawLine({
          start: { x: x - 5, y: tableStartY + 20 },
          end: { x: x - 5, y: tableStartY - tableHeight + 20 },
          thickness: 1,
          color: rgb(0.7, 0.7, 0.7),
        });
      }
    });
    
    page.drawLine({
      start: { x: 45, y: tableStartY + 20 },
      end: { x: width - 45, y: tableStartY + 20 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    
    page.drawLine({
      start: { x: 45, y: tableStartY - 5 },
      end: { x: width - 45, y: tableStartY - 5 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    
    page.drawLine({
      start: { x: 45, y: tableStartY - tableHeight + 20 },
      end: { x: width - 45, y: tableStartY - tableHeight + 20 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    
    page.drawRectangle({
      x: 45,
      y: tableStartY - tableHeight + 20,
      width: width - 90,
      height: tableHeight,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 1,
    });
    
    yPosition -= 40;
    
    const totalItems = poData.items.reduce((sum, item) => sum + item.quantity, 0);
    page.drawText(`Total Items: ${totalItems}`, {
      x: width - 150,
      y: yPosition,
      size: 12,
      font: helveticaBoldFont,
      color: textColor,
    });
    
    yPosition -= 60;
    
    page.drawText('Thank you for your business!', {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaFont,
      color: primaryColor,
    });
    
    const pdfBytes = await pdfDoc.save();
    
    // Convert to base64
    const base64String = Array.from(pdfBytes, byte => 
      String.fromCharCode(byte)
    ).join('');
    
    return btoa(base64String);
    
  } catch (error) {
    console.error('Error generating base64 PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}