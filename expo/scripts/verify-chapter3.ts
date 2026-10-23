/**
 * Chapter 3 verification — universal product and purchasing model.
 *
 * Runs the four roadmap purchasing examples plus the import duplicate-protection
 * rules against the pure logic (no network, no database). Execute with:
 *
 *   bun run expo/scripts/verify-chapter3.ts
 *
 * Exit code 0 = all assertions pass.
 */
import { Product } from '@/types/inventory';
import {
  buildOrderItem,
  effectiveStockUnit,
  formatOrderQuantity,
  lineTotalExGst,
  orderQtyToStockUnits,
  unitPriceLabel,
} from '@/utils/purchasing';
import { matchProductsForImport } from '@/services/csvImportService';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}\n        expected ${e}\n        actual   ${a}`);
  }
}

const base = (over: Partial<Product>): Product => ({
  id: '00000000-0000-4000-8000-000000000001',
  barcode: '1234567890',
  name: 'Test Product',
  description: '',
  price: 0,
  cost: 0,
  sku: 'T1',
  category: '',
  supplier: 'Test Supplier',
  minStock: 0,
  currentStock: 0,
  unit: 'each',
  ...over,
});

console.log('\nExample 1 — screws counted individually, ordered by 1,000, priced per 100');
const screws = base({
  name: 'Countersunk Screw 8g x 50mm',
  stockUnit: 'each',
  orderUnit: 'box of 1,000',
  unitsPerOrderUnit: 1000,
  purchasePrice: 12.5,
  priceBasisQuantity: 100,
  priceBasisUnit: 'each',
  supplierCode: 'FS-8G50',
});
check('stock unit', effectiveStockUnit(screws), 'each');
check('3 boxes = 3,000 screws', orderQtyToStockUnits(screws, 3), 3000);
check('3 boxes cost 30 × $12.50 = $375.00', lineTotalExGst(screws, 3), 375);
check('unit price label', unitPriceLabel(screws), '$12.50 per 100 each');
check('quantity text', formatOrderQuantity(screws, 3), {
  main: '3 box of 1,000',
  stockEquivalent: '(= 3,000 each)',
});

console.log('\nExample 1b — screws ordered AND priced per 1,000');
const screwsPer1000 = base({
  name: 'Screw (per 1,000)',
  stockUnit: 'each',
  orderUnit: 'box of 1,000',
  unitsPerOrderUnit: 1000,
  purchasePrice: 125,
  priceBasisQuantity: 1000,
  priceBasisUnit: 'each',
});
check('2 boxes = 2,000 screws', orderQtyToStockUnits(screwsPer1000, 2), 2000);
check('2 boxes cost 2,000/1,000 × $125 = $250.00', lineTotalExGst(screwsPer1000, 2), 250);

console.log('\nExample 2 — silicone stocked as cartridges, ordered in cartons of 12');
const silicone = base({
  name: 'Silicone Clear 300ml',
  barcode: '1234567890124',
  stockUnit: 'cartridge',
  orderUnit: 'carton of 12',
  unitsPerOrderUnit: 12,
  purchasePrice: 4.2,
  priceBasisQuantity: 1,
  priceBasisUnit: 'cartridge',
});
check('stock unit', effectiveStockUnit(silicone), 'cartridge');
check('5 cartons = 60 cartridges', orderQtyToStockUnits(silicone, 5), 60);
check('5 cartons cost 60 × $4.20 = $252.00', lineTotalExGst(silicone, 5), 252);

console.log('\nExample 3 — packaging purchased by roll or carton');
const roll = base({
  name: 'Shrink Wrap 500mm',
  stockUnit: 'roll',
  orderUnit: 'roll',
  unitsPerOrderUnit: 1,
  purchasePrice: 18.99,
  priceBasisQuantity: 1,
  priceBasisUnit: 'roll',
});
const carton = base({
  name: 'Shrink Wrap 500mm (carton)',
  barcode: '1234567890125',
  stockUnit: 'roll',
  orderUnit: 'carton of 6',
  unitsPerOrderUnit: 6,
  // $99.90 per CARTON of 6 rolls = price basis of 6 rolls.
  purchasePrice: 99.9,
  priceBasisQuantity: 6,
  priceBasisUnit: 'roll',
});
check('by roll: 10 rolls = 10 rolls', orderQtyToStockUnits(roll, 10), 10);
check('by roll: 10 rolls = $189.90', lineTotalExGst(roll, 10), 189.9);
check('by carton: 2 cartons = 12 rolls', orderQtyToStockUnits(carton, 2), 12);
check('by carton: 2 cartons = $199.80', lineTotalExGst(carton, 2), 199.8);

console.log('\nExample 4 — timber stocked in lineal metres, ordered as lengths');
const timber = base({
  name: 'Pine DAR 90x45',
  stockUnit: 'Lm',
  orderUnit: '5.8m length',
  unitsPerOrderUnit: 5.8,
  purchasePrice: 3.2,
  priceBasisQuantity: 1,
  priceBasisUnit: 'Lm',
});
check('10 lengths = 58 Lm', orderQtyToStockUnits(timber, 10), 58);
check('10 lengths cost 58 × $3.20 = $185.60', lineTotalExGst(timber, 10), 185.6);
check('quantity text shows conversion', formatOrderQuantity(timber, 10), {
  main: '10 5.8m length',
  stockEquivalent: '(= 58 Lm)',
});

console.log('\nOrder-item snapshots (PO data)');
const item = buildOrderItem(screws, 3);
check('order quantity stored in order units', item.orderQuantity, 3);
check('stock-unit equivalent snapshot', item.quantity, 3000);
check('supplier code snapshot', item.supplierCode, 'FS-8G50');
check('line total snapshot', item.lineTotal, 375);
check('item is a purchasing snapshot, not a stock record', 'currentStock' in item, false);

console.log('\nImport matching and duplicate protection');
const catalogue: Product[] = [screws, silicone];
const repeat = matchProductsForImport(catalogue, [screws, { ...screws, id: 'x' }]);
check('re-importing the same rows adds nothing', repeat.toAdd.length, 0);
check('re-import reports duplicates', repeat.duplicates, 2);

const sameNameNewBarcode = base({ ...screws, barcode: '9999999999', purchasePrice: 999 });
const ambiguous = matchProductsForImport(catalogue, [sameNameNewBarcode]);
check('same name + different barcode is a conflict, not a new row', ambiguous.conflicts, 1);
check('conflicting row is not imported', ambiguous.toAdd.length, 0);

const changedPrice = matchProductsForImport(catalogue, [
  base({ ...screws, purchasePrice: 15, unitsPerOrderUnit: undefined }),
]);
check('price change is a conflict (never silently overwritten)', changedPrice.conflicts, 1);

const genuinelyNew = base({ name: 'Brand New Product', barcode: '5555555555' });
const fresh = matchProductsForImport(catalogue, [genuinelyNew]);
check('genuinely new row is imported', fresh.toAdd.length, 1);
check('existing catalogue untouched by matching', catalogue.length, 2);

console.log('\nLegacy products (no Chapter 3 fields) keep working');
const legacy = base({ name: 'Legacy Product' });
check('legacy stock unit falls back to `unit`', effectiveStockUnit(legacy), 'each');
check('legacy order qty passes through 1:1', orderQtyToStockUnits(legacy, 4), 4);
check('legacy line total is null (no price), never $0', lineTotalExGst(legacy, 4), null);

console.log('\nPack-size strings in legacy `unit` are not treated as stock units');
check('legacy overload guarded', effectiveStockUnit(base({ unit: 'box of 12' })), 'each');

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Chapter 3 checks passed.');
