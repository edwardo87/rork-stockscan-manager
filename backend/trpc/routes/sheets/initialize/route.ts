import { publicProcedure } from '../../../create-context';
import { initializeSheetStructure, updateProductsInSheet } from '../../../../services/google-sheets';
import { products as mockProducts } from '../../../../../mocks/products';

export const initializeSheetsProcedure = publicProcedure
  .mutation(async () => {
    try {
      console.log('🔧 [trpc] Initializing Google Sheets structure...');
      
      // Initialize sheet structure
      await initializeSheetStructure();
      
      // Populate with initial mock data
      await updateProductsInSheet(mockProducts);
      
      console.log('✅ [trpc] Successfully initialized Google Sheets with mock data');
      return { success: true, message: 'Google Sheets initialized successfully' };
    } catch (error) {
      console.error('❌ [trpc] Failed to initialize Google Sheets:', error);
      throw new Error('Failed to initialize Google Sheets structure');
    }
  });