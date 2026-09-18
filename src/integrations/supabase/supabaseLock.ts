/**
 * Resilient Web Locks wrapper for Supabase Auth (GoTrue `lock` option).
 *
 * Root cause of `LockAcquireTimeoutError: Acquiring an exclusive Navigator
 * LockManager lock "lock:sb-*-auth-token" immediately failed`: GoTrue
 * acquires the auth-token lock with timeout 0 during client init and token
 * refresh. When another tab holds the lock (multi-tab), HMR re-initialises,
 * or a Capacitor/webview context reports a busy lock table, the init promise
 * rejects unhandled and auth never initialises.
 *
 * Strategy: retry a few times with backoff (another tab usually releases in
 * ms), then run the callback unguarded rather than crash init. Worst case is
 * a benign double refresh, never a dead auth client. No `navigator.locks`
 * (SSR/tests/older webviews) also falls through to direct execution.
 */

type LockFn = <R>(name: string, acquireTimeout: number, fn: () => Promise<R>) => Promise<R>;

const RETRIES = 8;
const RETRY_DELAY_MS = 250;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isAcquireTimeoutError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { isAcquireTimeout?: unknown; name?: unknown };
  if (err.isAcquireTimeout === true) return true;
  return typeof err.name === 'string' && err.name.includes('LockAcquireTimeout');
}

type NavigatorLocks = {
  request: <R>(
    name: string,
    options: { mode?: 'exclusive' | 'shared'; ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: object | null) => Promise<R>,
  ) => Promise<R>;
};

function webLocks(): NavigatorLocks | null {
  const nav = (globalThis as { navigator?: Navigator & { locks?: NavigatorLocks } }).navigator;
  return nav?.locks && typeof nav.locks.request === 'function' ? nav.locks : null;
}

export const resilientNavigatorLock: LockFn = async (name, acquireTimeout, fn) => {
  void acquireTimeout; // intentionally: always retry briefly instead of failing fast
  const locks = webLocks();
  if (!locks) return fn();

  for (let attempt = 0; ; attempt++) {
    try {
      const result = await locks.request(name, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) throw timeoutError();
        return { held: true as const, value: await fn() };
      });
      return (result as { value: unknown }).value as never;
    } catch (e) {
      if (!isAcquireTimeoutError(e) || attempt >= RETRIES) {
        // Genuine callback failure (or retries exhausted): never swallow real
        // errors — but if the lock itself stayed busy, run unguarded so auth
        // init can't reject unhandled.
        if (isAcquireTimeoutError(e)) {
          if (typeof console !== 'undefined') {
            console.warn(`[supabase] lock "${name}" busy after retries; running unguarded`);
          }
          return fn();
        }
        throw e;
      }
      await sleep(RETRY_DELAY_MS);
    }
  }
};

function timeoutError(): Error {
  const e = new Error('LockAcquireTimeout');
  (e as { name: string }).name = 'LockAcquireTimeoutError';
  (e as { isAcquireTimeout: boolean }).isAcquireTimeout = true;
  return e;
}
