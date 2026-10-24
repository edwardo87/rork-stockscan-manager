/**
 * Dev helper: prints the positioned text rows extracted from a PDF so supplier
 * layouts can be inspected. Usage: bun scripts/dump-pdf-rows.ts <file.pdf> [maxRows]
 */
import { readFileSync } from 'fs';
import { extractPdfTextRows } from '@/services/pdfTextExtractor';

const file = process.argv[2];
const max = Number(process.argv[3] || 100000);
const rows = extractPdfTextRows(new Uint8Array(readFileSync(file)));
rows.slice(0, max).forEach((r, i) => {
  console.log(`${String(i).padStart(3)} p${r.page} y${Math.round(r.y)} | ` + r.cells.map(c => `[${Math.round(c.x)}-${Math.round(c.xEnd)}]${c.text}`).join('  '));
});
console.log(`TOTAL ${rows.length}`);
