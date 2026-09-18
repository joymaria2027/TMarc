import { describe, it, expect } from 'vitest';
import { maskPhone, maskPhonesInSample, hasSensitiveLeak } from '../rlsVerification.helpers';

describe('rlsVerification.helpers (PII masking)', () => {
  it('maskPhone keeps last 2-4 chars, masks rest', () => {
    expect(maskPhone('+2201234567')).toContain('67');
    expect(maskPhone('+2201234567')).not.toContain('123456');
    expect(maskPhone(null)).toBe('—');
    expect(maskPhone('')).toBe('—');
  });

  it('maskPhonesInSample masks phone fields without mutating', () => {
    const sample = [{ user_id: '1', full_name: 'A', phone: '+2201112222' }];
    const masked = maskPhonesInSample(sample);
    expect(masked[0].phone).not.toBe('+2201112222');
    expect(sample[0].phone).toBe('+2201112222');
  });

  it('hasSensitiveLeak detects withdrawal_pin keys', () => {
    expect(hasSensitiveLeak([{ phone: 'x' }])).toBe(true);
    expect(hasSensitiveLeak([{ withdrawal_pin: '1' }])).toBe(true);
    expect(hasSensitiveLeak([{ full_name: 'A' }])).toBe(false);
  });
});
