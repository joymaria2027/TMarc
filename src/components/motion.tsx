import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Shared Motion helpers (Motion, formerly Framer Motion).
 *
 * House rules, from ui-ux-pro-max + emil-design-eng + impeccable:
 * - transform/opacity only, never layout properties.
 * - Expo-out curve shared with the .rise/.press CSS tokens.
 * - Stagger 40-60ms between siblings, durations under 400ms.
 * - Reduced motion collapses to static via useReducedMotion
 *   (complements the prefers-reduced-motion block in src/index.css).
 */
export const MOTION_EASE = [0.16, 1, 0.3, 1] as const;

interface RevealProps {
  children: ReactNode;
  /** Stagger delay in seconds. Keep under 0.3. */
  delay?: number;
  /** Vertical travel in px. Small: movement is a hint, not a journey. */
  y?: number;
  className?: string;
}

export function Reveal({ children, delay = 0, y = 12, className }: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.35, delay, ease: [...MOTION_EASE] }}
    >
      {children}
    </motion.div>
  );
}
