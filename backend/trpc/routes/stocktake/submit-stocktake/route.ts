import { publicProcedure } from '../../../create-context';
import { writeStocktakeToSheet, updateProductsInSheet } from '../../../../services/google-sheets';
import { z } from 'zod';

const stocktakeItemSchema = z.object({
  productId: z.string(),
  barcode: z.string(),
  name: z.string(),
  expectedQuantity: z.number(),
  actualQuantity: z.number(),
  discrepancy: z.number(),
});

const productSchema = z.object({
  id: z.string(),
  barcode: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number(),
  cost: z.number(),
  sku: z.string(),
  category: z.string(),
  supplier: z.string(),
  minStock: z.number(),
  currentStock: z.number(),
  unit: z.string(),
  imageUrl: z.string().optional(),
  lastOrdered: z.string().optional(),
});

export const submitStocktakeProcedure = publicProcedure
  .input(z.object({
    stocktakeItems: z.array(stocktakeItemSchema),
    updatedProducts: z.array(productSchema),
  }))
  .mutation(async ({ input }) => {
    try {
      console.log(`📊 [trpc] Submitting stocktake with ${input.stocktakeItems.length} items...`);
      
      // Write stocktake log to Google Sheets
      await writeStocktakeToSheet(input.stocktakeItems);
      
      // Update product stock levels in Google Sheets
      await updateProductsInSheet(input.updatedProducts);
      
      console.log('✅ [trpc] Successfully submitted stocktake and updated products');
      return { success: true };
    } catch (error) {
      console.error('❌ [trpc] Failed to submit stocktake:', error);
      throw new Error('Failed to submit stocktake to Google Sheets');
    }
  });