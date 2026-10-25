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
  normaliseUnit,
  orderUnitPrice,
  prepareOrderForSubmission,
  purchasingCostLabel,
  purchasingProblem,
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

console.log('\nPricing guard — missing pack quantities never produce a misleading total');
const kjPack = base({ id: 'kj-1', name: '6G X 1/2 STS PAN SQ1 304', supplierCode: 'STP060012A2', stockUnit: 'each', orderUnit: 'pack of 1,000', unitsPerOrderUnit: 1000, purchasePrice: 0.0177, priceBasisQuantity: 1, priceBasisUnit: 'each' });
check('KJ regression: 1 pack = $17.70', orderUnitPrice(kjPack), 17.7);
check('KJ regression: 3 packs = $53.10', lineTotalExGst(kjPack, 3), 53.1);
check('KJ regression: 3 packs = 3,000 each', formatOrderQuantity(kjPack, 3), { main: '3 pack of 1,000', stockEquivalent: '(= 3,000 each)' });
check('KJ regression: card label', purchasingCostLabel(kjPack), '$17.70 per pack of 1,000 · $0.0177 each');
check('KJ regression: no pricing problem', purchasingProblem(kjPack), null);
const kjAsImported = base({ ...kjPack, orderUnit: undefined, unitsPerOrderUnit: undefined });
check('unit pricing: ordered each, 3 = $0.05 (honest, not a pack)', [lineTotalExGst(kjAsImported, 3), purchasingCostLabel(kjAsImported)], [0.05, '$0.0177 per each']);

const boxNoQty = base({ id: 'box-1', stockUnit: 'each', orderUnit: 'box', purchasePrice: 20, priceBasisQuantity: 1000, priceBasisUnit: 'each' });
check('box with no pack quantity → no total', lineTotalExGst(boxNoQty, 3), null);
check('box with no pack quantity → problem explained', purchasingProblem(boxNoQty), 'How many each are in one box? Set the pack quantity.');
const boxDefault1 = base({ ...boxNoQty, unitsPerOrderUnit: 1 });
check('box with pack quantity 1 (database default) → still unresolved', lineTotalExGst(boxDefault1, 3), null);
const packText = base({ stockUnit: 'each', orderUnit: 'pack of 1,000', unitsPerOrderUnit: 1, purchasePrice: 0.0177 });
check('"pack of 1,000" with pack quantity 1 → unresolved', [lineTotalExGst(packText, 3), (purchasingProblem(packText) || '').startsWith('Pack quantity not set')], [null, true]);
const packConflict = base({ stockUnit: 'each', orderUnit: 'carton of 12', unitsPerOrderUnit: 6, purchasePrice: 4 });
check('"carton of 12" vs pack quantity 6 → conflict', (purchasingProblem(packConflict) || '').startsWith('Pack quantity conflict'), true);
check('roll / length order units are single items (no pack question)', [purchasingProblem(roll), purchasingProblem(base({ stockUnit: 'length', orderUnit: 'length', purchasePrice: 9 }))], [null, null]);
check('missing price stays allowed: no total, no problem', [lineTotalExGst(base({ orderUnit: 'box of 100', unitsPerOrderUnit: 100 }), 2), purchasingProblem(base({ orderUnit: 'box of 100', unitsPerOrderUnit: 100 }))], [null, null]);

console.log('\nPricing guard — price unit must convert to the stock unit');
const perMetreAsLength = base({ stockUnit: 'length', purchasePrice: 3.2, priceBasisQuantity: 1, priceBasisUnit: 'm' });
check('priced per m, counted in lengths → no total', lineTotalExGst(perMetreAsLength, 3), null);
check('priced per m, counted in lengths → explained', purchasingProblem(perMetreAsLength), 'Priced per m but counted in length. Set how the price converts to length.');
check('Lm vs metre are the same unit', purchasingProblem(base({ stockUnit: 'Lm', purchasePrice: 3, priceBasisUnit: 'metre' })), null);
check('unit synonyms', ['Pcs', 'EA', 'LM', 'Boxes', 'ctn', 'Ltr'].map(normaliseUnit), ['each', 'each', 'metre', 'box', 'carton', 'litre']);
const perCarton = base({ stockUnit: 'cartridge', orderUnit: 'carton of 12', unitsPerOrderUnit: 12, purchasePrice: 50.4, priceBasisQuantity: 1, priceBasisUnit: 'carton' });
check('price per order unit (carton) converts via pack quantity: 2 cartons = $100.80', lineTotalExGst(perCarton, 2), 100.8);
check('per-carton label', purchasingCostLabel(perCarton), '$50.40 per carton of 12 · $4.20 cartridge');

console.log('\nBulk pricing per 100 / 1,000 and discounts');
check('per 100: box of 1,000 at $12.50/100 → $125 per box', orderUnitPrice(screws), 125);
check('per 100 label', purchasingCostLabel(screws), '$125.00 per box of 1,000 · $0.125 each');
check('per 1,000: 2 boxes = $250', lineTotalExGst(screwsPer1000, 2), 250);
const discounted = base({ stockUnit: 'roll', orderUnit: 'roll', unitsPerOrderUnit: 1, purchasePrice: 2.17424, priceBasisQuantity: 1, priceBasisUnit: 'roll' });
check('discounted net price: 3 rolls = $6.52', lineTotalExGst(discounted, 3), 6.52);
check('basis label uses thousands separator', unitPriceLabel(base({ purchasePrice: 20, priceBasisQuantity: 1000 })), '$20.00 per 1,000 each');

console.log('\nPO totals and submission gating');
const kjItem = buildOrderItem(kjPack, 3);
check('PO line snapshot: 3 packs, $53.10, no issue', [kjItem.orderQuantity, kjItem.quantity, kjItem.lineTotal, kjItem.pricingIssue], [3, 3000, 53.1, undefined]);
check('PO snapshot price label (PDF/email)', unitPriceLabel(kjItem), '$0.0177 per each');
check('snapshot total is used as stored (history never recomputed)', lineTotalExGst({ ...kjItem }, 3), 53.1);
const badItem = buildOrderItem(boxNoQty, 3);
check('unresolved line: no total, issue recorded', [badItem.lineTotal, !!badItem.pricingIssue], [undefined, true]);
const gate = prepareOrderForSubmission([kjItem, badItem], [kjPack, boxNoQty]);
check('submission blocked by the unresolved line only', gate.blocked.map(b => b.productId), [boxNoQty.id]);
const fixedBox = { ...boxNoQty, unitsPerOrderUnit: 1000 };
const regate = prepareOrderForSubmission([badItem], [fixedBox]);
check('after fixing the product, the line re-snapshots and unblocks: 3 boxes = $60', [regate.blocked.length, regate.items[0].lineTotal], [0, 60]);
const noPrice = buildOrderItem(base({ id: 'np', orderUnit: 'box of 100', unitsPerOrderUnit: 100 }), 2);
check('missing price does not block submission (no total, never $0)', [prepareOrderForSubmission([noPrice], []).blocked.length, noPrice.lineTotal], [0, undefined]);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Chapter 3 checks passed.');
