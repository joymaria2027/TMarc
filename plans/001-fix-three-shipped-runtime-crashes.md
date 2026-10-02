# Plan 001: Fix the three shipped runtime crashes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 08f5ec4..HEAD -- src/pages/AdminDashboard.tsx src/pages/MerchantsPage.tsx src/pages/ProductApprovalsPage.tsx src/hooks/useAuth.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `08f5ec4`, 2026-10-02

## Why this matters

Three user-facing React pages crash at runtime today, and all three are
already visible to the TypeScript compiler. They shipped because this repo
has no working typecheck gate (fixed in plan 002). The admin product-approval
page is the worst: it renders a different number of hooks on first paint than
after the async role load resolves, so React unmounts the tree and the page
goes blank for every admin — with no error surfaced.

These are the three highest-confidence crashes in the codebase and the
cheapest real user value in the audit. Fixing them first also means plan 002
has three fewer errors to clear.

## Current state

- `src/pages/AdminDashboard.tsx` — admin home dashboard. Uses `toast` at line 114 but never imports it.
- `src/pages/MerchantsPage.tsx` — merchant list. Imports `useNavigate` but never calls it; uses bare `navigate(...)` at line 653.
- `src/pages/ProductApprovalsPage.tsx` — admin product approval grid. Early-returns before two `useMemo` calls.
- `src/hooks/useAuth.tsx` — provides `useAuth()` returning `{ user, role, roles, rolesReady, hasRole }`. `rolesReady` already exists and is the correct gate to use.

The three defects, confirmed by the compiler (`npx tsc --noEmit -p tsconfig.app.json`):

```
src/pages/AdminDashboard.tsx(114,18): error TS2304: Cannot find name 'toast'.
src/pages/MerchantsPage.tsx(653,82): error TS2552: Cannot find name 'navigate'. Did you mean 'navigator'?
src/components/__tests__/...  (no error here; see step 3)
```

ESLint confirms the hook-order defect:

```
src/pages/ProductApprovalsPage.tsx
 143:18  error  React Hook "useMemo" is called conditionally. React Hooks must be
                  called in the exact same order in every component render
                                                      react-hooks/rules-of-hooks
```

**Repo conventions to match:**
- Toasts: `import { toast } from "sonner";` — used in 10+ sibling pages, e.g. `src/pages/AlertsPage.tsx`, `src/pages/WalletPage.tsx`.
- React Router: `const navigate = useNavigate();` immediately after the other hooks at the top of the component.
- Tests: Vitest + Testing Library, `globals: true` (no `import { describe }` needed, but existing tests do import it — either is accepted), `@testing-library/jest-dom` matchers are preloaded via `src/test/setup.ts`. Test files live in `src/pages/__tests__/`. Model your tests on `src/pages/__tests__/PageEmptyStates.test.tsx`.

## Commands you will need

| Purpose   | Command                                | Expected on success |
|-----------|----------------------------------------|---------------------|
| Tests     | `npm test`                             | 800 passed (108 files) |
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json` | 51 errors before, 48 after this plan |
| Lint      | `npx eslint src/pages/AdminDashboard.tsx src/pages/MerchantsPage.tsx src/pages/ProductApprovalsPage.tsx` | no `error`-severity lines for the rules named above |
| Build     | `npm run build`                        | exit 0 |

There is **no** `npm run typecheck` script — plan 002 adds one. Use the explicit `npx tsc -p tsconfig.app.json` form above.

## Scope

**In scope** (the only files you should modify):
- `src/pages/AdminDashboard.tsx`
- `src/pages/MerchantsPage.tsx`
- `src/pages/ProductApprovalsPage.tsx`
- `src/pages/__tests__/shippedCrashes.test.tsx` (create)

**Out of scope** (do NOT touch, even though they look related):
- `src/hooks/useAuth.tsx` — read it to understand `rolesReady`, but do not modify it. It is correct as-is.
- The other 48 typecheck errors — plan 002 owns them.
- `src/pages/FinanceWhitescreen.test.tsx` and its assertions — plan 002 may adjust; you must not.
- Any file under `src/components/ui/**` — vendored shadcn primitives.

## Git workflow

- Branch: `advisor/001-fix-shipped-crashes`
- Commit style: the repo uses Conventional Commits. Observed examples from `git log`:
  - `fix(alerts): keep filter row on one line, standardize search affordance`
  - `fix(finance): hold proof rows out of bulk settlement approval`
  - `fix(chat): mirror order chat bubbles by viewer role`
- So: `fix(dashboard): restore missing toast import`, `fix(merchants): bind useNavigate`, `fix(approvals): gate memo hooks on rolesReady`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the missing `toast` import in AdminDashboard

Open `src/pages/AdminDashboard.tsx`. The file's existing imports are at the top (lines 1–~20). `toast.error(...)` is called at line 114:

```tsx
    if (error) { toast.error(error.message); return; } // keep unread on failure
```

Add `import { toast } from "sonner";` alongside the other imports, matching the quoting/style of the surrounding lines.

**Verify**: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep AdminDashboard` → no output.

### Step 2: Bind `useNavigate` in MerchantsPage

`src/pages/MerchantsPage.tsx:2` already imports the hook:

```tsx
import { useNavigate, useSearchParams } from 'react-router-dom';
```

but never calls it, so line 653 references an undefined binding:

```tsx
onClick={() => navigate(`/deliveries/new?merchant=${r.id}`)}
```

Add `const navigate = useNavigate();` alongside the existing `useSearchParams()` binding at the top of the same component. Do not change the template literal.

**Verify**: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "TS2552"` → no output.

### Step 3: Gate the `useMemo` calls on `rolesReady`

`src/pages/ProductApprovalsPage.tsx` early-returns for non-admins around line 96:

```tsx
  if (!hasRole("admin")) return /* … non-admin shell … */;
```

but calls `useMemo` later at lines 143 and 153. Because `useAuth` starts `roles` as `[]` and fills it asynchronously, `hasRole("admin")` is `false` on the first render and may become `true` on a later one — so the component returns early once and then renders more hooks. React throws "Rendered more hooks than during the previous render" and blanks the page.

Read `src/hooks/useAuth.tsx` and confirm the exported context value includes a `rolesReady` boolean. It does (`rolesReady` is set after the roles fetch settles).

Then change the guard so the early return only happens once roles are actually resolved:

```tsx
  const { hasRole, rolesReady } = useAuth();
  // …other hooks…

  if (rolesReady && !hasRole("admin")) return /* …non-admin shell… */;
```

The `rolesReady &&` is load-bearing: without it the early return still fires before roles load, which is the original bug. While `rolesReady` is false, render must fall through and call every hook unconditionally — render the normal (admin) markup in that window, or a neutral loading shell, but do not return early.

**Verify**:
- `npx eslint src/pages/ProductApprovalsPage.tsx 2>&1 | grep rules-of-hooks` → no output.
- `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep ProductApprovalsPage` → no output.

### Step 4: Add regression tests

Create `src/pages/__tests__/shippedCrashes.test.tsx`. Three cases, one per defect:

1. **`AdminDashboard` mark-notification-read error path does not throw.** Render the page with the notification-read mutation mocked to reject, click the mark-read control, assert no `ReferenceError` is thrown. Mock `useAuth` to return an admin user.
2. **`MerchantsPage` "Create Delivery" button does not throw.** Render with a mocked `merchants` list containing one row, click the create-delivery button, assert no `ReferenceError` and that `useNavigate`'s spy was called.
3. **`ProductApprovalsPage` survives a false→true role transition.** Render it **twice in sequence within one test** using a mutable `hasRole`/`rolesReady` mock: first pass with `rolesReady: false, hasRole: () => false`, then re-render with `rolesReady: true, hasRole: () => true`. Assert no error is thrown and the component is still in the document. This two-pass shape is the whole point — a single-pass render would pass even with the bug.

Mock `@/hooks/useAuth` with `vi.mock`. Note that `src/pages/__tests__/financeWhitescreen.test.tsx:15` already mocks `hasRole` to a constant; follow that mocking style but make the value mutable across renders.

**Verify**: `npm test -- shippedCrashes` → 3 tests pass.

## Test plan

- New file: `src/pages/__tests__/shippedCrashes.test.tsx`, 3 tests as specified above.
- Structural pattern: `src/pages/__tests__/PageEmptyStates.test.tsx` (simple render + assert) and `src/pages/__tests__/financeWhitescreen.test.tsx:15` (the `useAuth` mock shape).
- These are regression tests for specific shipped defects, not new coverage. Case 3 is the one that would actually have caught the original bug.
- **Verification**: `npm test` → 803 passed (was 800), 109 files (was 108).

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -cE 'error TS'` returns `48` (down from 51)
- [ ] `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "TS2304|TS2552"` returns nothing
- [ ] `npx eslint . 2>&1 | grep -c "react-hooks/rules-of-hooks"` returns `0`
- [ ] `npm test` exits 0 with 803 tests passing
- [ ] `npm run build` exits 0
- [ ] `git status --porcelain` shows only the 4 in-scope files
- [ ] `plans/README.md` status row for 001 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `src/pages/AdminDashboard.tsx:114` does not contain `toast.error`, or the file has gained a `sonner` import since this plan was written.
- `src/pages/MerchantsPage.tsx:653` no longer calls `navigate(...)`, or a `const navigate = useNavigate()` binding already exists elsewhere in the file.
- `src/hooks/useAuth.tsx` does **not** export `rolesReady`. If it does not, stop — do not invent an equivalent; that is a change to `useAuth` and therefore out of scope.
- `ProductApprovalsPage.tsx` has been restructured such that the early return is no longer before the `useMemo` calls.
- `npm test` fails after your changes in a file you did not touch. That is a pre-existing failure — report it, do not fix it.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- **What a reviewer should scrutinise:** step 3's `rolesReady &&` guard. It is easy to "simplify" back to `!hasRole("admin")` and silently reintroduce the crash. If a future change makes the role fetch synchronous, this guard can be revisited — but until then it is load-bearing.
- **Interaction:** plan 002 makes the typecheck a required gate. Once it lands, a regression of any of these three defects fails the build. Do not add `@ts-ignore` or `eslint-disable` to silence them instead.
- **Deferred, not done here:** the 48 remaining typecheck errors (plan 002); the absence of any CI to run these tests (plan 002).
- **Note for step 2:** `MerchantsPage.tsx:661` has a separate pre-existing `TS2345` on a `guardedWrite` call. That is plan 002's error #10 — leave it alone.
