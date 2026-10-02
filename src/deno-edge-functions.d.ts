// Ambient declaration for the Deno surface the Supabase edge functions use.
//
// Lives under `src/` (not `supabase/functions/`) on purpose: it has to sit where
// `tsconfig.app.json`'s `include: ["src"]` already picks it up, so no import or
// triple-slash reference is needed to pull it into the program.
//
// WHY THIS EXISTS: no tsconfig in this repo includes `supabase/functions/**` —
// `tsconfig.app.json` covers `src` only — so these files were never
// compiler-checked at all (see docs/testing.md). A Vitest test that imports a
// pure helper from `_shared/modempay.ts` does pull that module into the app
// program, which then fails on the `Deno` global that was previously never
// resolved.
//
// This is a declaration, not a suppression: it describes the runtime these
// functions genuinely execute on, and it makes the file checkable for the first
// time. Declaring it here (rather than reaching for @ts-ignore) is deliberate —
// reaching zero errors by suppression is not reaching zero.
//
// KNOWN TRADE-OFF: ambient globals are program-wide, so app code under `src/`
// could now reference `Deno` and typecheck while crashing in the browser. The
// declaration is kept to the two members actually used rather than importing a
// full Deno type surface, to keep that window as small as possible. Removing
// this file means the security test in src/lib/__tests__/modempaySignatureGate
// .test.ts can no longer import the module it guards.

declare const Deno: {
  /** Present only on the Deno runtime (Supabase edge functions). */
  serve(handler: (req: Request) => Response | Promise<Response>): void;
  env: {
    get(key: string): string | undefined;
  };
};
