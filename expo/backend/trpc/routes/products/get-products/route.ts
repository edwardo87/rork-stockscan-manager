import { publicProcedure } from '../../../create-context';
import { getProductsFromSheet } from '../../../../services/google-sheets';

export const getProductsProcedure = publicProcedure
  .query(async () => {
    try {
      console.log('📦 [trpc] Getting products from Google Sheets...');
      const products = await getProductsFromSheet();
      console.log(`✅ [trpc] Successfully retrieved ${products.length} products`);
      return { products };
    } catch (error) {
      console.error('❌ [trpc] Failed to get products:', error);
      throw new Error('Failed to retrieve products from Google Sheets');
    }
  });