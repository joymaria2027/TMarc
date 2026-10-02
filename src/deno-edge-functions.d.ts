// Ambient declaration for the Deno surface the Supabase edge functions use.
//
// Lives under `src/` (not `supabase/functions/`) on purpose: it has to sit where
// `tsconfig.app.json`'s `include: ["src"]` already picks it up, so no import or
// triple-slash reference is needed to pull it into the program.
//
// WHY THIS EXISTS: no tsconfig in this repo includes `supabase/functions/**` —
// `tsconfig.app.json` covers `src` only — so those files were never
// compiler-checked at all (see docs/testing.md). A Vitest test that imports a
// pure helper from `_shared/modempay.ts` does pull that module into the app
// program, which then fails on the `Deno` global that was previously never
// resolved.
//
// This is a declaration, not a suppression: it describes the runtime these
// functions genuinely execute on, and it makes the file checkable for the first
// time. Suppressing the error instead would have left the file unchecked, and
// reaching zero errors by suppression is not reaching zero.
//
// KNOWN TRADE-OFF: ambient globals are program-wide, so app code under `src/`
// could now reference `Deno` and typecheck while crashing in the browser. Keep
// this surface as small as the program actually needs. Removing this file means
// the security test in src/lib/__tests__/modempaySignatureGate.test.ts can no
// longer import the module it guards.
//
// `serve` is not currently reachable from the app program (the entry points that
// use it are still outside every tsconfig). It is declared because those files
// exist and will be pulled in as coverage grows; the signature matches Deno's
// real return value, which is a server handle with `shutdown()`/`finished()`, not
// void.

declare const Deno: {
  /** Deno runtime only (Supabase edge functions). */
  serve(handler: (req: Request) => Response | Promise<Response>): {
    finished: Promise<void>;
    shutdown(): Promise<void>;
    ref(): void;
    unref(): void;
  };
  env: {
    get(key: string): string | undefined;
  };
};