import { describe, it, expect } from 'vitest';
import { pageEmptyKeys, pageEmptyStates } from '@/lib/pageEmptyStates';

// Slice 06 contract: every swept page has a guided empty panel (what belongs
// + how it populates); CTAs point at real routes; CONTEXT.md terms
// (Claim/run allowed where canonical: unassigned pool, payroll runs).
describe('pageEmptyStates (slice 06 contract)', () => {
  it('covers the sweep pages with at least one guided panel each', () => {
    expect([...pageEmptyKeys].sort()).toEqual(
      [
        'rejectedDeliveries',
        'riders',
        'gpsTracker',
        'wallet',
        'riderExpenses',
        'payroll',
        'merchantOrders',
        'webhookEvents',
        'dispatchAudit',
        'paymentBackfill',
      ].sort()
    );
    for (const key of pageEmptyKeys) {
      expect(Object.keys(pageEmptyStates[key]).length).toBeGreaterThan(0);
    }
  });

  it('states what belongs and how it populates, with real-route CTAs', () => {
    const realRoutes = new Set([
      '/deliveries',
      '/deliveries/new',
      '/settlements',
      '/wallet',
      '/merchants',
      '/riders',
      '/alerts',
      '/shop',
      '/rls-verification',
      '/admin/webhook-events',
    ]);
    let withAction = 0;
    for (const key of pageEmptyKeys) {
      for (const [panel, p] of Object.entries(pageEmptyStates[key])) {
        expect(p.title.trim().length, `${key}/${panel} title`).toBeGreaterThan(0);
        expect(p.body.trim().length, `${key}/${panel} body`).toBeGreaterThan(0);
        if (p.actionHref) {
          withAction += 1;
          expect(p.actionLabel, `${key}/${panel} label`).toBeTruthy();
          expect(realRoutes.has(p.actionHref), `${key}/${panel} → ${p.actionHref}`).toBe(true);
        }
      }
    }
    expect(withAction).toBeGreaterThan(0);
  });

  it('uses CONTEXT.md domain terms only', () => {
    const banned = /\b(driver|courier|restaurant|store|job)\b/i;
    for (const key of pageEmptyKeys) {
      for (const [panel, p] of Object.entries(pageEmptyStates[key])) {
        for (const text of [p.title, p.body]) {
          expect(`${key}/${panel}: ${text}`).not.toMatch(banned);
        }
      }
    }
  });
});
