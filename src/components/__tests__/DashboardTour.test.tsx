import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardTour, { TourReplay } from '../DashboardTour';
import { dashboardTours, tourRoles, tourKey, pageTours, pageTourIds } from '@/lib/dashboardTours';

// Slice 02 contract: 3-step spotlight micro-tours, Skip on every step,
// progress, first-seen trigger, dismiss respected, reduced-motion safe.
const joyrideState = vi.hoisted(() => ({ lastProps: null as null | Record<string, unknown> }));

vi.mock('react-joyride', () => ({
  Joyride: (props: Record<string, unknown>) => {
    joyrideState.lastProps = props;
    return null;
  },
  STATUS: { FINISHED: 'finished', SKIPPED: 'skipped', ERROR: 'error', RUNNING: 'running' },
}));

const fireJoyride = (status: string) => {
  const onEvent = joyrideState.lastProps?.onEvent as ((d: { status: string }) => void) | undefined;
  if (!onEvent) throw new Error('Joyride onEvent not captured');
  act(() => {
    onEvent({ status });
  });
};

describe('dashboardTours map (slice 02 contract)', () => {
  it('covers all six dashboard roles with exactly 3 steps', () => {
    expect([...tourRoles].sort()).toEqual(
      ['accountant', 'admin', 'app_developer', 'business_owner', 'merchant_manager', 'rider'].sort()
    );
    for (const role of tourRoles) {
      expect(dashboardTours[role], `${role} tour`).toHaveLength(3);
    }
  });

  it('gives every step a spotlight target, title and one-concept body', () => {
    for (const role of tourRoles) {
      for (const step of dashboardTours[role]) {
        expect(step.target.startsWith('[data-tour="'), `${role} target`).toBe(true);
        expect(step.title.trim().length).toBeGreaterThan(0);
        expect(step.content.trim().length).toBeGreaterThan(0);
        expect(step.content.length, `${role}/${step.title} one concept`).toBeLessThanOrEqual(140);
      }
    }
  });

  it('uses CONTEXT.md domain terms only', () => {
    const banned = /\b(claim|driver|courier|restaurant|store|job)\b/i;
    for (const role of tourRoles) {
      for (const step of dashboardTours[role]) {
        expect(`${role}/${step.title}: ${step.content}`).not.toMatch(banned);
      }
    }
  });
});

describe('DashboardTour wrapper (slice 02 contract)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    joyrideState.lastProps = null;
  });

  const renderTour = (role = 'admin', runWhen = true, replaySignal?: number) =>
    render(
      <MemoryRouter>
        <DashboardTour role={role} runWhen={runWhen} replaySignal={replaySignal} />
      </MemoryRouter>
    );

  it('auto-runs on first sight when the dashboard is empty', () => {
    renderTour('admin', true);
    expect(joyrideState.lastProps?.run).toBe(true);
    expect(joyrideState.lastProps?.continuous).toBe(true);
  });

  it('stays quiet for power users (data present) and after completion', () => {
    renderTour('admin', false);
    expect(joyrideState.lastProps?.run).toBe(false);
    const { unmount } = renderTour('admin', true);
    expect(joyrideState.lastProps?.run).toBe(true);
    unmount();
    window.localStorage.setItem(tourKey('admin'), 'done');
    renderTour('admin', true);
    expect(joyrideState.lastProps?.run).toBe(false);
  });

  it('shows Skip, progress and Back: dismissable on every step', () => {
    renderTour('rider', true);
    const options = joyrideState.lastProps?.options as Record<string, unknown>;
    expect((options.buttons as string[])).toContain('skip');
    expect(options.showProgress).toBe(true);
    expect(options.closeButtonAction).toBe('skip');
    expect(options.dismissKeyAction).toBe('skip');
    expect(options.overlayClickAction).toBe('skip');
    expect((options.targetWaitTimeout as number)).toBeGreaterThanOrEqual(1000);
    const locale = joyrideState.lastProps?.locale as Record<string, string>;
    expect(locale.skip).toMatch(/skip/i);
    expect(locale.nextWithProgress).toContain('{current}');
    expect(locale.nextWithProgress).toContain('{total}');
  });

  it('persists completion on finish AND on skip — never auto-reshows', () => {
    renderTour('admin', true);
    fireJoyride('finished');
    expect(window.localStorage.getItem(tourKey('admin'))).toBe('done');
    expect(joyrideState.lastProps?.run).toBe(false);

    window.localStorage.clear();
    renderTour('rider', true);
    fireJoyride('skipped');
    expect(window.localStorage.getItem(tourKey('rider'))).toBe('dismissed');
    expect(joyrideState.lastProps?.run).toBe(false);
  });

  it('stops quietly when a target never appears (no crash)', () => {
    renderTour('admin', true);
    fireJoyride('error');
    expect(joyrideState.lastProps?.run).toBe(false);
  });

  it('replays on demand via replaySignal even after completion', () => {
    window.localStorage.setItem(tourKey('admin'), 'done');
    const { rerender } = render(
      <MemoryRouter>
        <DashboardTour role="admin" runWhen={false} replaySignal={0} />
      </MemoryRouter>
    );
    expect(joyrideState.lastProps?.run).toBe(false);
    rerender(
      <MemoryRouter>
        <DashboardTour role="admin" runWhen={false} replaySignal={1} />
      </MemoryRouter>
    );
    expect(joyrideState.lastProps?.run).toBe(true);
  });

  it('skips smooth scrolling under prefers-reduced-motion', () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q === '(prefers-reduced-motion: reduce)',
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      renderTour('admin', true);
      const options = joyrideState.lastProps?.options as Record<string, unknown>;
      expect(options.scrollDuration).toBe(0);
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('TourReplay (slice 02 contract)', () => {
  beforeEach(() => window.localStorage.clear());

  it('clears the completion key and replays the matching tour', () => {
    window.localStorage.setItem(tourKey('admin'), 'done');
    render(
      <MemoryRouter>
        <DashboardTour role="admin" runWhen={false} />
        <TourReplay role="admin" />
      </MemoryRouter>
    );
    expect(joyrideState.lastProps?.run).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /take the tour/i }));
    expect(window.localStorage.getItem(tourKey('admin'))).toBeNull();
    expect(joyrideState.lastProps?.run).toBe(true);
  });
});

describe('pageTours map + override props (slice 04 contract)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    joyrideState.lastProps = null;
  });

  it('defines the deliveries-queue tour in exactly 3 steps', () => {
    expect([...pageTourIds]).toContain('deliveries-queue');
    expect(pageTours['deliveries-queue']).toHaveLength(3);
    for (const step of pageTours['deliveries-queue']) {
      expect(step.target.startsWith('[data-tour="deliveries-')).toBe(true);
      expect(step.content.length).toBeLessThanOrEqual(140);
    }
  });

  it('drives steps and storage from tourId/tourSteps, leaving role keys alone', () => {
    const steps = pageTours['deliveries-queue'].map((s) => ({ ...s }));
    render(
      <MemoryRouter>
        <DashboardTour role="admin" tourId="deliveries-queue" tourSteps={steps} runWhen={true} />
      </MemoryRouter>
    );
    expect(joyrideState.lastProps?.run).toBe(true);
    const joySteps = joyrideState.lastProps?.steps as Array<{ target: string }>;
    expect(joySteps.map((s) => s.target)).toEqual(steps.map((s) => s.target));
    fireJoyride('finished');
    expect(window.localStorage.getItem(tourKey('deliveries-queue'))).toBe('done');
    // The dashboard role key is untouched by the page tour.
    expect(window.localStorage.getItem(tourKey('admin'))).toBeNull();
  });

  it('replays the page tour via tourId without touching role state', () => {
    window.localStorage.setItem(tourKey('deliveries-queue'), 'dismissed');
    const steps = pageTours['deliveries-queue'].map((s) => ({ ...s }));
    render(
      <MemoryRouter>
        <DashboardTour role="admin" tourId="deliveries-queue" tourSteps={steps} runWhen={false} />
        <TourReplay role="admin" tourId="deliveries-queue" />
      </MemoryRouter>
    );
    expect(joyrideState.lastProps?.run).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /take the tour/i }));
    expect(window.localStorage.getItem(tourKey('deliveries-queue'))).toBeNull();
    expect(joyrideState.lastProps?.run).toBe(true);
  });
});

describe('pageTours alerts + settlements (slice 05 contract)', () => {
  it('defines both tours in exactly 3 steps with page-scoped targets', () => {
    expect([...pageTourIds]).toEqual(
      expect.arrayContaining(['alerts-triage', 'settlements-approval'])
    );
    for (const id of ['alerts-triage', 'settlements-approval'] as const) {
      expect(pageTours[id]).toHaveLength(3);
      for (const step of pageTours[id]) {
        expect(step.target.startsWith('[data-tour="'), `${id} target`).toBe(true);
        expect(step.title.trim().length).toBeGreaterThan(0);
        expect(step.content.trim().length).toBeGreaterThan(0);
        expect(step.content.length, `${id}/${step.title} one concept`).toBeLessThanOrEqual(140);
      }
    }
  });

  it('keeps page-tour copy in domain terms (Claim allowed on ops surfaces)', () => {
    const banned = /\b(driver|courier|restaurant|store|job)\b/i;
    for (const id of ['alerts-triage', 'settlements-approval'] as const) {
      for (const step of pageTours[id]) {
        expect(`${id}/${step.title}: ${step.content}`).not.toMatch(banned);
      }
    }
  });
});
