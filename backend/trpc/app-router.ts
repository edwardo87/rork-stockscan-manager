import { createTRPCRouter } from "./create-context";
import hiRoute from "./routes/example/hi/route";
import submitOrderRoute from "./routes/orders/submit-order/route";
import testEnvRoute from "./routes/test/env/route";

export const appRouter = createTRPCRouter({
  example: createTRPCRouter({
    hi: hiRoute,
  }),
  orders: createTRPCRouter({
    submitOrder: submitOrderRoute,
  }),
  test: createTRPCRouter({
    env: testEnvRoute,
  }),
});