// @ts-nocheck — standalone generator, run outside the app with pdf-lib installed (see below).
/**
 * Generates the PDF supplier price-list fixtures used by
 * scripts/verify-catalogue-import.ts. pdf-lib is NOT an app dependency, so
 * run this from a scratch folder that has it installed:
 *
 *   mkdir -p /tmp/pdfgen && cd /tmp/pdfgen && bun add pdf-lib @pdf-lib/fontkit
 *   cp <repo>/expo/scripts/fixtures/make-pdf-fixtures.ts . && bun make-pdf-fixtures.ts <repo>/expo/scripts/fixtures
 *
 * Fixtures:
 *  - price-list-standard.pdf  two pages, standard Helvetica (WinAnsi), right-
 *    aligned prices, repeated header, freight/zero-price/"M" basis lines,
 *    supplier stock column, totals and page footers; object streams on.
 *  - price-list-embedded.pdf  embedded TrueType (Type0 + ToUnicode CMap).
 *  - scanned.pdf              image-only page (no text layer).
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const outDir = process.argv[2] || '.';
mkdirSync(outDir, { recursive: true });

type Col = { title: string; x: number; align: 'left' | 'right'; width: number };

function drawRow(page: PDFPage, font: PDFFont, y: number, cols: Col[], cells: string[], size = 9) {
  cells.forEach((text, i) => {
    const c = cols[i];
    const w = font.widthOfTextAtSize(text, size);
    const x = c.align === 'right' ? c.x + c.width - w : c.x;
    page.drawText(text, { x, y, size, font });
  });
}

async function standard() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cols: Col[] = [
    { title: 'Item Code', x: 40, align: 'left', width: 70 },
    { title: 'Description', x: 115, align: 'left', width: 220 },
    { title: 'Pack', x: 340, align: 'left', width: 70 },
    { title: 'Price', x: 415, align: 'right', width: 50 },
    { title: 'Per', x: 475, align: 'left', width: 30 },
    { title: 'Available', x: 510, align: 'right', width: 50 },
  ];
  const rowsP1 = [
    ['FS-8G50', 'Countersunk Screw 8g x 50mm Zinc', 'Box of 1,000', '12.50', '100', '48,000'],
    ['FS-10G75', 'Countersunk Screw 10g x 75mm Zinc', 'Box of 500', '$18.90', '100', '12,500'],
    ['FS-WAS6', 'Flat Washer M6 Zinc', 'Bag of 200', '0.00', 'EA', '3,000'],
    ['FS-NUT8', 'Hex Nut M8 Galv', 'Box of 1,000', '45.00', 'M', '900'],
  ];
  const rowsP2 = [
    ['SS-C300', 'Silicone Clear 300ml', 'Carton of 12', '4.20', 'EA', '240'],
    ['FREIGHT', 'Freight - metro delivery', 'EA', '25.00', 'EA', ''],
    ['TB-9045', 'Pine Framing 90x45 MGP10', 'LM', '6.80', 'LM', '1,200'],
  ];
  const header = (page: PDFPage, y: number) => {
    cols.forEach(c => {
      const w = bold.widthOfTextAtSize(c.title, 9);
      page.drawText(c.title, { x: c.align === 'right' ? c.x + c.width - w : c.x, y, size: 9, font: bold });
    });
  };

  const p1 = doc.addPage([595, 842]);
  p1.drawText('Fastener Supplies Pty Ltd — Trade Price List October 2026', { x: 40, y: 790, size: 14, font: bold });
  p1.drawText('All prices ex GST. Prices subject to change.', { x: 40, y: 772, size: 9, font });
  header(p1, 740);
  p1.drawLine({ start: { x: 40, y: 735 }, end: { x: 560, y: 735 }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
  rowsP1.forEach((r, i) => drawRow(p1, font, 720 - i * 16, cols, r));
  p1.drawText('Page 1 of 2', { x: 270, y: 40, size: 8, font });

  const p2 = doc.addPage([595, 842]);
  header(p2, 790);
  rowsP2.forEach((r, i) => drawRow(p2, font, 770 - i * 16, cols, r));
  p2.drawText('Total lines: 7', { x: 40, y: 700, size: 9, font: bold });
  p2.drawText('Page 2 of 2', { x: 270, y: 40, size: 8, font });

  writeFileSync(join(outDir, 'price-list-standard.pdf'), await doc.save({ useObjectStreams: true }));
}

async function embedded() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'), { subset: true });
  const cols: Col[] = [
    { title: 'Product Code', x: 40, align: 'left', width: 80 },
    { title: 'Product Description', x: 130, align: 'left', width: 230 },
    { title: 'UOM', x: 370, align: 'left', width: 60 },
    { title: 'Nett Price', x: 440, align: 'right', width: 70 },
  ];
  const page = doc.addPage([595, 842]);
  drawRow(page, font, 780, cols, cols.map(c => c.title), 10);
  const rows = [
    ['PK-STR48', 'Packing Strap 12mm × 1000m – Black', 'Roll', '38.50'],
    ['PK-BOX45', 'Shipping Carton 450×350×300', 'Bundle of 25', '61.25'],
    ['PK-TAPE', 'Tape Ø48mm Clear', 'Carton of 36', '72.00'],
  ];
  rows.forEach((r, i) => drawRow(page, font, 760 - i * 18, cols, r, 10));
  writeFileSync(join(outDir, 'price-list-embedded.pdf'), await doc.save({ useObjectStreams: false }));
}

async function scanned() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  for (let i = 0; i < 20; i++) {
    page.drawRectangle({ x: 40, y: 780 - i * 20, width: 500, height: 12, color: rgb(0.85, 0.85, 0.85) });
  }
  writeFileSync(join(outDir, 'scanned.pdf'), await doc.save());
}

await standard();
await embedded();
await scanned();
console.log('PDF fixtures written to', outDir);
