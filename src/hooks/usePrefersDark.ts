import { useEffect } from "react";

/**
 * Theme mode: "light" | "dark" | "system", persisted in localStorage.
 * usePrefersDark() keeps its no-arg signature so existing callers
 * (StorefrontLayout and every storefront page) follow the toggle site-wide —
 * any mounted hook instance re-applies the class when the mode changes.
 */
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "dg-theme-mode";

let mode: ThemeMode = readStoredMode();
const modeListeners = new Set<() => void>();

// Module-level cross-tab sync: the store owns the storage event so every
// subscriber (toggles, layouts) stays current without needing usePrefersDark
// mounted on the page.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      const stored = e.newValue as ThemeMode;
      if (stored === "light" || stored === "dark" || stored === "system") {
        mode = stored;
        applyMode();
      }
    }
  });
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  } catch {
    return "system";
  }
}

let notifying = false;

function applyMode(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && systemDark);
  document.documentElement.classList.toggle("dark", dark);
  // Re-entrancy guard: a listener that calls applyMode (e.g. re-syncing from
  // storage) must not recurse through the notification loop again.
  if (notifying) return;
  notifying = true;
  try {
    modeListeners.forEach((fn) => fn());
  } finally {
    notifying = false;
  }
}

/** Current theme mode. */
export function getThemeMode(): ThemeMode {
  return mode;
}

/** Subscribe to theme-mode changes (same-tab via setThemeMode, cross-tab via storage sync). */
export function subscribeThemeMode(fn: () => void): () => void {
  modeListeners.add(fn);
  return () => {
    modeListeners.delete(fn);
  };
}

/** Set the theme mode, persist it, and re-apply the dark class everywhere. */
export function setThemeMode(next: ThemeMode): void {
  mode = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode / storage quota: the toggle still works for this visit.
  }
  applyMode();
}

/**
 * Syncs Tailwind `dark` class with the chosen theme mode. With no argument it
 * follows the store, so iOS appearance switches still work (the original
 * behavior) and the footer toggle applies site-wide.
 */
export function usePrefersDark(): void {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyMode();
    const onModeChange = () => {
      // Re-read storage in case another tab changed the mode; only re-apply
      // when something actually moved (applyMode already ran for this change).
      const stored = readStoredMode();
      if (stored !== mode) {
        mode = stored;
        applyMode();
      }
    };

    // Re-sync with storage on every mount: the module-level mode was captured
    // at import time, and another tab or a prior visit may have moved on.
    const stored = readStoredMode();
    if (stored !== mode) mode = stored;

    apply();
    mq.addEventListener("change", apply);
    modeListeners.add(onModeChange);

    return () => {
      mq.removeEventListener("change", apply);
      modeListeners.delete(onModeChange);
    };
  }, []);
}
