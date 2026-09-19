import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "dg.onboarding.v1";
const DRAFT_KEY = "dg.onboarding.draft.v1";

/**
 * Transcript-style onboarding (slices 01–02).
 * Step 1 doors → Step 2 JTBD insight → Step 3 personalization (max 2
 * inputs, each visibly reused) → Step 4 ready with role activation CTA.
 * Answers persist to localStorage so slice 03 can personalize day-1.
 */
const DOORS = [
  { role: "rider", label: "I ride", hint: "Accept offers with one tap." },
  { role: "merchant", label: "I run deliveries", hint: "See every Rider on one live map." },
  { role: "customer", label: "I order", hint: "Order from local Merchants." },
  { role: "wholesaler", label: "I buy in bulk", hint: "Apply for wholesale pricing." },
] as const;

type Role = (typeof DOORS)[number]["role"];

const ROLE_CONTENT: Record<
  Role,
  { pain: string; insight: string; cta: string; ctaLabel: string; detailLabel: string; detailPlaceholder: string }
> = {
  rider: {
    pain: "Jobs get lost in chat threads.",
    insight: "One-tap Accept puts the route, the Customer, and the tariff on one screen.",
    cta: "/rider",
    ctaLabel: "Start riding",
    detailLabel: "Your vehicle",
    detailPlaceholder: "Bicycle, motorbike…",
  },
  merchant: {
    pain: "Customers keep asking “where is my Rider?”.",
    insight: "A live map shows every Rider, so the “where are you?” calls stop.",
    cta: "/deliveries/new",
    ctaLabel: "Create a delivery",
    detailLabel: "Store name",
    detailPlaceholder: "Your store or operation",
  },
  customer: {
    pain: "You never know when an order will arrive.",
    insight: "Follow the Rider to your door with a live ETA.",
    cta: "/shop",
    ctaLabel: "Order now",
    detailLabel: "Your neighbourhood",
    detailPlaceholder: "Where should riders meet you?",
  },
  wholesaler: {
    pain: "Retail prices eat your margin.",
    insight: "Approval unlocks wholesale prices across the shop.",
    cta: "/wholesale",
    ctaLabel: "Apply now",
    detailLabel: "Business name",
    detailPlaceholder: "Your registered business",
  },
};

const VALID_ROLES = new Set<string>(DOORS.map((d) => d.role));

function Shell({ step, children }: { step: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main id="main-content" tabIndex={-1} className="container mx-auto max-w-lg px-4 py-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {step}
        </p>
        {children}
        <Link
          to="/"
          className="mt-8 inline-flex min-h-[44px] items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Skip
        </Link>
      </main>
    </div>
  );
}

export default function Onboarding() {
  const [params] = useSearchParams();
  const rawRole = params.get("role") ?? "";
  const role: Role | null = VALID_ROLES.has(rawRole) ? (rawRole as Role) : null;
  const [stage, setStage] = useState<"insight" | "details" | "ready">("insight");
  const [zone, setZone] = useState("");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let draft: { stage?: unknown; zone?: unknown; detail?: unknown } | null = null;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object" && parsed.role === rawRole) draft = parsed;
    } catch {
      draft = null;
    }
    setStage(draft?.stage === "details" ? "details" : "insight");
    setZone(typeof draft?.zone === "string" ? draft.zone : "");
    setDetail(typeof draft?.detail === "string" ? draft.detail : "");
  }, [rawRole]);

  // Draft-persist mid-flow answers; drop the draft once completed.
  useEffect(() => {
    if (!role) return;
    try {
      if (stage === "ready") {
        window.localStorage.removeItem(DRAFT_KEY);
      } else {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ role, stage, zone, detail }));
      }
    } catch {
      /* private-mode: flow still completes */
    }
  }, [role, stage, zone, detail]);

  if (!role) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <main id="main-content" tabIndex={-1} className="container mx-auto max-w-lg px-4 py-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Step 1 of 4
          </p>
          <h1 className="mt-3 font-display text-3xl tracking-tight">
            How will you use DeliveryAce?
          </h1>
          <div
            role="group"
            aria-label="Choose how you will use DeliveryAce"
            className="mt-8 grid gap-3"
          >
            {DOORS.map((door) => (
              <Link
                key={door.role}
                to={`/welcome?role=${door.role}`}
                className="press flex min-h-[44px] flex-col justify-center rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/60"
              >
                <span className="font-medium">{door.label}</span>
                <span className="text-sm text-muted-foreground">{door.hint}</span>
              </Link>
            ))}
          </div>
          <Link
            to="/"
            className="mt-8 inline-flex min-h-[44px] items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Skip
          </Link>
        </main>
      </div>
    );
  }

  const content = ROLE_CONTENT[role];

  if (stage === "insight") {
    return (
      <Shell step="Step 2 of 4">
        <h1 className="mt-3 font-display text-3xl tracking-tight">{content.pain}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{content.insight}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button onClick={() => setStage("details")} size="lg" className="min-h-[48px]">
            Continue
          </Button>
          <Link
            to="/welcome"
            className="inline-flex min-h-[44px] items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Back
          </Link>
        </div>
      </Shell>
    );
  }

  if (stage === "details") {
    return (
      <Shell step="Step 3 of 4">
        <h1 className="mt-3 font-display text-3xl tracking-tight">
          Make your first session yours.
        </h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Two quick answers — your home screen uses them right away.
        </p>
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ role, zone, detail })
              );
            } catch {
              /* private-mode: flow still completes */
            }
            setStage("ready");
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-zone">Which zone?</Label>
            <Input
              id="onboarding-zone"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              autoComplete="address-level2"
              placeholder="Serrekunda, Banjul…"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-detail">{content.detailLabel}</Label>
            <Input
              id="onboarding-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={content.detailPlaceholder}
              className="h-11"
            />
          </div>
          <Button type="submit" size="lg" className="min-h-[48px] w-full">
            See my session
          </Button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell step="Step 4 of 4">
      <h1 className="mt-3 font-display text-3xl tracking-tight">
        Your first session is ready
      </h1>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        {zone || detail
          ? `Set for ${[detail, zone].filter(Boolean).join(" · ")} — start with one ${role === "rider" ? "Offer" : role === "merchant" ? "Delivery" : role === "wholesaler" ? "application" : "Order"}.`
          : "Start with one small win — the rest can wait."}
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button asChild size="lg" className="min-h-[48px]">
          <Link to={content.cta}>{content.ctaLabel}</Link>
        </Button>
        <Link
          to="/welcome"
          className="inline-flex min-h-[44px] items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Start over
        </Link>
      </div>
    </Shell>
  );
}
