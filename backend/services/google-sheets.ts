import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { sheets_v4 } from 'googleapis';

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