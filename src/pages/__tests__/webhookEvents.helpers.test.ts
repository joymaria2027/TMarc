import { describe, it, expect } from 'vitest';
import {
  getWebhookStatusToken,
  getSignatureToken,
  filterWebhookEvents,
} from '../webhookEvents.helpers';

describe('webhookEvents.helpers (token-only badges)', () => {
  it('status tokens use success/warning/destructive/info tokens, no hardcoded palette', () => {
    const processed = getWebhookStatusToken('processed');
    const failed = getWebhookStatusToken('failed');
    const pending = getWebhookStatusToken('pending');
    const duplicate = getWebhookStatusToken('duplicate');
    expect(processed).toContain('bg-success');
    expect(failed).toContain('bg-destructive');
    expect(pending).toContain('bg-warning');
    // duplicate maps to info token
    expect(duplicate).toContain('bg-info');
    for (const t of [processed, failed, pending, duplicate]) {
      expect(t).not.toContain('green-100');
      expect(t).not.toContain('red-100');
      expect(t).not.toContain('blue-100');
      expect(t).not.toContain('amber-100');
      expect(t).not.toContain('gray-100');
    }
  });

  it('signature tokens use tokens', () => {
    expect(getSignatureToken(true)).toContain('bg-success');
    expect(getSignatureToken(false)).toContain('bg-destructive');
    expect(getSignatureToken(null)).toContain('variant-outline');
  });

  it('filterWebhookEvents is case-insensitive across type/ref/order', () => {
    const events = [
      { event_type: 'Payment.Succeeded', payment_reference: 'REF123', order_id: 'aaa' },
      { event_type: 'payment.failed', payment_reference: 'xyz', order_id: 'BBB' },
    ];
    expect(filterWebhookEvents(events, '').length).toBe(2);
    expect(filterWebhookEvents(events, 'succeeded').length).toBe(1);
    expect(filterWebhookEvents(events, 'ref123').length).toBe(1);
    expect(filterWebhookEvents(events, 'bbb').length).toBe(1);
  });
});
