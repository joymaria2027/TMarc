import { toast } from 'sonner';

type WriteError = { message?: string | null; details?: string | null; hint?: string | null; code?: string | null };

type GuardedResult<T> = { data: T | null; error: WriteError | null };

/**
 * Normalize any failure shape (supabase PostgrestError, Error, string,
 * object, undefined) into the supabase `{ message }`-style shape so call
 * sites can treat every failure uniformly.
 */
export function normalizeWriteError(err: unknown): WriteError {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const message =
      (typeof e.message === 'string' && e.message) ||
      (typeof e.details === 'string' && e.details) ||
      (typeof e.hint === 'string' && e.hint) ||
      '';
    if (message) return { message };
    if (typeof e.code === 'string' && e.code) return { message: e.code };
    // Unrecognized object: keep a stable, non-empty message.
    return { message: 'Unknown error' };
  }
  if (typeof err === 'string' && err) return { message: err };
  return { message: 'Unknown error' };
}

/**
 * Await a supabase-style write ({ data, error } promise), surface failures to
 * the user once (context-prefixed toast), and always return the supabase-
 * shaped result so call sites keep their `if (error) return;` pattern.
 *
 * Complements the in-repo reference patterns (RiderDashboard.confirmReject,
 * WalletPage.handleProcess): it does not change state for you — it guarantees
 * the failure is *seen* and the error is *returned* before you mutate.
 */
export async function guardedWrite<T = unknown>(
  write: Promise<GuardedResult<T>> | GuardedResult<T>,
  options: { context: string; silent?: boolean },
): Promise<GuardedResult<T>> {
  let data: T | null = null;
  let error: WriteError | null = null;
  try {
    const result = await write;
    data = result?.data ?? null;
    error = result?.error ?? null;
  } catch (thrown) {
    error = normalizeWriteError(thrown);
  }

  if (error && !options.silent) {
    // Normalize for display only; return the original error object so
    // call sites can still branch on code/details (e.g. 23505 unique checks).
    const display = normalizeWriteError(error);
    toast.error(`${options.context}: ${display.message}`);
  }

  return { data, error };
}
