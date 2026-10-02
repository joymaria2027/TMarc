## Agent skills

### Issue tracker

Local markdown issues under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout with one CONTEXT.md + docs/adr/ at repo root. See `docs/agents/domain.md`.

## Verify

Run all four before calling a change done. They are the same four steps CI runs.

| Command | What it proves |
|---|---|
| `npm test` | 804 tests / 109 files, jsdom, ~50s |
| `npm run lint` | `eslint .` — currently **0 errors** |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.app.json` — must be **0 errors** |
| `npm run build` | Vite production build |

### The root-tsconfig trap

`npx tsc --noEmit` at the repo root **exits 0 without checking a single file.**
The root `tsconfig.json` sets `"files": []` because it uses project references
(`tsconfig.app.json`, `tsconfig.node.json`). This is legitimate TypeScript — but
it means the command most people and agents reach for first is a silent no-op.

**Always use `npm run typecheck`.** Never trust a bare `npx tsc --noEmit`.

This is not hypothetical: three `ReferenceError` crashes and a hook-order crash
shipped to production while `tsc` reported them. See `plans/001-*.md`.

### Lint ratchet

`npx eslint .` reports **0 errors** and ~1202 warnings. Two families dominate,
both deliberately non-blocking:

- **281 × `@typescript-eslint/no-explicit-any`** — ratcheted from `error` to
  `warn` so a permanently-red gate would not mask new defects. **The count may
  go down. Never go up.**
- **890 × `shadcn/no-arbitrary-values` / `shadcn/no-restyle`** — deliberately
  `warn` as part of an in-flight measurement effort (`.scratch/shadcn-lint-adoption`).
  Leave them alone.

### Coverage gap: `supabase/**`

`vitest.config.ts` sets `include: ["src/**/*.{test,spec}.{ts,tsx}"]`, and **no
tsconfig includes `supabase/functions/**`**. So the Deno edge functions are
neither typechecked nor tested by any command in this repo — including
`supabase/functions/modempay-webhook/index.ts`, the unauthenticated
money-moving endpoint, and `settlement-e2e/index.test.ts`, a Deno test that
exercises real settlement math and has no runner script.

Do not assume `npm run typecheck` or `npm test` covers them. Details and the
recommended remediation are in `docs/testing.md`.

### Where money logic lives

- `src/lib/moneyGuards.ts` — client-side money guards.
- `src/lib/netRevenue.ts` — a **hand-maintained mirror** of the SQL trigger. Its
  header comment points at a migration glob (`*_settlement_net_revenue*.sql`)
  that **does not exist**; the real migrations are `2026041*` / `2026052*`. Treat
  the SQL as the ledger and this file as a copy that can drift.
- `supabase/migrations/**` — the real ledger.
- `src/lib/guardedWrite.ts` — the **required** wrapper for client-side writes.
