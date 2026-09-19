import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GettingStartedChecklist from '../GettingStartedChecklist';
import {
  checklistRoles,
  checklistKey,
  buildAdminChecklist,
  buildRiderChecklist,
  buildManagerChecklist,
  buildAccountantChecklist,
  buildOwnerChecklist,
  buildDeveloperChecklist,
} from '@/lib/dashboardChecklists';
import type { ChecklistItem } from '@/lib/dashboardChecklists';

// Slice 03 contract: dismissible ≤4-item checklists, task-named, quick-win
// first, real-event completion (never click-through), progress + success.
const items = (done: boolean[] = [false, false, false]): ChecklistItem[] => [
  { id: 'a', label: 'Create first Delivery', actionLabel: 'Create Delivery', actionHref: '/deliveries/new', done: done[0] },
  { id: 'b', label: 'Assign a Rider', actionLabel: 'Open queue', actionHref: '/deliveries', done: done[1] },
  { id: 'c', label: 'Review first Settlement', actionLabel: 'View Settlements', actionHref: '/settlements', done: done[2] },
];

const renderList = (role = 'admin', list: ChecklistItem[] = items(), onOpenChange?: (open: boolean) => void, onAction?: (id: string) => void) =>
  render(
    <MemoryRouter>
      <GettingStartedChecklist role={role} items={list} onOpenChange={onOpenChange} onAction={onAction} />
    </MemoryRouter>
  );

describe('checklist builders (slice 03 contract)', () => {
  it('covers all six dashboard roles with at most 4 items', () => {
    expect([...checklistRoles].sort()).toEqual(
      ['accountant', 'admin', 'app_developer', 'business_owner', 'merchant_manager', 'rider'].sort()
    );
    const lists = [
      buildAdminChecklist({ total: 0, active: 0, delivered: 0, settled: false }),
      buildRiderChecklist({ isOnline: false, queueCount: 0, deliveredCount: 0 }),
      buildManagerChecklist({ merchantCount: 0, tariffCount: 0, deliveryCount: 0 }),
      buildAccountantChecklist({ settledCount: 0, withdrawalsTotal: 0, withdrawalsPending: 0, deliveredTotal: 0, pendingSettlements: 0 }),
      buildOwnerChecklist({ merchantCount: 0, deliveredCount: 0, settled: false }),
      buildDeveloperChecklist({ merchantCount: 0, riderCount: 0, deliveryCount: 0, alertCount: 0 }),
    ];
    for (const list of lists) {
      expect(list.length).toBeGreaterThan(0);
      expect(list.length).toBeLessThanOrEqual(4);
    }
  });

  it('names items as tasks and completes on real events, not clicks', () => {
    const banned = /\b(configuration|management|overview|dashboard)\b/i;
    const done = buildAdminChecklist({ total: 5, active: 2, delivered: 1, settled: true });
    expect(done.every((i) => i.done)).toBe(true);
    const fresh = buildAdminChecklist({ total: 0, active: 0, delivered: 0, settled: false });
    expect(fresh.some((i) => i.done)).toBe(false);
    for (const item of [...done, ...fresh]) {
      expect(item.label).not.toMatch(banned);
    }
    // Rider quick win: already online counts immediately.
    expect(buildRiderChecklist({ isOnline: true, queueCount: 0, deliveredCount: 0 })[0].done).toBe(true);
    // Withdrawal queue clears only on real resolution, not on viewing.
    expect(
      buildAccountantChecklist({ settledCount: 0, withdrawalsTotal: 3, withdrawalsPending: 0, deliveredTotal: 0, pendingSettlements: 0 })[1].done
    ).toBe(true);
    expect(
      buildAccountantChecklist({ settledCount: 0, withdrawalsTotal: 3, withdrawalsPending: 1, deliveredTotal: 0, pendingSettlements: 0 })[1].done
    ).toBe(false);
  });

  it('points actions at real routes with CONTEXT.md terms only', () => {
    const realRoutes = new Set(['/deliveries', '/deliveries/new', '/settlements', '/wallet', '/merchants', '/riders', '/alerts', '/rls-verification', '/admin/webhook-events']);
    const banned = /\b(claim|driver|courier|restaurant|store|job|run)\b/i;
    const all = [
      ...buildAdminChecklist({ total: 0, active: 0, delivered: 0, settled: false }),
      ...buildRiderChecklist({ isOnline: false, queueCount: 0, deliveredCount: 0 }),
      ...buildManagerChecklist({ merchantCount: 0, tariffCount: 0, deliveryCount: 0 }),
      ...buildAccountantChecklist({ settledCount: 0, withdrawalsTotal: 0, withdrawalsPending: 0, deliveredTotal: 0, pendingSettlements: 0 }),
      ...buildOwnerChecklist({ merchantCount: 0, deliveredCount: 0, settled: false }),
      ...buildDeveloperChecklist({ merchantCount: 0, riderCount: 0, deliveryCount: 0, alertCount: 0 }),
    ];
    expect(all.filter((i) => i.actionHref).length).toBeGreaterThan(0);
    for (const item of all) {
      if (item.actionHref) expect(realRoutes.has(item.actionHref), `${item.id} → ${item.actionHref}`).toBe(true);
      expect(`${item.label} ${item.detail ?? ''}`).not.toMatch(banned);
    }
  });
});

describe('GettingStartedChecklist (slice 03 contract)', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows progress, one CTA per item, and checks off real events', () => {
    renderList('admin', items([false, true, false]));
    expect(screen.getByText('1 of 3 complete')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Delivery' })).toHaveAttribute('href', '/deliveries/new');
    // Completed item shows a check, not a second CTA.
    const doneRow = screen.getByText('Assign a Rider').closest('li') as HTMLElement;
    expect(doneRow.textContent).toMatch(/done/i);
    expect(doneRow.querySelector('a')).toBeNull();
  });

  it('celebrates fresh completion, then stays quiet on revisit', () => {
    const onOpenChange = vi.fn();
    const { unmount } = renderList('admin', items([true, true, true]), onOpenChange);
    expect(screen.getByRole('status').textContent).toMatch(/set|ready|complete/i);
    expect(window.localStorage.getItem(checklistKey('admin'))).toBe('done');
    expect(onOpenChange).toHaveBeenCalledWith(true);
    unmount();
    // Revisit with everything still done: compact replay entry, charts stay.
    const reopen = vi.fn();
    renderList('admin', items([true, true, true]), reopen);
    expect(reopen).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: /getting started/i })).toBeInTheDocument();
  });

  it('dismisses without completing and offers replay', () => {
    const onOpenChange = vi.fn();
    renderList('admin', items(), onOpenChange);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(window.localStorage.getItem(checklistKey('admin'))).toBe('dismissed');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // Replay entry restores the list.
    fireEvent.click(screen.getByRole('button', { name: /getting started/i }));
    expect(screen.getByText('0 of 3 complete')).toBeInTheDocument();
  });

  it('never checks off on click-through: actions navigate, done comes from data', () => {
    const onAction = vi.fn();
    renderList('rider', [
      { id: 'online', label: 'Go Online', actionLabel: 'Go online now', done: false },
    ], undefined, onAction);
    fireEvent.click(screen.getByRole('button', { name: 'Go online now' }));
    expect(onAction).toHaveBeenCalledWith('online');
    // Clicking the action does NOT mark the item done.
    expect(screen.queryByText(/done/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(checklistKey('rider'))).toBeNull();
  });

  it('reports openness so the dashboard can swap charts back in', () => {
    const onOpenChange = vi.fn();
    render(
      <MemoryRouter>
        <GettingStartedChecklist role="admin" items={items()} onOpenChange={onOpenChange} />
      </MemoryRouter>
    );
    act(() => {});
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
