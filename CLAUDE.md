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
| `npm test` | 819 tests / 111 files, jsdom, ~50s |
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
shipped to production precisely *because* that command reported nothing. See
`plans/001-*.md`.

### Lint ratchet

`npx eslint .` reports **0 errors** and ~1201 warnings. Two families dominate,
both deliberately non-blocking:

- **280 × `@typescript-eslint/no-explicit-any`** — ratcheted from `error` to
  `warn` so a permanently-red gate would not mask new defects. **The count may
  go down. Never go up.**
- **890 × `shadcn/no-arbitrary-values` / `shadcn/no-restyle`** — deliberately
  `warn` as part of an in-flight measurement effort (`.scratch/shadcn-lint-adoption`).
  Leave them alone.

### Coverage gap: `supabase/**`

`vitest.config.ts` sets `include: ["src/**/*.{test,spec}.{ts,tsx}"]`, and **no
tsconfig includes `supabase/functions/**`**. So the Deno edge functions are
neither typechecked nor tested by any command in this repo.

One partial exception, and it is easy to over-read: `supabase/functions/_shared/modempay.ts`
**is** typechecked, because `src/lib/__tests__/modempaySignatureGate.test.ts`
imports it, which pulls it into the app program (and is why
`src/deno-edge-functions.d.ts` exists). That covers **one** file. Every other
edge function — including `modempay-webhook/index.ts`, the unauthenticated
money-moving endpoint — is still unchecked, and `settlement-e2e/index.test.ts`,
a Deno test exercising real settlement math, still has no runner script.

Do not assume `npm run typecheck` or `npm test` covers them. Details and the
recommended remediation are in `docs/testing.md`.

### Where money logic lives

- `supabase/migrations/**` — the real ledger. Nothing in `src/` computes money
  the ledger also computes.
- `src/lib/moneyGuards.ts` — client-side money guards.
- `src/lib/guardedWrite.ts` — the **required** wrapper for client-side writes.
- `docs/settlement-net-revenue.md` — **prose only.** A readable description of
  the `credit_wallets_on_settlement` net-income formula, pointing at
  `20260520120446`. Not code, not tested, not authoritative. When it disagrees
  with the SQL, the SQL wins and the doc is the bug.

A `src/lib/netRevenue.ts` mirror used to sit here with a test suite that could
not detect its own drift (every assertion was computed from the mirror itself),
so it was green, exported and typechecked while verifying nothing. Do not
reintroduce a hand-maintained copy of ledger math here.
