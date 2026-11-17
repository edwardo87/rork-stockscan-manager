import type { StocktakeSession } from '@/types/inventory';

// Spreadsheet apps must treat imported names/codes as text, never formulas.
function textCell(value: string): string {
  const safe = /^[\s]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
function numberCell(value: number): string {
  if (!Number.isFinite(value)) throw new Error('This stocktake contains an invalid quantity. Export was stopped.');
  return String(value);
}

/** Export saved snapshots, never today's product names/counts or inferred units. */
export function stocktakeCsv(session: StocktakeSession): string {
  const header = 'Stocktake ID,Date,Status,Product ID,Barcode,Product,Previous recorded count,Counted quantity,Recorded difference';
  const rows = session.items.map(item => [
    session.id, session.date, session.status, item.productId, item.barcode, item.name,
  ].map(textCell).concat([
    numberCell(item.expectedQuantity), numberCell(item.actualQuantity), numberCell(item.discrepancy),
  ]).join(','));
  return '\uFEFF' + [header, ...rows].join('\r\n') + '\r\n';
}
