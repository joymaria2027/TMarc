export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const digits = String(phone).replace(/\s/g, '');
  if (digits.length <= 4) return '••••';
  const last = digits.slice(-2);
  return `••••••${last}`;
}

export function maskPhonesInSample<T extends Record<string, unknown>>(sample: T[]): T[] {
  return sample.map((row) => {
    if (!row || typeof row !== 'object' || !('phone' in row)) return row;
    return { ...row, phone: maskPhone(row.phone as string | null) };
  });
}

export function hasSensitiveLeak(sample: Record<string, unknown>[]): boolean {
  return sample.some((r) => r && ('phone' in r || 'withdrawal_pin' in r));
}
