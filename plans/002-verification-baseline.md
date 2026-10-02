# Plan 002: Establish a green verification baseline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 08f5ec4..HEAD -- package.json tsconfig.json tsconfig.app.json tsconfig.node.json eslint.config.js vitest.config.ts src/lib/guardedWrite.ts .github`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-fix-three-shipped-runtime-crashes.md
- **Category**: dx
- **Planned at**: commit `08f5ec4`, 2026-10-02

## Why this matters

This repo currently has **no working typecheck gate**, and the failure is
silent rather than loud. The root `tsconfig.json` sets `"files": []`, so the
command every developer and agent reaches for — `npx tsc --noEmit` — typechecks
**zero files and exits 0**. There is also no `typecheck` npm script at all, so
the real check has to be reconstructed from memory as
`npx tsc --noEmit -p tsconfig.app.json`, which reports 48 errors (51 before
plan 001).

That is how three `ReferenceError` crashes reached `main`. It is also why the
money-path fixes in plans 004–007 currently land unverified. This plan makes
`npm run typecheck` a real, honest, zero-error command and wires lint +
typecheck + test into a CI gate, so the next class of defect fails the build
instead of production.

Everything else in this audit depends on this landing first.

## Current state

### The silent-pass trap

`tsconfig.json` (root):

```json
{
  "compilerOptions": { … },
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`"files": []` plus project references means `npx tsc --noEmit` at the repo root
compiles nothing. Verified: it exits 0 with no output.

`package.json:6-14` — the full scripts block, note the absence of `typecheck`:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:dev": "vite build --mode development",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

`tsconfig.app.json:16,25` — the app config is not strict:

```json
    "noImplicitAny": false,
    …
    "strict": false,
```

`tsconfig.app.json` has `"include": ["src"]`. It does **not** cover
`supabase/functions/**` (543 LOC of Deno edge-function code, including the
ModemPay money webhook) — no tsconfig includes it, so it is never
compiler-checked. Do not try to fix that in this plan; note it in
`CLAUDE.md` instead (step 6).

`vercel.json` has **no** `buildCommand`, so deploys run Vercel's default
`vite build` — an esbuild transpile with no type checking, no tests, no lint.
There is no `.github/`, `.gitlab-ci.yml`, `.circleci/`, or `.husky/` directory.

### The 48 remaining errors, grouped by root cause

Run `npx tsc --noEmit -p tsconfig.app.json` to see them all. They are **not** 48
independent problems — they collapse into 6 root causes:

| Root cause | Count | Files |
|---|---|---|
| **A.** `guardedWrite` rejects a PostgREST thenable | 9 | `AlertsPage:109`, `DeliveriesPage:268`, `FraudPage:92`, `MerchantsPage:661`, `NewDeliveryPage:103`, `RiderDashboard:320,599`, `RidersPage:105,279` |
| **B.** `DeliveryRow` / `DeliverySortRow` shape mismatch | 10 | `DeliveriesTable:302,305,356,370`, `SettlementsPage:252,253`, `RiderExpensesPage:273`, + 3 test files |
| **C.** `as` casts TS2352 "neither type sufficiently overlaps" | 9 | `supabaseLock:77`, `alertFilters.test:67`, `queries/deliveries:127,155`, `AlertsPage:76`, `DispatchAuditPage:93`, `NewDeliveryPage:71` |
| **D.** Generated-DB type vs. local interface on inserts/updates (`RejectExcessProperties`) | 9 | `AdminProductEditDialog:146`, `ExpenseTypesPage:245,291`, `PayrollPage:237`, `WalletPage:335`, + 4 test files |
| **E.** Library prop-type drift | 8 | `DashboardTour:91,121,122`, `DispatchAuditPage:136`, `PaymentMethodSelect.label.test` ×5 |
| **F.** Misc narrow unions | 3 | `RiderExpensesPage:443`, `NewDeliveryPage:61` ×2, `WalletPage:538,539`, `ProductDetailPage.icebug.test:65` |

**Root cause A is the highest leverage and the most important thing to
understand.** `src/lib/guardedWrite.ts:37-41`:

```tsx
export async function guardedWrite<T = unknown>(
  write: Promise<GuardedResult<T>> | GuardedResult<T>,
  options: { context: string; silent?: boolean },
): Promise<GuardedResult<T>> {
```

where `type GuardedResult<T> = { data: T | null; error: WriteError | null };`
(line 5).

Call sites pass a **PostgREST builder**, e.g. `supabase.from('x').update({…})`.
That object is *thenable* — it has `.then()` — but it is **not a `Promise`**:
it has no `.catch`, no `.finally`, no `[Symbol.toStringTag]`. TypeScript
correctly rejects it, and the error message is the giveaway:

```
Type 'PostgrestFilterBuilder<…>' is missing the following properties from type
'Promise<GuardedResult<unknown>>': catch, finally, [Symbol.toStringTag]
```

Widening the parameter to `PromiseLike` fixes all 9 at once. **Do not "fix"
these by casting at each call site** — that would scatter 9 suppressions across
5 files and leave the underlying signature wrong.

### Lint state

`npx eslint .` → **293 errors, 921 warnings**.

- **281 of 293 errors are one rule**: `@typescript-eslint/no-explicit-any`
  (47 files; `MerchantsPage.tsx` alone has 32, `RejectedDeliveriesPage.tsx` 20,
  `RiderDashboard.tsx` 15).
- 890 of the 921 warnings are `shadcn/no-arbitrary-values` (453) and
  `shadcn/no-restyle` (437) — both are **deliberately** set to `"warn"` in
  `eslint.config.js:28,34` as part of an in-flight measurement effort
  (`.scratch/shadcn-lint-adoption`). **Leave them alone.**
- The 2 remaining `react-hooks/rules-of-hooks` errors are fixed by plan 001.

A permanently-red gate is a permanently-ignored gate. The goal here is not to
delete all 281 `any`s — it is to make **red mean something new**.

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json`  | 48 errors before step 2, **0** after |
| Tests     | `npm test`                               | 803 passed (109 files) |
| Lint      | `npx eslint . -f json`                   | 281 errors, 0 rules-of-hooks |
| Build     | `npm run build`                          | exit 0 |

## Scope

**In scope**:
- `package.json` (add `typecheck` script)
- `tsconfig.json` (make the root honest about what it checks)
- `eslint.config.js` (ratchet `no-explicit-any` to `warn`)
- `src/lib/guardedWrite.ts` (widen the `PromiseLike` signature)
- The 25 source/test files named in the error table above (fix root causes A–F)
- `.github/workflows/ci.yml` (create)
- `CLAUDE.md` (document the commands and the untypechecked `supabase/functions` gap)
- `docs/testing.md` (create — how to run the suite and what it does not cover)

**Out of scope** (do NOT touch):
- `eslint.config.js` shadcn rules — deliberately `warn`, part of a separate ticket.
- `tsconfig.app.json` `strict` / `noImplicitAny` — see step 7; this plan does **not** flip them.
- Any file under `src/components/ui/**` — vendored shadcn primitives.
- `vitest.config.ts` `include` glob — adding `supabase/**` coverage is a follow-up (deferred note in step 8).
- The 281 `any` annotations themselves — ratchet only, do not rewrite.
- `supabase/migrations/**` — plans 004–007 own migrations.
- `supabase/functions/**` type errors — not currently in any tsconfig; see step 6.

## Git workflow

- Branch: `advisor/002-verification-baseline`
- Conventional Commits, matching observed repo style:
  - `chore(lint): add typecheck script and CI gate`
  - `fix(types): widen guardedWrite to accept PostgREST builders`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `typecheck` script

In `package.json`, add to `scripts`:

```json
    "typecheck": "tsc --noEmit -p tsconfig.app.json"
```

Name the config **explicitly**. Do not use `tsc -b`, and do not rely on the root
config — the root has `"files": []` and checks nothing.

**Verify**: `npm run typecheck` → exits non-zero and prints the 48 errors. It must
NOT print nothing. (If it prints nothing, you used the wrong config — stop and
re-read this step.)

### Step 2: Make the root tsconfig honest

The trap is that `npx tsc --noEmit` silently passes. Do not delete
`"files": []` (project references legitimately need it). Instead, in
`tsconfig.json`, add a comment is not possible in JSON-with-comments… so
choose one of these two options and pick **one**:

**Option 2a (recommended):** leave `tsconfig.json` alone and rely on the
`typecheck` script. Then add `"typecheck"` to the scripts **and** record in
`CLAUDE.md` (step 6) that the bare root command is a no-op and must never be used.

**Option 2b:** remove the `references` array and give the root a real
`include`. This is riskier — it changes what editors check.

**Take option 2a.** Do not restructure the tsconfig layout.

**Verify**: `npx tsc --noEmit` still exits 0 (unchanged, expected) and
`npm run typecheck` still reports 48. Both behaviors are now documented.

### Step 3: Widen `guardedWrite` to accept thenables

This clears root cause A — **9 errors across 5 files — with one change.**

In `src/lib/guardedWrite.ts`, change the signature at line 38 from
`Promise<GuardedResult<T>>` to `PromiseLike<GuardedResult<T>>`:

```tsx
export async function guardedWrite<T = unknown>(
  write: PromiseLike<GuardedResult<T>> | GuardedResult<T>,
  options: { context: string; silent?: boolean },
): Promise<GuardedResult<T>> {
```

`await` already works on any thenable, so the body needs no change. Do not touch
`normalizeWriteError` or the toast behavior.

**Verify**: `npm run typecheck 2>&1 | grep -c "PostgrestFilterBuilder"` → `0`.
Expected total drops from 48 to 39.

### Step 4: Fix root causes B and C

**B — the `DeliveryRow` family (10 errors).** Four shapes describe the
`deliveries` table: `src/lib/queries/deliveries.ts:14` (`DeliveryRow`, derived
from the generated `Database` type — correct), `:42` (`JoinedDeliveryRow` —
correct), `src/lib/deliveries.ts:219-227` (`DeliverySortRow` — a deliberate
7-field subset), and `src/pages/SettlementsPage.tsx:126-143` — **a hand-written
17-field `interface DeliveryRow` that shadows the same name**. The generated
table has 40 columns.

The errors are the two shapes disagreeing about nullability: the DB has
`delivered_at`, `dispatched_at` etc. as nullable, while the sort/row shapes
declare them non-null.

Fix by making `SettlementsPage.tsx` and `MerchantSettlementCard.tsx` import the
real type and `Pick` the fields they read:

```tsx
import type { DeliveryRow as FullDeliveryRow } from "@/lib/queries/deliveries";
type SettlementDelivery = Pick<FullDeliveryRow, /* the ~17 fields actually read */>;
```

Delete the hand-written shadow interface. Then reconcile `DeliveriesTable.tsx`
— it passes `DeliveryRow[]` where `DeliverySortRow[]` is expected; make the
call site honest about which shape it holds rather than casting.

**C — the TS2352 `as` casts (9 errors).** All are
"neither type sufficiently overlaps". The correct fix is to route the value
through `unknown` first, which is exactly what the compiler suggests:

```tsx
const x = raw as unknown as TargetType;   // not: const x = raw as TargetType;
```

Only do this where the cast is genuinely correct. For `supabaseLock.ts:77`
(`Error` → `{ isAcquireTimeout: boolean }`) and the three realtime-payload casts
(`AlertsPage:76`, `DispatchAuditPage:93`, `alertFilters.test:67`), a type
predicate is better than a double cast — but a double cast is acceptable if you
add a one-line comment naming why the cast is sound. **Do not use
`@ts-ignore`.**

**Verify**: `npm run typecheck 2>&1 | grep -cE "TS2352|TS2345.*Delivery|TS2339.*picked_up_at|TS2339.*gps_confirmed"` → `0`.

### Step 5: Fix root causes D, E, F (20 errors)

**D — `RejectExcessProperties` on inserts/updates (9).** The generated DB types
reject excess properties. A `Record<string, unknown>` payload
(e.g. `WalletPage:335`, `PayrollPage:237`) cannot satisfy them. Fix by typing
the payload object at its construction site to the generated `Insert`/`Update`
type imported from `@/integrations/supabase/types`, rather than widening the
DB type. If a payload is genuinely dynamic, build it as a typed const first:
`const payload: Database['public']['Tables']['withdrawal_requests']['Update'] = { … }`.

**E — library prop-type drift (8).** These are real version-skew signals, not
noise:
- `DashboardTour.tsx:91` — `Status.ERROR` does not exist on the installed
  `react-joyride` `Status` enum (it is `IDLE|READY|WAITING|RUNNING|PAUSED|SKIPPED|FINISHED`).
- `DashboardTour.tsx:121,122` — `"skip"` is not a valid action (`false|"next"|"close"|"replay"`).
  These three mean the code was written against a different `react-joyride`
  version than the one installed. Check `npm ls react-joyride` and reconcile
  the call sites to the **installed** version's types. Do not upgrade the
  package in this plan.
- `DispatchAuditPage.tsx:136` — an async handler `(opts?) => Promise<void>` is
  passed where `MouseEventHandler` is expected; wrap it: `onClick={() => void handler()}`.
- The 5 `PaymentMethodSelect.label.test.tsx` errors — the test passes
  `orderReference`, which the component's props do not include. Either the
  component dropped the prop or the test is stale. **If it is ambiguous, that is
  a STOP condition** (see below).

**F — narrow unions (3+).** `RiderExpensesPage:443` passes `"verified"|"rejected"`
where state is typed `"reject"|"verify"` — reconcile the two vocabularies
(the `"verify"`/`"reject"` action names vs `"verified"`/`"rejected"` result
statuses are genuinely different things; make the state type express the
action). `WalletPage:538,539` and `NewDeliveryPage:61` are local-interface vs.
generated-type mismatches — fix like cause B.

**Verify**: `npm run typecheck` → **0 errors**.

### Step 6: Document the verification commands in CLAUDE.md

`CLAUDE.md` is currently 13 lines, all of it pointers to agent skills. Add a
section covering:

- **Verify**: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- **The trap**: `npx tsc --noEmit` at the root checks zero files because
  `tsconfig.json` has `"files": []`. Always use `npm run typecheck`.
- **Coverage gap**: `vitest.config.ts` sets
  `include: ["src/**/*.{test,spec}.{ts,tsx}"]`, so **`supabase/**` is excluded**.
  No tsconfig includes `supabase/functions/**` either — the Deno edge
  functions, including the ModemPay money webhook, are neither typechecked nor
  tested by any command in this repo.
- **Where money logic lives**: `src/lib/moneyGuards.ts`, `src/lib/netRevenue.ts`
  (a hand-maintained mirror of the SQL trigger — its header comment points at a
  migration glob `*_settlement_net_revenue*.sql` that **does not exist**; the
  real ones are `2026041*`/`2026052*`), and `supabase/migrations/*` (the real
  ledger). `src/lib/guardedWrite.ts` is the required wrapper for client writes.

Match the existing `CLAUDE.md` heading style (it uses `##` sections).

**Verify**: `cat CLAUDE.md` shows the new sections.

### Step 7: Add the CI workflow

Create `.github/workflows/ci.yml`. There is no existing CI, so you are writing
the first one.

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci --legacy-peer-deps
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

`--legacy-peer-deps` is **required**: `.npmrc:1` sets
`legacy-peer-deps=true` because `react-leaflet@5.0.0` declares
`react: ^19.0.0` while the repo pins `react@18.3.1`. Do not remove
`--legacy-peer-deps` in this plan — it is masking a real dependency conflict
that deserves its own plan.

Do **not** add the Deno settlement e2e here — it needs a live database and a
`service_role` key, so it belongs on a schedule, not on every PR. Record that
deferral in `docs/testing.md` (step 8).

**Verify**: `npm ci --legacy-peer-deps && npm run lint && npm run typecheck && npm test && npm run build` all pass locally in sequence.

### Step 8: Ratchet the lint gate and document testing

**Lint ratchet.** In `eslint.config.js`, change:

```js
"@typescript-eslint/no-explicit-any": "off",   // currently inherited as "error" from tseslint.configs.recommended
```

Replace with `"@typescript-eslint/no-explicit-any": "warn"`. Leave every
`shadcn/*` rule exactly as-is (they are already `warn` by deliberate decision).

After this, `npx eslint .` reports **281 errors and ~1202 warnings** instead of
293 errors. The gate is now green-on-errors, and the 281 `any`s are visible as
a countable ratchet baseline rather than blocking everything.

Add a note in `CLAUDE.md` step 6's section: the `any` count is **281**; the
intent is that number only goes down, never up.

**docs/testing.md (create).** Cover:
- `npm test` — 803 tests / 109 files, ~50s, jsdom.
- What the suite does **not** cover: `supabase/functions/**` (outside the
  vitest `include` glob). In particular
  `supabase/functions/settlement-e2e/index.test.ts` is a Deno test that
  exercises the real settlement money math and **is not run by `npm test` and
  has no runner script**. Note that it needs a reachable database and
  `service_role`, so it must be env-gated and scheduled.
- The fact that many existing tests assert against **migration file text** via
  `readFileSync` rather than executing SQL. Name the pattern so future
  contributors know it exists and that it is a change-detector rather than a
  true contract test.

**Verify**:
- `npx eslint . 2>&1 | tail -2` → the summary line shows `0 errors`.
- `npx eslint . 2>&1 | grep -c "no-explicit-any"` → `281`.

## Test plan

No new test files are required — this plan changes types, config, and CI, not
behavior. The existing 803 tests are the regression net, and the typecheck
becomes a second net.

- **Verification**: `npm test` → 803 passed (unchanged count from plan 001).
- If you find yourself wanting to add a test, that is a signal you have changed
  behavior rather than types — stop and re-read the step.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0 with zero output
- [ ] `npx tsc --noEmit -p tsconfig.app.json` exits 0 (same command, honest now)
- [ ] `npx eslint . 2>&1 | tail -2` reports `0 errors`
- [ ] `npx eslint . 2>&1 | grep -c "no-explicit-any"` returns `281` or fewer
- [ ] `npm test` exits 0 with 803 tests passing
- [ ] `npm run build` exits 0
- [ ] `grep -c "@ts-ignore" -r src/` did not increase
- [ ] `.github/workflows/ci.yml` exists and its five steps all pass locally in order
- [ ] `CLAUDE.md` documents the commands, the root-tsconfig trap, and the `supabase/**` coverage gap
- [ ] `docs/testing.md` exists and names the settlement-e2e gap
- [ ] `eslint.config.js` shadcn rules are unchanged (`git diff eslint.config.js` shows only the `no-explicit-any` line)
- [ ] `git status --porcelain` shows only in-scope files
- [ ] `plans/README.md` status row for 002 updated

## STOP conditions

Stop and report back (do not improvise) if:

- **`PaymentMethodSelect.label.test.tsx`**: you cannot determine from the code
  whether the component *should* accept `orderReference` (i.e. the prop was
  dropped from `PaymentMethodSelectProps`, or the test is stale). Guessing here
  means either deleting a prop the UI needs or deleting a test that documents
  intended behavior. Report the ambiguity instead.
- Any fix requires adding a tsconfig that includes `supabase/functions/**` —
  that needs a Deno tsconfig decision, out of scope here.
- Reaching 0 errors would require `@ts-ignore`, `@ts-expect-error`, or deleting a
  test. **Report instead.** Reaching 0 by suppression is not reaching 0.
- `npm test` count is not 803 at the start of your work — plan 001 may not have
  landed, or something else changed. Confirm with the operator.
- The `no-explicit-any` count is not 281 — re-measure before assuming your
  ratchet worked.
- `npm ci --legacy-peer-deps` fails. The lockfile situation in this repo is
  known-dirty (three lockfiles are tracked: `package-lock.json`, `bun.lock`,
  `bun.lockb`). Do not attempt to fix lockfiles here.

## Maintenance notes

- **What a reviewer should scrutinise:** step 3. If someone later "cleans up"
  `guardedWrite` back to `Promise<T>`, 9 errors return immediately and will be
  tempting to suppress at call sites. Add a comment in `guardedWrite.ts`
  explaining *why* `PromiseLike` (PostgREST builders are thenables, not
  Promises) so the next reader does not "fix" it.
- **Interaction:** every plan after this one has `npm run typecheck` in its done
  criteria, so it now runs in CI. Plans 003–007 were written against the
  *pre-baseline* state — after this lands, re-check their "Current state"
  excerpts still match, since plan 002 changes the lint severity of `any` and
  may make some previously-flagged sites resolve differently.
- **Deferred, deliberately, with reasons:**
  - Flipping `strict`/`noImplicitAny` to `true` in `tsconfig.app.json`. This
    is the real prize — it is what would catch nullability bugs on money paths —
    but the error count is unknown and it is a separate, larger piece of work.
    Not in this plan.
  - Converting the ~288 migration-text-grep tests into executed SQL assertions
    against a throwaway Postgres. High value, new infrastructure, new flake
    surface. Separate plan.
  - Removing the three tracked lockfiles and `--legacy-peer-deps`. Deferred
    because `--legacy-peer-deps` is currently masking a genuine
    React 18 / react-leaflet 5 peer conflict; removing it without resolving
    that conflict breaks the build.
  - Route-level code splitting and the money-formatting consolidation. Both are
    real (the latter has a blast radius of 82 graph edges across ~30 files per
    `graphify affected formatMoney`) but neither is a defect, and both are much
    safer once this gate exists.
