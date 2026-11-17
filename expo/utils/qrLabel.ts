export interface QrLabelProduct { name: string; sku: string; barcode: string }
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export function qrLabelUrl(barcode: string): string {
  if (!barcode.trim()) throw new Error('This product has no barcode to print.');
  return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(barcode)}&bgcolor=ffffff&color=000000&format=png`;
}

export function qrLabelHtml(product: QrLabelProduct, pngBase64: string): string {
  if (!pngBase64.startsWith('iVBORw0KGgo') || !/^[A-Za-z0-9+/=]+$/.test(pngBase64)) throw new Error('QR service did not return a PNG image. Please retry.');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Product QR label</title>
    <style>@page { margin: 12mm; } body { font-family: Arial, sans-serif; color: #000; background: #fff; }
    .label { width: 60mm; padding: 4mm; border: 1px solid #000; box-sizing: border-box; text-align: center; break-inside: avoid; }
    img { width: 32mm; height: 32mm; } .name { font-size: 12px; font-weight: bold; overflow-wrap: anywhere; }
    .code { font-size: 10px; overflow-wrap: anywhere; margin-top: 3mm; }</style></head><body><div class="label">
    <img src="data:image/png;base64,${pngBase64}" alt="Product QR code">
    <div class="name">${escapeHtml(product.name)}</div><div class="code">${escapeHtml(product.sku)}</div>
    <div class="code">${escapeHtml(product.barcode)}</div></div></body></html>`;
}

export async function prepareQrLabel(product: QrLabelProduct, io: {
  loadPng: (url: string) => Promise<string>;
  renderPdf: (html: string) => Promise<string>;
}): Promise<string> {
  const png = await io.loadPng(qrLabelUrl(product.barcode));
  return io.renderPdf(qrLabelHtml(product, png));
}

export async function prepareQrLabelBatch(
  products: ReadonlyArray<QrLabelProduct & { category?: string }>,
  labelSize: number,
  io: { loadPng: (url: string) => Promise<string>; renderPdf: (html: string) => Promise<string> },
): Promise<string> {
  if (!products.length) throw new Error('Select at least one product.');
  if (!Number.isFinite(labelSize) || labelSize < 80 || labelSize > 200) throw new Error('Invalid label size.');
  const urls = products.map(product => qrLabelUrl(product.barcode));
  const labels: string[] = [];
  // Four at a time bounds network pressure; any failure stops the next group and PDF creation.
  for (let offset = 0; offset < products.length; offset += 4) {
    const group = await Promise.all(products.slice(offset, offset + 4).map(async (product, index) => {
      const png = await io.loadPng(urls[offset + index]);
      qrLabelHtml(product, png); // Reuse the single-label PNG validation.
      return `<div class="label"><img src="data:image/png;base64,${png}" alt="Product QR code">
        <div class="name">${escapeHtml(product.name)}</div><div>${escapeHtml(product.sku)}</div>
        <div>${escapeHtml(product.barcode)}</div><div>${escapeHtml(product.category ?? '')}</div></div>`;
    }));
    labels.push(...group);
  }
  return io.renderPdf(`<!doctype html><html><head><meta charset="utf-8"><title>QR labels</title>
    <style>@page { size: A4; margin: 10mm; } body { font: 9px Arial, sans-serif; color: #000; background: #fff; }
    .label { display: inline-block; vertical-align: top; width: ${labelSize * 0.3}mm;
      min-height: ${labelSize * 0.36}mm; margin: 2mm; padding: 2mm; box-sizing: border-box;
      border: 1px solid #000; text-align: center; break-inside: avoid; page-break-inside: avoid; }
    img { width: ${labelSize * 0.2}mm; height: ${labelSize * 0.2}mm; }
    .name { font-weight: bold; } .label div { overflow-wrap: anywhere; word-break: break-word; }
    </style></head><body>${labels.join('')}</body></html>`);
}