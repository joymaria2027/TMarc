import { useEffect, useState } from "react";
import { getThemeMode, setThemeMode, subscribeThemeMode, type ThemeMode } from "@/hooks/usePrefersDark";

/**
 * LIGHT / DARK / SYSTEM toggle, shared by every surface (landing footer,
 * storefront footer, app sidebar, auth panel). Selection persists through
 * the theme store (`dg-theme-mode`) and applies site-wide, with cross-tab
 * sync handled by usePrefersDark.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());
  const choose = (next: ThemeMode) => {
    setThemeMode(next);
    setMode(next);
  };
  // Follow mode changes from other toggles and other tabs.
  useEffect(() => subscribeThemeMode(() => setMode(getThemeMode())), []);
  return (
    <div className={`font-mono text-[11px] uppercase tracking-[0.18em] ${className}`} role="group" aria-label="Colour theme">
      {(["light", "dark", "system"] as const).map((m, i) => (
        <span key={m}>
          {i > 0 && <span className="text-muted-foreground/50"> / </span>}
          <button
            type="button"
            onClick={() => choose(m)}
            aria-pressed={mode === m}
            className={
              mode === m
                ? "underline underline-offset-4 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }
          >
            {m}
          </button>
        </span>
      ))}
    </div>
  );
}
