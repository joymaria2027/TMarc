import { describe, it, expect } from 'vitest';
import { validateAuthField, getEmailAutocomplete, getPasswordAutocomplete, welcomeTargetFor } from '../auth.helpers';

describe('auth.helpers (inline errors + autocomplete)', () => {
  it('validateAuthField requires email shape and password length', () => {
    expect(validateAuthField('email', 'not-an-email')).toMatch(/email/i);
    expect(validateAuthField('email', 'a@b.com')).toBeNull();
    expect(validateAuthField('password', '123', 'signup')).toMatch(/6/);
    expect(validateAuthField('password', '123456', 'signup')).toBeNull();
    expect(validateAuthField('fullName', '', 'signup')).toMatch(/name/i);
  });

  it('autocomplete tokens are correct', () => {
    expect(getEmailAutocomplete()).toBe('email');
    expect(getPasswordAutocomplete('signin')).toBe('current-password');
    expect(getPasswordAutocomplete('signup')).toBe('new-password');
  });

  it('welcomeTargetFor maps signup intent to the JTBD flow entry', () => {
    expect(welcomeTargetFor(true, false)).toBe('/welcome?role=customer');
    expect(welcomeTargetFor(false, true)).toBe('/welcome?role=wholesaler');
    expect(welcomeTargetFor(false, false)).toBe('/welcome');
  });
});
