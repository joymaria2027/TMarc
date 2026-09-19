import { describe, it, expect, beforeEach } from 'vitest';
import {
  STORAGE_KEY,
  ONBOARDING_STAGES,
  readOnboarding,
  firstSessionHint,
  onboardingEvent,
} from '../onboarding';

// Slice 03 contract: storage-backed first-run hooks + funnel event names.
// No analytics vendor — event helper is a pure name builder (hook point).
describe('onboarding lib (slice 03 contract)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns null when nothing was stored', () => {
    expect(readOnboarding()).toBeNull();
  });

  it('returns null on invalid payloads', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json');
    expect(readOnboarding()).toBeNull();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ role: 'pilot' }));
    expect(readOnboarding()).toBeNull();
  });

  it('reads back a stored role + zone', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ role: 'rider', zone: 'Serrekunda', detail: 'Bicycle' })
    );
    expect(readOnboarding()).toEqual({ role: 'rider', zone: 'Serrekunda', detail: 'Bicycle' });
  });

  it('gives a first-session hint per role using domain terms', () => {
    expect(firstSessionHint('rider')).toMatch(/first Offer/i);
    expect(firstSessionHint('merchant')).toMatch(/first Delivery/i);
    expect(firstSessionHint('customer')).toMatch(/first Order/i);
    expect(firstSessionHint('wholesaler')).toMatch(/application/i);
  });

  it('weaves the stored zone into the hint when present', () => {
    expect(firstSessionHint('rider', 'Serrekunda')).toMatch(/Serrekunda/);
    expect(firstSessionHint('customer', '')).not.toMatch(/··|undefined/);
  });

  it('defines the funnel stages and builds event names', () => {
    expect(ONBOARDING_STAGES).toEqual(['started', 'door', 'insight', 'personalized', 'activation']);
    expect(onboardingEvent('insight', 'rider')).toBe('onboarding.insight.rider');
    expect(onboardingEvent('activation', 'wholesaler')).toBe('onboarding.activation.wholesaler');
  });
});
