/**
 * Reproduces (and verifies the fix for) the supabase-js auth-lock deadlock
 * behind the "Add Supplier spins forever" onboarding defect (24 Oct 2026).
 *
 * supabase-js awaits onAuthStateChange callbacks, and emits SIGNED_IN from
 * session recovery (e.g. browser tab refocus) while HOLDING its auth lock.
 * A callback that awaits Supabase queries there waits on getSession(), which
 * queues behind that same lock -> deadlock; every later request hangs.
 *
 * Runs against the real project with a throwaway QA account:
 *   bun scripts/verify-auth-deadlock.ts
 * Expect: "awaiting callback" HANGS, "deferred callback" (the app's fix) OK.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

const withTimeout = <T>(p: PromiseLike<T>, ms: number) =>
  Promise.race([
    Promise.resolve(p).then(v => ({ ok: true as const, v })),
    new Promise<{ ok: false }>(r => setTimeout(() => r({ ok: false }), ms)),
  ]);

async function scenario(label: string, deferred: boolean): Promise<boolean> {
  const client: SupabaseClient = createClient(url, key, {
    auth: { storage: memoryStorage(), autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
  });
  const email = `qa.onboarding.lock${Date.now()}@smartstock-test.example.com`;
  const { error: signUpError } = await client.auth.signUp({ email, password: 'Sm@rtStock-QA-lock' });
  if (signUpError) throw signUpError;

  // Mirrors the store's listener: on SIGNED_IN, load data via Supabase.
  const load = async () => { await client.from('products').select('id').limit(1); };
  client.auth.onAuthStateChange(async (event) => {
    if (event !== 'SIGNED_IN') return;
    if (deferred) setTimeout(() => { void load(); }, 0); // the fix
    else await load(); // the original code
  });

  // What the library does on tab refocus: recover the session inside the lock.
  const auth = client.auth as unknown as {
    _acquireLock: (t: number, fn: () => Promise<void>) => Promise<void>;
    _recoverAndRefresh: () => Promise<void>;
  };
  void auth._acquireLock(-1, () => auth._recoverAndRefresh());

  // Then the user taps "Add Supplier": any request after the event.
  const r = await withTimeout(client.from('suppliers').select('id').limit(1), 8000);
  console.log(`${label}: ${r.ok ? 'OK — request completed' : 'HANGS — no response after 8s (deadlock)'}`);
  return r.ok;
}

(async () => {
  const before = await scenario('awaiting callback (original)', false);
  const after = await scenario('deferred callback (fix)     ', true);
  const pass = !before && after;
  console.log(pass ? 'PASS: deadlock reproduced and fixed' : 'UNEXPECTED RESULT');
  process.exit(pass ? 0 : 1);
})();
