/** Narrow recovery for the incoming Rork invalid-refresh-token bug. */
export function isExpiredRefreshToken(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return false;
  const error = reason as { name?: unknown; code?: unknown; message?: unknown };
  if (error.code === 'refresh_token_not_found') return true;
  return error.name === 'AuthApiError' && typeof error.message === 'string' &&
    /invalid refresh token|refresh token not found/i.test(error.message);
}
export function createExpiredSessionHandler(signOutLocal: () => Promise<unknown>) {
  let recovering = false;
  return (event: { reason: unknown; preventDefault: () => void }): void => {
    if (!isExpiredRefreshToken(event.reason)) return;
    event.preventDefault();
    if (recovering) return;
    recovering = true;
    void Promise.resolve().then(signOutLocal).catch(() => undefined).finally(() => { recovering = false; });
  };
}