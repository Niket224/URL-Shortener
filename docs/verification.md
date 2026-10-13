# Phase 3–5 verification

> Continued through the later phases below. Historical Phase 3–5 findings remain as evidence; the approved Phase 6 retention policy supersedes the earlier legacy-history consolidation/removal behavior.

Measured on 2026-10-13. No deployment performed. No normal database records or indexes were changed.

## Phase 3: persistence and isolation

Both configured connections authenticated successfully. Normal database: `snip`; isolated Atlas test database: `snip_test`. The normal MongoDB adapter initialized successfully with autoCreate and autoIndex disabled in the inspection process, and readiness was true. Only connection, ping and index metadata were inspected. The expected `urls`, `users`, and `sessions` collections were absent from `snip`; therefore there were no existing indexes for these collections to assess there. This does not establish the location of any older project data.

Normal `npm test` continues to use memory for unit/API tests and disposable local MongoDB for the MongoDB suite. `npm run test:atlas` explicitly loads private configuration, refuses missing/implicit/same-database targets, requires `snip_test`, and runs the same MongoDB suite against Atlas. The storage initializer independently refuses normal database names in test mode. No normal credentials are printed. Tests generate run-specific fixtures and clean only their own IDs/account; they never drop a database or clear collections. Interrupted runs can leave disposable fixtures; cleanup does not sweep unrelated data.

The initial sandboxed Atlas attempt could connect but could not launch the fresh Node process (`EPERM`). An approved run outside the sandbox passed. Persistence checks create a URL, disconnect, read it from a fresh Node process, reconnect and retrieve it, record 20 concurrent visits, disconnect/reconnect again and verify the same ID and daily/lifetime counts. Other assertions cover listing, custom codes, duplicate API/database rejection, timestamps, edit, expiration, soft deletion and ownership. Legacy analytics consolidation is tested only on synthetic fixtures.

Health now distinguishes application running, selected storage and storage readiness, returning 503 for disconnected MongoDB. Startup waits for initialization; shutdown closes the HTTP server and MongoDB connection with a 10-second drain deadline. Initialization errors leave readiness false. Mongoose handles reconnection; reconnect-after-explicit-disconnect was tested, not arbitrary network outages.

Phase 3 checkpoint: 9 suites / 56 tests passed (10.426 s); Atlas 1 suite / 3 tests passed (21.504 s); Vite build passed (1.70 s); diff check passed.

## Index audit

Observed in `snip_test` after initialization; none were removed. `_id` uniqueness is intrinsic even when listIndexes omits the unique flag.

| Collection / fields | Unique | Purpose | Assessment |
|---|---|---|---|
| urls `_id` | Yes | Stats, edits, deletion, click updates | Required primary key |
| urls `shortCode` | Yes | Redirect lookup and collision constraint | Required |
| urls `ownerId` | No | Per-owner listing | Useful; compound listing index not added speculatively |
| urls `createdAt` descending | No | Recent ordering | Supports sorting; owner-filtered sort should be evaluated before changing |
| users `_id` | Yes | Account identity | Required |
| users `email` | Yes | Login and registration uniqueness | Required by existing accounts |
| sessions `_id` | Yes | Session document identity | Default primary key |
| sessions `digest` | Yes | Bearer-token lookup | Required by existing sessions |
| sessions `expiresAt` | No; TTL 0 seconds | Expired-session cleanup | Useful; application also rejects expiry immediately |

## Phase 4: hardening audit

Existing code already enforces HTTP/HTTPS destinations, 24-hex IDs, custom-code constraints, a 16 kB JSON limit, bounded generated-code retries, and explicit proxy-hop trust. Added exhaustion/oversize/error-redaction regression tests. Raw database errors are no longer logged by URL and redirect handlers; startup failures use a fixed safe message. Proxy trust remains bounded and opt-in; validate the hop count on Render. The per-process rate limiter is not a distributed limiter.

Phase 4 checkpoint: 9 suites / 59 tests passed (6.08 s); Vite build passed (1.13 s); diff check passed. The three Atlas tests are repeated executions of tests included in the backend total, not three additional unique tests.

## Phase 5: measured performance

Reproduce from backend with `node scripts/benchmark.js` after privately configuring both database settings. Evidence: [benchmark-results.json](./benchmark-results.json). The script creates a random dedicated collection in `snip_test`, inserts 2,000 synthetic benchmark records, measures the same redirect lookup before and after adding the shortCode index, and drops only that run's benchmark collection afterward. It also creates/deletes one isolated redirect fixture through the real storage adapter. No production indexes or records are touched.

Environment: Windows, Node v22.18.0, Mongoose 8.24.5; local Express on loopback backed by remote MongoDB Atlas `snip_test`. Test-mode rate limiting is disabled. Redirects are not followed. This is not a production load test or a capacity claim.

| Metric | Exact measured value | Sample / method | Reliability / resume use |
|---|---|---|---|
| Documents examined before index | 2,000 | 2,000 synthetic records, explain executionStats | High for this dataset; yes with synthetic benchmark qualifier |
| Documents examined after index | 1 | Same dataset/filter; unique shortCode index | High for this dataset; yes with qualifier |
| Documents examined reduction | 99.95% | (2000−1)/2000 × 100 | High for this comparison; not a latency improvement |
| Query plan | COLLSCAN → FETCH/IXSCAN | Same lookup and dataset | High; validates an index already present in the app |
| Keys examined after index | 1 | explain executionStats | High for this query |
| Execution time | 1 ms before; 1 ms after | Coarse server explain timer | Too coarse for any improvement percentage |
| Redirect success | 100/100, 0 failures | 100 measured requests, 10 excluded warm-up, concurrency 2 | High for this run; not uptime |
| Throughput | 10.775526959366328 requests/sec | 9,280.2886 ms measured wall time | Medium, single local/Atlas run; not production capacity |
| Mean latency | 185.16521999999995 ms | Request start through response body consumption | Medium, includes Atlas/network/write latency |
| p50 latency | 184.1178 ms | Nearest-rank percentile, n=100 | Medium |
| p95 latency | 192.38739999999962 ms | Nearest-rank percentile, n=100 | Medium |
| p99 latency | 325.9832000000006 ms | Nearest-rank percentile, n=100 | Low; unsuitable for a broad resume performance claim |
| Persisted clicks | 110 | 100 measured + 10 warm-up | High; all expected writes persisted |

Additional explain checks: `_id` lookup examined one document/key using EXPRESS_IXSCAN. The dedicated benchmark collection's owner listing examined 2,000 documents with SORT/COLLSCAN. That collection had only `_id` and shortCode indexes; this is NOT a measurement of the application's ownerId/createdAt-indexed listing. No speculative listing index was added. No production measurements, traffic or user counts are claimed.

Build evidence at Phase 4: Vite 5.4.21, 90 modules, JavaScript 213.33 kB (70.74 kB gzip), CSS 2.09 kB (0.91 kB gzip), HTML 0.71 kB. Sizes are build-tool output, not download latency.

## Phase 6 approval boundary

Phase 5 checkpoint after adding the benchmark and report: backend 9 suites / 59 tests passed (5.835 s); frontend build passed (1.26 s), same 213.33 kB JavaScript / 70.74 kB gzip; diff check passed. Benchmark correctness assertions passed (100 expected redirects and all 110 click writes). Changes for this phase: benchmark script, raw JSON evidence, this report, and README instructions.

The earlier implementation in `mongoUrlStore.recordClick` initializes daily counters from legacy click history and then clears `clickHistory`. It preserves seven-day counts and lifetime totals, but discards raw timestamps/referrer/user-agent history. No real history was migrated during this work. Section 6.3 of the master plan requires approval before a schema/migration change could affect real data. Decide whether to preserve legacy raw history or approve its consolidation/removal before proceeding. Later phases and final resume bullets are not represented as complete.

## Changed files in this continuation

Modified: `backend/.env.example`, `backend/package.json`, `backend/src/index.js`, `backend/src/store/index.js`, `backend/src/routes/url.js`, `backend/src/routes/redirect.js`, `backend/tests/mongo.test.js`, `backend/tests/hardening.test.js`, `README.md`.

New: `backend/tests/atlasConfig.js`, `backend/tests/atlasConfig.test.js`, `backend/tests/runAtlas.js`, `backend/scripts/benchmark.js`, `docs/benchmark-results.json`, `docs/verification.md`.

Deleted: none. Local secret environment files were not edited. No deployment or commit was performed.

## Phase 6: approved non-destructive retention

No schema/index changes or bulk migration were needed. The existing dailyClicks buckets are authoritative per-day totals including legacy events. On read, each bucket overrides that day's legacy count rather than adding to it; missing days fall back to raw history. On write, MongoDB atomically initializes missing day totals from raw history, increments today's bucket and lifetime clicks, and retains exactly seven UTC buckets. It never assigns, clears or appends to clickHistory. The memory adapter uses the same semantics. Arrays are returned in deterministic date order.

This supports legacy-only documents, prior aggregate-only documents, mixed documents, empty bucket arrays and partially populated buckets. Existing lifetime totals remain authoritative and increment once per recorded click. Previously erased history cannot be recovered. Externally imported daily counts must follow the documented total-per-day semantics, not represent disjoint increments. Invalid/contradictory externally edited analytics are not automatically repaired.

Raw data preservation was checked by comparing complete history arrays and BSON bytes around writes and reconnects. Synthetic tests cover concurrent increments, UTC year/month boundaries, nine-day bucket rollover, mixed-data API responses and no double counting. The new-only fixture measured 487 BSON bytes after 1 click and 487 bytes after 51 clicks (seven buckets, zero raw events), both locally and on Atlas snip_test. This is a bounded-growth fixture measurement, not a universal document-size claim. Existing large raw arrays are intentionally retained; reads of legacy stats can still cost O(number of legacy events). Lifetime numeric fields can change BSON numeric representation at larger values, but there is no event-per-click growth.

Redirects remain 302/no-store: suitable for mutable destinations and analytics, unlike cacheable permanent 301 redirects; 307's method preservation offers little benefit for the GET-only flow. Cached historic 301 responses cannot be recalled. HEAD probes do not increment counts. Failed analytics writes are logged safely and do not prevent a valid redirect, so best-effort totals can undercount on failures.

Changed: backend/src/store/mongoUrlStore.js, backend/src/store/memoryUrlStore.js, backend/src/utils/analytics.js, backend/tests/mongo.test.js, README.md, this report. New: backend/src/utils/analytics.test.js. No normal database access was performed during this phase.

Checks: backend 10 suites / 66 tests passed (6.053 s); Atlas 1 suite / 6 tests passed (29.426 s); frontend build passed (1.55 s, 213.33 kB JS / 70.74 kB gzip); diff check passed. An initial test exposed nondeterministic merged-day ordering; it was corrected and both suites rerun successfully. Atlas tests repeat six tests already included in the backend total.

## Phase 7: frontend recovery and accessibility

Changed frontend/src/App.jsx (scheme validation, accessible icon labels, stale copy-success reset), frontend/src/Dialog.jsx (explicit Tab/Shift+Tab wrapping), frontend/tests/smoke.spec.js (failure/retry and pagination scenarios). No new UI framework or product features were introduced. Browser plugin was absent; Playwright Chromium was used against local test servers with disposable memory storage at http://127.0.0.1:5179, desktop 1280x720 and mobile 390x844.

Four browser executions passed in 11.4 s: two workflows at each viewport. The normal workflow verifies page identity, nonblank content, no framework overlay, no app console errors, registration/create/copy/redirect/stats/edit/delete/sign-in, screenshots and button bounds. Recovery tests deliberately inject 503 responses and clipboard rejection and verify user-visible errors/retry; expected network errors from those injected responses are not unexplained runtime exceptions. Keyboard focus, Escape/return focus, UTC labels, empty/loading states and pagination were inspected. An initial Tab wrapping failure was fixed and all browser checks rerun. Production build passed (996 ms, 213.92 kB JS / 70.95 kB gzip); diff check passed. Screenshots remain in OS temp, outside source control.

## Phases 8–13: final checkpoints

- **8 — CI:** Existing workflow reviewed; no infrastructure change needed. Clean npm ci succeeded for backend (440 packages) and frontend (91 packages). Local equivalents passed: 66 backend tests (13.343 s) and build (1.51 s). Initial sandbox spawn failures were resolved with approved retries. No remote Actions execution claimed.
- **9 — Smoke:** Existing workflow extended in Phase 7 reused; four desktop/mobile executions passed (15.9 s), covering the requested create → redirect → stats → delete chain and recovery. No production data used.
- **10 — Readiness:** Local CORS preflight/origin checks passed, uninitialized health returned 503, proxy trust default was 0. Required production origins remain enforced; .env ignored/untracked. Current secret exact-match scan found zero matches in tracked files and 100 reachable historical blobs. Hosted configuration and effective Atlas role restrictions remain unverified; no production connection was made in this continuation.
- **11 — Final review:** [Architecture, endpoints, risk assessment and every changed file](./final-review.md). Final backend 66/66 (10 suites), Atlas 6/6 (31.938 s), browser 4/4, build passed. Final diff check passed; no commit or deployment. Repeated Atlas cases are not additional unique tests.
- **12 — Metrics:** [Verified metrics](./verified-resume-metrics.md), with environment, dataset, method, evidence, reliability and resume-safety assessment for each. Current benchmark evidence is [benchmark-current-results.json](./benchmark-current-results.json); historical and concurrent-install runs are retained. No percentage latency improvement inferred.
- **13 — Resume:** Four evidence-based bullets appear in the metrics report. No production usage or performance claims.

Phase 8–10 introduced no application changes beyond Phase 7; verification commands reused the current code. Phase 11–13 added the final review/metrics documents, refreshed benchmark evidence and documentation links. Normal records and indexes remained untouched. Deployment is the stop boundary and was not attempted.
