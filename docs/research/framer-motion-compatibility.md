# framer-motion / motion compatibility

**Researched:** 2026-09-19 · **Question:** can this project install framer-motion (now also published as `motion`)?
**Saved in:** `docs/research/` (durable research; `.scratch/` stays for tickets, which are gitignored).

## TL;DR — YES, install `motion@^13` (latest 13.4.0), import from `motion/react`

The project (Vite ^5.4.19, React ^18.3.1, Tailwind ^3.4.17, no SSR, Capacitor targets — `package.json`) satisfies every prerequisite. The official install guide states Motion requires React `18.2+` and that "no special configuration is needed with Vite" (`https://motion.dev/docs/react-installation`). Registry metadata for `motion@13.4.0` declares peers `react: ^18.0.0 || ^19.0.0`, so React 18.3.1 installs with no peer warnings (`https://registry.npmjs.org/motion/latest`). Use the `motion` package name, not `framer-motion` — the official upgrade guide's migration path is `npm uninstall framer-motion` + `npm install motion` with imports swapped to `"motion/react"` (`https://motion.dev/docs/react-upgrade-guide`). One exclusion on React 18: the `motion/react-animate-view` entry point requires React 19.3+ (`https://www.npmjs.com/package/motion`).

| Verdict | Item | Evidence |
|---|---|---|
| ✅ Installable | React 18.3.1 + Vite 5 | Peers `^18 \|\| ^19` (`https://registry.npmjs.org/motion/latest`); "React 18.2+" minimum, Vite works out of the box (`https://motion.dev/docs/react-installation`) |
| ✅ Package name | `motion`, import `motion/react` | Successor naming + migration steps (`https://motion.dev/docs/react-upgrade-guide`); npm page: "Framer Motion is now Motion. Import from `motion/react`" (`https://www.npmjs.com/package/motion`) |
| ✅ Version line | Latest 13.x (13.4.0) still supports React 18 | Peers of `framer-motion@13.4.0` are `^18 \|\| ^19` (`https://registry.npmjs.org/framer-motion/latest`); no pin to an old major needed |
| ⚠️ Exclude | `motion/react-animate-view` (view transitions) | Requires React + React DOM 19.3+; "other Motion React APIs continue to support React 18" (`https://www.npmjs.com/package/motion`) |
| ✅ No conflict | tailwindcss-animate, Radix CSS, embla | `tailwindcss-animate@1.0.7` peers only on `tailwindcss >=3.0.0`, zero shared deps with Motion (`https://registry.npmjs.org/tailwindcss-animate/latest`); Motion runtime deps are only `tslib/motion-dom/motion-utils` (`https://registry.npmjs.org/motion/latest`) |
| ✅ Accessibility | Complements existing reduced-motion CSS | `MotionConfig reducedMotion="user"` + `useReducedMotion` (`https://motion.dev/docs/react-accessibility`, `https://motion.dev/docs/react-use-reduced-motion`) |
| ✅ Mobile/Capacitor | No blocker on modern WebViews | Gestures use Pointer Events; v8 removed the mouse/touch polyfill (`https://motion.dev/docs/react-upgrade-guide`); only legacy IE/Safari-12 need an `IntersectionObserver` polyfill (`https://motion.dev/docs/react-upgrade-guide`) |

## Compatibility matrix (registry-verified 2026-09-19)

| Package @ version | `peerDependencies.react` | Fits React 18.3.1? |
|---|---|---|
| `motion@13.4.0` (latest) | `^18.0.0 \|\| ^19.0.0` (`https://registry.npmjs.org/motion/latest`) | ✅ |
| `framer-motion@13.4.0` | `^18.0.0 \|\| ^19.0.0` (`https://registry.npmjs.org/framer-motion/latest`) | ✅ (but legacy name) |
| `framer-motion@12.23.24` | `^18.0.0 \|\| ^19.0.0` (`https://registry.npmjs.org/framer-motion/12.23.24`) | ✅ |
| `framer-motion@11.18.2` | `^18.0.0 \|\| ^19.0.0` (`https://registry.npmjs.org/framer-motion/11.18.2`) | ✅ |
| `motion@12.23.24` | `^18.0.0 \|\| ^19.0.0` (`https://registry.npmjs.org/motion/12.23.24`) | ✅ |
| `motion@11.13.1` | `^18.0.0` only (`https://registry.npmjs.org/motion/11.13.1`) | ✅ (but outdated; skip) |

Minimum-React history: v7.0 made `react@18` the minimum supported version (`https://motion.dev/docs/react-upgrade-guide`).

## Install command + footprint

```bash
npm install motion
```

```tsx
import { motion } from "motion/react";
```

- Install and import path per the official React guide (`https://motion.dev/docs/react`, `https://motion.dev/docs/react-installation`).
- Peer-dep footprint: `react` + `react-dom` (already at ^18.3.1, satisfy `^18 || ^19`) — no new peers (`https://registry.npmjs.org/motion/latest`).
- Runtime deps pulled in: `tslib`, plus `framer-motion → motion-dom + motion-utils` (`motion@13.4.0` depends on `framer-motion ^13.4.0`; `https://registry.npmjs.org/motion/latest`). Do **not** install both names — that duplicates the engine.
- ESM/Vite/TS: the package moved to ESM modules in v5 (`https://motion.dev/docs/react-upgrade-guide`); Vite needs no special config (`https://motion.dev/docs/react-installation`); the npm page shows built-in TypeScript declarations (`https://www.npmjs.com/package/motion`), compatible with this repo's `moduleResolution: bundler` + `module: ESNext` (`tsconfig.app.json`). No SSR in this project, so the only framework caveat in the docs (Next.js App Router `"use client"` / `motion/react-client` entry) does not apply (`https://motion.dev/docs/react-installation`).
- Bundle-size cost: the full `motion` component floor is **~34kb** (min+gzip); via `m` + `LazyMotion` the initial render drops to **~4.6kb**, with `domAnimation` **+15kb** / `domMax` **+25kb** feature packs; `useAnimate` mini is **2.3kb**, hybrid **17kb** (`https://motion.dev/docs/react-reduce-bundle-size`). All bundlers tree-shake unimported exports, so a quoted "~100KB" only materialises if the whole API surface is imported without `LazyMotion` (same page notes naive Bundlephobia reads like "50kb or more" are misleading for this reason).

## Risks / duplication with what exists

- **No dependency overlap.** `tailwindcss-animate@1.0.7` peers solely on Tailwind and brings no runtime deps (`https://registry.npmjs.org/tailwindcss-animate/latest`); Motion's tree is `tslib/motion-dom/motion-utils` (`https://registry.npmjs.org/motion/latest`). Keep `tailwind.config.ts`'s `animate-accordion-*` + Radix `--radix-accordion-content-height` keyframes as-is — Motion complements rather than replaces CSS enter/exit for Radix primitives.
- **Keep embla-carousel for carousels.** `embla-carousel-react ^8.6.0` (`package.json`) owns swipe physics; Motion's drag/layout is a different tool — don't re-implement the carousel in Motion.
- **Don't mix animation systems on one element.** Motion docs position CSS as right for "simple, self-contained effects" and Motion for state-linked/gesture/layout animation (`https://motion.dev/docs/react`); pick one driver per element to avoid transform fights (e.g. don't put `animate-accordion-*` and `layout` on the same node).
- **v13 CSS-in-JS note:** only affects styled-components/Emotion users (`MotionConfig isValidProp` injection — `https://motion.dev/docs/react-upgrade-guide`); this repo uses Tailwind + CSS variables, so no action.
- **Tests:** v11 moved `motion` post-mount renders to a microtask, so any future vitest asserting post-animation styles must await a frame (`frame.postRender` pattern — `https://motion.dev/docs/react-upgrade-guide`).

## Accessibility note (extends existing `src/index.css` handling)

`src/index.css` already degrades `.rise`/`.pulse-dot`/`.press`/`.shimmer` under `prefers-reduced-motion: reduce`. Motion has a matching built-in layer rather than a conflict:

- Wrap the app in `<MotionConfig reducedMotion="user">` — transform and layout animations auto-disable while `opacity`/`backgroundColor` still animate (`https://motion.dev/docs/react-accessibility`).
- For bespoke cases (parallax, autoplay video, transform→fade swaps), use the `useReducedMotion()` boolean hook (`https://motion.dev/docs/react-use-reduced-motion`, `https://motion.dev/docs/react-accessibility`).
- Side benefit: v9.0 made tap targets keyboard-accessible (`tabindex="0"`) and `whileFocus` behave like `:focus-visible` (`https://motion.dev/docs/react-upgrade-guide`).

## Capacitor / mobile caveat

None blocking. Motion's hybrid engine runs on the Web Animations API with JS fallback for springs/gestures (`https://motion.dev/docs/react`); gestures are explicitly "robust, cross-device" tap/drag/hover recognisers (`https://motion.dev/docs/react`). The two legacy-browser notes don't touch Capacitor 8's modern WebViews: Pointer Events polyfill removed in v8 (fine on Chromium/WKWebView), and only IE/Safari-12 need an `IntersectionObserver` polyfill for `whileInView` (`https://motion.dev/docs/react-upgrade-guide`). Prefer `transform`/`opacity` props (GPU-friendly, 120fps claim — `https://motion.dev/docs/react`) over layout-animating large lists on low-end devices.

## Method

- Codebase recon: `package.json` (React ^18.3.1, Vite ^5.4.19, Tailwind ^3.4.17, `tailwindcss-animate` ^1.0.7, `embla-carousel-react` ^8.6.0, `@vitejs/plugin-react-swc` ^3.11.0, Capacitor ^8.3.0), `vite.config.ts` (no SSR, `dedupe` on react), `tsconfig.app.json` (`moduleResolution: bundler`, `target: ES2020`), `src/index.css` (reduced-motion block), `tailwind.config.ts` (Radix accordion keyframes). No source modified.
- Primary verification (fetched 2026-09-19): `https://motion.dev/docs/react-installation` (prereqs, Vite note, `motion/react` import), `https://motion.dev/docs/react-upgrade-guide` (migration, v5 ESM, v7 React-18 minimum, v8 pointer events, v10 IntersectionObserver, v11 microtask, v13 emotion dep), `https://motion.dev/docs/react`, `https://motion.dev/docs/quick-start`, `https://motion.dev/docs/react-reduce-bundle-size`, `https://motion.dev/docs/react-accessibility`, `https://motion.dev/docs/react-use-reduced-motion`, `https://www.npmjs.com/package/motion` (13.4.0, successor naming, AnimateView React-19.3 note, TS declarations), `https://github.com/motiondivision/motion` (repo identity), registry JSON: `https://registry.npmjs.org/motion/latest`, `.../framer-motion/latest`, `.../framer-motion/{11.18.2,12.23.24}`, `.../motion/{11.13.1,12.23.24}`, `.../tailwindcss-animate/latest`.
- Dead end: `https://motion.dev/docs/react-install` 404s — canonical install URL is `https://motion.dev/docs/react-installation`; `https://www.npmjs.com/package/framer-motion` returned 403 to the fetcher, so framer-motion metadata was verified via `https://registry.npmjs.org/framer-motion/*` instead.
