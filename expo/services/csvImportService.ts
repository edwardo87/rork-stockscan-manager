import { Product } from '@/types/inventory';

/**
 * CSV import service for SmartStock.
 *
 * Designed for non-technical users importing Excel/Google Sheets exports.
 * Handles:
 *   - UTF-8 BOM (common in Excel exports)
 *   - Comma OR semicolon delimiters (European locale Excel uses ;)
 *   - Quoted fields with embedded commas
 *   - CR/LF line endings
 *   - Flexible column naming (see columnMapping below)
 *   - Row-level validation with line-number errors
 */

const columnMapping: Record<string, string | string[]> = {
  // Standard column names
  'name': 'name',
  'product_name': 'name',
  'item_name': 'name',
  'description': 'description',
  'sku': 'sku',
  'barcode': 'barcode',
  'category': 'category',
  'supplier': 'supplier',
  'supplier_email': 'supplierEmail',
  'supplier_e_mail': 'supplierEmail',
  'supplieremail': 'supplierEmail',
  'email': 'supplierEmail',
  'supplier_contact': 'supplierEmail',
  'price': 'price',
  'selling_price': 'price',
  'cost': 'cost',
  'cost_price': 'cost',
  'current_stock': 'currentStock',
  'stock': 'currentStock',
  'quantity': 'currentStock',
  'qty': 'currentStock',
  'min_stock': 'minStock',
  'minimum_stock': 'minStock',
  'minstock': 'minStock',
  'reorder_level': 'minStock',
  'unit': 'unit',
  // Chapter 3 — dedicated purchasing fields (never overloaded onto `unit`).
  'supplier_code': 'supplierCode',
  'suppliercode': 'supplierCode',
  'supplier_product_code': 'supplierCode',
  'supplier_item_code': 'supplierCode',
  'stock_unit': 'stockUnit',
  'stockunit': 'stockUnit',
  'order_unit': 'orderUnit',
  'orderunit': 'orderUnit',
  'ordering_unit': 'orderUnit',
  'units_per_order_unit': 'unitsPerOrderUnit',
  'unitsperorderunit': 'unitsPerOrderUnit',
  'pack_quantity': 'unitsPerOrderUnit',
  'pack_qty': 'unitsPerOrderUnit',
  'units_per_pack': 'unitsPerOrderUnit',
  'purchase_price': 'purchasePrice',
  'purchaseprice': 'purchasePrice',
  'purchase_price_ex_gst': 'purchasePrice',
  'price_ex_gst': 'purchasePrice',
  'price_basis_quantity': 'priceBasisQuantity',
  'price_basis_qty': 'priceBasisQuantity',
  'price_basis_unit': 'priceBasisUnit',
  // Legacy / alternative
  'item_description': ['name', 'description'],
  'itemcode': 'sku',
  'last_ordered': 'lastOrdered',
  // NOTE: 'pack_size' is deliberately NOT mapped to `unit` any more — that
  // overload hid pack quantities inside a stock-unit field. Pack-style values
  // belong in units_per_order_unit / pack_quantity above.
};

export interface CSVImportResult {
  products: Product[];
  imported: number;
  skipped: number;
  warnings: string[];
}

/**
 * Strips a UTF-8 BOM if present.
 */
function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/**
 * Detects whether the file uses ';' or ',' as a delimiter.
 * Looks at the header row only.
 */
function detectDelimiter(headerLine: string): ',' | ';' {
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  return semiCount > commaCount ? ';' : ',';
}

/**
 * Normalises a header cell to a snake_case lookup key.
 */
function normaliseHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Parses a single CSV line, supporting quoted values and a chosen delimiter.
 */
export function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map(v => v.trim());
}

/**
 * Validates the structure of a CSV before parsing. Returns
 * row-level errors (with line numbers) suitable to display to the user.
 */
export function validateCSVFormat(csvContent: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const cleaned = stripBom(csvContent);
    const lines = cleaned.split(/\r?\n/).filter(line => line.trim().length > 0);

    if (lines.length < 2) {
      return { isValid: false, errors: ['CSV must contain a header row and at least one data row.'] };
    }

    const delimiter = detectDelimiter(lines[0]);
    const headers = parseCSVLine(lines[0], delimiter).map(normaliseHeader);

    const hasNameColumn = headers.some(h =>
      ['name', 'product_name', 'item_name', 'item_description'].includes(h),
    );
    if (!hasNameColumn) {
      errors.push('Missing a product name column. Add one of: name, product_name, item_name.');
    }

    const headerCount = headers.length;
    for (let i = 1; i < Math.min(lines.length, 11); i++) {
      const values = parseCSVLine(lines[i], delimiter);
      if (values.length !== headerCount) {
        errors.push(`Row ${i + 1}: has ${values.length} columns but header has ${headerCount}.`);
      }
    }

    return { isValid: errors.length === 0, errors };
  } catch {
    return { isValid: false, errors: ['Could not read the CSV file. Please re-export it from Excel.'] };
  }
}

/**
 * Parses CSV content into Product objects.
 * Throws if the file is unrecoverable; collects per-row warnings for soft errors.
 */
export function parseCSV(csvContent: string): Product[] {
  return parseCSVWithSummary(csvContent).products;
}

/**
 * Full parse with import summary (count + warnings). Use this from the UI
 * to show users exactly how many rows succeeded vs. were skipped.
 */
export function parseCSVWithSummary(csvContent: string): CSVImportResult {
  const cleaned = stripBom(csvContent);
  const lines = cleaned.split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error('CSV must contain a header row and at least one data row.');
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCSVLine(lines[0], delimiter).map(normaliseHeader);

  const hasNameColumn = headers.some(h =>
    ['name', 'product_name', 'item_name', 'item_description'].includes(h),
  );
  if (!hasNameColumn) {
    throw new Error('CSV must contain a product name column (name, product_name, or item_name).');
  }

  const products: Product[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine || !rawLine.trim()) continue; // empty line

    const values = parseCSVLine(rawLine, delimiter);
    if (values.length !== headers.length) {
      warnings.push(`Row ${i + 1}: column count mismatch — skipped.`);
      skipped++;
      continue;
    }

    const draft: Record<string, string | number> = {};
    headers.forEach((header, index) => {
      const mapping = columnMapping[header];
      const value = values[index] ?? '';
      if (!mapping || !value) return;

      if (Array.isArray(mapping)) {
        mapping.forEach(field => { draft[field] = value; });
      } else if (['currentStock', 'minStock'].includes(mapping)) {
        const n = parseInt(value, 10);
        draft[mapping] = Number.isFinite(n) ? n : 0;
      } else if (mapping === 'supplierEmail') {
        const trimmed = value.trim();
        // Basic sanity check — skip obvious non-emails so we don't email garbage.
        draft[mapping] = /.+@.+\..+/.test(trimmed) ? trimmed : '';
      } else if (['price', 'cost'].includes(mapping)) {
        // Tolerate currency symbols / commas as thousand sep
        const cleanedNum = value.replace(/[^0-9.\-]/g, '');
        const n = parseFloat(cleanedNum);
        draft[mapping] = Number.isFinite(n) ? n : 0;
      } else if (['unitsPerOrderUnit', 'priceBasisQuantity'].includes(mapping)) {
        // Pack quantities / price bases may include units ("100 pcs") — take
        // the leading number; unparseable values are ignored rather than 0.
        const cleanedNum = value.replace(/[^0-9.]/g, '');
        const n = parseFloat(cleanedNum);
        if (Number.isFinite(n) && n > 0) draft[mapping] = n;
      } else if (mapping === 'purchasePrice') {
        const cleanedNum = value.replace(/[^0-9.\-]/g, '');
        const n = parseFloat(cleanedNum);
        if (Number.isFinite(n) && n > 0) draft[mapping] = n;
      } else {
        draft[mapping] = value;
      }
    });

    const name = (draft.name as string | undefined)?.trim();
    if (!name) {
      warnings.push(`Row ${i + 1}: missing product name — skipped.`);
      skipped++;
      continue;
    }

    const productSku = (draft.sku as string | undefined) || generateSKU(name);
    const productBarcode = (draft.barcode as string | undefined) || generateBarcode();

    const finalProduct: Product = {
      id: generateProductId(i, productSku),
      name,
      description: (draft.description as string | undefined) || name,
      sku: productSku,
      barcode: productBarcode,
      category: (draft.category as string | undefined) || 'Uncategorized',
      supplier: (draft.supplier as string | undefined) || 'Unknown Supplier',
      supplierEmail: (draft.supplierEmail as string | undefined) || undefined,
      price:
        (draft.price as number | undefined) ||
        (typeof draft.cost === 'number' ? Math.round(draft.cost * 1.3 * 100) / 100 : 0),
      cost: (draft.cost as number | undefined) || 0,
      currentStock: (draft.currentStock as number | undefined) || 0,
      minStock: (draft.minStock as number | undefined) || 0,
      unit: (draft.unit as string | undefined) || 'each',
      // ---- Chapter 3 purchasing fields (all optional; absent = unset) ----
      supplierCode: (draft.supplierCode as string | undefined)?.trim() || undefined,
      stockUnit: (draft.stockUnit as string | undefined)?.trim() || undefined,
      orderUnit: (draft.orderUnit as string | undefined)?.trim() || undefined,
      unitsPerOrderUnit: (draft.unitsPerOrderUnit as number | undefined) || undefined,
      purchasePrice: (draft.purchasePrice as number | undefined) || undefined,
      priceBasisQuantity: (draft.priceBasisQuantity as number | undefined) || undefined,
      priceBasisUnit: (draft.priceBasisUnit as string | undefined)?.trim() || undefined,
      lastOrdered: (draft.lastOrdered as string | undefined) || undefined,
    };

    products.push(finalProduct);
  }

  if (products.length === 0) {
    throw new Error('No valid products found in CSV file.');
  }

  return {
    products,
    imported: products.length,
    skipped,
    warnings,
  };
}

/**
 * Generates an RFC4122 v4 UUID. Supabase `products.id` is a `uuid` column,
 * so non-UUID strings (e.g. `PROD_ABCD_123456_1`) cause `invalid input syntax
 * for type uuid` errors on bulk insert.
 */
export function generateProductId(_index: number, _identifier: string): string {
  // Prefer the platform's crypto.randomUUID when available (modern Hermes / web).
  const g: { crypto?: { randomUUID?: () => string } } = globalThis as unknown as {
    crypto?: { randomUUID?: () => string };
  };
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  // Fallback v4 implementation.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateSKU(name: string): string {
  const cleanName = name.replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase();
  const words = cleanName.split(/\s+/).filter(w => w.length > 0);
  const initials = words.map(w => w.charAt(0)).join('').slice(0, 4) || 'PROD';
  const timestamp = Date.now().toString().slice(-4);
  return `${initials}${timestamp}`;
}

export function generateBarcode(): string {
  const timestamp = Date.now().toString();
  const random = Math.random().toString().slice(2, 6);
  return timestamp.slice(-8) + random;
}

/**
 * Generates a starter CSV template for non-technical users.
 */
export function generateCSVTemplate(): string {
  const headers = [
    'name', 'description', 'sku', 'barcode', 'category', 'supplier', 'supplier_email',
    'cost', 'price', 'current_stock', 'min_stock', 'unit',
    // Chapter 3 purchasing columns (all optional)
    'supplier_code', 'stock_unit', 'order_unit', 'units_per_order_unit',
    'purchase_price', 'price_basis_quantity', 'price_basis_unit',
  ];

  const sampleData = [
    // Screws: counted individually, ordered by 1,000, priced per 100.
    ['Countersunk Screw 8g x 50mm', 'Zinc countersunk screws', 'SCREW8G', '1234567890123', 'Fasteners', 'Fastener Supplies', 'orders@fastenersupplies.com', '10.50', '15.99', '2500', '1000', 'each', 'FS-8G50', 'each', 'box of 1,000', '1000', '12.50', '100', 'each'],
    // Silicone: counted by cartridge, ordered in cartons of 12, priced per cartridge.
    ['Silicone Clear 300ml', 'Neutral cure silicone cartridge', 'SIL300', '1234567890124', 'Sealants', 'Seal Supply Co', 'sales@sealsupply.co', '4.20', '7.50', '24', '6', 'cartridge', 'SS-C300', 'cartridge', 'carton of 12', '12', '4.20', '1', 'cartridge'],
  ];

  return [headers.join(','), ...sampleData.map(row => row.join(','))].join('\n');
}

// ============================================================================
// Chapter 3 — import matching and duplicate protection
// ============================================================================

export interface ImportMatchOutcome {
  /** Rows that are genuinely new and safe to insert. */
  toAdd: Product[];
  /** Rows skipped because an identical product already exists. */
  duplicates: number;
  /** Rows skipped because the match conflicts with the existing record. */
  conflicts: number;
  /** Human-readable skip reasons (one per skipped row). */
  details: string[];
}

const norm = (s: string | undefined): string => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Two values differ meaningfully (numbers compared to the cent / 4th decimal). */
function differs(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined && b === undefined) return false;
  if (a === undefined || b === undefined) return true;
  return Math.abs(a - b) > 0.0001;
}

function textDiffers(a: string | undefined, b: string | undefined): boolean {
  return norm(a || undefined) !== norm(b || undefined);
}

export type RowMatchStatus = 'new' | 'duplicate' | 'conflict';

export interface RowMatch {
  status: RowMatchStatus;
  /** Human-readable explanation (empty for plain new rows). */
  reason: string;
  /** The existing product the row matched, when any. */
  match?: Product;
  /**
   * Conflict rows only: true when the row is the same product (same supplier,
   * stock unit and identity) and differs ONLY in purchasing details (order
   * unit, pack quantity, purchase price, price basis, or a supplier code the
   * existing product lacks). Such rows may be applied to the existing product
   * as an explicit, confirmed purchasing update — never automatically.
   */
  purchasingOnly?: boolean;
}

/**
 * Classifies incoming catalogue rows against existing products so repeated
 * supplier imports can never silently duplicate the catalogue:
 *
 *  - identity match: barcode (when the row has one), then supplier code for
 *    the same supplier, then normalised name;
 *  - row with identical meaning to the existing product → DUPLICATE (skipped);
 *  - row matching a product but carrying conflicting data (supplier, code,
 *    units, prices…) → CONFLICT (skipped and reported — never overwritten);
 *  - no match → NEW (imported).
 *
 * Unspecified/derived fields (default 'each', 'Unknown Supplier', zero
 * prices) are treated as "not provided" so they cannot cause false
 * conflicts. Existing records are NEVER modified. Returns one result per
 * incoming row, in order.
 */
export function matchRowsForImport(existing: Product[], incoming: Product[]): RowMatch[] {
  const results: RowMatch[] = [];

  // Keys of products already in the catalogue. A value of `null` marks an
  // AMBIGUOUS key (two or more existing products share it) — matching by such
  // a key must not pick a wrong product, so it falls through to conflict
  // handling rather than silently matching one of them.
  const barcodeKeys = new Map<string, Product | null>();
  const nameKeys = new Map<string, Product | null>();
  const codeKeys = new Map<string, Product | null>();
  for (const p of existing) {
    const bc = norm(p.barcode);
    if (bc) barcodeKeys.set(bc, barcodeKeys.has(bc) ? null : p);
    const nk = norm(p.name);
    if (nk) nameKeys.set(nk, nameKeys.has(nk) ? null : p);
    const sc = norm(p.supplierCode);
    if (sc) {
      const ck = `${norm(p.supplier)}|${sc}`;
      codeKeys.set(ck, codeKeys.has(ck) ? null : p);
    }
  }

  // Keys seen so far in this import batch (in-file duplicates too).
  const seenKeys = new Set<string>();

  const keysOf = (p: Product): string[] => {
    const keys: string[] = [];
    const bc = norm(p.barcode);
    if (bc) keys.push(`bc:${bc}`);
    const sc = norm(p.supplierCode);
    if (sc) keys.push(`sc:${norm(p.supplier)}|${sc}`);
    const nk = norm(p.name);
    if (!bc && !sc && nk) keys.push(`nm:${nk}`);
    return keys;
  };

  for (const row of incoming) {
    const bc = norm(row.barcode);
    const nk = norm(row.name);
    const sc = norm(row.supplierCode);
    const supplierProvided = !!row.supplier && row.supplier !== 'Unknown Supplier';

    let match: Product | undefined;
    let matchReason = '';
    let ambiguous = false;
    if (bc && barcodeKeys.has(bc)) {
      const found = barcodeKeys.get(bc);
      if (found) {
        match = found;
        matchReason = `barcode ${row.barcode}`;
      } else {
        ambiguous = true;
      }
    }
    if (!match && !ambiguous && sc && supplierProvided) {
      const ck = `${norm(row.supplier)}|${sc}`;
      if (codeKeys.has(ck)) {
        const found = codeKeys.get(ck);
        if (found) {
          match = found;
          matchReason = `supplier code ${row.supplierCode}`;
        } else {
          ambiguous = true;
        }
      }
    }
    if (!match && !ambiguous && nk && nameKeys.has(nk)) {
      const found = nameKeys.get(nk);
      if (found) {
        match = found;
        matchReason = `name "${row.name}"`;
      } else {
        ambiguous = true;
      }
    }

    if (ambiguous) {
      results.push({
        status: 'conflict',
        reason: 'Several existing products share this barcode, supplier code or name — review manually.',
      });
      continue;
    }

    if (!match) {
      const keys = keysOf(row);
      if (keys.some(k => seenKeys.has(k))) {
        results.push({ status: 'duplicate', reason: 'Repeated within the import file.' });
      } else {
        keys.forEach(k => seenKeys.add(k));
        results.push({ status: 'new', reason: '' });
      }
      continue;
    }

    // An imported row that carries its own barcode while matching by name is
    // ambiguous when the barcodes differ — could be a different real product.
    if (bc && matchReason.startsWith('name') && !barcodeKeys.has(bc) && norm(match.barcode)) {
      results.push({
        status: 'conflict',
        match,
        reason: `Name matches an existing product but barcode ${row.barcode} differs — review manually.`,
      });
      continue;
    }

    const conflictReasons: string[] = [];
    // Any difference outside purchasing details makes the row ineligible for
    // a purchasing-only update of the existing product.
    let identityDiffers = false;
    if (supplierProvided && textDiffers(row.supplier, match.supplier)) {
      conflictReasons.push(`supplier ("${row.supplier}" vs "${match.supplier}")`);
      identityDiffers = true;
    }
    if (row.supplierCode && textDiffers(row.supplierCode, match.supplierCode)) {
      conflictReasons.push(`supplier code ("${row.supplierCode}" vs "${match.supplierCode ?? 'none'}")`);
      if (norm(match.supplierCode)) identityDiffers = true;
    }
    if (row.stockUnit && textDiffers(row.stockUnit, match.stockUnit || match.unit)) {
      conflictReasons.push(`stock unit ("${row.stockUnit}" vs "${match.stockUnit || match.unit}")`);
      identityDiffers = true;
    }
    if (row.unit && row.unit !== 'each' && !row.stockUnit && textDiffers(row.unit, match.stockUnit || match.unit)) {
      conflictReasons.push(`stock unit ("${row.unit}" vs "${match.stockUnit || match.unit}")`);
      identityDiffers = true;
    }
    if (row.orderUnit && textDiffers(row.orderUnit, match.orderUnit)) {
      conflictReasons.push(`order unit ("${row.orderUnit}" vs "${match.orderUnit ?? 'none'}")`);
    }
    if (row.unitsPerOrderUnit !== undefined && differs(row.unitsPerOrderUnit, match.unitsPerOrderUnit)) {
      conflictReasons.push(`pack quantity (${row.unitsPerOrderUnit} vs ${match.unitsPerOrderUnit ?? '1'})`);
    }
    if (row.purchasePrice !== undefined && differs(row.purchasePrice, match.purchasePrice)) {
      conflictReasons.push(`purchase price ($${row.purchasePrice} vs $${match.purchasePrice ?? 'none'})`);
    }
    if (row.priceBasisQuantity !== undefined && differs(row.priceBasisQuantity, match.priceBasisQuantity)) {
      conflictReasons.push(`price basis quantity (${row.priceBasisQuantity} vs ${match.priceBasisQuantity ?? '1'})`);
    }
    if (row.priceBasisUnit && textDiffers(row.priceBasisUnit, match.priceBasisUnit)) {
      conflictReasons.push(`price basis unit ("${row.priceBasisUnit}" vs "${match.priceBasisUnit ?? 'none'}")`);
    }

    if (conflictReasons.length > 0) {
      results.push({
        status: 'conflict',
        match,
        reason: `Matches existing "${match.name}" by ${matchReason} but differs in ${conflictReasons.join(', ')} — existing product left unchanged.`,
        purchasingOnly: !identityDiffers,
      });
      continue;
    }

    results.push({ status: 'duplicate', match, reason: `Already in your catalogue (${matchReason}).` });
  }

  return results;
}

/** Batch form of {@link matchRowsForImport} used by the structured CSV importer. */
export function matchProductsForImport(existing: Product[], incoming: Product[]): ImportMatchOutcome {
  const outcome: ImportMatchOutcome = { toAdd: [], duplicates: 0, conflicts: 0, details: [] };
  const results = matchRowsForImport(existing, incoming);
  results.forEach((r, i) => {
    const row = incoming[i];
    if (r.status === 'new') outcome.toAdd.push(row);
    else if (r.status === 'duplicate') {
      outcome.duplicates++;
      outcome.details.push(`"${row.name}": ${r.reason} Skipped.`);
    } else {
      outcome.conflicts++;
      outcome.details.push(`"${row.name}": ${r.reason} Skipped.`);
    }
  });
  return outcome;
}
