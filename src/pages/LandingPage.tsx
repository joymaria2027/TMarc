import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bike, CheckCircle2, MapPin, Package, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import ThemeToggle from "@/components/ThemeToggle";
import { usePrefersDark } from "@/hooks/usePrefersDark";
import { supabase } from "@/integrations/supabase/client";
import { getProductPublicUrl } from "@/lib/productImage";

/**
 * Public marketing page at "/", structured after the Icebug reference:
 * full-viewport centered hero over a moody scene, split mono nav with the
 * logo in the middle, mega footer with a LIGHT / DARK / SYSTEM toggle.
 * Copy follows the CRO framework and stays deliberately short.
 */
export default function LandingPage() {
  // Mount the mode-aware hook so the footer toggle applies on this page.
  usePrefersDark();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      {/* Split nav: audience anchors left, logo center, utilities right */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="container mx-auto grid h-14 grid-cols-[auto_1fr_auto] items-center gap-3 px-4 md:grid-cols-[1fr_auto_1fr]">
          <nav aria-label="Audience" className="hidden md:flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <a href="#riders" className="hover:text-foreground">For riders</a>
            <a href="#managers" className="hover:text-foreground">For managers</a>
            <a href="#finance" className="hover:text-foreground">For finance</a>
          </nav>

          <Link to="/" className="flex items-center gap-2.5 md:justify-center" aria-label="DeliveryAce home">
            <span className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
              <span className="font-display text-lg text-primary-foreground leading-none">D</span>
            </span>
            <span className="font-display text-xl tracking-tight">DeliveryAce</span>
          </Link>

          <nav aria-label="Primary" className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/shop">Order delivery</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/wholesale">Wholesale</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/auth?tab=signup">Start free</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {/* Full-viewport hero: centered giant headline over the rain scene */}
        <section className="relative overflow-hidden border-b bg-sidebar text-sidebar-foreground">
          <div className="absolute inset-0" aria-hidden="true">
            <div className="absolute inset-0 opacity-[0.07]" style={{
              backgroundImage:
                'repeating-linear-gradient(105deg, hsl(var(--sidebar-foreground)) 0 1px, transparent 1px 9px)',
            }} />
            <div className="absolute -top-40 left-1/2 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
            <div className="absolute bottom-0 -right-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
          </div>

          <div className="relative container mx-auto flex min-h-[92vh] flex-col items-center justify-center px-4 py-16 text-center">
            <p className="rise font-mono text-[11px] uppercase tracking-[0.2em] text-sidebar-foreground/70">
              Evening rain · Serrekunda
            </p>
            <h1 className="rise rise-1 mt-5 max-w-4xl font-display text-5xl md:text-7xl xl:text-8xl leading-[1.02] tracking-tight">
              Track every delivery. Settle every dalasi.
            </h1>
            <p className="rise rise-2 mt-6 max-w-md text-base md:text-lg text-sidebar-foreground/80 leading-relaxed">
              DeliveryAce runs dispatch, GPS tracking, and settlement for delivery
              teams across The Gambia.
            </p>

            <div className="rise rise-3 mt-9 flex flex-wrap items-center justify-center gap-4">
              {/* Icebug-style outlined mono CTA */}
              <Link
                to="/auth?tab=signup"
                className="press inline-flex min-h-[44px] items-center gap-2 border border-sidebar-foreground/60 px-6 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10"
              >
                Start here
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link
                to="/shop"
                className="press inline-flex min-h-[44px] items-center border-b border-sidebar-foreground/40 px-1 pb-0.5 font-mono text-[11px] uppercase tracking-[0.2em] text-sidebar-foreground/80 transition-colors hover:text-sidebar-foreground"
              >
                Order a delivery
              </Link>
            </div>
            <p className="rise rise-4 mt-5 text-sm text-sidebar-foreground/70">
              Free to join, set up in minutes.
            </p>

            {/* Product close-up: the dispatch card, centered under the pitch */}
            <div className="rise rise-4 mt-12 w-full max-w-md">
              <DispatchCard />
            </div>
          </div>
        </section>

        {/* Statement break: the quiet line between loud sections, Icebug-style */}
        <section className="border-b bg-background">
          <div className="container mx-auto px-4 py-16 text-center">
            <Reveal>
              <p className="mx-auto max-w-xl font-display text-2xl md:text-3xl tracking-tight text-foreground/90">
                Every kilometre, every dalasi, accounted for.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Live product proof: the marketplace is real and shoppable now */}
        <ProductRail />

        {/* Webshop rhythm: full-bleed banner, then the audience rail */}
        <section className="relative overflow-hidden border-b bg-sidebar text-sidebar-foreground">
          <div className="absolute inset-0 opacity-[0.06]" aria-hidden="true" style={{
            backgroundImage:
              'repeating-linear-gradient(105deg, hsl(var(--sidebar-foreground)) 0 1px, transparent 1px 11px)',
          }} />
          <div className="absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
          <div className="relative container mx-auto px-4 pb-10 pt-20 md:pt-28">
            <Reveal>
              <h2 className="max-w-lg font-display text-4xl md:text-5xl leading-[1.05] tracking-tight">
                Three jobs. One map.
              </h2>
            </Reveal>
          </div>
        </section>

        {/* The rail: one card per audience, scrollable on small screens */}
        <section className="border-b bg-background">
          <div className="container mx-auto px-4 py-12">
            <Reveal>
              <ol className="flex snap-x gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible">
              <Step id="riders" n="1" audience="For riders" icon={<Bike className="h-5 w-5" />} title="Riders accept">
                A job lands, one tap accepts it. The route, the customer, the tariff,
                all in one screen built for a gloved thumb.
              </Step>
              <Step id="managers" n="2" audience="For managers" icon={<MapPin className="h-5 w-5" />} title="Managers watch">
                Every rider on one live map. Spot a stalled delivery before the
                customer calls about it.
              </Step>
              <Step id="finance" n="3" audience="For finance" icon={<Receipt className="h-5 w-5" />} title="Finance settles">
                Distances, tariffs, and payouts reconcile themselves. Close the books
                while the day is still fresh.
              </Step>
              </ol>
            </Reveal>
          </div>
        </section>

        {/* Objections: exactly three, ordered by how often they come up */}
        <section className="border-y bg-muted/40">
          <div className="container mx-auto px-4 py-16 md:py-20">
            <Reveal>
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
            </Reveal>
          </div>
        </section>

        {/* Doors: Icebug's finder pattern — visitors segment themselves */}
        <section className="border-b bg-background">
          <Reveal className="container mx-auto grid gap-10 px-4 py-20 md:grid-cols-2 md:gap-8 md:py-24">
            <DoorTile
              kicker="You run deliveries"
              statement="Take your operation from WhatsApp threads to one live map."
              cta="Start free"
              href="/auth?tab=signup"
              primary
            />
            <DoorTile
              kicker="You need something moved"
              statement="Order from local stores and follow the rider to your door."
              cta="Order a delivery"
              href="/shop"
            />
          </Reveal>
          <div className="container mx-auto mt-8">
            <p className="text-sm text-muted-foreground">
              Sell instead?{" "}
              <Link to="/sell" className="text-foreground underline underline-offset-4 hover:no-underline">Turn your kitchen into orders</Link>
            </p>
          </div>
        </section>

        {/* Promise: kicker, triad statement, small aside — Icebug's pattern */}
        <section className="border-b bg-background">
          <Reveal className="container mx-auto grid gap-10 px-4 py-20 md:grid-cols-[1.4fr_1fr] md:py-24">
            <div className="space-y-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Our promise to you
              </p>
              <h2 className="max-w-xl font-display text-4xl md:text-5xl leading-[1.05] tracking-tight">
                Fair fees. Live tracking. Money settled the day it's earned.
              </h2>
            </div>
            <p className="self-end font-mono text-[11px] leading-relaxed tracking-wide text-muted-foreground md:justify-self-end md:max-w-xs">
              The money arrives when we said it would. That is the whole promise,
              and everything else on this page exists to keep it.
            </p>
          </Reveal>
        </section>

        {/* Values band: full-bleed, kicker + centered statement + outlined link */}
        <section className="relative overflow-hidden border-b bg-sidebar text-sidebar-foreground">
          <div className="absolute inset-0 opacity-[0.06]" aria-hidden="true" style={{
            backgroundImage:
              'repeating-linear-gradient(105deg, hsl(var(--sidebar-foreground)) 0 1px, transparent 1px 11px)',
          }} />
          <div className="relative container mx-auto px-4 py-24 md:py-32">
            <Reveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/60">
                Who comes first
              </p>
              <div className="mt-10 flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
                <h2 className="max-w-xl font-display text-4xl md:text-5xl leading-[1.05] tracking-tight">
                  Riders first. Then the merchants. Then us.
                </h2>
                <a
                  href="#finance"
                  className="press inline-flex min-h-[44px] items-center border border-sidebar-foreground/60 px-6 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10"
                >
                  See how settlement works
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Closing CTA: heavy type, image-toned background, centered */}
        <section className="relative overflow-hidden bg-sidebar text-sidebar-foreground">
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-primary/15 to-transparent pointer-events-none" />
          <div className="container relative mx-auto px-4 py-24 md:py-32 text-center space-y-8">
            <Reveal>
              <h2 className="mx-auto max-w-2xl font-display text-4xl md:text-5xl xl:text-6xl leading-[1.05] tracking-tight">
                Today's deliveries, accounted for by tonight.
              </h2>
            </Reveal>
            <div className="flex justify-center">
              <Link
                to="/auth?tab=signup"
                className="press inline-flex min-h-[48px] items-center gap-2 border border-sidebar-foreground/60 px-8 py-2.5 font-mono text-xs uppercase tracking-[0.2em] text-sidebar-foreground transition-colors hover:bg-sidebar-foreground/10"
              >
                Start here
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Mega footer: link columns, blurb, theme toggle, © line */}
      <footer className="border-t bg-card text-card-foreground">
        <div className="container mx-auto grid gap-10 px-4 py-14 md:grid-cols-[1fr_1fr_1fr_1.4fr]">
          <FooterCol title="Product">
            <Link to="/shop" className="hover:underline underline-offset-4">Order delivery</Link>
            <Link to="/sell" className="hover:underline underline-offset-4">Sell</Link>
            <Link to="/wholesale" className="hover:underline underline-offset-4">Wholesale</Link>
            <Link to="/auth?tab=signup" className="hover:underline underline-offset-4">Start free</Link>
          </FooterCol>
          <FooterCol title="Company">
            <a href="#riders" className="hover:underline underline-offset-4">For riders</a>
            <a href="#managers" className="hover:underline underline-offset-4">For managers</a>
            <a href="#finance" className="hover:underline underline-offset-4">For finance</a>
          </FooterCol>
          <FooterCol title="Legal">
            <Link to="/privacy" className="hover:underline underline-offset-4">Privacy policy</Link>
            <a href="mailto:support@deliveryace.example" className="hover:underline underline-offset-4">Contact</a>
          </FooterCol>
          {/* Theme toggle stays legible in both footer palettes */}
          <div className="space-y-5">
            <p className="font-display text-2xl leading-snug tracking-tight">
              Run one delivery through it today.
            </p>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Most teams move their whole operation over within a week.
            </p>
            <Button asChild size="sm" className="min-h-[44px] press">
              <Link to="/auth?tab=signup">Start free</Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
        <div className="border-t">
          <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <p>Same-day settlement · WCAG AA · Gambia-built</p>
            <p>© DeliveryAce {new Date().getFullYear()}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** One self-segmentation door, Icebug finder style. */
function DoorTile({ kicker, statement, cta, href, primary = false }: {
  kicker: string;
  statement: string;
  cta: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <div className="rise flex flex-col items-start gap-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{kicker}</p>
      <p className="max-w-md font-display text-3xl md:text-4xl leading-[1.08] tracking-tight">{statement}</p>
      {primary ? (
        <Link
          to={href}
          className="press inline-flex min-h-[44px] items-center gap-2 bg-primary px-6 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {cta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : (
        <div className="space-y-2">
          <Link
            to={href}
            className="press inline-flex min-h-[44px] items-center border border-foreground/40 px-6 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground transition-colors hover:bg-foreground/5"
          >
            {cta}
          </Link>
          <p className="text-xs text-muted-foreground">
            Buying in bulk?{' '}
            <Link to="/wholesale" className="underline underline-offset-4 hover:text-foreground">
              Wholesale pricing
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

/** Footer link column with a mono uppercase heading. */
function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <nav aria-label={title} className="flex flex-col items-start gap-2 text-sm">
        {children}
      </nav>
    </div>
  );
}

/** One rail card: audience label, icon, title, one plain sentence. */
function Step({ id, n, audience, icon, title, children }: {
  id: string;
  n: string;
  audience: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li id={id} className="rise w-72 shrink-0 snap-start rounded-lg border bg-card p-5 space-y-4 scroll-mt-24 md:w-auto">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary">{audience}</p>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </span>
        <span className="font-mono text-xs text-muted-foreground" aria-hidden="true">{n}</span>
        <h3 className="font-display text-2xl tracking-tight">{title}</h3>
      </div>
      <p className="text-muted-foreground leading-relaxed">{children}</p>
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
    <div aria-hidden="true" className="w-full rounded-xl border border-sidebar-border bg-sidebar-accent/60 backdrop-blur p-4 space-y-3 shadow-lg">
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
    <div className="rounded-md bg-card/85 px-2 py-1.5 text-center">
      <p className="text-[10px] uppercase tracking-wide text-foreground/60">{label}</p>
      <p className="font-display text-sm text-foreground tabular-nums">{value}</p>
    </div>
  );
}

interface RailProduct {
  id: string;
  name: string;
  price: number | string;
  image_path: string | null;
  merchants?: { name: string } | null;
}

/**
 * Icebug webshop rail: mono kicker + SHOP ALL, Prev/Next controls, flat
 * tiles with hairline dividers, hover zoom. Progressive — the landing's
 * static first paint is untouched; the rail fills in when the catalog
 * query resolves and is omitted entirely on empty or error.
 */
function ProductRail() {
  const [products, setProducts] = useState<RailProduct[]>([]);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("products")
          .select("id,name,price,image_path,merchants(name)")
          .eq("approval_status", "approved")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(8);
        if (!cancelled && data) setProducts(data as unknown as RailProduct[]);
      } catch {
        // Empty page beats a broken page.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (products.length === 0) return null;

  const scroll = (dir: 1 | -1) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollBy({ left: dir * strip.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section aria-label="Fresh from the stores" className="border-b">
      <div className="container mx-auto px-4 pt-14 pb-6 flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Fresh from the stores{" "}
          <Link to="/shop" className="text-foreground underline underline-offset-4 hover:no-underline">Shop all</Link>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label="Previous products"
            className="min-h-[44px] px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label="Next products"
            className="min-h-[44px] px-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            Next
          </button>
        </div>
      </div>
      <div
        ref={stripRef}
        data-rail-strip
        className="flex snap-x snap-mandatory overflow-x-auto border-t"
      >
        {products.map((p, i) => (
          <Link
            key={p.id}
            to={`/shop/p/${p.id}`}
            className="group relative w-56 shrink-0 snap-start border-r p-4 pb-5 [&:nth-child(odd)]:bg-muted/30"
          >
            <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted/40">
              {getProductPublicUrl(p.image_path) ? (
                <img
                  src={getProductPublicUrl(p.image_path)!}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="max-h-full max-w-full object-contain p-3 transition-transform duration-200 ease-out group-hover:scale-[1.04] [@media(hover:hover)]:group-hover:scale-[1.04]"
                />
              ) : (
                <Package className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
              )}
            </div>
            <p className="mt-3 text-sm font-medium leading-snug line-clamp-2">{p.name}</p>
            {p.merchants?.name && (
              <p className="text-xs text-muted-foreground truncate">{p.merchants.name}</p>
            )}
            <p className="mt-1 font-display text-base tabular-nums">D {Number(p.price).toFixed(2)}</p>
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-px bg-border first:hidden" />
            {i === 0 && <span className="sr-only">Newest first</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}
