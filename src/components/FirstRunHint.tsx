import { useMemo } from "react";
import { readOnboarding, firstSessionHint } from "@/lib/onboarding";

type Audience = "rider" | "merchant" | "storefront";

/**
 * Slice 03: additive first-run hint. Reads `dg.onboarding.v1` once and
 * renders a role-specific line — or nothing, so default page copy stays
 * untouched when no answers were stored (or the audience mismatches).
 */
export default function FirstRunHint({ audience }: { audience: Audience }) {
  const hint = useMemo(() => {
    const stored = readOnboarding();
    if (!stored) return null;
    if (audience === "rider" && stored.role !== "rider") return null;
    if (audience === "merchant" && stored.role !== "merchant") return null;
    if (
      audience === "storefront" &&
      stored.role !== "customer" &&
      stored.role !== "wholesaler"
    )
      return null;
    return firstSessionHint(stored.role, stored.zone);
  }, [audience]);
  if (!hint) return null;
  return (
    <p data-testid="first-run-hint" className="text-sm text-muted-foreground">
      {hint}
    </p>
  );
}
