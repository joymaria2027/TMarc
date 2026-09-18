import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The public marketing page at "/" is the first thing logged-out visitors see.
// Contract: one outcome headline, CTAs for both visitor types, three steps,
// three objections, legal links, and decorative markup hidden from screen
// readers.

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    roles: [],
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    hasRole: vi.fn(() => false),
  }),
}));

import LandingPage from '../LandingPage';

const renderLanding = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <LandingPage />
    </MemoryRouter>
  );

describe('LandingPage (public marketing page at "/")', () => {
  it('leads with the outcome headline', () => {
    renderLanding();
    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toMatch(/track every delivery/i);
    expect(h1[0].textContent).toMatch(/settle every dalasi/i);
  });

  it('gives ops visitors and customer shoppers separate doors', () => {
    renderLanding();
    expect(screen.getAllByRole('link', { name: /start free/i })[0]).toHaveAttribute(
      'href',
      '/auth?tab=signup'
    );
    expect(screen.getAllByRole('link', { name: /order delivery|order a delivery/i }).length)
      .toBeGreaterThanOrEqual(1);
  });

  it('explains the product in exactly three steps', () => {
    const { container } = renderLanding();
    const steps = container.querySelector('ol')!;
    const items = within(steps).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    const text = items.map(i => i.textContent).join(' ');
    expect(text).toMatch(/riders accept/i);
    expect(text).toMatch(/managers watch/i);
    expect(text).toMatch(/finance settles/i);
  });

  it('answers exactly three objections', () => {
    renderLanding();
    const heading = screen.getByRole('heading', { name: /fair questions/i });
    const list = heading.closest('section')!.querySelector('ul')!;
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('closes with a second Start free CTA and carries legal links', () => {
    renderLanding();
    const heading = screen.getByRole('heading', { name: /accounted for by tonight/i });
    const cta = within(heading.closest('section')!).getByRole('link', { name: /start free/i });
    expect(cta).toHaveAttribute('href', '/auth?tab=signup');

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });

  it('hides the decorative dispatch card from assistive tech', () => {
    const { container } = renderLanding();
    // Several small icons are aria-hidden; the whole dispatch card must be too.
    const card = Array.from(container.querySelectorAll('[aria-hidden="true"]'))
      .find(el => /live dispatch/i.test(el.textContent ?? ''));
    expect(card).toBeDefined();
  });
});
