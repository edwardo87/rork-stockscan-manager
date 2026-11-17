import assert from 'node:assert/strict';
import { qrLabelUrl, qrLabelHtml, prepareQrLabel, prepareQrLabelBatch } from '../utils/qrLabel';
const product = { name: '<script>alert(1)</script> & stock', sku: '"A"', barcode: '001 & #/+=é' };
const png = 'iVBORw0KGgoAAA=='; // Header-shaped synthetic data; no claim that this fixture is a decodable QR.
const url = new URL(qrLabelUrl(product.barcode));
assert.equal(url.searchParams.get('data'), product.barcode);
assert.equal(url.searchParams.get('format'), 'png');
assert.throws(() => qrLabelUrl('  '), /no barcode/);
const html = qrLabelHtml(product, png);
assert.ok(html.includes('&lt;script&gt;'));
assert.ok(!html.includes('<script>'));
assert.ok(html.includes('data:image/png;base64,'));
assert.ok(!html.includes('https://'), 'PDF contains embedded image, not a remote dependency');
assert.throws(() => qrLabelHtml(product, '<html>error</html>'), /PNG/);
let renders = 0;
await assert.rejects(prepareQrLabel(product, { loadPng: async () => { throw new Error('offline'); }, renderPdf: async () => { renders++; return 'pdf'; } }), /offline/);
assert.equal(renders, 0, 'Do not generate a blank label after download failure');
assert.equal(await prepareQrLabel(product, { loadPng: async () => png, renderPdf: async body => { assert.equal(body, html); return 'label.pdf'; } }), 'label.pdf');
console.log('PASS QR label: barcode encoding, HTML escaping, embedded image, missing barcode and failed-download handling');

const batch = Array.from({ length: 6 }, (_, i) => ({ ...product, name: `Item ${i} <b>`, barcode: `00${i}`, category: '<tools>' }));
let active = 0, peak = 0, batchRenders = 0;
await prepareQrLabelBatch(batch, 120, {
  loadPng: async () => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 1)); active--; return png; },
  renderPdf: async html => {
    batchRenders++;
    assert.equal((html.match(/data:image\/png;base64,/g) ?? []).length, 6);
    assert.ok(!html.includes('https://'));
    assert.ok(html.includes('width: 36mm'));
    assert.ok(html.includes('&lt;tools&gt;'));
    assert.ok(html.indexOf('Item 0') < html.indexOf('Item 5'));
    assert.ok(!html.includes('<b>'));
    return 'batch.pdf';
  },
});
assert.equal(peak, 4); assert.equal(batchRenders, 1);
let downloads = 0;
const failIO = { loadPng: async () => { downloads++; throw new Error('offline'); }, renderPdf: async () => { throw new Error('Must not render a partial batch'); } };
await assert.rejects(prepareQrLabelBatch(batch, 120, failIO), /offline/);
assert.equal(downloads, 4, 'Failure must not start the next download group');
await assert.rejects(prepareQrLabelBatch([], 120, failIO), /Select/);
await assert.rejects(prepareQrLabelBatch(batch, NaN, failIO), /size/);
await assert.rejects(prepareQrLabelBatch([{ ...product, barcode: '' }], 120, failIO), /barcode/);
assert.equal(downloads, 4, 'Invalid inputs fail before network work');
console.log('PASS batch PDF: embedded images, selection order, dimensions, escaping, bounded concurrency and no partial PDF on failure');