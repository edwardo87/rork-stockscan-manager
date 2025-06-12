import { Product } from '@/types/inventory';

// Column mapping from CSV to Product type
const columnMapping = {
  'Category': 'category',
  'Supplier': 'supplier',
  'Item_Description': ['name', 'description'],
  'Pack_Size': 'unit',
  'itemcode': 'id',
  'barcode': 'barcode',
  'current_stock': 'currentStock',
  'last_ordered': 'lastOrdered',
  'cost': 'cost',
  'minstock': 'minStock'
};

/**
 * Parses CSV content and returns array of products
 */
export function parseCSV(csvContent: string): Product[] {
  try {
    // Split CSV into lines, handling both \n and \r\n
    const lines = csvContent.split(/\r?\n/);
    if (lines.length < 2) throw new Error('CSV file is empty or invalid');

    // Get headers from first line
    const headers = lines[0].split(',').map(h => h.trim());

    // Parse data lines
    const products: Product[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines
      
      const values = line.split(',').map(v => v.trim());
      const product: any = {};

      // Map CSV columns to product fields
      headers.forEach((header, index) => {
        const mapping = columnMapping[header as keyof typeof columnMapping];
        const value = values[index];

        if (mapping) {
          if (Array.isArray(mapping)) {
            // Handle fields that map to multiple properties (like Item_Description)
            mapping.forEach(field => {
              product[field] = value;
            });
          } else {
            // Handle numeric fields
            if (['currentStock', 'minStock'].includes(mapping)) {
              product[mapping] = parseInt(value) || 0;
            } else if (mapping === 'cost') {
              product[mapping] = parseFloat(value) || 0;
              // Calculate selling price with 30% markup
              product.price = Math.round((product[mapping] * 1.3) * 100) / 100;
            } else {
              product[mapping] = value;
            }
          }
        }
      });

      // Ensure required fields have default values
      product.id = product.id || `PROD${i}`;
      product.name = product.name || 'Unnamed Product';
      product.description = product.description || product.name;
      product.category = product.category || 'Uncategorized';
      product.supplier = product.supplier || 'Unknown Supplier';
      product.unit = product.unit || 'each';
      
      products.push(product as Product);
    }

    return products;
  } catch (error) {
    console.error('Error parsing CSV:', error);
    throw new Error('Failed to parse CSV file. Please check the format and try again.');
  }
}