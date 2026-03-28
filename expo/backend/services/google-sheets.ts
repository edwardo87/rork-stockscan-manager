import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { sheets_v4 } from 'googleapis';
import { Product, StocktakeItem } from '../../types/inventory';

// Check required environment variables
const checkRequiredEnvVars = () => {
  const required = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_SHEET_ID'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ [google-sheets] Missing required environment variables:', missing);
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Initialize Google Sheets client
const initGoogleSheets = async (): Promise<sheets_v4.Sheets> => {
  try {
    console.log('🔄 [google-sheets] Initializing Google Sheets client...');
    
    // Check env vars before proceeding
    checkRequiredEnvVars();

    const auth = new GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Get client and cast as any to avoid TS errors with JWT/OAuth2Client
    const client = await auth.getClient();
    
    // Create sheets instance with type assertion
    const sheets = google.sheets({ 
      version: 'v4', 
      auth: client as any
    });

    console.log('✅ [google-sheets] Google Sheets client initialized successfully');
    return sheets;
  } catch (error) {
    console.error('❌ [google-sheets] Failed to initialize Google Sheets:', {
      error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
};

// Get all products from the Products sheet
export const getProductsFromSheet = async (): Promise<Product[]> => {
  try {
    console.log('📖 [google-sheets] Reading products from sheet...');
    
    const sheets = await initGoogleSheets();
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Products!A2:P', // Skip header row, read all product columns
    });

    const rows = response.data.values || [];
    
    const products: Product[] = rows.map((row, index) => {
      try {
        const product: Product = {
          id: row[0] || `product_${index}`,
          barcode: row[1] || '',
          name: row[2] || '',
          description: row[3] || '',
          price: parseFloat(row[4]) || 0,
          cost: parseFloat(row[5]) || 0,
          sku: row[6] || '',
          category: row[7] || '',
          supplier: row[8] || '',
          minStock: parseInt(row[9]) || 0,
          currentStock: parseInt(row[10]) || 0,
          unit: row[11] || '',
        };
        
        // Add optional fields only if they exist
        if (row[12]) product.imageUrl = row[12];
        if (row[13]) product.lastOrdered = row[13];
        
        return product;
      } catch (error) {
        console.warn(`⚠️ [google-sheets] Error parsing product row ${index}:`, error);
        return null;
      }
    }).filter((product): product is Product => product !== null);

    console.log(`✅ [google-sheets] Successfully read ${products.length} products from sheet`);
    return products;
  } catch (error) {
    console.error('❌ [google-sheets] Failed to read products from sheet:', error);
    throw error;
  }
};

// Update products in the Products sheet
export const updateProductsInSheet = async (products: Product[]) => {
  try {
    console.log('📝 [google-sheets] Updating products in sheet...');
    
    const sheets = await initGoogleSheets();
    
    // Clear existing data (except header)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Products!A2:P',
    });
    
    // Prepare values for batch update
    const values = products.map(product => [
      product.id,
      product.barcode,
      product.name,
      product.description,
      product.price,
      product.cost,
      product.sku,
      product.category,
      product.supplier,
      product.minStock,
      product.currentStock,
      product.unit,
      product.imageUrl || '',
      product.lastOrdered || '',
    ]);

    // Write all products at once
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Products!A2:P',
      valueInputOption: 'RAW',
      requestBody: {
        values,
      },
    });

    console.log(`✅ [google-sheets] Successfully updated ${products.length} products in sheet`);
    return true;
  } catch (error) {
    console.error('❌ [google-sheets] Failed to update products in sheet:', error);
    throw error;
  }
};

// Update a single product in the sheet
export const updateSingleProductInSheet = async (product: Product) => {
  try {
    console.log(`📝 [google-sheets] Updating single product ${product.id} in sheet...`);
    
    const sheets = await initGoogleSheets();
    
    // First, find the row for this product
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Products!A2:A', // Get all product IDs
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === product.id);
    
    if (rowIndex === -1) {
      // Product not found, append as new row
      const values = [[
        product.id,
        product.barcode,
        product.name,
        product.description,
        product.price,
        product.cost,
        product.sku,
        product.category,
        product.supplier,
        product.minStock,
        product.currentStock,
        product.unit,
        product.imageUrl || '',
        product.lastOrdered || '',
      ]];
      
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'Products!A:P',
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    } else {
      // Update existing row (rowIndex + 2 because we start from A2)
      const actualRowNumber = rowIndex + 2;
      const range = `Products!A${actualRowNumber}:P${actualRowNumber}`;
      
      const values = [[
        product.id,
        product.barcode,
        product.name,
        product.description,
        product.price,
        product.cost,
        product.sku,
        product.category,
        product.supplier,
        product.minStock,
        product.currentStock,
        product.unit,
        product.imageUrl || '',
        product.lastOrdered || '',
      ]];
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    }

    console.log(`✅ [google-sheets] Successfully updated product ${product.id} in sheet`);
    return true;
  } catch (error) {
    console.error(`❌ [google-sheets] Failed to update product ${product.id} in sheet:`, error);
    throw error;
  }
};

// Write order items to the reorder log sheet
export const writeOrderToSheet = async (orderItems: any[]) => {
  try {
    console.log('📝 [google-sheets] Preparing to write order items:', {
      itemCount: orderItems.length,
      timestamp: new Date().toISOString()
    });

    const sheets = await initGoogleSheets();
    
    const values = orderItems.map(item => [
      new Date().toISOString(), // Timestamp
      item.supplier,
      item.productId,
      item.barcode,
      item.name,
      item.quantity,
    ]);

    console.log('📊 [google-sheets] Writing values to sheet:', {
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Reorder Log!A:F',
      valueCount: values.length
    });

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Reorder Log!A:F', // Adjust range based on your sheet
      valueInputOption: 'RAW',
      requestBody: {
        values,
      },
    });

    console.log('✅ [google-sheets] Successfully wrote to sheet:', {
      updatedRange: response.data.updates?.updatedRange,
      updatedRows: response.data.updates?.updatedRows,
      timestamp: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error('❌ [google-sheets] Failed to write to sheet:', {
      error,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
};

// Write stocktake results to the Stocktake Log sheet
export const writeStocktakeToSheet = async (stocktakeItems: StocktakeItem[]) => {
  try {
    console.log('📝 [google-sheets] Writing stocktake results to sheet...');
    
    const sheets = await initGoogleSheets();
    
    const values = stocktakeItems.map(item => [
      new Date().toISOString(), // Timestamp
      item.productId,
      item.barcode,
      item.name,
      item.expectedQuantity,
      item.actualQuantity,
      item.discrepancy,
    ]);

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Stocktake Log!A:G',
      valueInputOption: 'RAW',
      requestBody: {
        values,
      },
    });

    console.log(`✅ [google-sheets] Successfully wrote ${stocktakeItems.length} stocktake items to sheet`);
    return true;
  } catch (error) {
    console.error('❌ [google-sheets] Failed to write stocktake to sheet:', error);
    throw error;
  }
};

// Initialize sheet structure if needed
export const initializeSheetStructure = async () => {
  try {
    console.log('🔧 [google-sheets] Initializing sheet structure...');
    
    const sheets = await initGoogleSheets();
    
    // Get current sheet info
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
    });
    
    const existingSheets = spreadsheet.data.sheets?.map(sheet => sheet.properties?.title) || [];
    
    // Create missing sheets
    const requiredSheets = [
      { title: 'Products', headers: ['ID', 'Barcode', 'Name', 'Description', 'Price', 'Cost', 'SKU', 'Category', 'Supplier', 'Min Stock', 'Current Stock', 'Unit', 'Image URL', 'Last Ordered'] },
      { title: 'Reorder Log', headers: ['Timestamp', 'Supplier', 'Product ID', 'Barcode', 'Name', 'Quantity'] },
      { title: 'Stocktake Log', headers: ['Timestamp', 'Product ID', 'Barcode', 'Name', 'Expected Qty', 'Actual Qty', 'Discrepancy'] }
    ];
    
    for (const requiredSheet of requiredSheets) {
      if (!existingSheets.includes(requiredSheet.title)) {
        console.log(`📋 [google-sheets] Creating sheet: ${requiredSheet.title}`);
        
        // Add the sheet
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          requestBody: {
            requests: [{
              addSheet: {
                properties: {
                  title: requiredSheet.title
                }
              }
            }]
          }
        });
        
        // Add headers
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.GOOGLE_SHEET_ID,
          range: `${requiredSheet.title}!A1:${String.fromCharCode(64 + requiredSheet.headers.length)}1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [requiredSheet.headers]
          }
        });
      }
    }
    
    console.log('✅ [google-sheets] Sheet structure initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ [google-sheets] Failed to initialize sheet structure:', error);
    throw error;
  }
};