import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EmptyState from '@/components/EmptyState';
import { dashboardEmptyStates, emptyStateRoles } from '@/lib/dashboardEmptyStates';

// Slice 01 contract: every empty panel states what belongs there + how it gets
// populated + at most one CTA that starts the task in place (CONTEXT.md terms).
const renderEmpty = (props: {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
}) =>
  render(
    <MemoryRouter>
      <EmptyState {...props} />
    </MemoryRouter>
  );

describe('EmptyState (slice 01 contract)', () => {
  it('renders title, body and a single CTA link', () => {
    renderEmpty({
      title: 'No deliveries yet',
      body: 'Create an Order to generate a Delivery.',
      actionLabel: 'Create Delivery',
      actionHref: '/deliveries/new',
    });
    expect(screen.getByText('No deliveries yet')).toBeInTheDocument();
    expect(screen.getByText('Create an Order to generate a Delivery.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Create Delivery' });
    expect(link.getAttribute('href')).toBe('/deliveries/new');
    // Exactly one action — no stacked CTAs.
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('renders guidance without a CTA when the panel is inbound-only', () => {
    renderEmpty({ title: 'No notifications', body: 'Tariff updates appear here.' });
    expect(screen.getByText('No notifications')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('covers all six dashboard roles', () => {
    expect([...emptyStateRoles].sort()).toEqual(
      ['accountant', 'admin', 'app_developer', 'business_owner', 'merchant_manager', 'rider'].sort()
    );
  });

  it('gives every role at least one actionable empty state with a real route', () => {
    const realRoutes = new Set([
      '/deliveries',
      '/deliveries/new',
      '/settlements',
      '/wallet',
      '/merchants',
      '/rls-verification',
      '/admin/webhook-events',
      '/alerts',
      '/rider',
    ]);
    for (const role of emptyStateRoles) {
      const panels = dashboardEmptyStates[role];
      expect(Object.keys(panels).length).toBeGreaterThan(0);
      const withAction = Object.values(panels).filter((p) => p.actionHref);
      expect(withAction.length, `${role} needs a CTA`).toBeGreaterThan(0);
      for (const p of withAction) {
        expect(p.actionLabel, `${role} CTA label`).toBeTruthy();
        expect(realRoutes.has(p.actionHref as string), `${role} CTA ${p.actionHref} must be a real route`).toBe(true);
      }
    }
  });

  it('uses CONTEXT.md domain terms only (no Claim, driver, restaurant, store)', () => {
    const banned = /\b(claim|driver|courier|restaurant|store)\b/i;
    for (const role of emptyStateRoles) {
      for (const [panel, p] of Object.entries(dashboardEmptyStates[role])) {
        for (const text of [p.title, p.body]) {
          expect(`${role}/${panel}: ${text}`).not.toMatch(banned);
        }
      }
    }
  });
});
