import { Badge } from "@/components/ui/badge";
import { Check, Clock, X, RotateCcw } from "lucide-react";

export default function PaymentStatusBadge({ status }: { status?: string | null }) {
  const s = (status ?? "pending").toLowerCase();
  const cfg =
    s === "paid"
      ? { label: "Paid", cls: "bg-success/15 text-success border-success/40 dark:bg-success/25", Icon: Check }
      : s === "failed"
      ? { label: "Failed", cls: "bg-destructive/10 text-destructive border-destructive/40 dark:bg-destructive/20", Icon: X }
      : s === "refunded"
      ? { label: "Refunded", cls: "bg-info/15 text-info border-info/40 dark:bg-info/25", Icon: RotateCcw }
      : { label: "Pending payment", cls: "bg-warning/20 text-warning-foreground border-warning/50 dark:bg-warning/25", Icon: Clock };
  const { Icon } = cfg;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {cfg.label}
    </Badge>
  );
}
