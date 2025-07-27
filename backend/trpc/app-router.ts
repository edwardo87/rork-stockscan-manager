import { createTRPCRouter } from "./create-context";
import hiRoute from "./routes/example/hi/route";
import submitOrderRoute from "./routes/orders/submit-order/route";
import testEnvRoute from "./routes/test/env/route";
import { getProductsProcedure } from "./routes/products/get-products/route";
import { updateProductProcedure } from "./routes/products/update-product/route";
import { submitStocktakeProcedure } from "./routes/stocktake/submit-stocktake/route";
import { initializeSheetsProcedure } from "./routes/sheets/initialize/route";

export const appRouter = createTRPCRouter({
  example: createTRPCRouter({
    hi: hiRoute,
  }),
  orders: createTRPCRouter({
    submitOrder: submitOrderRoute,
  }),
  products: createTRPCRouter({
    getProducts: getProductsProcedure,
    updateProduct: updateProductProcedure,
  }),
  stocktake: createTRPCRouter({
    submitStocktake: submitStocktakeProcedure,
  }),
  sheets: createTRPCRouter({
    initialize: initializeSheetsProcedure,
  }),
  test: createTRPCRouter({
    env: testEnvRoute,
  }),
});

// Export type router type
export type AppRouter = typeof appRouter;