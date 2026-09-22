import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { plugin as shadcn } from "@shadcn/lint";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      shadcn,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Trial: @shadcn/lint warn-only (ticket .scratch/shadcn-lint-adoption).
      // Slice 01: measure arbitrary-value usage.
      "shadcn/no-arbitrary-values": "warn",
      // Slice 02: measure component restyling. Button owns spacing/shape/
      // typography via size+variant props (see src/components/ui/button.tsx);
      // CardTitle may change typography, CardContent may change spacing.
      // Slice 03: triaged refinements (ticket 03-triage-refine) — each backed
      // by a warning cluster. Still warn-only; nothing promoted to error.
      "shadcn/no-restyle": ["warn", {
        allow: ["layout"],
        contracts: [
          { pattern: "^Button$", allow: ["layout"] },
          // Icon+title composition rows use gap-2 (23/23 CardTitle hits).
          { pattern: "^CardTitle$", allow: ["layout", "typography", "spacing"] },
          // Plain content container carrying body copy (text-sm muted, 16/16).
          { pattern: "^CardContent$", allow: ["layout", "spacing", "typography"] },
          // Tightened header rhythm pb-2/pb-3 (44/46 hits), mirrors CardContent.
          { pattern: "^CardHeader$", allow: ["layout", "spacing"] },
          // Finance tables: tabular-nums + weights (121 hits) are the
          // tabular-nums system (src/index.css); money-cell semantics
          // (success/destructive/muted/primary, 38 hits) allowlisted by name
          // so all other colors stay flagged.
          { pattern: "^TableCell$", allow: ["layout", "typography", "text-success", "text-destructive", "text-muted-foreground", "text-primary"] },
          // No size variants exist; density tweaks (text-xs restatement 59,
          // tabular-nums, capitalize) have no variant path. Color/shape stay
          // flagged → feeds slice-04 success/warning variant proposal.
          { pattern: "^Badge$", allow: ["layout", "typography"] },
          // Same no-size-variant rationale as Badge (text-xs x17).
          { pattern: "^Label$", allow: ["layout", "typography"] },
          // shimmer is the design-system skeleton animation (src/index.css,
          // unclassified by the grammar — allow by name per upstream docs);
          // rounded-lg matches the system --radius (base uses rounded-md).
          { pattern: "^Skeleton$", allow: ["layout", "shimmer", "rounded-lg"] },
          // Plain tab-panel container, 19/19 hits are space-y stacks.
          { pattern: "^TabsContent$", allow: ["layout", "spacing"] },
        ],
      }],
    },
  },
  {
    // Components style their own internals — don't lint the design system
    // against itself (upstream recommendation).
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: { "shadcn/no-restyle": "off" },
  },
);
