/**
 * iOS HIG haptics helper with web fallback.
 * Uses @capacitor/haptics when available, otherwise navigator.vibrate.
 * All functions are safe to call on web (no-op on unsupported).
 */

type ImpactStyle = "LIGHT" | "MEDIUM" | "HEAVY";
type NotificationType = "SUCCESS" | "WARNING" | "ERROR";

async function capacitorHaptics(): Promise<{
  impact?: (opts: { style: string }) => Promise<void>;
  notification?: (opts: { type: string }) => Promise<void>;
  selectionChanged?: () => Promise<void>;
} | null> {
  try {
    const mod = await import("@capacitor/haptics").catch(() => null);
    const candidate = (mod as unknown as { Haptics?: unknown } | null)?.Haptics;
    if (
      candidate &&
      typeof candidate === "object" &&
      ("impact" in candidate || "notification" in candidate || "selectionChanged" in candidate)
    ) {
      return candidate as {
        impact?: (opts: { style: string }) => Promise<void>;
        notification?: (opts: { type: string }) => Promise<void>;
        selectionChanged?: () => Promise<void>;
      };
    }
    return null;
  } catch {
    return null;
  }
}

function vibrateFallback(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* no-op */
  }
}

export async function impact(style: ImpactStyle = "LIGHT"): Promise<void> {
  try {
    const Haptics = await capacitorHaptics();
    if (Haptics?.impact) {
      await Haptics.impact({ style });
      return;
    }
  } catch {
    /* fall through to vibrate */
  }
  vibrateFallback(10);
}

export async function selectionChanged(): Promise<void> {
  try {
    const Haptics = await capacitorHaptics();
    if (Haptics?.selectionChanged) {
      await Haptics.selectionChanged();
      return;
    }
  } catch {
    /* fall through */
  }
  vibrateFallback(8);
}

export async function notify(type: NotificationType): Promise<void> {
  try {
    const Haptics = await capacitorHaptics();
    if (Haptics?.notification) {
      await Haptics.notification({ type });
      return;
    }
  } catch {
    /* fall through */
  }
  vibrateFallback(type === "SUCCESS" ? [12, 40, 12] : type === "WARNING" ? [20] : [30, 40, 30]);
}

export const haptics = {
  impact,
  selectionChanged,
  notify,
  success: () => notify("SUCCESS"),
  warning: () => notify("WARNING"),
  error: () => notify("ERROR"),
};
