/** Invalidating also discards results from requests started in an older account/session. */
export function createInvalidatableCache<T>(load: () => Promise<T>, ttlMs: number, now = Date.now) {
  let generation = 0;
  let cached: { value: T; time: number } | null = null;
  return {
    clear() { generation++; cached = null; },
    async get(): Promise<T | null> {
      if (cached && now() - cached.time < ttlMs) return cached.value;
      const started = generation;
      try {
        const value = await load();
        if (started !== generation) return null;
        cached = { value, time: now() };
        return value;
      } catch (error) {
        if (started !== generation) return null;
        throw error;
      }
    },
  };
}