# Public APIs fit for Delivery Guardian

**Researched:** 2026-09-19 · **Question:** which entries in [public-apis/public-apis](https://github.com/public-apis/public-apis) (snapshot: `docs/Unsaved Document 1`) can actually be used in this codebase?
**Saved in:** `docs/research/` (new home for durable research; `.scratch/` stays for tickets, which are gitignored).

## TL;DR

The codebase is a **browser-only Vite SPA on Vercel + Supabase Edge Functions** (`package.json`, `vercel.json`, `supabase/functions/`). That makes "can we use it?" a three-part test: **(1) HTTPS-only, (2) CORS-yes if called from the browser, (3) apiKey must be a browser-safe free key (or the call must move behind an Edge Function).** ~5 providers pass all three outright; ~6 more pass with a key held in an Edge Function secret; most of the list fails the domain fit entirely.

| Verdict | API | Domain (line in snapshot) | Auth / HTTPS / CORS | Best use here |
|---|---|---|---|---|
| ✅ Adopt | Open-Meteo | Weather (L2225) | No / Yes / Yes | Rider & ops weather on the tracking map |
| ✅ Adopt | Frankfurter | Currency (L535) | No / Yes / Yes | Daily FX reference rates (cache into Supabase) |
| ✅ Adopt | fawazahmed0 Currency-api | Currency (L527) | No / Yes / Yes | Fallback FX source, 200+ currencies |
| ⚠️ Adopt with care | Nominatim | Geocoding (L1189) | No / Yes / Yes | One-off user-triggered lookups only — see policy wall below |
| 🔑 Free key, browser-safe | Geoapify | Geocoding (L1152) | apiKey / Yes / Yes | Address autocomplete at merchant signup (Nominatim forbids this) |
| 🔑 Free key, browser-safe | ExchangeRate-API | Currency (L533) | apiKey / Yes / Yes | Keyed tier above Frankfurter fallbacks |
| 🔑 Free key, browser-safe | REST Countries | Geocoding (L1199) | No / Yes / Yes | Country reference data in address forms |
| 🖥️ Edge-Function only | GraphHopper | Transportation (L2067) | apiKey / Yes / ? | Rider turn-by-turn routing (key in Edge secret) |
| 🖥️ Edge-Function only | Veriphone / Numverify | Phone (L1649–1650) | apiKey / Yes / Yes | Merchant phone validation (PII → keep server-side) |
| 🖥️ Edge-Function only | Hunter / mailboxlayer | Email / Business | apiKey / Yes | Signup email hygiene (PII → keep server-side) |
| ❌ No fit | the overwhelming rest | — | — | OAuth apps, non-HTTPS, CORS-no, or irrelevant to delivery ops |

## Why the constraint exists (codebase evidence)

- `vercel.json` serves a static SPA — no backend of our own. Any secret shipped as `VITE_*` (`src/integrations/supabase/client.ts` is the only `import.meta.env` consumer today) is **public**.
- `supabase/functions/` already runs Deno Edge Functions (`modempay-*`, `settlement-e2e`) with secrets — the established place for keyed/proxied third-party calls.
- `src/components/DeliveryMap.tsx` already consumes a keyless external service (OSM raster tiles) — the keyless-provider pattern exists.
- ADR-0001: self-owned Supabase is the **system of record**. Third-party APIs may supply *reference* data (FX, geocoding), never settle as truth.
- Browser platforms: Vercel web + Capacitor Android (`package.json`), so mobile-web CORS rules apply everywhere.

## Verified findings (primary sources, fetched 2026-09-19)

### ✅ Open-Meteo — Weather (snapshot L2225)
No auth, HTTPS, CORS Yes. **Verified** on open-meteo.com: free tier is **non-commercial only** — under 10,000 calls/day, 5,000/hour, 600/min, with CC-BY-4.0 attribution required; commercial use requires a paid plan (`open-meteo.com/en/terms`, `/en/pricing`, `/en/licence`). Fits rider/ops weather overlays on `DeliveryMap`; if Delivery Guardian monetizes, budget for their paid tier or switch providers. Attribution link must be rendered on the map.

### ✅ Frankfurter — Currency (snapshot L535)
No auth, HTTPS, CORS Yes. **Verified** on frankfurter.dev: "No API key", 206 currencies / 98 central-bank sources, explicitly "no server required, CORS is open" (`frankfurter.dev`, `frankfurter.dev/javascript/`). Use: daily FX reference rates cached into a Supabase table (per ADR-0001, never used directly in Settlement math). Rates are ECB-derived, so update frequency is daily.

### ✅ fawazahmed0 Currency-api — Currency (snapshot L527)
No auth, HTTPS, CORS Yes. Daily-updated static JSON served over jsDelivr, 200+ currencies incl. cryptos and metals, no rate limits (jsDelivr package page `@fawazahmed0/currency-api`). Note: the GitHub repo migrated to `fawazahmed0/exchange-api` — pin the CDN package, not the repo path. Good coverage fallback where Frankfurter's 206-currency set or daily cadence is insufficient.

### ⚠️ Nominatim — Geocoding (snapshot L1189)
No auth, HTTPS, CORS Yes — but the public instance's usage policy (operations.osmfoundation.org/policies/nominatim, fetched 2026-09-19) is a wall of conditions that bite a delivery platform specifically:
- Max **1 request/second absolute**, valid Referer/UA, visible attribution, ODbL share-alike.
- **No client-side autocomplete** (explicitly banned use).
- Apps must be able to **switch endpoints at OSMF's request** without an app update.
- **"Unacceptable use": "Applications and services whose primary function is related to geocoding must run their own service. This includes but is not limited to package/vehicle tracking applications…"** — i.e., the policy names tracking platforms exactly like ours as the ones that may *not* lean on the public endpoint for geocoding infrastructure.

Verdict: acceptable only for occasional, user-triggered single lookups (e.g., an ops admin dropping a pin) with caching + attribution. It must **not** become the address-autocomplete or bulk-geocoding backend. Use Geoapify (below) for that; revisit self-hosting or a paid provider if volume grows.

### 🔑 Geoapify — Geocoding (snapshot L1152)
apiKey / Yes / Yes. Forward/reverse geocoding **and address autocomplete** with a free tier. The correct home for merchant-address autocomplete at signup — the feature Nominatim forbids. Key ships as `VITE_` only if domain-restricted at the provider; safer default is a thin Edge Function proxy so the key never reaches the bundle.

### 🔑 ExchangeRate-API — Currency (snapshot L533)
apiKey / Yes / Yes. Its `open.er-api.com` endpoint even works keyless with 150+ currencies — useful second source alongside Frankfurter for the FX cache.

### 🔑 REST Countries — Geocoding (snapshot L1199)
No / Yes / Yes. Static country reference data (names, currencies, dial codes) for address/phone form widgets. Zero risk, zero key.

### 🖥️ GraphHopper — Transportation (snapshot L2067)
apiKey / Yes / CORS unknown. A-to-B routing with turn-by-turn — the missing piece behind rider navigation (PRODUCT.md's rider persona). The key must live in a Supabase Edge Function secret; the client calls our function, the function calls GraphHopper. Same pattern for any Mapbox/TomTom/HERE upgrade path (all apiKey/Yes in the list).

### 🖥️ Validators (Email / Phone sections)
mailboxlayer, Numverify, Veriphone, Hunter etc. — all apiKey / Yes / mostly Yes-CORS, but they process **PII** (customer/merchant emails, phones). Even when CORS permits browser calls, route them through Edge Functions so keys are secret and PII transits our server. Only worth wiring when signup/checkout friction data demands it.

### ❌ Not usable from this codebase
- **OAuth everything** (Google Maps, Dropbox, GitHub, Uber, …): OAuth apps ≠ public keys; wrong lane for this question.
- **HTTP-only** entries (ip-api, Fixer L519, BCLaws, …): mixed-content blocked on an HTTPS Vercel/Capacitor origin.
- **CORS No/Unknown + apiKey** (Weatherstack, MapQuest, most finance data): Edge-Function-only; none justify the work today.
- **Domain mismatch**: animals, anime, games, memes, test-data, dictionaries, etc. — no connection to dispatch, wallets, or settlement. (Test Data section *is* useful for vitest fixtures later — FakeStoreAPI/JSONPlaceholder for storefront mocks — noted as a side find.)

## Security guardrails (grounded in what's in the repo today)

- **`.env` currently contains pasted live credentials** (a payment-provider live secret, a GitHub token, a Supabase service-role key, a webhook secret, a DB password — types and location only, values deliberately not reproduced). `.env` is gitignored, but these were shared as chat text and are exposed. **Recommend rotating all of them now**, then adopting `.env.example` with placeholders only.
- Browser-side `VITE_` keys are public: domain-restrict them at each provider, or proxy via Edge Functions by default.
- Keep third-party rates/geocodes out of settlement math: cache into Supabase, record provenance (`source`, `fetched_at`), per ADR-0001.

## Method

- Snapshot of the curated list: `docs/Unsaved Document 1` (saved copy of public-apis/public-apis README, ~2,300 lines; sections Geocoding L1120, Currency L514, Weather L2225, Transportation L2038, Phone L1647, Test Data L1959).
- Primary verification (fetched 2026-09-19): open-meteo.com `/en/terms`, `/en/pricing`, `/en/licence`; frankfurter.dev (+ `/javascript/`, `/v1/`); operations.osmfoundation.org/policies/nominatim; jsDelivr package page for `@fawazahmed0/currency-api`.
- Codebase recon: `package.json`, `vercel.json`, `CONTEXT.md`, `PRODUCT.md`, `docs/adr/0001`, `docs/adr/0002`, `src/components/DeliveryMap.tsx`, `src/integrations/supabase/client.ts`, `supabase/functions/*`.
- Knowledge-graph orientation (graphify): `DeliveryMap` (community 41, leaf — no downstream callers) and the shared Supabase `client` module (community 351, degree 73 — every page imports it) are the only symbols any API integration would touch; research-only change, no source modified, so no caller tests required.
