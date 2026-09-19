import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Slice 01 contract: JTBD doors self-segment before any form.
// Mirrors Moonly ad → tailored-flow entry using role param only.
import Onboarding from '../Onboarding';

const renderWelcome = (entry = '/welcome') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Onboarding />
    </MemoryRouter>
  );

describe('Onboarding doors (slice 01 contract)', () => {
  it('renders 4 role doors with correct routes', () => {
    renderWelcome();
    const group = screen.getByRole('group', { name: /choose how you will use/i });
    const doors = within(group).getAllByRole('link');
    expect(doors).toHaveLength(4);
    expect(screen.getByRole('link', { name: /i ride/i })).toHaveAttribute(
      'href',
      '/welcome?role=rider'
    );
    expect(screen.getByRole('link', { name: /i run deliveries/i })).toHaveAttribute(
      'href',
      '/welcome?role=merchant'
    );
    expect(screen.getByRole('link', { name: /i order/i })).toHaveAttribute(
      'href',
      '/welcome?role=customer'
    );
    expect(screen.getByRole('link', { name: /i buy in bulk/i })).toHaveAttribute(
      'href',
      '/welcome?role=wholesaler'
    );
  });

  it('shows progress Step 1 of 4 with a single h1', () => {
    renderWelcome();
    expect(screen.getByText(/step 1 of 4/i)).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('offers Skip on the doors step so users are never trapped', () => {
    renderWelcome();
    expect(screen.getByRole('link', { name: /skip/i })).toBeInTheDocument();
  });
});

describe('Onboarding insight + personalization (slice 02 contract)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const cases = [
    { role: 'rider', insight: /one-tap accept/i, cta: '/rider' },
    { role: 'merchant', insight: /live map/i, cta: '/deliveries/new' },
    { role: 'customer', insight: /follow the rider/i, cta: '/shop' },
    { role: 'wholesaler', insight: /wholesale prices/i, cta: '/wholesale' },
  ] as const;

  it.each(cases)('shows $role insight at Step 2 with a single h1 and Skip', ({ role, insight }) => {
    renderWelcome(`/welcome?role=${role}`);
    expect(screen.getByText(/step 2 of 4/i)).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(insight)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /skip/i })).toBeInTheDocument();
  });

  it('personalization uses at most 3 inputs', () => {
    renderWelcome('/welcome?role=rider');
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText(/step 3 of 4/i)).toBeInTheDocument();
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeLessThanOrEqual(3);
    expect(screen.getByRole('link', { name: /skip/i })).toBeInTheDocument();
  });

  it.each(cases)('result screen routes $role to $cta and persists answers', ({ role, cta }) => {
    renderWelcome(`/welcome?role=${role}`);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.change(screen.getByLabelText(/zone/i), { target: { value: 'Serrekunda' } });
    const boxes = screen.getAllByRole('textbox');
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(boxes[1], { target: { value: 'Test detail' } });
    fireEvent.click(screen.getByRole('button', { name: /see my session/i }));
    expect(screen.getByText(/your first session is ready/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^(start riding|create a delivery|order now|apply now)/i })).toHaveAttribute('href', cta);
    const stored = JSON.parse(window.localStorage.getItem('dg.onboarding.v1') ?? '{}');
    expect(stored.role).toBe(role);
    expect(stored.zone).toBe('Serrekunda');
  });
});

describe('Onboarding draft resume (friction-fix 02 contract)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('restores typed answers and stage after remount', () => {
    const first = renderWelcome('/welcome?role=rider');
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.change(screen.getByLabelText(/zone/i), { target: { value: 'Serrekunda' } });
    first.unmount();
    renderWelcome('/welcome?role=rider');
    expect(screen.getByText(/step 3 of 4/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/zone/i)).toHaveValue('Serrekunda');
  });

  it('clears the draft on completed submit but keeps completed answers', () => {
    renderWelcome('/welcome?role=rider');
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.change(screen.getByLabelText(/zone/i), { target: { value: 'Serrekunda' } });
    fireEvent.click(screen.getByRole('button', { name: /see my session/i }));
    expect(screen.getByText(/your first session is ready/i)).toBeInTheDocument();
    expect(window.localStorage.getItem('dg.onboarding.draft.v1')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('dg.onboarding.v1') ?? '{}').zone).toBe('Serrekunda');
  });
});
