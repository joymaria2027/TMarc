import { describe, it, expect, vi, afterEach } from 'vitest';
import { resilientNavigatorLock } from '@/integrations/supabase/supabaseLock';

const realNavigator = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', { value: realNavigator, configurable: true });
});

describe('resilientNavigatorLock', () => {
  it('runs fn directly when Web Locks API is unavailable', async () => {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    const fn = vi.fn(async () => 'ok');
    await expect(resilientNavigatorLock('x', 0, fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('runs fn under the lock when free', async () => {
    const request = vi.fn(async (_name: string, _opts: object, cb: (l: object) => Promise<string>) => cb({}));
    Object.defineProperty(globalThis, 'navigator', { value: { locks: { request } }, configurable: true });
    await expect(resilientNavigatorLock('x', 0, async () => 'held')).resolves.toBe('held');
    expect(request).toHaveBeenCalledOnce();
  });

  it('retries a busy lock then runs fn (no unhandled rejection)', async () => {
    let calls = 0;
    const request = vi.fn(async (_name: string, _opts: object, cb: (l: object | null) => Promise<never>) => {
      calls++;
      return cb(calls < 3 ? null : {});
    });
    Object.defineProperty(globalThis, 'navigator', { value: { locks: { request } }, configurable: true });
    await expect(resilientNavigatorLock('x', 0, async () => 'recovered')).resolves.toBe('recovered');
    expect(calls).toBe(3);
  });

  it('runs unguarded after retries are exhausted instead of rejecting', async () => {
    const request = vi.fn(async (_n: string, _o: object, cb: (l: null) => Promise<never>) => cb(null));
    Object.defineProperty(globalThis, 'navigator', { value: { locks: { request } }, configurable: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(resilientNavigatorLock('x', 0, async () => 'unguarded')).resolves.toBe('unguarded');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  }, 15000);

  it('rethrows genuine callback errors (does not swallow)', async () => {
    const request = vi.fn(async (_n: string, _o: object, cb: (l: object) => Promise<never>) => cb({}));
    Object.defineProperty(globalThis, 'navigator', { value: { locks: { request } }, configurable: true });
    await expect(
      resilientNavigatorLock('x', 0, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
