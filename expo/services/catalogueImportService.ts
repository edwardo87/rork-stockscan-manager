/**
 * Chapter 4 — Supplier-document onboarding.
 *
 * Turns supplier catalogues (CSV, Excel .xlsx, text-based PDF price lists)
 * into reviewed product drafts. Everything here is pure and deterministic:
 *
 *   file → sheets → header row → column mapping → drafts (validated) →
 *   matched against the existing catalogue → user-selected import.
 *
 * Nothing is invented: every product value comes from a cell the user can
 * see and edit. Freight lines, zero prices, ambiguous price bases and
 * supplier stock levels are flagged and never silently misused.
 */
import * as XLSX from 'xlsx';
import { Product } from '@/types/inventory';
import {
  parseCSVLine,
  generateSKU,
  matchRowsForImport,
  RowMatch,
} from '@/services/csvImportService';
import { extractPdfTextRows, PdfTextRow, PdfLimitationError } from '@/services/pdfTextExtractor';

export { PdfLimitationError };

// ============================================================================
// Sources and sheets
// ============================================================================

export type CatalogueSource = 'csv' | 'xlsx' | 'pdf';

export interface SheetData {
  name: string;
  /** Raw cell text, every row of the sheet (header rows included). */
  rows: string[][];
  /** PDF only: sheet row indexes whose cells did not align cleanly with a column. */
  lowConfidenceRows?: number[];
}

export interface ParsedCatalogueFile {
  source: CatalogueSource;
  fileName: string;
  sheets: SheetData[];
  /** Notes about how the file was read (shown to the user). */
  notes: string[];
}

export function detectSource(fileName: string, mimeType?: string | null): CatalogueSource | null {
  const lower = fileName.toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt') || mime.includes('csv')) return 'csv';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm') || lower.endsWith('.xls') || mime.includes('spreadsheet') || mime.includes('excel')) return 'xlsx';
  if (lower.endsWith('.pdf') || mime.includes('pdf')) return 'pdf';
  return null;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62;
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

/** Decodes base64 without relying on atob/Buffer (works in Hermes and Bun). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/\-_]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)];
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 2)] : -1;
    const d = i + 3 < clean.length ? B64_LOOKUP[clean.charCodeAt(i + 3)] : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/** UTF-8 decode with a Latin-1 fallback for legacy Excel CSV exports. */
export function bytesToText(bytes: Uint8Array): string {
  let text = '';
  try {
    if (typeof TextDecoder !== 'undefined') {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    }
  } catch {
    /* not valid UTF-8 → Latin-1 below */
  }
  // Manual UTF-8 decode (Hermes may lack TextDecoder), falling back to Latin-1.
  try {
    let i = 0;
    while (i < bytes.length) {
      const c = bytes[i++];
      if (c < 0x80) text += String.fromCharCode(c);
      else if (c >= 0xc2 && c < 0xe0) {
        const c2 = bytes[i++];
        if ((c2 & 0xc0) !== 0x80) throw new Error('bad');
        text += String.fromCharCode(((c & 0x1f) << 6) | (c2 & 0x3f));
      } else if (c >= 0xe0 && c < 0xf0) {
        const c2 = bytes[i++], c3 = bytes[i++];
        if ((c2 & 0xc0) !== 0x80 || (c3 & 0xc0) !== 0x80) throw new Error('bad');
        text += String.fromCharCode(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
      } else if (c >= 0xf0 && c < 0xf5) {
        const c2 = bytes[i++], c3 = bytes[i++], c4 = bytes[i++];
        if ((c2 & 0xc0) !== 0x80 || (c3 & 0xc0) !== 0x80 || (c4 & 0xc0) !== 0x80) throw new Error('bad');
        const cp = (((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f)) - 0x10000;
        text += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      } else throw new Error('bad');
    }
  } catch {
    text = '';
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** CSV text → one sheet. Handles quoted fields with embedded newlines. */
export function parseCsvToSheet(text: string, name = 'CSV'): SheetData {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  // Join physical lines that are inside an open quote.
  const physical = clean.split(/\r?\n/);
  const logical: string[] = [];
  let buffer = '';
  for (const line of physical) {
    buffer = buffer ? `${buffer}\n${line}` : line;
    const quotes = (buffer.match(/"/g) || []).length;
    if (quotes % 2 === 0) { logical.push(buffer); buffer = ''; }
  }
  if (buffer) logical.push(buffer);
  const sample = logical.find(l => l.trim()) || '';
  const counts: Record<string, number> = {
    ',': (sample.match(/,/g) || []).length,
    ';': (sample.match(/;/g) || []).length,
    '\t': (sample.match(/\t/g) || []).length,
  };
  const delimiter = Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ',');
  const rows = logical
    .filter(l => l.trim().length > 0)
    .map(l => parseCSVLine(l, delimiter).map(v => v.replace(/\n/g, ' ').trim()));
  return { name, rows };
}

/** Excel workbook (base64 or bytes) → one sheet per worksheet, formatted text. */
export function parseWorkbook(data: Uint8Array): SheetData[] {
  const wb = XLSX.read(data, { type: 'array', cellDates: false, cellText: true });
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: false });
    const rows = raw
      .map(r => (Array.isArray(r) ? r.map(c => (c === null || c === undefined ? '' : String(c)).replace(/\s+/g, ' ').trim()) : []))
      .filter(r => r.some(c => c !== ''));
    return { name, rows };
  });
}

export async function parseCatalogueFile(
  data: Uint8Array,
  fileName: string,
  source: CatalogueSource,
): Promise<ParsedCatalogueFile> {
  if (source === 'csv') {
    return { source, fileName, sheets: [parseCsvToSheet(bytesToText(data))], notes: [] };
  }
  if (source === 'xlsx') {
    let sheets: SheetData[];
    try {
      sheets = parseWorkbook(data);
    } catch {
      throw new Error('This Excel file could not be read. Re-save it as .xlsx or CSV and try again.');
    }
    const nonEmpty = sheets.filter(s => s.rows.length > 0);
    if (nonEmpty.length === 0) throw new Error('This workbook has no data in any worksheet.');
    return { source, fileName, sheets: nonEmpty, notes: [] };
  }
  const rows = extractPdfTextRows(data); // throws PdfLimitationError
  const table = pdfRowsToSheet(rows);
  if (!table) {
    throw new PdfLimitationError(
      'unreadable',
      'Text was found in this PDF, but no product table with recognisable column headings (for example "Code", "Description", "Price") could be located. Ask the supplier for an Excel or CSV version.',
    );
  }
  return {
    source,
    fileName,
    sheets: [table.sheet],
    notes: table.notes,
  };
}

// ============================================================================
// Target fields and auto-mapping
// ============================================================================

export type TargetField =
  | 'supplierCode'
  | 'name'
  | 'description'
  | 'barcode'
  | 'orderUnit'
  | 'unitsPerOrderUnit'
  | 'stockUnit'
  | 'purchasePrice'
  | 'priceBasisQuantity'
  | 'priceBasisUnit'
  | 'category'
  | 'sku'
  | 'supplier'
  | 'supplierEmail'
  | 'sellPrice'
  | 'currentStock'
  | 'minStock';

export const TARGET_FIELDS: { field: TargetField; label: string; hint: string }[] = [
  { field: 'name', label: 'Product name', hint: 'Required' },
  { field: 'supplierCode', label: 'Supplier code', hint: "Supplier's item / part number" },
  { field: 'description', label: 'Description', hint: 'Longer description' },
  { field: 'barcode', label: 'Barcode', hint: 'EAN / UPC / APN' },
  { field: 'orderUnit', label: 'Order unit', hint: 'e.g. box of 1,000, carton of 12' },
  { field: 'unitsPerOrderUnit', label: 'Pack quantity', hint: 'Stock units in one order unit' },
  { field: 'stockUnit', label: 'Stock unit', hint: 'What you count, e.g. each, metre' },
  { field: 'purchasePrice', label: 'Purchase price (ex GST)', hint: 'Your buy price' },
  { field: 'priceBasisQuantity', label: 'Price per (quantity)', hint: 'e.g. 100 for "per 100"' },
  { field: 'priceBasisUnit', label: 'Price per (unit)', hint: 'e.g. each, metre' },
  { field: 'category', label: 'Category', hint: 'Product group' },
  { field: 'sku', label: 'Your SKU', hint: 'Internal code' },
  { field: 'supplier', label: 'Supplier name', hint: 'Only when the file mixes suppliers' },
  { field: 'supplierEmail', label: 'Supplier email', hint: 'Ordering email' },
  { field: 'sellPrice', label: 'Sell price', hint: 'Retail / RRP' },
  { field: 'currentStock', label: 'Your stock on hand', hint: 'Only your own count — never supplier stock' },
  { field: 'minStock', label: 'Minimum stock', hint: 'Reorder point' },
];

export const FIELD_LABEL: Record<TargetField, string> = TARGET_FIELDS.reduce(
  (acc, f) => ({ ...acc, [f.field]: f.label }),
  {} as Record<TargetField, string>,
);

/** Header aliases, best first. Matching is on normalised header text. */
const ALIASES: Record<TargetField, string[]> = {
  supplierCode: [
    'supplier code', 'supplier item code', 'supplier sku', 'supplier part number', 'item code', 'product code',
    'part number', 'part no', 'part #', 'stock code', 'item number', 'item no', 'item #', 'cat no',
    'catalogue number', 'catalogue no', 'catalog number', 'vendor code', 'article number', 'article no',
    'mfr code', 'manufacturer code', 'code', 'part', 'ref', 'reference', 'product id', 'item id',
  ],
  name: [
    'name', 'product name', 'item name', 'product', 'item', 'title', 'product title', 'item description',
    'product description', 'description', 'desc',
  ],
  description: [
    'description', 'long description', 'product description', 'item description', 'details',
    'extended description', 'desc', 'notes',
  ],
  barcode: ['barcode', 'bar code', 'ean', 'ean13', 'ean 13', 'upc', 'gtin', 'apn', 'barcode number'],
  orderUnit: [
    'order unit', 'order uom', 'purchase unit', 'buy unit', 'pack', 'packaging', 'pack description',
    'pack type', 'sell unit', 'selling unit', 'uom', 'unit of measure', 'pack size', 'unit',
  ],
  unitsPerOrderUnit: [
    'units per order unit', 'pack qty', 'pack quantity', 'qty per pack', 'units per pack', 'per pack',
    'carton qty', 'carton quantity', 'qty per carton', 'units per carton', 'inner qty', 'box qty',
    'pcs per pack', 'pieces per pack', 'pack size', 'conversion', 'outer qty',
  ],
  stockUnit: ['stock unit', 'count unit', 'base unit', 'base uom', 'stocking unit', 'unit'],
  purchasePrice: [
    'purchase price', 'buy price', 'cost price', 'trade price', 'net price', 'nett price', 'nett',
    'unit price', 'your price', 'price ex gst', 'price excl gst', 'price ex', 'ex gst', 'excl gst',
    'cost ex gst', 'dealer price', 'price', 'cost', 'unit cost',
  ],
  priceBasisQuantity: [
    'price basis quantity', 'price per', 'priced per', 'price basis', 'price unit', 'price qty',
    'per qty', 'pricing unit', 'price uom', 'per',
  ],
  priceBasisUnit: ['price basis unit'],
  category: ['category', 'product category', 'group', 'product group', 'range', 'department', 'family', 'class', 'type'],
  sku: ['sku', 'your sku', 'internal code', 'our code'],
  supplier: ['supplier', 'supplier name', 'vendor', 'vendor name'],
  supplierEmail: ['supplier email', 'order email', 'ordering email', 'email'],
  sellPrice: ['sell price', 'selling price', 'retail price', 'rrp', 'recommended retail', 'retail'],
  // Deliberately exact-only: supplier files often contain THEIR stock levels.
  currentStock: ['current stock', 'my stock', 'our stock', 'stock on hand mine'],
  minStock: ['min stock', 'minimum stock', 'reorder point', 'reorder level', 'par level', 'min qty'],
};

export function normaliseHeader(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[_\-./\\:()[\]]+/g, ' ')
    .replace(/[^a-z0-9# $]+/g, ' ')
    .replace(/\$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Headers that look like a supplier's stock / availability column. */
const SUPPLIER_STOCK_RE = /\b(stock|qty|quantity|available|availability|avail|soh|on hand|in stock|inventory|balance|free|warehouse)\b/;

export function isSupplierStockHeader(header: string): boolean {
  const n = normaliseHeader(header);
  if (!n) return false;
  if (ALIASES.currentStock.includes(n) || ALIASES.minStock.includes(n)) return false;
  if (ALIASES.unitsPerOrderUnit.includes(n)) return false;
  if (/\b(per|pack|carton|box|inner|outer|min|order)\b/.test(n)) return false;
  return SUPPLIER_STOCK_RE.test(n);
}

function aliasScore(header: string, field: TargetField): number {
  const n = normaliseHeader(header);
  if (!n) return 0;
  const list = ALIASES[field];
  const exact = list.indexOf(n);
  if (exact >= 0) return 100 - exact;
  if (field === 'currentStock') return 0; // never fuzzy
  // Word-contains match for multi-word aliases ("Item Code (Supplier)").
  let best = 0;
  list.forEach((alias, i) => {
    if (alias.length < 4) return;
    const re = new RegExp(`(^| )${alias.replace(/[#$]/g, '\\$&')}( |$)`);
    if (re.test(n)) best = Math.max(best, 60 - i);
  });
  return best;
}

export type ColumnMapping = (TargetField | null)[];

function numericRatio(values: string[]): number {
  const nonEmpty = values.filter(v => v.trim() !== '');
  if (nonEmpty.length === 0) return 0;
  return nonEmpty.filter(v => /^\s*[$€£]?\s*[\d,]+(\.\d+)?\s*$/.test(v)).length / nonEmpty.length;
}

/**
 * Suggests a column mapping. Each field is assigned to at most one column
 * and each column to at most one field (best scores first). Ambiguous
 * stock-like columns are never mapped automatically.
 */
export function autoMapColumns(headers: string[], sampleRows: string[][] = []): ColumnMapping {
  const mapping: ColumnMapping = headers.map(() => null);
  const pairs: { col: number; field: TargetField; score: number }[] = [];
  headers.forEach((h, col) => {
    const values = sampleRows.map(r => r[col] ?? '');
    const numeric = numericRatio(values);
    (Object.keys(ALIASES) as TargetField[]).forEach(field => {
      let score = aliasScore(h, field);
      if (!score) return;
      // "Pack size" can be text ("Box of 100") or a number (100).
      if (field === 'unitsPerOrderUnit' && normaliseHeader(h) === 'pack size') score = numeric > 0.6 ? 95 : 10;
      if (field === 'orderUnit' && normaliseHeader(h) === 'pack size') score = numeric > 0.6 ? 10 : 95;
      if ((field === 'purchasePrice' || field === 'sellPrice') && values.some(v => v.trim()) && numeric < 0.3) score -= 50;
      if (score > 0) pairs.push({ col, field, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score || a.col - b.col);
  const usedFields = new Set<TargetField>();
  for (const p of pairs) {
    if (mapping[p.col] !== null || usedFields.has(p.field)) continue;
    mapping[p.col] = p.field;
    usedFields.add(p.field);
  }
  // Supplier files often have only a "Description" column — it IS the name.
  if (!usedFields.has('name')) {
    const descCol = mapping.indexOf('description');
    if (descCol >= 0) mapping[descCol] = 'name';
  }
  return mapping;
}

/** Scores how header-like a row is (number of distinct alias matches). */
function headerRowScore(row: string[]): number {
  const fields = new Set<TargetField>();
  let hits = 0;
  for (const cell of row) {
    if (!cell || /^\s*[\d$.,]+\s*$/.test(cell)) continue;
    let best: TargetField | null = null;
    let bestScore = 0;
    (Object.keys(ALIASES) as TargetField[]).forEach(f => {
      const s = aliasScore(cell, f);
      if (s > bestScore) { bestScore = s; best = f; }
    });
    if (best && !fields.has(best)) { fields.add(best); hits++; }
  }
  return hits;
}

/** Finds the most likely header row within the first rows (title rows skipped). */
export function detectHeaderRow(rows: string[][], scanLimit = 15): number {
  let bestRow = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, scanLimit); i++) {
    const s = headerRowScore(rows[i]);
    if (s > bestScore) { bestScore = s; bestRow = i; }
  }
  return bestScore >= 2 ? bestRow : 0;
}

export interface TableView {
  headers: string[];
  /** Data rows with their 1-based row number in the original sheet. */
  rows: { rowNumber: number; cells: string[] }[];
}

export function sheetToTable(sheet: SheetData, headerRow: number): TableView {
  const headerCells = sheet.rows[headerRow] ?? [];
  const width = Math.max(headerCells.length, ...sheet.rows.slice(headerRow + 1).map(r => r.length), 0);
  const headers = Array.from({ length: width }, (_, i) => (headerCells[i] || '').trim() || `Column ${i + 1}`);
  const headerKey = headerCells.map(h => normaliseHeader(h)).join('|');
  const rows = sheet.rows
    .slice(headerRow + 1)
    .map((cells, i) => ({ rowNumber: headerRow + i + 2, cells: Array.from({ length: width }, (_, k) => (cells[k] ?? '').trim()) }))
    .filter(r => r.cells.some(c => c !== ''))
    // Repeated header rows (multi-page exports) are not products.
    .filter(r => r.cells.map(c => normaliseHeader(c)).join('|') !== headerKey);
  return { headers, rows };
}

export function supplierStockColumns(headers: string[], mapping: ColumnMapping): string[] {
  return headers.filter((h, i) => mapping[i] === null && isSupplierStockHeader(h));
}

// ============================================================================
// PDF tables
// ============================================================================

const PDF_SKIP_RE = /^(sub ?total|total|page \d+|page \d+ of \d+|continued|gst|freight total|balance)\b/i;

/**
 * Converts positioned PDF text rows into a table by locating the header row
 * and assigning each cell to the header column it overlaps most.
 * Returns null when no recognisable header exists.
 */
export function pdfRowsToSheet(rows: PdfTextRow[]): { sheet: SheetData; notes: string[] } | null {
  let headerIdx = -1;
  let bestScore = 0;
  rows.forEach((r, i) => {
    if (r.cells.length < 2) return;
    const s = headerRowScore(r.cells.map(c => c.text));
    if (s > bestScore) { bestScore = s; headerIdx = i; }
  });
  if (headerIdx < 0 || bestScore < 2) return null;

  const header = rows[headerIdx].cells;
  const headerKey = header.map(c => normaliseHeader(c.text)).join('|');
  const cols = header.map((c, i) => ({
    x: c.x,
    xEnd: Math.max(c.xEnd, i + 1 < header.length ? Math.min(header[i + 1].x - 2, c.x + (c.xEnd - c.x) * 3) : c.xEnd),
  }));

  const out: string[][] = [header.map(c => c.text)];
  let skippedLines = 0;
  let mergedCells = 0;
  const lowConfidence: number[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const texts = r.cells.map(c => normaliseHeader(c.text)).join('|');
    if (texts === headerKey) continue; // header repeated on next page
    const joined = r.cells.map(c => c.text).join(' ');
    if (r.cells.length < 2 || PDF_SKIP_RE.test(joined.trim())) { skippedLines++; continue; }

    const cells: string[] = header.map(() => '');
    let collided = false;
    for (const cell of r.cells) {
      let best = -1;
      let bestOverlap = 0;
      cols.forEach((col, k) => {
        const overlap = Math.min(cell.xEnd, col.xEnd) - Math.max(cell.x, col.x);
        if (overlap > bestOverlap) { bestOverlap = overlap; best = k; }
      });
      if (best < 0) {
        const centre = (cell.x + cell.xEnd) / 2;
        let bestDist = Infinity;
        cols.forEach((col, k) => {
          const d = Math.abs(centre - (col.x + col.xEnd) / 2);
          if (d < bestDist) { bestDist = d; best = k; }
        });
      }
      if (cells[best]) { cells[best] += ` ${cell.text}`; collided = true; mergedCells++; }
      else cells[best] = cell.text;
    }
    if (collided) lowConfidence.push(out.length);
    out.push(cells);
  }

  const notes: string[] = [];
  notes.push('Read from the PDF text layer — check a few rows against the original before importing.');
  if (skippedLines) notes.push(`${skippedLines} line(s) that were not product rows (titles, totals, page footers) were left out.`);
  if (mergedCells) notes.push(`${lowConfidence.length} row(s) had text that did not line up with a single column and need review.`);
  return { sheet: { name: 'PDF', rows: out, lowConfidenceRows: lowConfidence }, notes };
}


// ============================================================================
// Value parsing
// ============================================================================

export function parseMoney(raw: string | undefined): { value?: number; issue?: 'zero' | 'unreadable' | 'negative' | 'poa' } {
  const s = (raw || '').trim();
  if (!s) return {};
  if (/\b(poa|p\.o\.a|call|tba|tbc|quote|n\/a)\b/i.test(s)) return { issue: 'poa' };
  const cleaned = s.replace(/\b(ex|excl|inc|incl)\.?\s*gst\b/gi, '').replace(/(aud|nzd|usd)/gi, '').replace(/[$€£\s]/g, '');
  // European decimal comma ("12,50") → dot when no dot present and 2 decimals.
  const normalised = /^\d+,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  if (!/^-?\d*\.?\d+$/.test(normalised)) return { issue: 'unreadable' };
  const n = parseFloat(normalised);
  if (!Number.isFinite(n)) return { issue: 'unreadable' };
  if (n < 0) return { issue: 'negative' };
  if (n === 0) return { issue: 'zero' };
  return { value: Math.round(n * 10000) / 10000 };
}

const UNIT_WORDS: Record<string, string> = {
  ea: 'each', each: 'each', e: 'each', pc: 'each', pcs: 'each', piece: 'each', pieces: 'each', unit: 'each', units: 'each', no: 'each', nos: 'each',
  lm: 'metre', 'lin m': 'metre', 'l m': 'metre', metre: 'metre', metres: 'metre', meter: 'metre', meters: 'metre', mtr: 'metre', mtrs: 'metre',
  kg: 'kg', kgs: 'kg', l: 'litre', ltr: 'litre', litre: 'litre', litres: 'litre',
  roll: 'roll', rolls: 'roll', box: 'box', boxes: 'box', bx: 'box', carton: 'carton', ctn: 'carton', ctns: 'carton',
  pack: 'pack', pk: 'pack', pkt: 'pack', packet: 'pack', bag: 'bag', bags: 'bag', sheet: 'sheet', sheets: 'sheet',
  pair: 'pair', pr: 'pair', set: 'set', length: 'length', lengths: 'length', tube: 'tube', cartridge: 'cartridge', drum: 'drum', pail: 'pail',
};

export interface BasisParse {
  quantity?: number;
  unit?: string;
  /** Set when the basis is ambiguous and must be confirmed by the user. */
  ambiguous?: string;
  /** Set when an interpretation was applied that the user should confirm. */
  interpreted?: string;
}

/** Parses a price-basis cell: "per 100", "/1000", "100", "C", "EA", "per m". */
export function parsePriceBasis(raw: string | undefined): BasisParse {
  const s = (raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return {};
  if (s === 'm') return { ambiguous: '"M" could mean per 1,000 or per metre' };
  if (s === 'c') return { quantity: 100, unit: 'each', interpreted: '"C" read as per 100' };
  if (s === 'mille' || s === 'per mille' || s === 'k' || s === 'per k' || s === 'thousand' || s === 'per thousand') return { quantity: 1000, unit: 'each' };
  if (s === 'hundred' || s === 'per hundred') return { quantity: 100, unit: 'each' };
  const m = s.match(/^(?:per|\/|p\/|@)?\s*([\d,]*\.?\d+)?\s*([a-z][a-z ]*)?$/);
  if (!m) return { ambiguous: `"${raw}" is not a recognised price basis` };
  const qty = m[1] ? parseFloat(m[1].replace(/,/g, '')) : undefined;
  const word = (m[2] || '').trim();
  let unit: string | undefined;
  if (word) {
    unit = UNIT_WORDS[word];
    if (!unit) return { ambiguous: `"${raw}" is not a recognised price basis` };
  }
  if (qty !== undefined && (!Number.isFinite(qty) || qty <= 0)) return { ambiguous: `"${raw}" is not a valid price basis` };
  if (qty === undefined && !unit) return { ambiguous: `"${raw}" is not a recognised price basis` };
  return { quantity: qty ?? 1, unit: unit ?? 'each' };
}

/** Pulls a pack quantity from text like "Box of 1,000", "CTN 12", "100/box", "12 x 300ml". */
export function parsePackQuantity(raw: string | undefined): { quantity?: number; unclear?: boolean } {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return {};
  if (UNIT_WORDS[s] === 'each') return { quantity: 1 };
  const patterns = [
    /\b(?:of|x)\s*([\d,]+)\b/, // box of 1,000 / pack x 50
    /^([\d,]+)\s*(?:x\b|\/|per\b|pcs?\b|pieces\b|ea\b|units?\b|pk\b|pack\b|box\b|bx\b|ctn\b|carton\b|bag\b|roll\b)/, // 100/box, 12 x 300ml, 50 pcs
    /^(?:box|bx|ctn|carton|pack|pk|pkt|bag|tub|tin|roll|case|inner|outer)\s*(?:of\s*)?([\d,]+)$/, // ctn 12
    /\(([\d,]+)\)/, // carton (12)
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ''), 10);
      if (Number.isFinite(n) && n > 0) return { quantity: n };
    }
  }
  if (/^[\d,]+$/.test(s)) {
    const n = parseInt(s.replace(/,/g, ''), 10);
    if (n > 0) return { quantity: n };
  }
  return /\d/.test(s) ? { unclear: true } : {};
}

function parseCount(raw: string | undefined): number | undefined | null {
  const s = (raw || '').trim();
  if (!s) return undefined;
  const cleaned = s.replace(/,/g, '').replace(/\s*(pcs?|ea|each|units?)$/i, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ============================================================================
// Drafts
// ============================================================================

export type IssueLevel = 'error' | 'review' | 'info';

export type IssueCode =
  | 'missing-name'
  | 'freight'
  | 'zero-price'
  | 'negative-price'
  | 'unreadable-price'
  | 'poa'
  | 'missing-price'
  | 'ambiguous-basis'
  | 'interpreted-basis'
  | 'pack-unclear'
  | 'pack-mismatch'
  | 'derived-order-unit'
  | 'missing-identifier'
  | 'name-looks-like-code'
  | 'invalid-number'
  | 'invalid-barcode'
  | 'pdf-source'
  | 'pdf-low-confidence';

export interface DraftIssue {
  level: IssueLevel;
  code: IssueCode;
  message: string;
}

export type DraftStatus = 'ready' | 'review' | 'invalid';

export interface SupplierContext {
  /** Selected supplier record; when absent the file's supplier column is used. */
  name?: string;
  email?: string;
  id?: string;
}

export interface CatalogueDraft {
  key: string;
  rowNumber: number;
  values: Partial<Record<TargetField, string>>;
  product: Product;
  issues: DraftIssue[];
  status: DraftStatus;
  /** Whether the row is selected for import by default. */
  includeByDefault: boolean;
  lowConfidence: boolean;
}

const FREIGHT_RE = /\b(freight|delivery|delivery charge|shipping|cartage|surcharge|courier|postage|fuel levy|handling fee|handling charge|small order fee|min(imum)? order (fee|charge))\b/i;

export function isFreightLine(values: Partial<Record<TargetField, string>>): boolean {
  return FREIGHT_RE.test(`${values.name || ''} ${values.supplierCode || ''}`);
}

export interface DraftContext {
  source: CatalogueSource;
  supplier: SupplierContext;
  lowConfidence?: boolean;
}

/** Builds one validated draft from raw (editable) field values. */
export function buildDraft(
  key: string,
  rowNumber: number,
  values: Partial<Record<TargetField, string>>,
  ctx: DraftContext,
): CatalogueDraft {
  const v = (f: TargetField) => (values[f] || '').trim();
  const issues: DraftIssue[] = [];
  const name = v('name');
  if (!name) issues.push({ level: 'error', code: 'missing-name', message: 'No product name — this row cannot be imported.' });
  else if (/^[\d\s\-./]+$/.test(name)) issues.push({ level: 'review', code: 'name-looks-like-code', message: 'The name looks like a number or code — check the column mapping.' });

  const freight = isFreightLine(values);
  if (freight) issues.push({ level: 'review', code: 'freight', message: 'Looks like a freight / delivery charge, not a stocked product.' });

  // Price
  let purchasePrice: number | undefined;
  const price = parseMoney(v('purchasePrice'));
  if (price.value !== undefined) purchasePrice = price.value;
  else if (price.issue === 'zero') issues.push({ level: 'review', code: 'zero-price', message: 'Price is $0 — left blank rather than imported as free.' });
  else if (price.issue === 'negative') issues.push({ level: 'review', code: 'negative-price', message: 'Negative price (credit or discount line?) — left blank.' });
  else if (price.issue === 'poa') issues.push({ level: 'review', code: 'poa', message: 'Price on application — no price imported.' });
  else if (price.issue === 'unreadable') issues.push({ level: 'review', code: 'unreadable-price', message: `Price "${v('purchasePrice')}" could not be read — left blank.` });
  else if (name && !freight) issues.push({ level: 'info', code: 'missing-price', message: 'No price — orders will show no line total until one is added.' });

  // Pack / order unit
  let orderUnit = v('orderUnit') || undefined;
  let unitsPerOrderUnit: number | undefined;
  const packCol = parseCount(v('unitsPerOrderUnit'));
  if (packCol === null) issues.push({ level: 'review', code: 'invalid-number', message: `Pack quantity "${v('unitsPerOrderUnit')}" is not a number.` });
  else if (packCol !== undefined && packCol > 0) unitsPerOrderUnit = packCol;
  if (orderUnit) {
    const pack = parsePackQuantity(orderUnit);
    if (pack.quantity !== undefined) {
      if (unitsPerOrderUnit !== undefined && Math.abs(unitsPerOrderUnit - pack.quantity) > 0.0001) {
        issues.push({ level: 'review', code: 'pack-mismatch', message: `Order unit "${orderUnit}" disagrees with pack quantity ${unitsPerOrderUnit}.` });
      } else if (unitsPerOrderUnit === undefined) {
        unitsPerOrderUnit = pack.quantity;
      }
    } else if (pack.unclear && unitsPerOrderUnit === undefined) {
      issues.push({ level: 'review', code: 'pack-unclear', message: `Pack quantity in "${orderUnit}" is unclear — set it to order correctly.` });
    }
  } else if (unitsPerOrderUnit !== undefined && unitsPerOrderUnit > 1) {
    orderUnit = `pack of ${unitsPerOrderUnit.toLocaleString('en-AU')}`;
    issues.push({ level: 'info', code: 'derived-order-unit', message: `Order unit set to "${orderUnit}" from the pack quantity.` });
  }

  // Price basis
  let priceBasisQuantity: number | undefined;
  let priceBasisUnit: string | undefined;
  const basisRaw = v('priceBasisQuantity');
  if (basisRaw) {
    const b = parsePriceBasis(basisRaw);
    if (b.ambiguous) {
      issues.push({ level: 'review', code: 'ambiguous-basis', message: `Price basis unclear: ${b.ambiguous}. Price kept, basis needs confirming.` });
    } else {
      priceBasisQuantity = b.quantity;
      priceBasisUnit = b.unit;
      if (b.interpreted) issues.push({ level: 'review', code: 'interpreted-basis', message: `${b.interpreted} — confirm.` });
    }
  }
  const basisUnitRaw = v('priceBasisUnit');
  if (basisUnitRaw) priceBasisUnit = UNIT_WORDS[basisUnitRaw.toLowerCase()] ?? basisUnitRaw;
  if (purchasePrice !== undefined && !basisRaw && unitsPerOrderUnit !== undefined && unitsPerOrderUnit > 1) {
    issues.push({
      level: 'review',
      code: 'ambiguous-basis',
      message: `Is $${purchasePrice} per item or per ${orderUnit}? Set "Price per" to confirm.`,
    });
  }

  const stockUnit = v('stockUnit') ? (UNIT_WORDS[v('stockUnit').toLowerCase()] ?? v('stockUnit')) : undefined;

  const barcode = v('barcode').replace(/\s+/g, '');
  if (barcode && !/^[0-9A-Za-z\-]{4,32}$/.test(barcode)) {
    issues.push({ level: 'review', code: 'invalid-barcode', message: `Barcode "${v('barcode')}" looks invalid.` });
  }
  const supplierCode = v('supplierCode') || undefined;
  if (name && !supplierCode && !barcode) {
    issues.push({ level: 'info', code: 'missing-identifier', message: 'No supplier code or barcode — matched by name only.' });
  }

  const currentStock = parseCount(v('currentStock'));
  if (currentStock === null) issues.push({ level: 'review', code: 'invalid-number', message: `Stock on hand "${v('currentStock')}" is not a number.` });
  const minStock = parseCount(v('minStock'));
  if (minStock === null) issues.push({ level: 'review', code: 'invalid-number', message: `Minimum stock "${v('minStock')}" is not a number.` });
  const sell = parseMoney(v('sellPrice'));

  if (ctx.source === 'pdf') {
    if (ctx.lowConfidence) issues.push({ level: 'review', code: 'pdf-low-confidence', message: 'Text in this PDF row did not line up with the columns — check every value.' });
    else issues.push({ level: 'info', code: 'pdf-source', message: 'Read from a PDF — check against the original.' });
  }

  const supplierName = ctx.supplier.name || v('supplier') || 'Unknown Supplier';
  const supplierEmail = ctx.supplier.name ? ctx.supplier.email : (/.+@.+\..+/.test(v('supplierEmail')) ? v('supplierEmail') : undefined);
  const basisQty = priceBasisQuantity ?? 1;

  const product: Product = {
    id: '',
    name,
    description: v('description') || name,
    sku: v('sku') || supplierCode || (name ? generateSKU(name) : ''),
    // Left empty for matching; a barcode is generated only at insert time.
    barcode,
    category: v('category') || 'Uncategorized',
    supplier: supplierName,
    supplierEmail: supplierEmail || undefined,
    supplierId: ctx.supplier.id,
    price: sell.value ?? 0,
    // Legacy cost per stock unit, derived only from a real purchase price.
    cost: purchasePrice !== undefined ? Math.round((purchasePrice / basisQty) * 10000) / 10000 : 0,
    currentStock: typeof currentStock === 'number' ? currentStock : 0,
    minStock: typeof minStock === 'number' ? minStock : 0,
    unit: stockUnit || 'each',
    supplierCode,
    stockUnit,
    orderUnit,
    unitsPerOrderUnit,
    purchasePrice,
    priceBasisQuantity,
    priceBasisUnit,
  };

  const status: DraftStatus = issues.some(i => i.level === 'error')
    ? 'invalid'
    : issues.some(i => i.level === 'review')
      ? 'review'
      : 'ready';

  return {
    key,
    rowNumber,
    values,
    product,
    issues,
    status,
    includeByDefault: status === 'ready',
    lowConfidence: !!ctx.lowConfidence,
  };
}

/** Builds drafts for every data row of a table using the column mapping. */
export function buildDrafts(
  table: TableView,
  mapping: ColumnMapping,
  ctx: Omit<DraftContext, 'lowConfidence'>,
  sheet?: SheetData,
): CatalogueDraft[] {
  const low = new Set(sheet?.lowConfidenceRows ?? []);
  return table.rows.map((row, i) => {
    const values: Partial<Record<TargetField, string>> = {};
    mapping.forEach((field, col) => {
      if (!field) return;
      // The selected supplier record wins over any supplier column in the file.
      if ((field === 'supplier' || field === 'supplierEmail') && ctx.supplier.name) return;
      const cell = row.cells[col] ?? '';
      if (cell) values[field] = values[field] ? `${values[field]} ${cell}` : cell;
    });
    return buildDraft(`r${row.rowNumber}-${i}`, row.rowNumber, values, {
      ...ctx,
      lowConfidence: low.has(row.rowNumber - 1),
    });
  });
}

// ============================================================================
// Matching + summary
// ============================================================================

export type ReviewCategory = 'ready' | 'existing' | 'conflict' | 'review' | 'invalid';

export interface ReviewedDraft extends CatalogueDraft {
  match: RowMatch;
  category: ReviewCategory;
  /** Whether the row can be imported at all (duplicates/conflicts/invalid cannot). */
  importable: boolean;
}

export function reviewDrafts(existing: Product[], drafts: CatalogueDraft[]): ReviewedDraft[] {
  // Invalid rows are excluded from matching so they cannot "claim" identity
  // keys and turn a later valid row into an in-file duplicate.
  const valid = drafts.filter(d => d.status !== 'invalid');
  const matches = matchRowsForImport(existing, valid.map(d => d.product));
  const byKey = new Map<string, RowMatch>();
  valid.forEach((d, i) => byKey.set(d.key, matches[i]));
  return drafts.map(d => {
    const match: RowMatch = byKey.get(d.key) ?? { status: 'new', reason: '' };
    let category: ReviewCategory;
    if (d.status === 'invalid') category = 'invalid';
    else if (match.status === 'duplicate') category = 'existing';
    else if (match.status === 'conflict') category = 'conflict';
    else if (d.status === 'review') category = 'review';
    else category = 'ready';
    return {
      ...d,
      match,
      category,
      importable: d.status !== 'invalid' && match.status === 'new',
    };
  });
}

export interface ReviewSummary {
  total: number;
  ready: number;
  existing: number;
  duplicatesInFile: number;
  conflicts: number;
  review: number;
  missingInfo: number;
  invalid: number;
}

export function summariseReview(rows: ReviewedDraft[]): ReviewSummary {
  return {
    total: rows.length,
    ready: rows.filter(r => r.category === 'ready').length,
    existing: rows.filter(r => r.category === 'existing' && r.match.match).length,
    duplicatesInFile: rows.filter(r => r.category === 'existing' && !r.match.match).length,
    conflicts: rows.filter(r => r.category === 'conflict').length,
    review: rows.filter(r => r.category === 'review').length,
    missingInfo: rows.filter(r => r.importable && r.issues.some(i => i.level === 'info' && (i.code === 'missing-price' || i.code === 'missing-identifier'))).length,
    invalid: rows.filter(r => r.category === 'invalid').length,
  };
}
