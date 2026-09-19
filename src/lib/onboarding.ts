/** Slice 03: storage-backed first-run hooks + funnel event names. */

export const STORAGE_KEY = "dg.onboarding.v1";

export type OnboardingRole = "rider" | "merchant" | "customer" | "wholesaler";

export interface StoredOnboarding {
  role: OnboardingRole;
  zone: string;
  detail: string;
}

const VALID_ROLES = new Set<string>(["rider", "merchant", "customer", "wholesaler"]);

/** Read onboarding answers once; null when absent or invalid (default copy wins). */
export function readOnboarding(): StoredOnboarding | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredOnboarding>;
    if (!parsed || !VALID_ROLES.has(parsed.role ?? "")) return null;
    return {
      role: parsed.role as OnboardingRole,
      zone: typeof parsed.zone === "string" ? parsed.zone : "",
      detail: typeof parsed.detail === "string" ? parsed.detail : "",
    };
  } catch {
    return null;
  }
}

/** First-session hint per role; zone woven in only when present. Domain terms only. */
export function firstSessionHint(role: OnboardingRole, zone = ""): string {
  const where = zone.trim() ? ` in ${zone.trim()}` : "";
  switch (role) {
    case "rider":
      return `New here? Claim your first Offer${where} — one tap accepts it.`;
    case "merchant":
      return `New here? Create your first Delivery${where} and watch it land on the live map.`;
    case "customer":
      return `New here? Place your first Order${where} and follow the Rider to your door.`;
    case "wholesaler":
      return `New here? Submit one application${where} — approval unlocks wholesale prices.`;
  }
}

/** Funnel stages for drop-off analysis; no vendor wired yet (hook point). */
export const ONBOARDING_STAGES = [
  "started",
  "door",
  "insight",
  "personalized",
  "activation",
] as const;

export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

/** Pure event-name builder so funnel tracking has one source of truth. */
export function onboardingEvent(stage: OnboardingStage, role: OnboardingRole): string {
  return `onboarding.${stage}.${role}`;
}
