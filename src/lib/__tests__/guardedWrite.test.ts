import { describe, it, expect, vi, beforeEach } from 'vitest';
import { guardedWrite } from '../guardedWrite';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe('guardedWrite', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  it('passes data through on success', async () => {
    const row = { id: '1' };
    const result = await guardedWrite(Promise.resolve({ data: row, error: null }), {
      context: 'Flag delivery',
    });
    expect(result).toEqual({ data: row, error: null });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does not toast when error is null', async () => {
    await guardedWrite(Promise.resolve({ data: null, error: null }), { context: 'X' });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('toasts context + supabase error message', async () => {
    const error = { message: 'new row violates row-level security policy' };
    await guardedWrite(Promise.resolve({ data: null, error }), { context: 'Flag delivery' });
    expect(toast.error).toHaveBeenCalledWith('Flag delivery: new row violates row-level security policy');
  });

  it('falls back to code when message is empty', async () => {
    await guardedWrite(Promise.resolve({ data: null, error: { message: '', code: '23505' } }), {
      context: 'Assign',
    });
    expect(toast.error).toHaveBeenCalledWith('Assign: 23505');
  });

  it('normalizes thrown Errors', async () => {
    await guardedWrite(Promise.reject(new Error('network down')), { context: 'Save' });
    expect(toast.error).toHaveBeenCalledWith('Save: network down');
  });

  it('normalizes string throws', async () => {
    await guardedWrite(Promise.reject('boom'), { context: 'Save' });
    expect(toast.error).toHaveBeenCalledWith('Save: boom');
  });

  it('normalizes object throws via details/hint/code', async () => {
    await guardedWrite(Promise.reject({ details: 'Key is missing.' }), { context: 'Save' });
    expect(toast.error).toHaveBeenCalledWith('Save: Key is missing.');
  });

  it('falls back to Unknown error for empty throws', async () => {
    await guardedWrite(Promise.reject(undefined), { context: 'Save' });
    expect(toast.error).toHaveBeenCalledWith('Save: Unknown error');
  });

  it('respects silent: true (no toast, error still returned)', async () => {
    const error = { message: 'duplicate key' };
    const result = await guardedWrite(Promise.resolve({ data: null, error }), {
      context: 'Delete',
      silent: true,
    });
    expect(result.error).toBe(error);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('respects silent: true for thrown errors too', async () => {
    const result = await guardedWrite(Promise.reject(new Error('x')), { context: 'Y', silent: true });
    expect(result.error?.message).toBe('x');
    expect(toast.error).not.toHaveBeenCalled();
  });
});
