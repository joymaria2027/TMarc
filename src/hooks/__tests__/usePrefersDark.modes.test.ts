import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePrefersDark, setThemeMode, getThemeMode } from '../usePrefersDark';

// The theme mode store backs the Icebug-style LIGHT / DARK / SYSTEM footer
// toggle. usePrefersDark() keeps its no-arg signature so existing callers
// (StorefrontLayout and every storefront page) follow the toggle site-wide.

let systemDark = false;
const mqListeners = new Set<() => void>();

const mqStub = {
  get matches() { return systemDark; },
  addEventListener: (_: string, fn: () => void) => { mqListeners.add(fn); },
  removeEventListener: (_: string, fn: () => void) => { mqListeners.delete(fn); },
  addListener: (fn: () => void) => { mqListeners.add(fn); },
  removeListener: (fn: () => void) => { mqListeners.delete(fn); },
};

beforeEach(() => {
  systemDark = false;
  mqListeners.clear();
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => mqStub));
  document.documentElement.classList.remove('dark');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme mode store (LIGHT / DARK / SYSTEM)', () => {
  it('defaults to system and applies the OS preference on mount', () => {
    systemDark = true;
    renderHook(() => usePrefersDark());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(getThemeMode()).toBe('system');
  });

  it('light mode removes the dark class even when the OS prefers dark', () => {
    systemDark = true;
    renderHook(() => usePrefersDark());
    act(() => { setThemeMode('light'); });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(getThemeMode()).toBe('light');
  });

  it('dark mode adds the class even when the OS prefers light', () => {
    systemDark = false;
    renderHook(() => usePrefersDark());
    act(() => { setThemeMode('dark'); });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('system mode follows a live OS change', () => {
    renderHook(() => usePrefersDark());
    act(() => {
      systemDark = true;
      mqListeners.forEach(fn => fn());
    });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    act(() => { setThemeMode('system'); });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persists the chosen mode for the next visit', () => {
    renderHook(() => usePrefersDark());
    act(() => { setThemeMode('light'); });
    expect(localStorage.getItem('dg-theme-mode')).toBe('light');
  });

  it('restores the persisted mode on the next mount', () => {
    localStorage.setItem('dg-theme-mode', 'dark');
    systemDark = false;
    renderHook(() => usePrefersDark());
    expect(getThemeMode()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
