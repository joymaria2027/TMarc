import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Revision 9: the LIGHT / DARK / SYSTEM control must exist on every surface
// (landing footer, storefront footer, app sidebar, auth panel). These tests
// lock the shared component's contract; surface tests assert its presence.

import ThemeToggle from '../ThemeToggle';

describe('ThemeToggle (shared component)', () => {
  beforeEach(() => {
    window.localStorage.removeItem('dg-theme-mode');
  });

  it('renders a labelled group with light, dark, and system buttons', () => {
    render(<ThemeToggle />);
    const group = screen.getByRole('group', { name: /colour theme/i });
    expect(withinGroup(group, 'Light')).toBeTruthy();
    expect(withinGroup(group, 'Dark')).toBeTruthy();
    expect(withinGroup(group, 'System')).toBeTruthy();
  });

  it('pressing a mode persists it to storage', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /dark/i }));
    expect(window.localStorage.getItem('dg-theme-mode')).toBe('dark');
    expect(screen.getByRole('button', { name: /dark/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /light/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('follows cross-tab storage events', () => {
    render(<ThemeToggle />);
    act(() => {
      window.localStorage.setItem('dg-theme-mode', 'light');
      window.dispatchEvent(new StorageEvent('storage', { key: 'dg-theme-mode', newValue: 'light' }));
    });
    expect(screen.getByRole('button', { name: /light/i })).toHaveAttribute('aria-pressed', 'true');
  });
});

function withinGroup(group: HTMLElement, name: string): HTMLElement | null {
  const buttons = Array.from(group.querySelectorAll('button'));
  return buttons.find(b => new RegExp(`^${name}$`, 'i').test(b.textContent ?? '')) ?? null;
}
