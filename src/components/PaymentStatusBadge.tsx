import { Badge } from "@/components/ui/badge";
import { Check, Clock, X, RotateCcw } from "lucide-react";

export default function PaymentStatusBadge({ status }: { status?: string | null }) {
  const s = (status ?? "pending").toLowerCase();
  const cfg =
    s === "paid"
      ? { label: "Paid", cls: "bg-green-100 text-green-800 border-green-300", Icon: Check }
      : s === "failed"
      ? { label: "Failed", cls: "bg-red-100 text-red-800 border-red-300", Icon: X }
      : s === "refunded"
      ? { label: "Refunded", cls: "bg-blue-100 text-blue-800 border-blue-300", Icon: RotateCcw }
      : { label: "Pending payment", cls: "bg-amber-100 text-amber-900 border-amber-300", Icon: Clock };
  const { Icon } = cfg;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.cls}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </Badge>
  );
}
