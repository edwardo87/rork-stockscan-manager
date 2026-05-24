// Web-only loader. Metro resolves this file on web (`.web.ts`) and the native
// `jspdfLoader.ts` everywhere else, so jspdf is never required on native.
export async function loadJsPDF(): Promise<any> {
  const mod = await import('jspdf');
  return mod.jsPDF;
}
