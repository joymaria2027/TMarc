import { describe, it, expect } from 'vitest';
import {
  buildSwitchAriaLabel,
  formatRole,
  PERM_LABELS,
} from '../rolePermissions.helpers';

describe('rolePermissions.helpers (a11y contracts)', () => {
  it('formatRole maps company_manager and prettifies underscores', () => {
    expect(formatRole('company_manager')).toBe('Merchant Manager');
    expect(formatRole('business_owner')).toBe('business owner');
  });

  it('buildSwitchAriaLabel includes role + resource + perm for screen readers', () => {
    const label = buildSwitchAriaLabel('company_manager', 'deliveries', 'can_view');
    expect(label.toLowerCase()).toContain('merchant manager');
    expect(label.toLowerCase()).toContain('deliveries');
    expect(label.toLowerCase()).toContain((PERM_LABELS['can_view'] ?? 'view').toLowerCase());
  });

  it('buildSwitchAriaLabel handles custom roles/resources', () => {
    const label = buildSwitchAriaLabel('dispatcher', 'payouts', 'can_delete');
    expect(label).toContain('dispatcher');
    expect(label).toContain('payouts');
    expect(label.toLowerCase()).toContain('delete');
  });
});
