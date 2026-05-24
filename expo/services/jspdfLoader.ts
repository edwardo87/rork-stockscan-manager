// Native stub — jsPDF is web-only. On native we use expo-print instead and
// should never reach this function. Throwing here makes the misuse obvious.
export async function loadJsPDF(): Promise<any> {
  throw new Error('jsPDF is not available on native; use expo-print');
}
