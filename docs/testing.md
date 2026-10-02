# Testing

## What runs

```bash
npm test          # 819 tests / 111 files, jsdom, ~50s
npm run lint      # eslint . — 0 errors, ~1201 warnings
npm run typecheck # tsc --noEmit -p tsconfig.app.json — must be 0 errors
npm run build     # vite build
```

CI (`.github/workflows/ci.yml`) runs the same four on every pull request and on
pushes to `main`, ordered **lint → typecheck → test → build**.

> **Never run a bare `npx tsc --noEmit`.** The root `tsconfig.json` sets
> `"files": []` for project references, so that command compiles zero files and
> exits 0. Always use `npm run typecheck`. See the "root-tsconfig trap" section
> in `CLAUDE.md`.

## What does NOT run

### `supabase/**` is outside both the test glob and every tsconfig

`vitest.config.ts` sets:

```ts
include: ["src/**/*.{test,spec}.{ts,tsx}"]
```

`tsconfig.app.json` sets `"include": ["src"]`. Nothing covers `supabase/`.

That leaves the Deno edge functions **neither typechecked nor tested** by any
command in this repo — with one partial exception, below. The gap is not
theoretical — it includes:

| File | Why it matters |
|---|---|
| `supabase/functions/modempay-webhook/index.ts` | The only unauthenticated, publicly reachable, money-moving endpoint (`supabase/config.toml` sets `verify_jwt = false` for it). Its entire authentication is one HMAC check. |
| `supabase/functions/_shared/modempay.ts` | That HMAC check plus the order-submit / merchant-wallet-credit path. **Partially covered — see below.** |
| `supabase/functions/modempay-webhook-replay/index.ts` | Admin-gated operator endpoint. |
| `supabase/functions/settlement-e2e/index.test.ts` | **A real Deno test** that exercises the actual settlement money math. It is not run by `npm test` and **has no runner script.** |

#### The one file that IS typechecked

`supabase/functions/_shared/modempay.ts` is the exception. Because
`src/lib/__tests__/modempaySignatureGate.test.ts` imports it, TypeScript follows
the import and pulls that file into the app program — `tsc --listFiles` lists it.
That is also why `src/deno-edge-functions.d.ts` exists: the module needed a
`Deno` global the app program had never declared.

Do not over-read this. It is **one file**, it is **typechecked only** (its
behaviour is asserted partly by real unit tests and partly by text-grep), and it
covers the shared module — not the entry points. `modempay-webhook/index.ts` and
`modempay-webhook-replay/index.ts` remain completely unchecked. `supabase/migrations/**`
is likewise outside every gate.

#### The settlement-e2e gap

`settlement-e2e/index.test.ts` is the only test in the repo that would execute
the settlement math rather than assert on its source text. It cannot simply be
added to the Vitest glob:

- It runs on the **Deno** runtime, not Node/jsdom.
- It needs a **reachable database** and a **`service_role`** key.

It is therefore deliberately **not** wired into the per-PR CI job above. Making it
run requires a real decision (Deno CI image, ephemeral Postgres or a nightly
against staging, secret handling) and is tracked as follow-up work. Until then,
settlement math changes are verified only by migration-text tests plus the
Vitest suite — read the next section before trusting that.

## The migration-text test pattern

Roughly 27 test files under `src/` read source or migration files off disk with
`fs.readFileSync` and assert on their **text**, rather than executing any SQL.
Canonical example: `src/lib/__tests__/modempayWebhookDedup.test.ts`.

```ts
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf-8");
expect(shared).toContain('await setStatus("invalid_signature"');
```

Two shapes appear repeatedly:

- **"contains" assertions** — that a specific line or call exists somewhere.
- **ordering assertions** — comparing `indexOf` positions to prove a guard runs
  before a mutation, e.g. that fail-closed signature rejection stays ahead of
  duplicate handling.

Know what this pattern is: a **change-detector**, not a contract test. It proves
the source still contains the string you care about. It does **not** prove:

- that the code runs, or that the branch is reachable;
- that the SQL parses, applies, or produces the intended rows;
- that the surrounding logic is correct.

That is a genuine limitation, and it is why the missing `settlement-e2e` runner
matters: for the money paths, the suite's coverage is thinner than its test count
suggests. Converting these into assertions executed against a throwaway Postgres
is high-value, self-contained follow-up work — new infrastructure, new flake
surface, so it does not belong in a verification-baseline change.
