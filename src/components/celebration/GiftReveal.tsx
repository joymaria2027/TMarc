import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { Reveal } from "@/components/motion";
import { haptics } from "@/lib/haptics";

interface GiftRevealProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Skip the mount buzz when the caller already fired haptics (avoids a double buzz). */
  silent?: boolean;
}

/**
 * Stage-2 ceremony wrapper (gift-vs-receipt slice 01).
 * Fires haptics.success() once on mount; motion collapses to static
 * under prefers-reduced-motion. Afterglow content goes in children.
 */
export default function GiftReveal({ title, description, icon, children, className, silent = false }: GiftRevealProps) {
  const reduce = useReducedMotion();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || silent) return;
    fired.current = true;
    void haptics.success();
  }, [silent]);

  const body = (
    <div className={className}>
      <div className="flex items-center gap-3">
        {icon}
        <div className="text-sm min-w-0">
          <p className="font-medium">{title}</p>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );

  if (reduce) return <div role="status">{body}</div>;
  return (
    <div role="status">
      <Reveal y={8}>{body}</Reveal>
    </div>
  );
}
