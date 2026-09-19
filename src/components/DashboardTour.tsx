import { useCallback, useEffect, useRef, useState } from "react";
import { Joyride, STATUS } from "react-joyride";
import type { EventData } from "react-joyride";
import { Button } from "@/components/ui/button";
import { dashboardTours, tourKey, REPLAY_EVENT } from "@/lib/dashboardTours";
import type { TourRole, TourStepDef } from "@/lib/dashboardTours";

/** True once the tour was finished OR dismissed — both mean "never auto-reshow". */
function isSeen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return true; // private-mode: stay quiet rather than nag
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

interface DashboardTourProps {
  /** Dashboard role (slice 02). Optional when tourId + tourSteps are given. */
  role?: TourRole;
  /** Teachable-moment condition — the tour only auto-runs when true. */
  runWhen: boolean;
  /** Increment to replay on demand (replay entry bypasses the seen key). */
  replaySignal?: number;
  /** Page-level micro-tour id (slice 04). Overrides the role map + key. */
  tourId?: string;
  tourSteps?: TourStepDef[];
}

/**
 * Slice 02: shared contextual spotlight tour. Auto-runs once — only when
 * runWhen holds AND the tour was never finished or dismissed. Every
 * dismissal path (Skip, X, ESC, overlay click) persists, so help never
 * nags. Slice 04: same wrapper drives page-level micro-tours via
 * tourId/tourSteps.
 */
export default function DashboardTour({ role, runWhen, replaySignal = 0, tourId, tourSteps }: DashboardTourProps) {
  const key = tourKey(tourId ?? role ?? "default");
  const defs = tourSteps ?? (role ? dashboardTours[role] : []);
  const [run, setRun] = useState(() => runWhen && !isSeen(key));
  const autoStarted = useRef(false);
  const lastReplay = useRef(replaySignal);

  // runWhen flips true after the async load resolves on an empty dashboard.
  useEffect(() => {
    if (runWhen && !autoStarted.current && !isSeen(key)) {
      autoStarted.current = true;
      setRun(true);
    }
  }, [runWhen, key]);

  useEffect(() => {
    if (replaySignal !== lastReplay.current) {
      lastReplay.current = replaySignal;
      if (replaySignal > 0) setRun(true);
    }
  }, [replaySignal]);

  useEffect(() => {
    const onReplay = (e: Event) => {
      const detail = (e as CustomEvent<{ role?: string; tourId?: string }>).detail;
      if ((detail?.role && detail.role === role) || (tourId && detail?.tourId === tourId)) setRun(true);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, [role, tourId]);

  const finish = useCallback(
    (value: "done" | "dismissed") => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* private-mode: stopping the tour is what matters */
      }
      setRun(false);
    },
    [key]
  );

  const handleEvent = useCallback(
    (data: EventData) => {
      if (data.status === STATUS.FINISHED) finish("done");
      else if (data.status === STATUS.SKIPPED) finish("dismissed");
      else if (data.status === STATUS.ERROR) setRun(false); // target never appeared: stop quietly
    },
    [finish]
  );

  const reduced = prefersReducedMotion();
  const steps = defs.map((s) => ({
    target: s.target,
    title: s.title,
    content: s.content,
    placement: "bottom" as const,
  }));

  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      onEvent={handleEvent}
      locale={{
        skip: "Skip",
        back: "Back",
        next: "Next",
        last: "Done",
        close: "Close",
        nextWithProgress: "Next ({current} of {total})",
      }}
      options={{
        buttons: ["back", "close", "primary", "skip"],
        closeButtonAction: "skip",
        dismissKeyAction: "skip",
        overlayClickAction: "skip",
        showProgress: true,
        skipBeacon: true,
        targetWaitTimeout: 3000,
        scrollDuration: reduced ? 0 : 300,
        spotlightPadding: 8,
        primaryColor: "hsl(var(--primary))",
        backgroundColor: "hsl(var(--popover))",
        textColor: "hsl(var(--popover-foreground))",
        arrowColor: "hsl(var(--popover))",
        zIndex: 100,
      }}
    />
  );
}

/** Replay entry — clears the seen key and replays the matching tour. */
export function TourReplay({ role, tourId }: { role?: TourRole; tourId?: string }) {
  const key = tourKey(tourId ?? role ?? "default");
  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-[44px]"
      onClick={() => {
        try {
          window.localStorage.removeItem(key);
        } catch {
          /* private-mode: replay still works for this session */
        }
        window.dispatchEvent(new CustomEvent(REPLAY_EVENT, { detail: { role, tourId } }));
      }}
    >
      Take the tour
    </Button>
  );
}
