import { Check, ChefHat, PackageCheck, Bike, Navigation, Home, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "preparing", label: "Preparing", icon: ChefHat, statuses: ["paid", "accepted", "preparing"] },
  { key: "ready", label: "Ready", icon: PackageCheck, statuses: ["ready"] },
  { key: "dispatched", label: "Rider assigned", icon: UserCheck, statuses: ["dispatched"] },
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
    <ol aria-label="Delivery progress" className={cn("w-full flex items-start justify-between gap-1", className)}>
        {steps.map((step, i) => {
          const stepIdx = STEPS.findIndex(s => s.key === step.key);
          const reached = currentIdx >= stepIdx;
          const isCurrent = (step.statuses as readonly string[]).includes(status);
          const Icon = step.icon;
          return (
            <li key={step.key} className="flex flex-1 items-start" aria-current={isCurrent ? "step" : undefined} aria-label={`${step.label}, step ${i + 1} of ${steps.length}${isCurrent ? ", current" : reached ? ", completed" : ""}`}>
              <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <div
                  aria-hidden="true"
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center border-2 transition-colors shrink-0 relative",
                    reached
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-border",
                    isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {reached && !isCurrent && (
                    <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background">
                      <Check className="h-2.5 w-2.5" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <span className={cn("text-xs text-center leading-relaxed break-words w-full", reached ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div aria-hidden="true" className={cn("h-0.5 flex-1 mt-4 mx-1", currentIdx > stepIdx ? "bg-primary" : "bg-border")} />
              )}
            </li>
          );
        })}
    </ol>
  );
}
