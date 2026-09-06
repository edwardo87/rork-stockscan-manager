/**
 * Compatibility shim — `useInventoryStore` now resolves to the Supabase-backed
 * store. This removes the dual-store divergence risk without forcing 11 import
 * sites to change at once. The original local-only implementation is preserved
 * in `inventoryStore.legacy.ts` for rollback safety during beta.
 *
 * Legacy Google Sheets fields are exposed as no-ops so existing UI that still
 * references them (e.g. GoogleSheetsIntegration) keeps compiling. Those code
 * paths are dormant for MVP and will be removed post-beta.
 */
import { useSupabaseInventoryStore } from './supabaseInventoryStore';

const noop = (): void => {};
const noopAsync = async (): Promise<void> => {};
const noopSetGoogleSheetsEnabled = (_enabled: boolean): void => {};

export const useInventoryStore = () => {
  const store = useSupabaseInventoryStore();
  return {
    ...store,
    // Deprecated Google Sheets API — kept only so legacy imports still compile.
    isGoogleSheetsEnabled: false as const,
    initializeGoogleSheets: noopAsync,
    syncWithGoogleSheets: noopAsync,
    setGoogleSheetsEnabled: noopSetGoogleSheetsEnabled,
    loadProductsFromSheets: noopAsync,
  };
};
