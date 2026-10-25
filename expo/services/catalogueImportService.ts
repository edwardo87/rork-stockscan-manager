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
import { resolvePricing } from '@/utils/purchasing';
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
  /** PDF only: how the document's text lines were classified. */
  layout?: PdfLayoutStats;
  /** Text outside the product table (titles, quote/customer details) — used to recognise the document type. */
  contextText?: string;
}

export interface ParsedCatalogueFile {
  source: CatalogueSource;
  fileName: string;
  sheets: SheetData[];
  /** Notes about how the file was read (shown to the user). */
  notes: string[];
  /** What kind of supplier document this appears to be. */
  document: DocumentInfo;
}

// ============================================================================
// Document recognition
// ============================================================================

export type DocumentKind = 'quotation' | 'price-list' | 'catalogue' | 'stock-report' | 'unknown';

export interface DocumentInfo {
  kind: DocumentKind;
  /** Plain-language label, e.g. "Quotation 70294". */
  label: string;
  /** Quote / price-list reference number when one is printed. */
  reference?: string;
  /** What the importer does differently for this kind of document. */
  explanation: string;
}

const DOC_EXPLANATION: Record<DocumentKind, string> = {
  quotation:
    'Quantities on a quote are what was quoted, not pack sizes or stock — they are only used to check each price against its line total.',
  'price-list': 'Prices are read with their price basis (each, per 100, per 1,000, per metre or per pack).',
  catalogue: 'Prices are read with their price basis (each, per 100, per 1,000, per metre or per pack).',
  'stock-report':
    'Quantities in a stock report are the supplier’s stock levels. They are shown for reference and never become your stock.',
  unknown: 'Check the column choices — every column can be changed.',
};

/**
 * Recognises the document type from its title/header text and its column
 * headings. General rules only — no supplier-specific layouts.
 */
export function detectDocumentKind(contextText: string, headers: string[] = []): DocumentInfo {
  const t = ` ${(contextText || '').toLowerCase().replace(/\s+/g, ' ')} `;
  const h = headers.map(normaliseHeader);
  const has = (field: TargetField) => h.some(x => aliasScore(x, field) >= 40);
  const qtyAndTotal = has('quotedQuantity') && (has('lineTotal') || has('lineTotalIncGst'));
  const isStock = /stock (report|on hand report|listing|availability)|inventory (report|listing)|availability report|stock status/.test(t);
  const isQuote = /\bquot(e|ation)\b/.test(t);
  const priceWords = /price ?list|price listing|quoted pricing|special price|price catalogue|price file|trade price|pricing|price quotation/.test(t);
  const isCatalogue = /\bcatalog(ue)?\b/.test(t);
  const refMatch = (contextText || '').match(/\b(?:quot(?:e|ation)(?:\s*(?:number|no\.?|#|ref(?:erence)?))?)\s*:?\s*([A-Z]{0,5}\d{3,}[A-Z0-9-]*)/i);
  const reference = refMatch ? refMatch[1] : undefined;
  let kind: DocumentKind;
  if (isStock) kind = 'stock-report';
  else if (qtyAndTotal) kind = 'quotation';
  else if (priceWords || isQuote) kind = 'price-list';
  else if (isCatalogue) kind = 'catalogue';
  else kind = 'unknown';
  const base: Record<DocumentKind, string> = {
    quotation: 'Quotation',
    'price-list': isQuote ? 'Price quote' : 'Price list',
    catalogue: 'Catalogue',
    'stock-report': 'Stock report',
    unknown: 'Supplier document',
  };
  return {
    kind,
    label: reference && (kind === 'quotation' || kind === 'price-list') ? `${base[kind]} ${reference}` : base[kind],
    reference,
    explanation: DOC_EXPLANATION[kind],
  };
}

function documentFor(sheets: SheetData[]): DocumentInfo {
  const s = sheets[0];
  if (!s) return detectDocumentKind('');
  const hdr = detectHeaderRow(s.rows);
  const preamble = s.rows.slice(0, hdr).map(r => r.join(' ')).join(' ');
  return detectDocumentKind(`${s.contextText || ''} ${preamble} ${s.name}`, s.rows[hdr] ?? []);
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
    const sheets = [parseCsvToSheet(bytesToText(data))];
    return { source, fileName, sheets, notes: [], document: documentFor(sheets) };
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
    return { source, fileName, sheets: nonEmpty, notes: [], document: documentFor(nonEmpty) };
  }
  const rows = extractPdfTextRows(data); // throws PdfLimitationError
  const table = pdfRowsToSheet(rows);
  if (!table) {
    throw new PdfLimitationError(
      'unreadable',
      'Text was found in this PDF, but no product table with recognisable column headings (for example "Code", "Description", "Price") could be located. Ask the supplier for an Excel or CSV version.',
    );
  }
  const document = documentFor([table.sheet]);
  return {
    source,
    fileName,
    sheets: [table.sheet],
    notes: [`Recognised as: ${document.label}. ${document.explanation}`, ...table.notes],
    document,
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
  | 'minStock'
  // Quote / reference fields: kept in the draft for checking, never saved as product data.
  | 'customerCode'
  | 'quotedQuantity'
  | 'discountPercent'
  | 'lineTotal'
  | 'gstAmount'
  | 'lineTotalIncGst'
  | 'purchasePriceIncGst'
  | 'supplierStock';

/** Fields that are only used to check or explain a row — never saved to the product. */
export const REFERENCE_FIELDS: TargetField[] = [
  'customerCode', 'quotedQuantity', 'discountPercent', 'lineTotal', 'gstAmount', 'lineTotalIncGst', 'supplierStock',
];

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
  { field: 'customerCode', label: 'Your code at supplier', hint: 'Customer code — used as your SKU when no SKU column' },
  { field: 'quotedQuantity', label: 'Quoted quantity', hint: 'Qty on a quote — never a pack size or stock' },
  { field: 'discountPercent', label: 'Discount %', hint: 'Used to work out the net price' },
  { field: 'lineTotal', label: 'Line total (ex GST)', hint: 'Extended amount — used to check the price' },
  { field: 'gstAmount', label: 'GST amount', hint: 'Checked, not imported' },
  { field: 'lineTotalIncGst', label: 'Line total (inc GST)', hint: 'Checked, not imported' },
  { field: 'purchasePriceIncGst', label: 'Price inc GST', hint: 'Converted to ex GST (÷ 1.1) and flagged' },
  { field: 'supplierStock', label: "Supplier's stock", hint: 'Reference only — never your stock' },
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
    'unit price', 'your price', 'price ex gst', 'price excl gst', 'price ex', 'unit price ex gst',
    'cost ex gst', 'dealer price', 'price', 'cost', 'unit cost', 'rate', 'pack rate', 'rate lm', 'price lm',
    'value',
  ],
  priceBasisQuantity: [
    'price basis quantity', 'price per', 'priced per', 'price basis', 'price unit', 'price qty',
    'per qty', 'pricing unit', 'price uom', 'per',
  ],
  priceBasisUnit: ['price basis unit'],
  category: ['category', 'product category', 'group', 'product group', 'range', 'department', 'family', 'class', 'type', 'section', 'heading'],
  sku: ['sku', 'your sku', 'internal code', 'our code'],
  supplier: ['supplier', 'supplier name', 'vendor', 'vendor name'],
  supplierEmail: ['supplier email', 'order email', 'ordering email', 'email'],
  sellPrice: ['sell price', 'selling price', 'retail price', 'rrp', 'recommended retail', 'retail'],
  // Deliberately exact-only: supplier files often contain THEIR stock levels.
  currentStock: ['current stock', 'my stock', 'our stock', 'stock on hand mine'],
  minStock: ['min stock', 'minimum stock', 'reorder point', 'reorder level', 'par level', 'min qty'],
  customerCode: [
    'customer code', 'customer product id', 'customer product code', 'customer item code', 'customer part number',
    'customer part no', 'cust code', 'cust product code', 'your code', 'your part number', 'customer sku',
  ],
  quotedQuantity: [
    'quoted quantity', 'quoted qty', 'quote qty', 'qty quoted', 'qty ord', 'qty ordered', 'order qty', 'ordered',
    'ord qty', 'quantity ordered', 'quantity', 'qty',
  ],
  discountPercent: ['discount percent', 'discount', 'disc', 'less disc', 'disc percent'],
  lineTotal: [
    'line total', 'line total ex gst', 'total ex gst', 'amount ex gst', 'ext ex gst', 'extended', 'extended price',
    'extended amount', 'ext price', 'ext amount', 'ext', 'nett amount', 'net amount', 'amount', 'ex gst', 'excl gst',
    'total',
  ],
  gstAmount: ['gst', 'gst amount', 'tax amount', 'tax'],
  lineTotalIncGst: [
    'total amount', 'total inc gst', 'total incl gst', 'amount inc gst', 'line total inc gst', 'inc gst', 'incl gst',
    'gross amount',
  ],
  purchasePriceIncGst: ['price inc gst', 'price incl gst', 'unit price inc gst', 'unit price incl gst', 'cost inc gst'],
  supplierStock: [
    'supplier stock', 'exstck', 'ex stck', 'ex stock', 'qty exstck', 'qty ex stock', 'stock', 'soh', 'stock on hand',
    'available', 'availability', 'qty available', 'avail', 'in stock', 'free stock', 'on hand',
  ],
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
export function autoMapColumns(
  headers: string[],
  sampleRows: string[][] = [],
  documentKind: DocumentKind = 'unknown',
): ColumnMapping {
  const mapping = aliasMapColumns(headers, sampleRows);
  return refineMappingWithValues(headers, sampleRows, mapping, documentKind);
}

/** Header-only mapping (no value checks). */
function aliasMapColumns(headers: string[], sampleRows: string[][] = []): ColumnMapping {
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

/** Numbers allowed in a "Unit"/"Per" column that means "price per N". */
const BASIS_NUMBERS = new Set([1, 10, 100, 1000, 10000]);

function isBasisLikeValue(v: string): boolean {
  const s = v.trim();
  if (/^[\d,]+$/.test(s)) return BASIS_NUMBERS.has(parseInt(s.replace(/,/g, ''), 10));
  const b = parsePriceBasis(s);
  return !b.ambiguous && b.quantity !== undefined;
}

function cellNumber(raw: string | undefined): number | undefined {
  const m = parseMoney(raw);
  if (m.value !== undefined) return m.value;
  return m.issue === 'zero' ? 0 : undefined;
}

/**
 * Uses the values themselves to correct header-only guesses:
 *  - a "Unit"/"UOM" column holding 1/100/1000 or EA/Roll/Carton is the price basis;
 *  - quantity × price ÷ basis = line total decides which money column is which;
 *  - a stock report's quantity column is the supplier's stock.
 * Every result stays user-overridable.
 */
export function refineMappingWithValues(
  headers: string[],
  rows: string[][],
  input: ColumnMapping,
  documentKind: DocumentKind = 'unknown',
): ColumnMapping {
  const mapping = [...input];
  const colVals = (c: number) => rows.map(r => (r[c] ?? '').trim()).filter(Boolean);
  const idx = (f: TargetField) => mapping.indexOf(f);

  // 1. Unit-like column that actually states the price basis.
  if (idx('priceBasisQuantity') < 0) {
    for (let c = 0; c < headers.length; c++) {
      const f = mapping[c];
      const n = normaliseHeader(headers[c]);
      if (f !== 'orderUnit' && f !== 'stockUnit' && f !== 'priceBasisUnit') continue;
      if (!/\b(unit|uom|per)\b/.test(n) || /order|stock|base|count|pack|purchase|buy|sell/.test(n)) continue;
      const vals = colVals(c);
      if (vals.length > 0 && vals.every(isBasisLikeValue)) { mapping[c] = 'priceBasisQuantity'; break; }
    }
  }

  // 2. Stock reports: quantities are the supplier's stock levels.
  if (documentKind === 'stock-report') {
    const q = idx('quotedQuantity');
    if (q >= 0 && idx('supplierStock') < 0) mapping[q] = 'supplierStock';
  }

  // 3. Money columns, decided by arithmetic.
  const qtyCol = idx('quotedQuantity');
  const basisCol = idx('priceBasisQuantity');
  const discCol = idx('discountPercent');
  const rate = (priceCol: number, totalCol: number) => {
    let checked = 0;
    let matched = 0;
    for (const r of rows) {
      const qty = cellNumber(r[qtyCol]);
      const price = cellNumber(r[priceCol]);
      const total = cellNumber(r[totalCol]);
      if (!qty || !price || total === undefined) continue;
      const b = basisCol >= 0 ? parsePriceBasis(r[basisCol]) : {};
      const rec = reconcileLine({
        quantity: qty, price, basis: b.quantity, discountPercent: discCol >= 0 ? cellNumber(r[discCol]) : undefined, lineTotal: total,
      });
      checked++;
      if (rec.status === 'match') matched++;
    }
    return { checked, rate: checked ? matched / checked : 0 };
  };
  const numericCols = headers
    .map((_, c) => c)
    .filter(c => mapping[c] === null && numericRatio(rows.map(r => r[c] ?? '')) > 0.8);
  if (qtyCol >= 0) {
    const priceCol = idx('purchasePrice');
    const totalCol = idx('lineTotal');
    if (priceCol >= 0 && totalCol >= 0) {
      const r1 = rate(priceCol, totalCol);
      if (r1.checked >= 2 && r1.rate < 0.5) {
        const r2 = rate(totalCol, priceCol);
        if (r2.rate > r1.rate + 0.3) { mapping[priceCol] = 'lineTotal'; mapping[totalCol] = 'purchasePrice'; }
      }
    } else if (priceCol >= 0) {
      const hit = numericCols.find(c => { const r = rate(priceCol, c); return r.checked >= 2 && r.rate >= 0.8; });
      if (hit !== undefined) mapping[hit] = 'lineTotal';
    } else if (totalCol >= 0) {
      const hit = numericCols.find(c => { const r = rate(c, totalCol); return r.checked >= 2 && r.rate >= 0.8; });
      if (hit !== undefined) mapping[hit] = 'purchasePrice';
    }
  } else if (idx('purchasePrice') < 0 && idx('lineTotal') >= 0) {
    // No quantities: the only money column ("Ex GST", "Amount") is the price.
    mapping[idx('lineTotal')] = 'purchasePrice';
  }
  return mapping;
}

/** Price basis stated in a price column's heading, e.g. "Price per 100", "Rate $/lm". */
export function basisFromHeader(header: string | undefined): BasisParse | undefined {
  const raw = (header || '').toLowerCase();
  if (!raw) return undefined;
  const m = raw.match(/(?:\bper\b|\/)\s*([\d,]+)?\s*(lm|lin\.? ?m|metre|meter|mtr|m|each|ea|100|1000|kg|litre|ltr|roll|box|carton|ctn|pack|pk)?\b/);
  if (!m || (!m[1] && !m[2])) return undefined;
  const qty = m[1] ? parseInt(m[1].replace(/,/g, ''), 10) : undefined;
  const word = (m[2] || '').replace(/[. ]/g, '');
  if (/^\d+$/.test(word)) return { quantity: parseInt(word, 10), unit: 'each' };
  const unit = word === 'm' || word === 'linm' ? 'metre' : word ? UNIT_WORDS[word] : 'each';
  if (!unit) return undefined;
  return { quantity: qty ?? 1, unit };
}

/** Extra context derived from the column headings, shared by every row. */
export interface ColumnHints {
  /** Price basis stated in the price heading. */
  priceBasis?: BasisParse;
  /** Word for the order unit taken from the pack heading ("Box Qty" → box). */
  packWord?: string;
  /** Price heading says the price includes GST. */
  priceIncGst?: boolean;
}

export function columnHints(headers: string[], mapping: ColumnMapping): ColumnHints {
  const hints: ColumnHints = {};
  const p = mapping.indexOf('purchasePrice');
  if (p >= 0) {
    hints.priceBasis = basisFromHeader(headers[p]);
    if (/\binc(l|luding)?\.?\s*gst\b/i.test(headers[p] || '')) hints.priceIncGst = true;
  }
  const u = mapping.indexOf('unitsPerOrderUnit');
  if (u >= 0) {
    const w = normaliseHeader(headers[u]).match(/\b(box|carton|ctn|pack|bag|bundle|case|inner|outer|roll)\b/);
    if (w) hints.packWord = w[1] === 'ctn' ? 'carton' : w[1];
  }
  return hints;
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

/** Supplier stock columns: mapped as supplier's stock, or stock-like and left unmapped. */
export function supplierStockColumns(headers: string[], mapping: ColumnMapping): string[] {
  return headers.filter((h, i) => mapping[i] === 'supplierStock' || (mapping[i] === null && isSupplierStockHeader(h)));
}

// ============================================================================
// PDF tables
// ============================================================================

export interface PdfLayoutStats {
  /** Every text line in the PDF. */
  sourceLines: number;
  /** Lines that became product rows. */
  productRows: number;
  /** Wrapped description lines joined onto the product above. */
  continuationLines: number;
  /** Section headings (used as the category of the products below). */
  headingLines: number;
  /** Column-heading lines, including headings repeated on later pages. */
  headerLines: number;
  /** Totals, GST, notes, sign-off and page-footer lines. */
  summaryLines: number;
  /** Quote/customer details, addresses, dates and other page text outside the table. */
  metadataLines: number;
}

/** Text that ends the product part of a page: totals, tax, notes, sign-off, page footers. */
const SUMMARY_RE = /^(sub ?-?total\b|total\b|grand total\b|gst\b|tax (code|rate|invoice)\b|balance( due)?\b|freight total\b|comments?:|accepted (by|date)|note:|notes:|this (quote|quotation) is valid|prices? (are|is) valid|quotation continued|continued( on next page)?\b|page:?(\s*\d+(\s*of\s*\d+)?)?$|e\.?\s*&\s*o\.?\s*e)/i;
const NUMERIC_CELL_RE = /^[$€£]?\s*-?[\d,]*\.?\d+\s*%?$/;

const isNumericText = (t: string) => NUMERIC_CELL_RE.test(t.trim());

/**
 * Converts positioned PDF text rows into a table:
 *  - finds the column-heading row (merging headings split over two lines);
 *  - ignores everything above the headings on each page (quote numbers,
 *    customer details, addresses, repeated page headers);
 *  - stops each page at totals / GST / notes / page footers;
 *  - joins wrapped description lines onto their product and turns
 *    stand-alone headings into a "Section" (category) column.
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

  // ---- Header columns, merging a heading split over two lines ("Qty." / "Ord.").
  const main = rows[headerIdx];
  type Col = { x: number; xEnd: number; text: string };
  const cols: Col[] = main.cells.map(c => ({ x: c.x, xEnd: c.xEnd, text: c.text }));
  const headerLineKeys = new Set<string>([main.cells.map(c => normaliseHeader(c.text)).join('|')]);
  const headerLineIdx = new Set<number>([headerIdx]);
  const mergeHeaderLine = (i: number, above: boolean): boolean => {
    const r = rows[i];
    if (!r || r.page !== main.page || Math.abs(r.y - main.y) > 12) return false;
    if (r.cells.some(c => isNumericText(c.text) || SUMMARY_RE.test(c.text.trim()))) return false;
    if (r.cells.some(c => c.text.trim().split(/\s+/).length > 3)) return false;
    for (const cell of r.cells) {
      const col = cols.find(c => Math.min(cell.xEnd, c.xEnd) - Math.max(cell.x, c.x) > 0);
      if (col) col.text = above ? `${cell.text} ${col.text}` : `${col.text} ${cell.text}`;
      else cols.push({ x: cell.x, xEnd: cell.xEnd, text: cell.text });
    }
    cols.sort((a, b) => a.x - b.x);
    headerLineKeys.add(r.cells.map(c => normaliseHeader(c.text)).join('|'));
    headerLineIdx.add(i);
    return true;
  };
  for (let i = headerIdx - 1; i >= Math.max(0, headerIdx - 2) && mergeHeaderLine(i, true); i--) { /* merged */ }
  for (let i = headerIdx + 1; i <= headerIdx + 2 && mergeHeaderLine(i, false); i++) { /* merged */ }
  const firstDataIdx = Math.max(...headerLineIdx) + 1;

  const extents = cols.map((c, i) => ({
    x: c.x,
    xEnd: Math.max(c.xEnd, i + 1 < cols.length ? Math.min(cols[i + 1].x - 2, c.x + (c.xEnd - c.x) * 3) : c.xEnd),
  }));
  const headerTexts = cols.map(c => c.text);
  const guess = aliasMapColumns(headerTexts);
  let nameCol = guess.indexOf('name');
  if (nameCol < 0) nameCol = guess.indexOf('description');
  if (nameCol < 0) {
    // Fall back to the widest heading.
    nameCol = cols.reduce((best, c, i) => (c.xEnd - c.x > cols[best].xEnd - cols[best].x ? i : best), 0);
  }
  const codeCols = new Set(
    guess.map((f, i) => (f === 'supplierCode' || f === 'barcode' || f === 'sku' ? i : -1)).filter(i => i >= 0),
  );

  // ---- Assign each line's cells to columns. Column -1 = text left of the first heading (line numbers).
  type Placed = { cells: string[]; lead: string; collided: boolean };
  const place = (r: PdfTextRow): Placed => {
    const cells: string[] = cols.map(() => '');
    let lead = '';
    let collided = false;
    for (const cell of r.cells) {
      let best = -1;
      let bestOverlap = 0;
      extents.forEach((col, k) => {
        const overlap = Math.min(cell.xEnd, col.xEnd) - Math.max(cell.x, col.x);
        if (overlap > bestOverlap) { bestOverlap = overlap; best = k; }
      });
      if (best < 0 && cell.xEnd < extents[0].x) { lead = lead ? `${lead} ${cell.text}` : cell.text; continue; }
      if (best < 0) {
        const centre = (cell.x + cell.xEnd) / 2;
        let bestDist = Infinity;
        extents.forEach((col, k) => {
          const d = Math.abs(centre - (col.x + col.xEnd) / 2);
          if (d < bestDist) { bestDist = d; best = k; }
        });
      }
      if (cells[best]) {
        // Two numbers in one column means the columns did not line up.
        if (isNumericText(cells[best]) && isNumericText(cell.text)) collided = true;
        cells[best] += ` ${cell.text}`;
      } else cells[best] = cell.text;
    }
    return { cells, lead, collided };
  };

  // Pages after the first that repeat the column headings: everything above them is page header.
  const headerRowOnPage = new Map<number, number>();
  rows.forEach((r, i) => {
    if (i < firstDataIdx || r.page === main.page || headerRowOnPage.has(r.page)) return;
    if (r.cells.length >= 2 && headerLineKeys.has(r.cells.map(c => normaliseHeader(c.text)).join('|'))) headerRowOnPage.set(r.page, i);
  });
  const repeatsHeaders = headerRowOnPage.size > 0;

  const stats: PdfLayoutStats = {
    sourceLines: rows.length, productRows: 0, continuationLines: 0, headingLines: 0,
    headerLines: headerLineIdx.size, summaryLines: 0, metadataLines: firstDataIdx - headerLineIdx.size,
  };
  const contextParts: string[] = rows.slice(0, headerIdx).filter((_, i) => !headerLineIdx.has(i)).map(r => r.cells.map(c => c.text).join(' '));

  type Line = { i: number; page: number; y: number; placed: Placed; product: boolean; nameText: string; hasCode: boolean };
  const candidates: Line[] = [];
  let footerPage = -1;
  for (let i = firstDataIdx; i < rows.length; i++) {
    const r = rows[i];
    const key = r.cells.map(c => normaliseHeader(c.text)).join('|');
    if (headerLineKeys.has(key)) { stats.headerLines++; continue; }
    const pageHeaderAt = headerRowOnPage.get(r.page);
    if (r.page !== main.page && repeatsHeaders && (pageHeaderAt === undefined || i < pageHeaderAt)) {
      stats.metadataLines++;
      contextParts.push(r.cells.map(c => c.text).join(' '));
      continue;
    }
    if (footerPage === r.page) { stats.metadataLines++; continue; }
    const placed = place(r);
    const nameText = placed.cells[nameCol] || '';
    const hasNumeric = placed.cells.some((c, k) => k !== nameCol && c && isNumericText(c));
    const summaryCell = r.cells.find(c => SUMMARY_RE.test(c.text.trim()));
    if (summaryCell && !(placed.cells[nameCol] === summaryCell.text && hasNumeric && placed.cells.some((c, k) => codeCols.has(k) && c))) {
      stats.summaryLines++;
      footerPage = r.page;
      contextParts.push(r.cells.map(c => c.text).join(' '));
      continue;
    }
    const hasCode = placed.cells.some((c, k) => codeCols.has(k) && !!c);
    candidates.push({ i, page: r.page, y: r.y, placed, product: !!nameText && (hasNumeric || hasCode), nameText, hasCode });
  }

  // Typical gap between product lines (for telling wrapped text from headings).
  const gaps: number[] = [];
  for (let k = 1; k < candidates.length; k++) {
    const a = candidates[k - 1], b = candidates[k];
    if (a.product && b.product && a.page === b.page) gaps.push(Math.abs(a.y - b.y));
  }
  gaps.sort((a, b) => a - b);
  const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 16;

  type OutRow = { cells: string[]; lead: string; section: string; collided: boolean; page: number; y: number };
  const products: OutRow[] = [];
  let section = '';
  for (let k = 0; k < candidates.length; k++) {
    const line = candidates[k];
    if (line.product) {
      products.push({ cells: [...line.placed.cells], lead: line.placed.lead, section, collided: line.placed.collided, page: line.page, y: line.y });
      stats.productRows++;
      continue;
    }
    const text = line.placed.cells.filter(Boolean).join(' ').trim();
    const prev = products[products.length - 1];
    const next = candidates.slice(k + 1).find(c => c.product && c.page === line.page);
    const gapPrev = prev && prev.page === line.page ? Math.abs(prev.y - line.y) : Infinity;
    const gapNext = next ? Math.abs(line.y - next.y) : Infinity;
    const onlyTextColumns = line.placed.cells.every((c, k2) => !c || !codeCols.has(k2));
    if (!text) { stats.metadataLines++; continue; }
    if (prev && onlyTextColumns && gapPrev <= pitch * 1.25 && (next ? gapPrev <= gapNext + 2 : true)) {
      // Wrapped description: join onto the product above.
      prev.cells[nameCol] = `${prev.cells[nameCol]} ${text}`.trim();
      stats.continuationLines++;
    } else if (next && onlyTextColumns && text.split(/\s+/).length <= 6 && !/\d{4,}/.test(text)) {
      // A heading directly above products: becomes their section/category.
      section = text;
      stats.headingLines++;
    } else {
      stats.metadataLines++;
      contextParts.push(text);
    }
  }

  const hasLead = products.some(p => p.lead);
  const hasSection = products.some(p => p.section);
  const header = [...(hasLead ? ['Line'] : []), ...headerTexts, ...(hasSection ? ['Section'] : [])];
  const out: string[][] = [header];
  const lowConfidence: number[] = [];
  for (const p of products) {
    if (p.collided) lowConfidence.push(out.length);
    out.push([...(hasLead ? [p.lead] : []), ...p.cells, ...(hasSection ? [p.section] : [])]);
  }

  const notes: string[] = [];
  notes.push('Read from the PDF text layer — check a few rows against the original before importing.');
  const pages = new Set(rows.map(r => r.page)).size;
  const leftOut = stats.metadataLines + stats.summaryLines + stats.headerLines;
  notes.push(
    `${stats.sourceLines} text lines on ${pages} page${pages === 1 ? '' : 's'}: ${stats.productRows} product row${stats.productRows === 1 ? '' : 's'}` +
      (stats.continuationLines ? `, ${stats.continuationLines} wrapped description line${stats.continuationLines === 1 ? '' : 's'} joined` : '') +
      (stats.headingLines ? `, ${stats.headingLines} section heading${stats.headingLines === 1 ? '' : 's'} used as categories` : '') +
      (leftOut ? `, ${leftOut} non-product line${leftOut === 1 ? '' : 's'} left out (column headings, quote and customer details, totals, GST, notes, page footers)` : '') +
      '.',
  );
  if (lowConfidence.length) notes.push(`${lowConfidence.length} row(s) had numbers that did not line up with a single column and need review.`);
  return {
    sheet: { name: 'PDF', rows: out, lowConfidenceRows: lowConfidence, layout: stats, contextText: contextParts.join(' ').slice(0, 6000) },
    notes,
  };
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
  // 6 decimals: keeps low-cost unit prices such as $0.01770 or $0.04873 exact.
  return { value: round6(n) };
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export interface LineCheckInput {
  quantity?: number;
  price?: number;
  /** Known price basis (e.g. 100 for "per 100"); omit to let the check try 1, 100 and 1,000. */
  basis?: number;
  discountPercent?: number;
  lineTotal?: number;
  lineTotalIncGst?: number;
}

export interface LineCheck {
  status: 'match' | 'mismatch' | 'not-checked';
  /** Basis that makes the arithmetic work. */
  basis?: number;
  /** The total only works with the discount applied. */
  discountApplied?: boolean;
  /** The total only works if the price includes GST. */
  incGst?: boolean;
  expected?: number;
  shown?: number;
}

const nearMoney = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.005);

/**
 * Checks quantity × price ÷ basis × (1 − discount) against the line total.
 * Never guesses: it only reports which reading (if any) the document's own
 * arithmetic supports.
 */
export function reconcileLine(i: LineCheckInput): LineCheck {
  const q = i.quantity;
  const p = i.price;
  if (!q || !p || q <= 0 || p <= 0) return { status: 'not-checked' };
  const ex = i.lineTotal;
  const inc = i.lineTotalIncGst;
  if (ex === undefined && inc === undefined) return { status: 'not-checked' };
  const d = i.discountPercent && i.discountPercent > 0 && i.discountPercent < 100 ? i.discountPercent : 0;
  const bases = i.basis ? [i.basis] : [1, 100, 1000];
  const factors = d ? [1 - d / 100, 1] : [1];
  for (const b of bases) {
    for (const f of factors) {
      const exp = (q * p * f) / b;
      if (ex !== undefined ? nearMoney(exp, ex) : nearMoney(exp * 1.1, inc as number)) {
        return { status: 'match', basis: b, discountApplied: f !== 1, expected: exp, shown: ex ?? inc };
      }
    }
  }
  for (const b of bases) {
    for (const f of factors) {
      const exp = (q * p * f) / b;
      if (ex !== undefined ? nearMoney(exp, ex * 1.1) : nearMoney(exp, inc as number)) {
        return { status: 'match', basis: b, discountApplied: f !== 1, incGst: true, expected: exp, shown: ex ?? inc };
      }
    }
  }
  const exp = (q * p * factors[0]) / bases[0];
  return { status: 'mismatch', basis: i.basis, expected: exp, shown: ex ?? inc };
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
  // "4LTR", "1LTR", "20KG" written without "per": a container size, not a price per
  // litre — confirm. "per kg" / "/L" stay a genuine measure basis.
  if (qty !== undefined && /^\d/.test(s) && (unit === 'litre' || unit === 'kg')) {
    return { quantity: 1, unit: 'each', interpreted: `"${(raw || '').trim()}" read as one ${(raw || '').trim()} container (price per container)` };
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
  | 'not-a-product'
  | 'freight'
  | 'zero-price'
  | 'negative-price'
  | 'unreadable-price'
  | 'poa'
  | 'missing-price'
  | 'ambiguous-basis'
  | 'interpreted-basis'
  | 'basis-from-total'
  | 'total-mismatch'
  | 'discount-applied'
  | 'discount-unclear'
  | 'price-inc-gst'
  | 'gst-check'
  | 'pack-hint'
  | 'pack-question'
  | 'pack-unclear'
  | 'pack-mismatch'
  | 'unit-mismatch'
  | 'placeholder-code'
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

/** Quote / reference values: shown and used for checks, never saved as product data. */
export interface DraftReference {
  customerCode?: string;
  quotedQuantity?: number;
  discountPercent?: number;
  /** Price as printed, before any discount or GST conversion. */
  listPrice?: number;
  lineTotal?: number;
  gstAmount?: number;
  lineTotalIncGst?: number;
  supplierStock?: number;
  check?: LineCheck;
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
  reference: DraftReference;
  /** True when the user edited this row. */
  edited?: boolean;
  /** A genuine ambiguity the user should answer (grouped for bulk answers). */
  clarification?: PackClarification;
}

/**
 * Quote line whose quoted quantity looks like a pack the supplier sells
 * (e.g. 1,000 screws at $0.0177 each): is the item bought singly, or only in
 * packs of that quantity? Never guessed — asked, and grouped so one answer
 * can cover many similar lines.
 */
export interface PackClarification {
  kind: 'pack-from-quote';
  /** The quoted quantity that may be the pack size. */
  quantity: number;
  /** Rows with the same key are asked together. */
  groupKey: string;
  /** Price per stock unit as printed. */
  unitPrice: number;
  /** Stock unit the price refers to. */
  unit: string;
}

/** Clear non-product charges: blocked from import. */
const CHARGE_RE = /\b(freight|cartage|courier|postage|fuel levy|surcharge|delivery (charge|fee)|handling (fee|charge)|small order (fee|charge)|min(imum)? order (fee|charge)|restocking fee|pallet (charge|fee)|admin(istration)? fee|shipping (charge|fee))\b/i;
/** Words that only suggest a charge: flagged for review. */
const MAYBE_CHARGE_RE = /\b(delivery|shipping|handling)\b/i;
/** Total / tax lines that slipped into the table. */
/** Codes suppliers reuse for unrelated non-catalogue lines. */
export const PLACEHOLDER_CODE_RE = /^(sundry|sundries|misc\d*|miscellaneous|non[- ]?stock|special|specials|n\/?a|tba|tbc|various|generic|-+|\.+|\*+)$/i;
const SUMMARY_NAME_RE = /^(sub ?-?total|total|grand total|gst|tax|freight total|balance|amount due|rounding|invoice total)\b/i;

export function isFreightLine(values: Partial<Record<TargetField, string>>): boolean {
  const t = `${values.name || ''} ${values.supplierCode || ''}`;
  return CHARGE_RE.test(t) || MAYBE_CHARGE_RE.test(t);
}

export interface DraftContext {
  source: CatalogueSource;
  supplier: SupplierContext;
  lowConfidence?: boolean;
  hints?: ColumnHints;
}

const fmtMoney = (n: number) => {
  if (n >= 1 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6) return `$${n.toFixed(2)}`;
  const s = n.toFixed(5).replace(/0+$/, '');
  const [, dec = ''] = s.split('.');
  return `$${dec.length < 2 ? n.toFixed(2) : s}`;
};
const fmtQty = (n: number) => n.toLocaleString('en-AU', { maximumFractionDigits: 3 });

function readNumber(raw: string | undefined): number | undefined {
  const s = (raw || '').trim().replace(/%$/, '');
  if (!s) return undefined;
  const m = parseMoney(s);
  if (m.value !== undefined) return m.value;
  return m.issue === 'zero' ? 0 : undefined;
}

/** Pack hints written into descriptions, e.g. "12/Ctn", "20/Ct", "100/box". */
function packHintFromName(name: string): { quantity: number; word: string } | undefined {
  const m = name.match(/\b(\d{1,5})\s*\/\s*(ctn|ct|carton|box|bx|pk|pack|bag|case)\b/i);
  if (!m) return undefined;
  const w = m[2].toLowerCase();
  return { quantity: parseInt(m[1], 10), word: w.startsWith('c') && w !== 'case' ? 'carton' : UNIT_WORDS[w] ?? w };
}

/** Builds one validated draft from raw (editable) field values. */
export function buildDraft(
  key: string,
  rowNumber: number,
  values: Partial<Record<TargetField, string>>,
  ctx: DraftContext,
): CatalogueDraft {
  const v = (f: TargetField) => (values[f] || '').trim();
  const hints = ctx.hints ?? {};
  const issues: DraftIssue[] = [];
  const name = v('name');
  const rawCode = v('supplierCode') || undefined;
  // Generic codes ("SUNDRY", "MISC", "NON-STOCK") are shared by unrelated lines: they are not
  // product identifiers, so they must not drive matching or duplicate detection.
  const placeholderCode = rawCode && PLACEHOLDER_CODE_RE.test(rawCode) ? rawCode : undefined;
  const supplierCode = placeholderCode ? undefined : rawCode;
  if (placeholderCode) {
    issues.push({ level: 'info', code: 'placeholder-code', message: `Code "${placeholderCode}" is a general sundry code, not a product code — matched by name instead.` });
  }
  if (!name) issues.push({ level: 'error', code: 'missing-name', message: 'No product name — this row cannot be imported.' });
  else if (!supplierCode && SUMMARY_NAME_RE.test(name)) {
    issues.push({ level: 'error', code: 'not-a-product', message: 'This is a total or tax line, not a product.' });
  } else if (/^[\d\s\-./]+$/.test(name)) issues.push({ level: 'review', code: 'name-looks-like-code', message: 'The name looks like a number or code — check the column mapping.' });

  const chargeText = `${name} ${supplierCode || ''}`;
  const strongCharge = CHARGE_RE.test(chargeText);
  const weakCharge = !strongCharge && MAYBE_CHARGE_RE.test(chargeText);
  if (strongCharge) {
    issues.push({ level: 'error', code: 'freight', message: 'Freight / delivery charge — not a product, so it cannot be imported. Edit the name if this really is a product.' });
  } else if (weakCharge) {
    issues.push({ level: 'review', code: 'freight', message: 'Might be a delivery or handling charge rather than a stocked product.' });
  }
  const freight = strongCharge || weakCharge;

  // ---- Reference values (quote fields)
  const reference: DraftReference = {};
  if (v('customerCode')) reference.customerCode = v('customerCode');
  reference.quotedQuantity = readNumber(v('quotedQuantity'));
  reference.discountPercent = readNumber(v('discountPercent'));
  reference.lineTotal = readNumber(v('lineTotal'));
  reference.gstAmount = readNumber(v('gstAmount'));
  reference.lineTotalIncGst = readNumber(v('lineTotalIncGst'));
  reference.supplierStock = readNumber(v('supplierStock'));

  // ---- Price
  let purchasePrice: number | undefined;
  let priceRaw = v('purchasePrice');
  let incGstPrice = !!hints.priceIncGst && !!priceRaw;
  if (!priceRaw && v('purchasePriceIncGst')) { priceRaw = v('purchasePriceIncGst'); incGstPrice = true; }
  const price = parseMoney(priceRaw);
  if (price.value !== undefined) purchasePrice = price.value;
  else if (price.issue === 'zero') issues.push({ level: 'review', code: 'zero-price', message: 'Price is $0 — left blank rather than imported as free.' });
  else if (price.issue === 'negative') issues.push({ level: 'review', code: 'negative-price', message: 'Negative price (credit or discount line?) — left blank.' });
  else if (price.issue === 'poa') issues.push({ level: 'review', code: 'poa', message: 'Price on application — no price imported.' });
  else if (price.issue === 'unreadable') issues.push({ level: 'review', code: 'unreadable-price', message: `Price "${priceRaw}" could not be read — left blank.` });
  else if (name && !freight) issues.push({ level: 'info', code: 'missing-price', message: 'No price — orders will show no line total until one is added.' });
  if (purchasePrice !== undefined) reference.listPrice = purchasePrice;
  if (purchasePrice !== undefined && incGstPrice) {
    purchasePrice = round6(purchasePrice / 1.1);
    issues.push({ level: 'review', code: 'price-inc-gst', message: `Price includes GST — converted to ${fmtMoney(purchasePrice)} ex GST (÷ 1.1). Confirm.` });
  }

  // ---- Pack / order unit
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
    orderUnit = `${hints.packWord ?? 'pack'} of ${unitsPerOrderUnit.toLocaleString('en-AU')}`;
    issues.push({ level: 'info', code: 'derived-order-unit', message: `Order unit set to "${orderUnit}" from the pack quantity.` });
  }

  // ---- Price basis
  let priceBasisQuantity: number | undefined;
  let priceBasisUnit: string | undefined;
  let basisKnown = false;
  let basisAmbiguous = false;
  const basisRaw = v('priceBasisQuantity');
  if (basisRaw) {
    const b = parsePriceBasis(basisRaw);
    if (b.ambiguous) {
      basisAmbiguous = true;
    } else {
      priceBasisQuantity = b.quantity;
      priceBasisUnit = b.unit;
      basisKnown = true;
      if (b.interpreted) issues.push({ level: 'review', code: 'interpreted-basis', message: `${b.interpreted} — confirm.` });
    }
  } else if (hints.priceBasis?.quantity) {
    priceBasisQuantity = hints.priceBasis.quantity;
    priceBasisUnit = hints.priceBasis.unit;
    basisKnown = true;
  }
  const basisUnitRaw = v('priceBasisUnit');
  if (basisUnitRaw) priceBasisUnit = UNIT_WORDS[basisUnitRaw.toLowerCase()] ?? basisUnitRaw;

  // ---- Check the price against the document's own arithmetic
  const listPrice = reference.listPrice;
  const check = reconcileLine({
    quantity: reference.quotedQuantity,
    price: listPrice,
    basis: basisKnown ? priceBasisQuantity : undefined,
    discountPercent: reference.discountPercent,
    lineTotal: reference.lineTotal,
    lineTotalIncGst: reference.lineTotal === undefined ? reference.lineTotalIncGst : undefined,
  });
  reference.check = check;
  const disc = reference.discountPercent ?? 0;
  if (check.status === 'match' && listPrice !== undefined) {
    const shown = fmtMoney(check.shown ?? 0);
    if (!basisKnown && check.basis && check.basis !== 1) {
      priceBasisQuantity = check.basis;
      priceBasisUnit = priceBasisUnit ?? 'each';
      basisKnown = true;
      issues.push({ level: 'info', code: 'basis-from-total', message: `Priced per ${fmtQty(check.basis)} — worked out from the line total ${shown}.` });
      basisAmbiguous = false;
    }
    if (check.discountApplied && !incGstPrice) {
      purchasePrice = round6(listPrice * (1 - disc / 100));
      issues.push({ level: 'info', code: 'discount-applied', message: `${fmtQty(disc)}% discount applied: listed ${fmtMoney(listPrice)} → your price ${fmtMoney(purchasePrice)} (matches the line total ${shown}).` });
    } else if (disc > 0) {
      issues.push({ level: 'review', code: 'discount-unclear', message: `A ${fmtQty(disc)}% discount is shown, but the line total matches the undiscounted price — check which price is yours.` });
    }
    if (check.incGst && !incGstPrice && purchasePrice !== undefined) {
      purchasePrice = round6(purchasePrice / 1.1);
      issues.push({ level: 'review', code: 'price-inc-gst', message: `The line total suggests this price includes GST — converted to ${fmtMoney(purchasePrice)} ex GST. Confirm.` });
    }
  } else if (check.status === 'mismatch') {
    const alt = basisKnown
      ? reconcileLine({
          quantity: reference.quotedQuantity, price: listPrice, discountPercent: reference.discountPercent,
          lineTotal: reference.lineTotal, lineTotalIncGst: reference.lineTotal === undefined ? reference.lineTotalIncGst : undefined,
        })
      : { status: 'mismatch' as const };
    const msg = alt.status === 'match' && alt.basis && alt.basis !== priceBasisQuantity
      ? `The line total fits a price per ${fmtQty(alt.basis)}, but the price basis says per ${fmtQty(priceBasisQuantity ?? 1)}. Check the price basis.`
      : `Quantity × price ${disc ? '× discount ' : ''}does not equal the line total (works out to ${fmtMoney(check.expected ?? 0)}; the document shows ${fmtMoney(check.shown ?? 0)}). Check the price, price basis and discount.`;
    issues.push({ level: 'review', code: 'total-mismatch', message: msg });
  } else if (disc > 0 && listPrice !== undefined) {
    issues.push({ level: 'review', code: 'discount-unclear', message: `A ${fmtQty(disc)}% discount is shown — it is not clear whether ${fmtMoney(listPrice)} is before or after the discount. Price kept as listed.` });
  }
  if (basisAmbiguous) {
    const b = parsePriceBasis(basisRaw);
    issues.push({ level: 'review', code: 'ambiguous-basis', message: `Price basis unclear: ${b.ambiguous}. Price kept, basis needs confirming.` });
  }
  if (reference.lineTotal !== undefined && reference.gstAmount !== undefined && reference.lineTotal > 0) {
    if (reference.gstAmount === 0) issues.push({ level: 'info', code: 'gst-check', message: 'No GST charged on this line.' });
    else if (!nearMoney(reference.gstAmount, reference.lineTotal * 0.1)) {
      issues.push({ level: 'info', code: 'gst-check', message: `GST ${fmtMoney(reference.gstAmount)} is not 10% of ${fmtMoney(reference.lineTotal)} — prices kept ex GST as listed.` });
    }
  }

  // Price per item or per pack? Only flag when the document doesn't say.
  if (purchasePrice !== undefined && !basisRaw && !basisKnown && unitsPerOrderUnit !== undefined && unitsPerOrderUnit > 1) {
    issues.push({
      level: 'review',
      code: 'ambiguous-basis',
      message: `Is ${fmtMoney(purchasePrice)} per item or per ${orderUnit}? Set "Price per" to confirm.`,
    });
  }
  const hint = name ? packHintFromName(name) : undefined;
  if (hint && unitsPerOrderUnit === undefined) {
    if (basisKnown || basisRaw) {
      issues.push({
        level: 'info',
        code: 'pack-hint',
        message: `Description mentions ${hint.quantity} per ${hint.word}; the price is per ${priceBasisQuantity && priceBasisQuantity !== 1 ? `${fmtQty(priceBasisQuantity)} ` : ''}${priceBasisUnit ?? 'each'} as listed, so the ${hint.word} size was not applied.`,
      });
    } else if (purchasePrice !== undefined) {
      issues.push({
        level: 'review',
        code: 'ambiguous-basis',
        message: `Description mentions ${hint.quantity} per ${hint.word} but no price unit is given — is ${fmtMoney(purchasePrice)} per item or per ${hint.word}?`,
      });
    }
  }

  let stockUnit = v('stockUnit') ? (UNIT_WORDS[v('stockUnit').toLowerCase()] ?? v('stockUnit')) : undefined;
  // Priced per roll / pack / pair / metre with no pack size: that is the unit you buy and count.
  if (!stockUnit && unitsPerOrderUnit === undefined && priceBasisQuantity === 1 && priceBasisUnit && priceBasisUnit !== 'each') {
    stockUnit = priceBasisUnit;
  }
  if (priceBasisUnit && ['metre', 'kg', 'litre'].includes(priceBasisUnit) && unitsPerOrderUnit !== undefined && unitsPerOrderUnit > 1
    && stockUnit !== priceBasisUnit && !/\b(m|lm|metres?|kg|l|litres?)\b/i.test(orderUnit || '')) {
    issues.push({
      level: 'review',
      code: 'unit-mismatch',
      message: `Priced per ${priceBasisUnit}, but the pack quantity (${fmtQty(unitsPerOrderUnit)}) isn't in ${priceBasisUnit}s — confirm how this is ordered and counted.`,
    });
  }

  const barcode = v('barcode').replace(/\s+/g, '');
  if (barcode && !/^[0-9A-Za-z\-]{4,32}$/.test(barcode)) {
    issues.push({ level: 'review', code: 'invalid-barcode', message: `Barcode "${v('barcode')}" looks invalid.` });
  }
  if (name && !supplierCode && !barcode) {
    issues.push({ level: 'info', code: 'missing-identifier', message: 'No supplier code or barcode — matched by name only.' });
  }

  const currentStock = parseCount(v('currentStock'));
  if (currentStock === null) issues.push({ level: 'review', code: 'invalid-number', message: `Stock on hand "${v('currentStock')}" is not a number.` });
  const minStock = parseCount(v('minStock'));
  if (minStock === null) issues.push({ level: 'review', code: 'invalid-number', message: `Minimum stock "${v('minStock')}" is not a number.` });
  const sell = parseMoney(v('sellPrice'));

  if (ctx.source === 'pdf') {
    if (ctx.lowConfidence) issues.push({ level: 'review', code: 'pdf-low-confidence', message: 'Numbers in this PDF row did not line up with the columns — check every value.' });
    else issues.push({ level: 'info', code: 'pdf-source', message: 'Read from a PDF — check against the original.' });
  }

  const supplierName = ctx.supplier.name || v('supplier') || 'Unknown Supplier';
  const supplierEmail = ctx.supplier.name ? ctx.supplier.email : (/.+@.+\..+/.test(v('supplierEmail')) ? v('supplierEmail') : undefined);
  const basisQty = priceBasisQuantity ?? 1;

  const product: Product = {
    id: '',
    name,
    description: v('description') || name,
    sku: v('sku') || reference.customerCode || supplierCode || (name ? generateSKU(name) : ''),
    // Left empty for matching; a barcode is generated only at insert time.
    barcode,
    category: v('category') || 'Uncategorized',
    supplier: supplierName,
    supplierEmail: supplierEmail || undefined,
    supplierId: ctx.supplier.id,
    price: sell.value ?? 0,
    // Legacy cost per stock unit, derived only from a real purchase price.
    cost: purchasePrice !== undefined ? round6(purchasePrice / basisQty) : 0,
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

  // ---- Pack question: a quoted quantity that genuinely looks like a pack.
  // Asked only when the document says nothing about packs or order units and
  // the numbers carry a real pack signal (round quantity of low-cost items,
  // or sub-cent pricing that is only meaningful in bulk). Never applied
  // automatically — the user answers (in bulk or per row).
  let clarification: PackClarification | undefined;
  const q = reference.quotedQuantity;
  const basisUnitForQ = priceBasisUnit ?? 'each';
  if (
    purchasePrice !== undefined && q !== undefined && Number.isInteger(q) && q > 1
    && !orderUnit && unitsPerOrderUnit === undefined && !hint && !v('stockUnit')
    && basisQty === 1 && basisUnitForQ === 'each'
  ) {
    const subCent = Math.abs(purchasePrice * 100 - Math.round(purchasePrice * 100)) > 1e-6;
    const packSignal = (q >= 50 && q % 50 === 0 && purchasePrice < 1) || (subCent && q >= 10 && q % 10 === 0);
    if (packSignal) {
      clarification = { kind: 'pack-from-quote', quantity: q, groupKey: `${q}|${basisUnitForQ}`, unitPrice: purchasePrice, unit: basisUnitForQ };
      issues.push({
        level: 'review',
        code: 'pack-question',
        message: `Quoted ${fmtQty(q)} at ${fmtMoney(purchasePrice)} each — is this sold in packs of ${fmtQty(q)}, or ordered individually?`,
      });
    }
  }

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
    reference,
    ...(clarification ? { clarification } : {}),
  };
}

// ============================================================================
// Clarifications (pack questions) — pure helpers used by the review screen
// ============================================================================

export type PackAnswer = 'pack' | 'individual';

/**
 * Field values for a row after answering its pack question. The price is
 * kept exactly as printed (per each); only the order unit and pack quantity
 * are recorded, so the purchasing maths stays transparent:
 *   pack       → "pack of 1,000", 1,000 per pack  (3 packs = 3,000 each)
 *   individual → ordered one at a time, 1 per order unit
 */
export function answerPackQuestion(
  values: Partial<Record<TargetField, string>>,
  clarification: PackClarification,
  answer: PackAnswer,
): Partial<Record<TargetField, string>> {
  const next = { ...values };
  if (answer === 'pack') {
    next.orderUnit = `pack of ${clarification.quantity.toLocaleString('en-AU')}`;
    next.unitsPerOrderUnit = String(clarification.quantity);
    if (!(next.priceBasisQuantity || '').trim()) next.priceBasisQuantity = '1';
  } else {
    next.orderUnit = (values.stockUnit || '').trim() || clarification.unit || 'each';
    next.unitsPerOrderUnit = '1';
  }
  return next;
}

export interface ClarificationGroup {
  groupKey: string;
  quantity: number;
  unit: string;
  /** Row keys in this group, in document order. */
  keys: string[];
}

/** Open pack questions grouped by quoted quantity, for bulk answers with per-row exceptions. */
export function clarificationGroups(rows: CatalogueDraft[]): ClarificationGroup[] {
  const groups = new Map<string, ClarificationGroup>();
  for (const r of rows) {
    const c = r.clarification;
    if (!c) continue;
    const g = groups.get(c.groupKey) ?? { groupKey: c.groupKey, quantity: c.quantity, unit: c.unit, keys: [] };
    g.keys.push(r.key);
    groups.set(c.groupKey, g);
  }
  return [...groups.values()].sort((a, b) => b.keys.length - a.keys.length || b.quantity - a.quantity);
}

/** Applies one answer to many rows (bulk), returning the new overrides. */
export function applyPackAnswers(
  overrides: DraftOverrides,
  rows: CatalogueDraft[],
  keys: string[],
  answer: PackAnswer,
): DraftOverrides {
  const want = new Set(keys);
  const next = { ...overrides };
  for (const r of rows) {
    if (!want.has(r.key) || !r.clarification) continue;
    next[r.key] = answerPackQuestion(r.values, r.clarification, answer);
  }
  return next;
}

/** Purchasing fields that a confirmed update may change on an existing product. */
export type PurchasingUpdate = Pick<Product, 'orderUnit' | 'unitsPerOrderUnit' | 'purchasePrice' | 'priceBasisQuantity' | 'priceBasisUnit' | 'supplierCode' | 'cost'>;

export interface PurchasingChange {
  field: string;
  before: string;
  after: string;
}

/**
 * Purchasing-only update for a conflict row that is the same product and
 * differs only in purchasing details. Returns null when the row is not
 * eligible. Never includes name, barcode, SKU, category, stock, sell price or
 * supplier — and order history snapshots are never touched.
 */
export function purchasingUpdateFor(row: ReviewedDraft): { productId: string; updates: Partial<PurchasingUpdate>; changes: PurchasingChange[] } | null {
  const existing = row.match.match;
  if (row.category !== 'conflict' || !row.match.purchasingOnly || !existing || row.status === 'invalid') return null;
  const p = row.product;
  const updates: Partial<PurchasingUpdate> = {};
  const changes: PurchasingChange[] = [];
  const show = (n: number | string | undefined) => (n === undefined || n === '' ? 'none' : String(n));
  const textDiff = (a?: string, b?: string) => (a || '').trim().toLowerCase() !== (b || '').trim().toLowerCase();
  const numDiff = (a?: number, b?: number) => a !== undefined && (b === undefined || Math.abs(a - b) > 1e-9);
  if (p.orderUnit && textDiff(p.orderUnit, existing.orderUnit)) {
    updates.orderUnit = p.orderUnit;
    changes.push({ field: 'Order unit', before: show(existing.orderUnit), after: p.orderUnit });
  }
  if (numDiff(p.unitsPerOrderUnit, existing.unitsPerOrderUnit)) {
    updates.unitsPerOrderUnit = p.unitsPerOrderUnit;
    changes.push({ field: 'Pack quantity', before: show(existing.unitsPerOrderUnit), after: show(p.unitsPerOrderUnit) });
  }
  if (numDiff(p.purchasePrice, existing.purchasePrice)) {
    updates.purchasePrice = p.purchasePrice;
    changes.push({ field: 'Purchase price (ex GST)', before: existing.purchasePrice !== undefined ? fmtMoney(existing.purchasePrice) : 'none', after: fmtMoney(p.purchasePrice as number) });
  }
  if (numDiff(p.priceBasisQuantity, existing.priceBasisQuantity)) {
    updates.priceBasisQuantity = p.priceBasisQuantity;
    changes.push({ field: 'Price per (quantity)', before: show(existing.priceBasisQuantity), after: show(p.priceBasisQuantity) });
  }
  if (p.priceBasisUnit && textDiff(p.priceBasisUnit, existing.priceBasisUnit)) {
    updates.priceBasisUnit = p.priceBasisUnit;
    changes.push({ field: 'Price per (unit)', before: show(existing.priceBasisUnit), after: p.priceBasisUnit });
  }
  if (p.supplierCode && !(existing.supplierCode || '').trim()) {
    updates.supplierCode = p.supplierCode;
    changes.push({ field: 'Supplier code', before: 'none', after: p.supplierCode });
  }
  if (changes.length === 0) return null;
  // Keep the legacy per-stock-unit cost consistent with the new pricing.
  const merged = { ...existing, ...updates };
  const resolved = resolvePricing(merged);
  if (merged.purchasePrice !== undefined && resolved.ok && resolved.basisInStockUnits > 0) {
    updates.cost = round6(merged.purchasePrice / resolved.basisInStockUnits);
  }
  return { productId: existing.id, updates, changes };
}

/** Row edits kept separately from the file so mapping changes never lose them. */
export type DraftOverrides = Record<string, Partial<Record<TargetField, string>>>;

/** Stable key for a table row. */
export const draftKey = (rowNumber: number) => `r${rowNumber}`;

/** Raw field values for one table row under a mapping. */
export function rowValues(
  cells: string[],
  mapping: ColumnMapping,
  supplier: SupplierContext,
): Partial<Record<TargetField, string>> {
  const values: Partial<Record<TargetField, string>> = {};
  mapping.forEach((field, col) => {
    if (!field) return;
    // The selected supplier record wins over any supplier column in the file.
    if ((field === 'supplier' || field === 'supplierEmail') && supplier.name) return;
    const cell = cells[col] ?? '';
    if (cell) values[field] = values[field] ? `${values[field]} ${cell}` : cell;
  });
  return values;
}

/** Builds drafts for every data row of a table using the column mapping (and any user edits). */
export function buildDrafts(
  table: TableView,
  mapping: ColumnMapping,
  ctx: Omit<DraftContext, 'lowConfidence'>,
  sheet?: SheetData,
  overrides: DraftOverrides = {},
): CatalogueDraft[] {
  const low = new Set(sheet?.lowConfidenceRows ?? []);
  const hints = ctx.hints ?? columnHints(table.headers, mapping);
  return table.rows.map(row => {
    const key = draftKey(row.rowNumber);
    const edited = overrides[key];
    const values = edited ? { ...edited } : rowValues(row.cells, mapping, ctx.supplier);
    const d = buildDraft(key, row.rowNumber, values, {
      ...ctx,
      hints,
      // Edited rows have been checked by the user.
      lowConfidence: !edited && low.has(row.rowNumber - 1),
    });
    return edited ? { ...d, edited: true } : d;
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
  return drafts.map(raw => {
    const match: RowMatch = byKey.get(raw.key) ?? { status: 'new', reason: '' };
    let d = raw;
    // The catalogue already knows how this product is ordered: don't ask again.
    if (d.clarification && (match.match?.orderUnit || '').trim()) {
      const issues = d.issues.filter(i => i.code !== 'pack-question');
      const status: DraftStatus = issues.some(i => i.level === 'error') ? 'invalid' : issues.some(i => i.level === 'review') ? 'review' : 'ready';
      d = { ...d, issues, status, includeByDefault: status === 'ready', clarification: undefined };
    }
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

// ============================================================================
// Selection and exclusion (session-only: excluding never deletes anything)
// ============================================================================

export interface ReviewSelection {
  selected: ReadonlySet<string>;
  excluded: ReadonlySet<string>;
}

export const emptySelection = (): ReviewSelection => ({ selected: new Set(), excluded: new Set() });

/** Rows that bulk actions may ever select: importable and not excluded. */
const selectable = (r: ReviewedDraft, sel: ReviewSelection) => r.importable && !sel.excluded.has(r.key);

/** Adds default selections (ready rows) for rows not seen before; keeps every existing choice. */
export function withDefaultSelection(rows: ReviewedDraft[], sel: ReviewSelection, seen: ReadonlySet<string>): ReviewSelection {
  const selected = new Set(sel.selected);
  for (const r of rows) if (!seen.has(r.key) && r.includeByDefault && selectable(r, sel)) selected.add(r.key);
  return { selected, excluded: sel.excluded };
}

export function toggleSelected(sel: ReviewSelection, key: string): ReviewSelection {
  const selected = new Set(sel.selected);
  if (selected.has(key)) selected.delete(key);
  else if (!sel.excluded.has(key)) selected.add(key);
  return { selected, excluded: sel.excluded };
}

/** Adds every Ready row (keeps other selections). */
export function selectAllReady(rows: ReviewedDraft[], sel: ReviewSelection): ReviewSelection {
  const selected = new Set(sel.selected);
  for (const r of rows) if (r.category === 'ready' && selectable(r, sel)) selected.add(r.key);
  return { selected, excluded: sel.excluded };
}

/**
 * Selects every importable row that is not excluded — Ready and Needs Review.
 * Never selects existing products, in-file duplicates, conflicts or rows that cannot be imported.
 */
export function selectAllRemaining(rows: ReviewedDraft[], sel: ReviewSelection): ReviewSelection {
  const selected = new Set<string>();
  for (const r of rows) if (selectable(r, sel)) selected.add(r.key);
  return { selected, excluded: sel.excluded };
}

/** Clears the selection; exclusions are kept. */
export function deselectAll(sel: ReviewSelection): ReviewSelection {
  return { selected: new Set(), excluded: sel.excluded };
}

export function excludeRows(sel: ReviewSelection, keys: string[]): ReviewSelection {
  const selected = new Set(sel.selected);
  const excluded = new Set(sel.excluded);
  for (const k of keys) { excluded.add(k); selected.delete(k); }
  return { selected, excluded };
}

/** Restored rows come back unselected. */
export function restoreRows(sel: ReviewSelection, keys: string[]): ReviewSelection {
  const excluded = new Set(sel.excluded);
  for (const k of keys) excluded.delete(k);
  return { selected: sel.selected, excluded };
}

/** Rows that will actually be imported. */
export function selectedForImport(rows: ReviewedDraft[], sel: ReviewSelection): ReviewedDraft[] {
  return rows.filter(r => selectable(r, sel) && sel.selected.has(r.key));
}

export type ReviewBucket = 'ready' | 'review' | 'existing' | 'cannot' | 'excluded';

/** One bucket per row: excluded wins, then existing/duplicate/conflict, then validation. */
export function bucketOf(r: ReviewedDraft, sel: ReviewSelection): ReviewBucket {
  if (sel.excluded.has(r.key)) return 'excluded';
  if (r.category === 'existing' || r.category === 'conflict') return 'existing';
  if (r.category === 'invalid') return 'cannot';
  return r.category === 'review' ? 'review' : 'ready';
}

export interface ReviewCounts {
  /** Lines in the source (PDF text lines, or spreadsheet rows including headings). */
  sourceRows: number;
  /** Rows recognised as products. */
  productRows: number;
  ready: number;
  review: number;
  /** Already in your catalogue, repeated in the file, or conflicting with an existing product. */
  existing: number;
  excluded: number;
  cannotImport: number;
  selected: number;
}

export function countReview(rows: ReviewedDraft[], sel: ReviewSelection, sourceRows: number): ReviewCounts {
  const c: ReviewCounts = { sourceRows, productRows: rows.length, ready: 0, review: 0, existing: 0, excluded: 0, cannotImport: 0, selected: 0 };
  for (const r of rows) {
    const b = bucketOf(r, sel);
    if (b === 'ready') c.ready++;
    else if (b === 'review') c.review++;
    else if (b === 'existing') c.existing++;
    else if (b === 'excluded') c.excluded++;
    else c.cannotImport++;
  }
  c.selected = selectedForImport(rows, sel).length;
  return c;
}

/** Source line count for a sheet: PDF text lines, or every spreadsheet row. */
export function sourceRowCount(sheet: SheetData | undefined): number {
  if (!sheet) return 0;
  return sheet.layout?.sourceLines ?? sheet.rows.length;
}

// ============================================================================
// Import accounting (completion summary)
// ============================================================================

export interface SaveOutcome {
  imported: number;
  skippedAsExisting: number;
  failed: number;
}

export interface ImportAccounting {
  sourceRows: number;
  productRows: number;
  selected: number;
  /** Saved as new products. */
  imported: number;
  /** Selected, but found to already exist when saving. */
  existingAtSave: number;
  /** Selected, but the save failed. */
  saveFailed: number;
  /** Selected, but never attempted (save stopped early). */
  notAttempted: number;
  /** Already in the catalogue / duplicates / conflicts at review. */
  existingSkipped: number;
  userExcluded: number;
  /** Failed validation (no name, total lines, freight charges). */
  cannotImport: number;
  /** Importable but left unticked. */
  notSelected: number;
}

/**
 * Accounts for every recognised product row exactly once. Must be computed
 * from the review state captured BEFORE saving (after saving, imported rows
 * match themselves and would be miscounted as "existing").
 */
export function buildImportAccounting(
  rows: ReviewedDraft[],
  sel: ReviewSelection,
  sourceRows: number,
  outcome: SaveOutcome,
): ImportAccounting {
  const counts = countReview(rows, sel, sourceRows);
  const selected = counts.selected;
  const imported = Math.min(outcome.imported, selected);
  const existingAtSave = Math.min(outcome.skippedAsExisting, selected - imported);
  const saveFailed = Math.min(outcome.failed, selected - imported - existingAtSave);
  return {
    sourceRows,
    productRows: rows.length,
    selected,
    imported,
    existingAtSave,
    saveFailed,
    notAttempted: selected - imported - existingAtSave - saveFailed,
    existingSkipped: counts.existing,
    userExcluded: counts.excluded,
    cannotImport: counts.cannotImport,
    notSelected: counts.ready + counts.review - selected,
  };
}

// ============================================================================
// Workflow navigation
// ============================================================================

export type ImportStep = 'supplier' | 'file' | 'columns' | 'review';
export const IMPORT_STEPS: ImportStep[] = ['supplier', 'file', 'columns', 'review'];

/** The stage Back returns to; null on the first stage (Back then leaves the workflow). */
export function stepBefore(step: ImportStep): ImportStep | null {
  const i = IMPORT_STEPS.indexOf(step);
  return i > 0 ? IMPORT_STEPS[i - 1] : null;
}
