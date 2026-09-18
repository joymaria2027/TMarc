import { Link } from "react-router-dom";
import { ArrowRight, Bike, CheckCircle2, MapPin, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Public marketing page at "/".
 *
 * Copy follows the CRO framework: one outcome promise in the headline, a
 * who-it's-for sub-headline, proof instead of decoration, three objection
 * bullets, and a CTA that names what you get. Kept deliberately short;
 * every section has to earn its place.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <span className="font-display text-lg text-primary-foreground leading-none">D</span>
            </div>
            <span className="font-display text-xl tracking-tight">DeliveryAce</span>
          </div>
          <nav aria-label="Primary" className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/shop">Order delivery</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/wholesale">Wholesale</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/auth?tab=signup">Start free</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {/* Hero: text holds the center; proof card sits in the reading flow on
            small screens and floats right on large ones */}
        <section className="relative overflow-hidden border-b bg-sidebar text-sidebar-foreground">
          <div className="absolute -top-40 right-0 h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl pointer-events-none" />

          <div className="container relative mx-auto px-4 py-20 md:py-28">
            <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
              <div className="max-w-xl space-y-7">
                <h1 className="rise font-display text-5xl md:text-6xl xl:text-7xl leading-[1.02] tracking-tight">
                  Track every delivery. Settle every dalasi.
                </h1>
                <p className="rise rise-1 text-lg text-sidebar-foreground/80 max-w-md leading-relaxed">
                  DeliveryAce runs dispatch, GPS tracking, and settlement for delivery
                  teams across The Gambia.
                </p>
                <div className="rise rise-2 flex flex-wrap items-center gap-4">
                  <Button asChild size="lg" className="min-h-[48px] px-6 text-base press">
                    <Link to="/auth?tab=signup">
                      Start free
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="min-h-[48px] border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <Link to="/shop">Order a delivery</Link>
                  </Button>
                </div>
                <p className="rise rise-3 text-sm text-sidebar-foreground/70">
                  Free to join, set up in minutes.
                </p>
              </div>

              <div className="rise rise-2 relative lg:justify-self-end">
                <DispatchCard />
              </div>
            </div>
          </div>
        </section>

        {/* How it works: three big verbs, one per audience. No card grid. */}
        <section className="container mx-auto px-4 py-20 md:py-24">
          <ol className="grid gap-12 md:grid-cols-3 md:gap-8">
            <Step n="1" icon={<Bike className="h-5 w-5" />} title="Riders accept">
              A job lands, one tap accepts it. The route, the customer, the tariff,
              all in one screen built for a gloved thumb.
            </Step>
            <Step n="2" icon={<MapPin className="h-5 w-5" />} title="Managers watch">
              Every rider on one live map. Spot a stalled delivery before the
              customer calls about it.
            </Step>
            <Step n="3" icon={<Receipt className="h-5 w-5" />} title="Finance settles">
              Distances, tariffs, and payouts reconcile themselves. Close the books
              while the day is still fresh.
            </Step>
          </ol>
        </section>

        {/* Objections: exactly three, ordered by how often they come up */}
        <section className="border-y bg-muted/40">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <h2 className="font-display text-3xl md:text-4xl tracking-tight max-w-lg">
              Fair questions
            </h2>
            <ul className="mt-8 grid gap-6 max-w-3xl">
              <Objection icon={<MapPin className="h-4 w-4" />}>
                Our riders already have a WhatsApp group. DeliveryAce gives every
                rider one live map to follow, so nobody has to ask where anyone is.
              </Objection>
              <Objection icon={<CheckCircle2 className="h-4 w-4" />}>
                You can run one delivery through it today. Most teams move their
                whole operation over within a week.
              </Objection>
              <Objection icon={<Receipt className="h-4 w-4" />}>
                Joining is free. We charge a small fee per settled delivery, so the
                software pays for itself out of work you already have.
              </Objection>
            </ul>
          </div>
        </section>

        {/* Closing CTA: heavy type, image-toned background, centered */}
        <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-primary/15 to-transparent pointer-events-none" />
          <div className="container relative mx-auto px-4 py-24 md:py-32 text-center space-y-8">
            <h2 className="rise mx-auto max-w-2xl font-display text-4xl md:text-5xl xl:text-6xl leading-[1.05] tracking-tight">
              Today's deliveries, accounted for by tonight.
            </h2>
            <div className="rise rise-1 flex justify-center">
              <Button asChild size="lg" className="min-h-[52px] px-8 text-base press">
                <Link to="/auth?tab=signup">
                  Start free
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer: legal links are a trust signal, not decoration */}
      <footer className="border-t bg-background">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} DeliveryAce</p>
          <nav aria-label="Legal" className="flex items-center gap-4">
            <Link to="/privacy" className="underline-offset-2 hover:underline">Privacy policy</Link>
            <Link to="/shop" className="underline-offset-2 hover:underline">Order delivery</Link>
            <a href="mailto:support@deliveryace.example" className="underline-offset-2 hover:underline">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** One numbered step: icon, title, one plain-language sentence. */
function Step({ n, icon, title, children }: {
  n: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rise space-y-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </span>
        <span className="font-mono text-xs text-muted-foreground" aria-hidden="true">{n}</span>
        <h3 className="font-display text-2xl tracking-tight">{title}</h3>
      </div>
      <p className="text-muted-foreground leading-relaxed max-w-xs">{children}</p>
    </li>
  );
}

/** Objection bullet with a check, matching the auth panel language. */
function Objection({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden="true" className="mt-0.5 h-7 w-7 shrink-0 rounded-md bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </span>
      <span className="text-sm md:text-base leading-relaxed text-foreground/90 max-w-xl">{children}</span>
    </li>
  );
}

/**
 * Proof visual: a stylised dispatch screen. It shows the product's core loop
 * (live map, delivery rows, settled money) and is decorative markup, so the
 * whole card is aria-hidden and screen readers skip it.
 */
function DispatchCard() {
  return (
    <div aria-hidden="true" className="w-full max-w-md rounded-xl border border-sidebar-border bg-sidebar-accent/60 backdrop-blur p-4 space-y-3 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60">
          Live dispatch
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent-foreground">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />
          3 riders nearby
        </span>
      </div>

      {/* Mini map: grid texture, one route, pickup and dropoff pins */}
      <div className="relative h-36 rounded-lg bg-sidebar-accent overflow-hidden">
        <div className="absolute inset-0 opacity-40" style={{
          backgroundImage:
            'linear-gradient(hsl(var(--sidebar-border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--sidebar-border)) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 144" fill="none" preserveAspectRatio="none">
          <path
            d="M20 124 C 96 110, 130 58, 208 62 S 296 40, 304 24"
            stroke="hsl(var(--sidebar-primary))"
            strokeWidth="2.5"
            strokeDasharray="7 6"
            strokeLinecap="round"
          />
          <circle cx="20" cy="124" r="6" fill="hsl(var(--sidebar-primary))" />
          <circle cx="304" cy="24" r="6" fill="hsl(var(--accent))" />
        </svg>
        <div className="absolute top-3 right-3 rounded-md bg-card/90 px-2 py-1 text-[11px] text-foreground shadow-sm">
          <span className="flex items-center gap-1">
            <Bike className="h-3 w-3 text-primary" />
            ETA 12 min
          </span>
        </div>
        <div className="absolute bottom-3 left-3 rounded-md bg-card/90 px-2 py-1 text-[11px] text-foreground shadow-sm tabular-nums">
          DG-1042 · D 85.00
        </div>
      </div>

      {/* Two queue rows: enough to read the product, not a fake dashboard */}
      <div className="space-y-2">
        <QueueRow name="Fatou J." area="Serrekunda" status="In transit" tone="live" />
        <QueueRow name="Lamin B." area="Banjul" status="Delivered" tone="done" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Delivered" value="142" />
        <MiniStat label="On time" value="96%" />
        <MiniStat label="Settled" value="D 8,410" />
      </div>
    </div>
  );
}

function QueueRow({ name, area, status, tone }: {
  name: string;
  area: string;
  status: string;
  tone: "live" | "done";
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-card/60 px-2.5 py-2">
      <span className="text-xs text-sidebar-foreground">
        <span className="font-medium">{name}</span>
        <span className="text-sidebar-foreground/60"> · {area}</span>
      </span>
      <span className={
        tone === "live"
          ? "inline-flex items-center gap-1 text-[11px] text-[hsl(var(--sidebar-primary))]"
          : "inline-flex items-center gap-1 text-[11px] text-[hsl(var(--accent))]"
      }>
        {tone === "live"
          ? <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[hsl(var(--sidebar-primary))]" />
          : <CheckCircle2 className="h-3 w-3" />}
        {status}
      </span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-card/60 px-2 py-1.5 text-center">
      <p className="text-[10px] uppercase tracking-wide text-sidebar-foreground/60">{label}</p>
      <p className="font-display text-sm text-sidebar-foreground tabular-nums">{value}</p>
    </div>
  );
}
