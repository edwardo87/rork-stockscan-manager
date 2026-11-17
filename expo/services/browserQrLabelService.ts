import { qrLabelHtml, qrLabelUrl, QrLabelProduct } from '@/utils/qrLabel';

interface LabelWindow {
  write: (html: string) => void;
  ready: () => Promise<void>;
  print: () => void;
  close: () => void;
}
export interface BrowserLabelEnvironment {
  open: () => LabelWindow | null;
  loadPng: (url: string) => Promise<string>;
}

async function bounded<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('QR image took too long to load. Please retry.')), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

const browserEnvironment: BrowserLabelEnvironment = {
  open: () => {
    const preview = window.open('', '_blank');
    if (!preview) return null;
    preview.opener = null;
    preview.document.write('<!doctype html><title>Preparing QR label</title><p>Preparing QR label…</p>');
    preview.document.close();
    return {
      write: html => {
        if (preview.closed) throw new Error('The label window was closed.');
        preview.document.open(); preview.document.write(html); preview.document.close();
      },
      ready: () => waitForQrImages(Array.from(preview.document.querySelectorAll('img'))),
      print: () => {
        if (preview.closed) throw new Error('The label window was closed.');
        preview.focus(); preview.print();
      },
      close: () => preview.close(),
    };
  },
  loadPng: async url => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('QR image download failed. Check your connection and retry.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    } finally { clearTimeout(timer); }
  },
};

/** Open synchronously from the button click; never print before decoding succeeds. */
export async function printBrowserQrLabel(product: QrLabelProduct, environment = browserEnvironment): Promise<void> {
  const url = qrLabelUrl(product.barcode);
  const preview = environment.open();
  if (!preview) throw new Error('Allow pop-ups for SmartStock, then try printing the label again.');
  try {
    const png = await environment.loadPng(url);
    preview.write(qrLabelHtml(product, png));
    await bounded(preview.ready(), 10000);
    preview.print();
  } catch (error) {
    preview.close();
    throw error;
  }
}

/** All labels must decode before printing; one failed or stalled image cancels the sheet. */
export async function waitForQrImages(
  images: ReadonlyArray<{ decode: () => Promise<void>; readonly naturalWidth: number }>,
  timeoutMs = 20000,
): Promise<void> {
  if (!images.length) throw new Error('The QR images are missing.');
  await bounded(Promise.all(images.map(async image => {
    await image.decode();
    if (!image.naturalWidth) throw new Error('A QR image could not be displayed. Please retry.');
  })), timeoutMs);
}