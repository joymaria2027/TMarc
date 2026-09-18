import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

// Copy-audit 2026-09-18 (humanizer + GCSE English lens) — rider/auth group.
// PRODUCT.md register: unhurried and warm. Confirmation copy states the
// outcome; it does not shout. Canonical vocabulary: Unassigned (not
// Unattended) per core-ops-a11y.
describe('rider/auth copy audit guards', () => {
  it('RiderDashboard confirmations are unhurried (no exclamation-mark toasts)', () => {
    const s = read('src/pages/RiderDashboard.tsx');
    expect(s).toMatch(/Delivery accepted\. Start it when you reach the pickup\./);
    expect(s).toMatch(/toast\.success\('Delivery claimed\.'\)/);
    expect(s).toMatch(/Delivery started\. GPS tracking is on\./);
    expect(s).not.toMatch(/toast\.success\('[^']*!'/);
  });

  it('RiderDashboard column heading uses canonical vocabulary (Unassigned, not Unattended)', () => {
    const s = read('src/pages/RiderDashboard.tsx');
    expect(s).not.toMatch(/Unattended \/ Rejected/);
    expect(s).toMatch(/Unassigned \/ Rejected/);
  });

  it('RiderDashboard empty-offers copy points at the unassigned pool', () => {
    const s = read('src/pages/RiderDashboard.tsx');
    expect(s).toMatch(/No offers right now\. Claim unassigned jobs from Deliveries\./);
    expect(s).not.toMatch(/unattended pool/);
  });

  it('Auth controls are sentence case (Sign in / Create account)', () => {
    const s = read('src/pages/Auth.tsx');
    expect(s).not.toMatch(/Sign In|Create Account/);
    expect(s).toMatch(/<TabsTrigger value="signin">Sign in<\/TabsTrigger>/);
    expect(s).toMatch(/<TabsTrigger value="signup">Create account<\/TabsTrigger>/);
  });

  it('ReceiptUpload confirmation states the outcome (no "successfully!")', () => {
    const s = read('src/components/ReceiptUpload.tsx');
    expect(s).toMatch(/toast\.success\('Receipt uploaded\.'\)/);
    expect(s).not.toMatch(/successfully!/);
  });
});
