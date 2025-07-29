import { Product } from '@/types/inventory';

// Column mapping from CSV to Product type
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
  'price': 'price',
  'selling_price': 'price',
  'cost': 'cost',
  'cost_price': 'cost',
  'current_stock': 'currentStock',
  'stock': 'currentStock',
  'quantity': 'currentStock',
  'min_stock': 'minStock',
  'minimum_stock': 'minStock',
  'minstock': 'minStock',
  'unit': 'unit',
  'pack_size': 'unit',
  
  // Legacy column names for backward compatibility
  'Category': 'category',
  'Supplier': 'supplier',
  'Item_Description': ['name', 'description'],
  'Pack_Size': 'unit',
  'itemcode': 'sku',
  'last_ordered': 'lastOrdered'
};

/**
 * Parses CSV content and returns array of products
 */
export function parseCSV(csvContent: string): Product[] {
  try {
    // Split CSV into lines, handling both \n and \r\n
    const lines = csvContent.split(/\r?\n/);
    if (lines.length < 2) throw new Error('CSV file must contain at least a header row and one data row');

    // Get headers from first line and normalize them
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
    
    // Validate that we have at least a name column
    const hasNameColumn = headers.some(h => 
      ['name', 'product_name', 'item_name', 'item_description'].includes(h)
    );
    
    if (!hasNameColumn) {
      throw new Error('CSV must contain at least a product name column (name, product_name, or item_name)');
    }

    // Parse data lines
    const products: Product[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines
      
      // Handle CSV parsing with quoted values
      const values = parseCSVLine(line);
      const product: any = {};

      // Map CSV columns to product fields
      headers.forEach((header, index) => {
        const mapping = columnMapping[header];
        const value = values[index]?.trim() || '';

        if (mapping && value) {
          if (Array.isArray(mapping)) {
            // Handle fields that map to multiple properties (like Item_Description)
            mapping.forEach(field => {
              product[field] = value;
            });
          } else {
            // Handle numeric fields
            if (['currentStock', 'minStock'].includes(mapping)) {
              product[mapping] = parseInt(value) || 0;
            } else if (['price', 'cost'].includes(mapping)) {
              product[mapping] = parseFloat(value) || 0;
            } else {
              product[mapping] = value;
            }
          }
        }
      });

      // Generate required fields if missing
      const productId = generateProductId(i, product.sku || product.name);
      const productSku = product.sku || generateSKU(product.name || `Product${i}`);
      const productBarcode = product.barcode || generateBarcode();
      
      // Ensure required fields have values
      const finalProduct: Product = {
        id: productId,
        name: product.name || `Product ${i}`,
        description: product.description || product.name || `Product ${i}`,
        sku: productSku,
        barcode: productBarcode,
        category: product.category || 'Uncategorized',
        supplier: product.supplier || 'Unknown Supplier',
        price: product.price || (product.cost ? Math.round((product.cost * 1.3) * 100) / 100 : 0),
        cost: product.cost || 0,
        currentStock: product.currentStock || 0,
        minStock: product.minStock || 0,
        unit: product.unit || 'each',
        lastOrdered: product.lastOrdered || undefined
      };
      
      products.push(finalProduct);
    }

    if (products.length === 0) {
      throw new Error('No valid products found in CSV file');
    }

    return products;
  } catch (error) {
    console.error('Error parsing CSV:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to parse CSV file. Please check the format and try again.');
  }
}

/**
 * Parses a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

/**
 * Generates a unique product ID
 */
function generateProductId(index: number, identifier: string): string {
  const timestamp = Date.now().toString().slice(-6);
  const cleanIdentifier = identifier.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
  return `PROD_${cleanIdentifier}_${timestamp}_${index}`;
}

/**
 * Generates a SKU from product name
 */
function generateSKU(name: string): string {
  const cleanName = name.replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase();
  const words = cleanName.split(/\s+/).filter(w => w.length > 0);
  const initials = words.map(w => w.charAt(0)).join('').slice(0, 4);
  const timestamp = Date.now().toString().slice(-4);
  return `${initials}${timestamp}`;
}

/**
 * Generates a barcode
 */
function generateBarcode(): string {
  const timestamp = Date.now().toString();
  const random = Math.random().toString().substr(2, 4);
  return timestamp.substr(-8) + random;
}

/**
 * Generates a sample CSV template
 */
export function generateCSVTemplate(): string {
  const headers = [
    'name',
    'description', 
    'sku',
    'barcode',
    'category',
    'supplier',
    'cost',
    'price',
    'current_stock',
    'min_stock',
    'unit'
  ];
  
  const sampleData = [
    [
      'Sample Product 1',
      'This is a sample product description',
      'SAMP001',
      '1234567890123',
      'Electronics',
      'Sample Supplier Ltd',
      '10.50',
      '15.99',
      '25',
      '5',
      'each'
    ],
    [
      'Sample Product 2',
      'Another sample product',
      'SAMP002',
      '1234567890124',
      'Office Supplies',
      'Office Supply Co',
      '2.25',
      '3.99',
      '100',
      '10',
      'pack'
    ]
  ];
  
  const csvContent = [headers.join(','), ...sampleData.map(row => row.join(','))].join('\n');
  return csvContent;
}

/**
 * Validates CSV format before parsing
 */
export function validateCSVFormat(csvContent: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  try {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
    
    if (lines.length < 2) {
      errors.push('CSV must contain at least a header row and one data row');
      return { isValid: false, errors };
    }
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    // Check for required columns
    const hasNameColumn = headers.some(h => 
      ['name', 'product_name', 'item_name', 'item_description'].includes(h.replace(/[^a-z0-9_]/g, '_'))
    );
    
    if (!hasNameColumn) {
      errors.push('CSV must contain a product name column (name, product_name, or item_name)');
    }
    
    // Check data consistency
    const headerCount = headers.length;
    for (let i = 1; i < Math.min(lines.length, 6); i++) { // Check first 5 data rows
      const values = parseCSVLine(lines[i]);
      if (values.length !== headerCount) {
        errors.push(`Row ${i + 1} has ${values.length} columns but header has ${headerCount} columns`);
      }
    }
    
    return { isValid: errors.length === 0, errors };
  } catch (error) {
    errors.push('Invalid CSV format');
    return { isValid: false, errors };
  }
}