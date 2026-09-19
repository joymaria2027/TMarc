import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * CI guard: no console logging of secret or signature material anywhere
 * under supabase/functions (ticket: edge-log-ci-guard).
 *
 * Generalizes the per-file contracts in paymentSecurityGuards.test.ts to the
 * whole tree. The scanner pairs each console call with a line-window after
 * it, so multi-line argument lists are covered, and classifies the argument
 * material:
 *  - env/secret variables and their derivations (key, token, secret,
 *    authorization headers, bearer values, signatures/HMACs)
 *  - request bodies and raw payloads (which carry customer personal data)
 * Structural allowlist: log statements may NAME a variable whose value is a
 * safe derivation (e.g. `secret.length`), never the value itself.
 */

const FUNCTIONS_DIR = path.resolve(__dirname, "../../../supabase/functions");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** Sensitive JS identifiers/expressions that must never appear in console args. */
const SENSITIVE_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\b(apiKey|api_key|API_KEY_VALUE|secret|webhookSecret|WEBHOOK_SECRET|password|passwd|pwd)\b/, why: "secret/key variable" },
  { re: /\b(cleanSecret|signedPayload|hmacHex|expectedHashes?|expectedSig(nature)?s?)\b/, why: "HMAC derivation or expected signature" },
  { re: /\b(signatureHeader|signature|sig)\b/, why: "signature header or value" },
  { re: /\b(Authorization|authorization)\b/, why: "authorization header" },
  { re: /\bBearer\s/, why: "bearer credential" },
  { re: /\b(SERVICE_ROLE_KEY|ANON_KEY|SUPABASE_KEY|PRIVATE_KEY|CLIENT_SECRET)\b/, why: "credential env var" },
  { re: /\b(rawBody|raw_body|rawPayload|requestBody|reqBody|bodyText)\b/, why: "raw request body (carries personal data)" },
];

/** Safe derivations: naming these is allowed; their VALUES are what's banned. */
const SAFE_DERIVATIONS = [
  /secret_len/i,
  /\.length\b/,
  /Object\.keys\(/,
  /_is_not_configured/,
  /_is_missing/,
];

const CONSOLE_RE = /console\.(log|error|warn|info|debug)\s*\(/g;

function findLeaks(source: string): string[] {
  const lines = source.split("\n");
  const leaks: string[] = [];

  lines.forEach((line, idx) => {
    CONSOLE_RE.lastIndex = 0;
    if (!CONSOLE_RE.test(line)) return;
    // Window: the call line plus up to 3 continuation lines (multi-line args).
    const window = lines.slice(idx, idx + 4).join("\n");

    for (const { re, why } of SENSITIVE_PATTERNS) {
      const match = window.match(re);
      if (!match) continue;
      // Allow pure safe-derivation usages: every occurrence of the sensitive
      // token inside this window must be part of a safe derivation.
      const tokenRe = new RegExp(re.source, "g");
      let tokenMatch: RegExpExecArray | null;
      let allSafe = true;
      while ((tokenMatch = tokenRe.exec(window)) !== null) {
        const context = window.slice(
          Math.max(0, tokenMatch.index - 24),
          Math.min(window.length, tokenMatch.index + tokenMatch[0].length + 24)
        );
        if (!SAFE_DERIVATIONS.some(allow => allow.test(context))) {
          allSafe = false;
          break;
        }
      }
      if (!allSafe) {
        leaks.push(
          `${path.relative(FUNCTIONS_DIR, path.dirname(source) + "/../" + path.basename(source))}:${idx + 1} ` +
          `logs ${why} (matched "${match[0]}"): ${line.trim().slice(0, 120)}`
        );
        break; // one report per console call
      }
    }
  });

  return leaks;
}

describe("edge function log hygiene CI guard (edge-log-ci-guard)", () => {
  const files = listTsFiles(FUNCTIONS_DIR).sort();
  const offenders = files.flatMap(f => findLeaks(fs.readFileSync(f, "utf-8")).map(msg => msg));

  it("scans a non-trivial number of function files", () => {
    // If this fails the glob broke and the guard is silently scanning nothing.
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it("never logs secrets, signatures, credentials, or raw bodies", () => {
    expect(offenders).toEqual([]);
  });
});

describe("scanner self-test (proves the guard catches each leak class)", () => {
  const scan = (code: string) => findLeaks(code);

  it("catches a logged secret value", () => {
    expect(scan(`console.error("cfg", webhookSecret);`)).toHaveLength(1);
  });

  it("catches a logged signature header and HMAC expected-hash", () => {
    expect(scan(`console.warn("sig", signatureHeader);`)).toHaveLength(1);
    expect(scan(`console.log("expected", expectedHashes[0]);`)).toHaveLength(1);
  });

  it("catches a logged raw body and authorization header", () => {
    expect(scan(`console.error("body", rawBody);`)).toHaveLength(1);
    expect(scan(`console.error("auth", Authorization);`)).toHaveLength(1);
  });

  it("catches leaks on continuation lines of a multi-line call", () => {
    expect(scan(`console.error(\n  "multi",\n  cleanSecret,\n);`)).toHaveLength(1);
  });

  it("allows naming the env var, safe derivations, and key schemas", () => {
    expect(scan(`console.error("MODEMPAY_API_KEY is not configured");`)).toEqual([]);
    expect(scan(`console.log("secret_len=", cleanSecret.length);`)).toEqual([]);
    expect(scan(`console.error("shape", JSON.stringify({ keys: Object.keys(payment) }));`)).toEqual([]);
  });

  it("catches a secret even when wrapped in a template string", () => {
    expect(scan("console.error(`key=${apiKey}`);")).toHaveLength(1);
  });
});
