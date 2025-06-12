import { z } from "zod";
import { publicProcedure } from "@/backend/trpc/create-context";
import { writeOrderToSheet } from "@/backend/services/google-sheets";

// Validation schema for order items
const OrderItemSchema = z.object({
  productId: z.string(),
  barcode: z.string(),
  name: z.string(),
  quantity: z.number(),
  supplier: z.string(),
});

export default publicProcedure
  .input(z.object({
    items: z.array(OrderItemSchema)
  }))
  .mutation(async ({ input }) => {
    console.log('📝 [submit-order] Route called with data:', {
      itemCount: input.items.length,
      items: input.items,
      timestamp: new Date().toISOString()
    });

    try {
      console.log('📊 [submit-order] Attempting to write to Google Sheets...');
      
      // Write order items to Google Sheet
      await writeOrderToSheet(input.items);
      
      console.log('✅ [submit-order] Successfully wrote to Google Sheets');
      
      return {
        success: true,
        message: "Order successfully logged to reorder sheet",
        timestamp: new Date().toISOString(),
        details: {
          itemCount: input.items.length,
          suppliers: [...new Set(input.items.map(item => item.supplier))],
        }
      };
    } catch (error) {
      // Log the full error
      console.error('❌ [submit-order] Failed to write to Google Sheets:', {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });

      // Return a structured error response
      return {
        success: false,
        message: "Failed to log order to reorder sheet",
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        details: {
          itemCount: input.items.length,
          suppliers: [...new Set(input.items.map(item => item.supplier))],
        }
      };
    }
  });