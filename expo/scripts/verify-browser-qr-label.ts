import assert from 'node:assert/strict';
import { printBrowserQrLabel, BrowserLabelEnvironment, waitForQrImages } from '../services/browserQrLabelService';
const product = { name: '<b>unsafe</b>', sku: 'A&B', barcode: '001 &é' };
const calls: string[] = [];
let release!: () => void;
const decoded = new Promise<void>(resolve => { release = resolve; });
const env: BrowserLabelEnvironment = {
  open: () => {
    calls.push('open');
    return { write: html => { assert.ok(html.includes('&lt;b&gt;')); calls.push('write'); },
      ready: () => decoded, print: () => { calls.push('print'); }, close: () => { calls.push('close'); } };
  },
  loadPng: async url => { assert.equal(new URL(url).searchParams.get('data'), product.barcode); calls.push('download'); return 'iVBORw0KGgoAAA=='; },
};
const pending = printBrowserQrLabel(product, env);
await Promise.resolve();
assert.deepEqual(calls, ['open', 'download', 'write']);
release(); await pending;
assert.deepEqual(calls, ['open', 'download', 'write', 'print']);
calls.length = 0;
await assert.rejects(printBrowserQrLabel(product, { ...env, open: () => null }), /pop-ups/);
assert.equal(calls.length, 0, 'Blocked popup must not download or print');
await assert.rejects(printBrowserQrLabel(product, { ...env, loadPng: async () => { throw new Error('offline'); } }), /offline/);
assert.deepEqual(calls, ['open', 'close']);
calls.length = 0;
await assert.rejects(printBrowserQrLabel(product, { ...env, open: () => ({ write() {}, ready: async () => { throw new Error('decode failed'); }, print: () => { calls.push('print'); }, close: () => { calls.push('close'); } }) }), /decode failed/);
assert.deepEqual(calls, ['download', 'close']);
console.log('PASS browser QR label: safe text, synchronous popup, waits for decoding, blocked popup, download failure and image failure');

let releaseLast!: () => void;
let sheetReady = false;
const lastImage = new Promise<void>(resolve => { releaseLast = resolve; });
const sheet = waitForQrImages([
  { decode: async () => {}, naturalWidth: 120 },
  { decode: () => lastImage, naturalWidth: 120 },
]).then(() => { sheetReady = true; });
await Promise.resolve(); await Promise.resolve();
assert.equal(sheetReady, false, 'A loaded first image must not release the remaining sheet');
releaseLast(); await sheet;
assert.equal(sheetReady, true);
await assert.rejects(waitForQrImages([]), /missing/);
await assert.rejects(waitForQrImages([{ decode: async () => {}, naturalWidth: 0 }]), /could not be displayed/);
await assert.rejects(waitForQrImages([
  { decode: async () => {}, naturalWidth: 120 },
  { decode: async () => { throw new Error('broken QR'); }, naturalWidth: 0 },
]), /broken QR/);
await assert.rejects(waitForQrImages([{ decode: () => new Promise<void>(() => {}), naturalWidth: 0 }], 5), /too long/);
console.log('PASS batch image readiness: waits for last image, rejects missing/broken/zero-width images and times out stalled decoding');