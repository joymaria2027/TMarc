import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle } from "lucide-react";
import { checklistKey, readChecklistState } from "@/lib/dashboardChecklists";
import type { ChecklistItem, ChecklistRole } from "@/lib/dashboardChecklists";

interface GettingStartedChecklistProps {
  role: ChecklistRole;
  items: ChecklistItem[];
  /** Same-page task handler (e.g. open a dialog, flip a switch). */
  onAction?: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Slice 03: dismissible Getting Started card. Items check off only when the
 * parent observes the real event in data — clicking an action navigates or
 * fires onAction but never marks anything done. Completion and dismissal
 * persist per role, with a compact replay entry afterwards.
 */
export default function GettingStartedChecklist({ role, items, onAction, onOpenChange }: GettingStartedChecklistProps) {
  const doneCount = items.filter((i) => i.done).length;
  const allDone = items.length > 0 && doneCount === items.length;
  const [dismissed, setDismissed] = useState(() => readChecklistState(role) === "dismissed");
  const [wasDone] = useState(() => readChecklistState(role) === "done");

  // Fresh completion persists once — revisit stays quiet (replay entry only).
  useEffect(() => {
    if (allDone && !dismissed && !wasDone) {
      try {
        window.localStorage.setItem(checklistKey(role), "done");
      } catch {
        /* private-mode: the success card still shows this session */
      }
    }
  }, [allDone, dismissed, wasDone, role]);

  const open = !dismissed && !(wasDone && allDone);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(checklistKey(role), "dismissed");
    } catch {
      /* private-mode: hiding the card is what matters */
    }
    setDismissed(true);
    onOpenChange?.(false);
  };

  const replay = () => {
    try {
      window.localStorage.removeItem(checklistKey(role));
    } catch {
      /* private-mode: replay still works for this session */
    }
    setDismissed(false);
  };

  if (!open) {
    return (
      <div className="flex justify-start">
        <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={replay}>
          Getting started
        </Button>
      </div>
    );
  }

  if (allDone) {
    return (
      <Card>
        <CardContent className="py-6">
          <div role="status" className="text-center">
            <CheckCircle2 className="h-8 w-8 mx-auto text-accent" aria-hidden="true" />
            <p className="font-medium mt-2">You&apos;re all set</p>
            <p className="text-sm text-muted-foreground mt-1">First session complete. The full dashboard is yours.</p>
            <Button variant="ghost" size="sm" className="mt-3 min-h-[44px]" onClick={dismiss}>
              Dismiss
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-medium">Getting started</CardTitle>
            <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
              {doneCount} of {items.length} complete
            </p>
          </div>
          <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Progress value={(doneCount / items.length) * 100} aria-label={`${doneCount} of ${items.length} complete`} />
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-1">
              <div className="flex items-start gap-2 min-w-0">
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {item.label}{" "}
                    {item.done && <span className="text-xs font-normal text-muted-foreground">Done</span>}
                  </p>
                  {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
                </div>
              </div>
              {!item.done &&
                (item.actionHref ? (
                  <Button asChild variant="outline" size="sm" className="shrink-0 min-h-[44px]">
                    <Link to={item.actionHref}>{item.actionLabel}</Link>
                  </Button>
                ) : (
                  item.actionLabel && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 min-h-[44px]"
                      onClick={() => onAction?.(item.id)}
                    >
                      {item.actionLabel}
                    </Button>
                  )
                ))}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
