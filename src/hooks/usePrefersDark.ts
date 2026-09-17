import { useEffect } from "react";

/**
 * Syncs Tailwind `dark` class with iOS appearance.
 * iOS sends prefers-color-scheme media query, not a class —
 * without this, class-based dark mode never activates on iPhone.
 */
export function usePrefersDark(): void {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
    };
    apply();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    // Safari < 14 fallback
    const legacy = mq as unknown as { addListener: (fn: () => void) => void; removeListener: (fn: () => void) => void };
    if (typeof legacy.addListener === "function") {
      legacy.addListener(apply);
      return () => legacy.removeListener(apply);
    }
  }, []);
}
