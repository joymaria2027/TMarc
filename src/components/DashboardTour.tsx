import { useCallback, useEffect, useRef, useState } from "react";
import { Joyride, STATUS } from "react-joyride";
import type { EventData } from "react-joyride";
import { Button } from "@/components/ui/button";
import { dashboardTours, tourKey, REPLAY_EVENT } from "@/lib/dashboardTours";
import type { TourRole } from "@/lib/dashboardTours";

/** True once the tour was finished OR dismissed — both mean "never auto-reshow". */
function isSeen(role: string): boolean {
  try {
    return window.localStorage.getItem(tourKey(role)) !== null;
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
  role: TourRole;
  /** Empty/low-data condition from the dashboard — the tour only auto-runs then. */
  runWhen: boolean;
  /** Increment to replay on demand (replay entry bypasses the seen key). */
  replaySignal?: number;
}

/**
 * Slice 02: shared contextual spotlight tour. Auto-runs once per role — only
 * when the dashboard is empty AND the tour was never finished or dismissed.
 * Every dismissal path (Skip, X, ESC, overlay click) persists, so help never
 * nags. Power users (data present) never see it.
 */
export default function DashboardTour({ role, runWhen, replaySignal = 0 }: DashboardTourProps) {
  const [run, setRun] = useState(() => runWhen && !isSeen(role));
  const autoStarted = useRef(false);
  const lastReplay = useRef(replaySignal);

  // runWhen flips true after the async load resolves on an empty dashboard.
  useEffect(() => {
    if (runWhen && !autoStarted.current && !isSeen(role)) {
      autoStarted.current = true;
      setRun(true);
    }
  }, [runWhen, role]);

  useEffect(() => {
    if (replaySignal !== lastReplay.current) {
      lastReplay.current = replaySignal;
      if (replaySignal > 0) setRun(true);
    }
  }, [replaySignal]);

  useEffect(() => {
    const onReplay = (e: Event) => {
      if ((e as CustomEvent<{ role?: string }>).detail?.role === role) setRun(true);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, [role]);

  const finish = useCallback(
    (value: "done" | "dismissed") => {
      try {
        window.localStorage.setItem(tourKey(role), value);
      } catch {
        /* private-mode: stopping the tour is what matters */
      }
      setRun(false);
    },
    [role]
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
  const steps = dashboardTours[role].map((s) => ({
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
export function TourReplay({ role }: { role: TourRole }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="min-h-[44px]"
      onClick={() => {
        try {
          window.localStorage.removeItem(tourKey(role));
        } catch {
          /* private-mode: replay still works for this session */
        }
        window.dispatchEvent(new CustomEvent(REPLAY_EVENT, { detail: { role } }));
      }}
    >
      Take the tour
    </Button>
  );
}
