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
  'pack_size': 'unit',
  // Legacy / alternative
  'item_description': ['name', 'description'],
  'itemcode': 'sku',
  'last_ordered': 'lastOrdered',
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
function parseCSVLine(line: string, delimiter: string = ','): string[] {
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
function generateProductId(_index: number, _identifier: string): string {
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

function generateSKU(name: string): string {
  const cleanName = name.replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase();
  const words = cleanName.split(/\s+/).filter(w => w.length > 0);
  const initials = words.map(w => w.charAt(0)).join('').slice(0, 4) || 'PROD';
  const timestamp = Date.now().toString().slice(-4);
  return `${initials}${timestamp}`;
}

function generateBarcode(): string {
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
  ];

  const sampleData = [
    ['Sample Product 1', 'This is a sample product description', 'SAMP001', '1234567890123', 'Electronics', 'Sample Supplier Ltd', 'orders@samplesupplier.com', '10.50', '15.99', '25', '5', 'each'],
    ['Sample Product 2', 'Another sample product', 'SAMP002', '1234567890124', 'Office Supplies', 'Office Supply Co', 'sales@officesupply.co', '2.25', '3.99', '100', '10', 'pack'],
  ];

  return [headers.join(','), ...sampleData.map(row => row.join(','))].join('\n');
}
