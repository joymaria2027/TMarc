import { useEffect, useState } from "react";
import { isChecklistOpen } from "@/lib/dashboardChecklists";
import type { ChecklistRole } from "@/lib/dashboardChecklists";

/**
 * Parent-side visibility for the charts swap: open while first-run AND the
 * card was never dismissed or completed. Falls shut the moment data arrives.
 */
export function useChecklistOpen(
  role: ChecklistRole,
  firstRun: boolean,
  allDone: boolean
): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => firstRun && isChecklistOpen(role, allDone));
  useEffect(() => {
    if (!firstRun) setOpen(false);
  }, [firstRun]);
  return [firstRun && open, setOpen];
}
