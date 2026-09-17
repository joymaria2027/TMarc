import { describe, it, expect } from 'vitest';
import { resolveMiles, computeNetIncome, amortizedSlice } from '@/lib/netRevenue';

describe('resolveMiles priority', () => {
  it('prefers odometer when both present', () => {
    expect(resolveMiles({ startOdo: 100, endOdo: 110, actualKm: 50, estimatedKm: 99 })).toBe(10);
  });
  it('falls back to actualKm when odometer missing', () => {
    expect(resolveMiles({ actualKm: 10 })).toBeCloseTo(6.21371, 4);
  });
  it('falls back to estimatedKm last', () => {
    expect(resolveMiles({ estimatedKm: 10 })).toBeCloseTo(6.21371, 4);
  });
  it('returns 0 when nothing provided', () => {
    expect(resolveMiles({})).toBe(0);
  });
  it('ignores odometer when end < start', () => {
    expect(resolveMiles({ startOdo: 100, endOdo: 90, actualKm: 5 })).toBeCloseTo(3.10685, 4);
  });
});

describe('computeNetIncome', () => {
  it('tariff minus fuel minus amortized minus immediate, never below 0', () => {
    const r = computeNetIncome({
      tariff: 500, ratePerMile: 5, miles: { startOdo: 0, endOdo: 10 },
      prepaidFuelRemaining: 1000, amortizedSlicesTotal: 20, immediateOtherExpenses: 30,
    });
    expect(r.fuelCost).toBe(50);
    expect(r.prepaidUsed).toBe(50);
    expect(r.netIncome).toBe(400);
  });
  it('prepaidUsed is capped by remaining', () => {
    const r = computeNetIncome({
      tariff: 500, ratePerMile: 5, miles: { startOdo: 0, endOdo: 20 },
      prepaidFuelRemaining: 30, amortizedSlicesTotal: 0, immediateOtherExpenses: 0,
    });
    expect(r.fuelCost).toBe(100);
    expect(r.prepaidUsed).toBe(30);
  });
  it('clamps at 0 when deductions exceed tariff', () => {
    const r = computeNetIncome({
      tariff: 50, ratePerMile: 5, miles: { startOdo: 0, endOdo: 20 },
      prepaidFuelRemaining: 0, amortizedSlicesTotal: 0, immediateOtherExpenses: 0,
    });
    expect(r.netIncome).toBe(0);
  });
});

describe('amortizedSlice', () => {
  it('spreads evenly', () => {
    expect(amortizedSlice(1000, 50, 0)).toBe(20);
    expect(amortizedSlice(1000, 100, 0)).toBe(10);
  });
  it('caps at remaining', () => {
    expect(amortizedSlice(1000, 50, 990)).toBe(10);
  });
});

describe('e2e scenario mirror (10mi @ rate 5, tariff 300, amortized 1000/50)', () => {
  it('matches backend net=230 with fuel=50 and amortized=20', () => {
    const r = computeNetIncome({
      tariff: 300, ratePerMile: 5, miles: { startOdo: 0, endOdo: 10 },
      prepaidFuelRemaining: 500, amortizedSlicesTotal: amortizedSlice(1000, 50, 0), immediateOtherExpenses: 0,
    });
    expect(r.fuelCost).toBe(50);
    expect(r.prepaidUsed).toBe(50);
    expect(r.amortized).toBe(20);
    expect(r.netIncome).toBe(230);
  });
});

