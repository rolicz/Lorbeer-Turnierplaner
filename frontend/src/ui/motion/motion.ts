/**
 * Shared Framer Motion presets for a calm, sleek-minimal feel.
 * Keep durations short and easing soft; respect prefers-reduced-motion
 * (Framer's <MotionConfig reducedMotion="user"> at the app root handles that).
 */
import type { Transition, Variants } from "framer-motion";

export const ease = {
  /** Decelerate (most UI). */
  out: [0.16, 1, 0.3, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

export const spring = {
  soft: { type: "spring", stiffness: 320, damping: 34, mass: 0.9 } as Transition,
  snappy: { type: "spring", stiffness: 520, damping: 42 } as Transition,
};

/** Simple opacity fade. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2, ease: ease.out } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** Fade + small upward slide — default for cards/content. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.26, ease: ease.out } },
  exit: { opacity: 0, y: 4, transition: { duration: 0.15 } },
};

/** Left slide-in drawer. */
export const drawerLeft: Variants = {
  hidden: { x: "-100%" },
  show: { x: 0, transition: spring.soft },
  exit: { x: "-100%", transition: { duration: 0.22, ease: ease.out } },
};

/** Bottom sheet. */
export const sheetUp: Variants = {
  hidden: { y: "100%" },
  show: { y: 0, transition: spring.soft },
  exit: { y: "100%", transition: { duration: 0.22, ease: ease.out } },
};

/** Backdrop scrim. */
export const scrim: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** Popover / dropdown. */
export const popover: Variants = {
  hidden: { opacity: 0, y: -6, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.16, ease: ease.out } },
  exit: { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.12 } },
};

/** Stagger container for lists. */
export const listStagger: Variants = {
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};
