import { Check, ChefHat, PackageCheck, Bike, Navigation, Home, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "preparing", label: "Preparing", icon: ChefHat, statuses: ["paid", "accepted", "preparing"] },
  { key: "ready", label: "Ready", icon: PackageCheck, statuses: ["ready"] },
  { key: "dispatched", label: "Rider assigned", icon: Search, statuses: ["dispatched"] },
  { key: "picked_up", label: "Picked up", icon: Bike, statuses: ["picked_up"] },
  { key: "in_transit", label: "In transit", icon: Navigation, statuses: ["in_transit"] },
  { key: "delivered", label: "Delivered", icon: Home, statuses: ["delivered"] },
] as const;

const ORDER: Record<string, number> = {
  pending_payment: -1, paid: 0, accepted: 0, preparing: 0,
  ready: 1, dispatched: 2, picked_up: 3, in_transit: 4, delivered: 5,
};

export default function OrderStatusTimeline({
  status,
  fulfillmentType = "delivery",
  className,
}: {
  status: string;
  fulfillmentType?: "delivery" | "pickup";
  className?: string;
}) {
  const steps = fulfillmentType === "pickup"
    ? STEPS.filter(s => s.key === "preparing" || s.key === "ready" || s.key === "delivered")
    : STEPS;
  const currentIdx = ORDER[status] ?? -1;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between gap-1">
        {steps.map((step, i) => {
          const stepIdx = STEPS.findIndex(s => s.key === step.key);
          const reached = currentIdx >= stepIdx;
          const isCurrent = (step.statuses as readonly string[]).includes(status);
          const Icon = step.icon;
          return (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center border-2 transition-colors shrink-0",
                    reached
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-border",
                    isCurrent && "ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
                  )}
                >
                  {reached && !isCurrent ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={cn("text-[10px] text-center leading-tight truncate w-full", reached ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn("h-0.5 flex-1 -mt-5 mx-1", currentIdx > stepIdx ? "bg-primary" : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
