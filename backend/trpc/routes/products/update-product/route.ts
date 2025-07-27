import { publicProcedure } from '../../../create-context';
import { updateSingleProductInSheet } from '../../../../services/google-sheets';
import { z } from 'zod';

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

export const updateProductProcedure = publicProcedure
  .input(productSchema)
  .mutation(async ({ input }) => {
    try {
      console.log(`📝 [trpc] Updating product ${input.id} in Google Sheets...`);
      await updateSingleProductInSheet(input);
      console.log(`✅ [trpc] Successfully updated product ${input.id}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ [trpc] Failed to update product ${input.id}:`, error);
      throw new Error('Failed to update product in Google Sheets');
    }
  });