# Final engineering review — 2026-10-13

Pre-deployment work through Phase 13 is complete. No deployment, production access, credential change, destructive migration, or normal `snip` data write was performed in the Phase 6–13 continuation. Earlier Phase 3 connection/metadata inspection was explicitly read-only. Tests and benchmarks used synthetic local data or `snip_test` only.

## Architecture

1. **System:** browser → Vercel static React/Vite frontend → HTTPS → Render Node/Express REST API and public redirects → external MongoDB Atlas. Vercel does not host the backend.
2. **Backend:** CommonJS Express, small route modules, shared configuration/validation/analytics utilities, interchangeable memory/Mongoose adapters. Initialization precedes listening; SIGINT/SIGTERM drain HTTP and disconnect MongoDB. There is a ten-second shutdown deadline.
3. **Frontend:** React state and Axios; API-provided shortUrl is used everywhere. Existing account, link and modal components remain; this continuation only improved validation, errors, labels and keyboard behavior. No large UI framework added.
4. **MongoDB:** Url documents retain unique short codes, lifetime counts, immutable legacy raw history, seven authoritative UTC daily totals, lifecycle fields and existing ownership. Existing User/Session models support accounts. No new schema fields/indexes were required for Phase 6. `snip_test` is explicitly isolated; test mode rejects normal database names.

## API endpoints

| Method/path | Responsibility |
|---|---|
| GET /api/health | Application running, selected storage, readiness; 503 when unavailable |
| GET /api/auth/mode | Existing account/public-demo mode |
| POST /api/auth/register, /login, /logout | Existing account/session lifecycle |
| POST /api/urls | Create generated/custom code, optional expiration |
| GET /api/urls?page=1&limit=12 | Owner-filtered pagination; X-Has-More response header |
| GET /api/urls/:id/stats | Lifetime clicks and seven UTC daily totals |
| PATCH /api/urls/:id | Existing destination/expiration editing |
| DELETE /api/urls/:id | Owner-checked soft deletion |
| GET /:code | Public 302/no-store redirect; missing/deleted 404, expired 410 |
| HEAD /:code | Same resolution without a click increment |

Accounts/editing/expiration predate the latest master-plan continuation; no additional features in those areas were introduced merely to increase scope.

## Security and reliability

- HTTP/HTTPS-only destination validation, restricted custom codes, validated MongoDB IDs, bounded collision retries and body size, JSON errors, and redacted database failure logs.
- Bounded, explicit reverse-proxy trust; the Render hop count must still be verified by the operator. Per-process API/auth limits are not shared across replicas. Redirect traffic is not currently rate-limited.
- Existing salted scrypt passwords, hashed expiring session tokens and owner-checked management operations. Session tokens are held in sessionStorage; email verification/recovery are not implemented.
- Production public origins are required instead of localhost fallbacks. CORS preflight succeeded for a synthetic configured origin; an untrusted origin was not reflected. This is not a check of live Render settings.
- Current URI/password exact matches: zero in tracked current files and zero across 100 reachable historical Git blobs checked. Local environment file is ignored/untracked. This is a bounded check for the current secrets, not a guarantee that no unknown historical secret exists.
- Health reports storage readiness; tests verify disconnect/reconnect and a fresh Node process retrieving persisted data. No arbitrary network outage or disaster-recovery exercise was performed.

## Analytics and performance

Daily counters represent totals, including legacy events. Reads prefer each day's stored total and use legacy fallback only for absent days. MongoDB increments lifetime/today atomically and retains seven buckets without deleting, truncating, rewriting or appending legacy raw history. Repeated new clicks cannot cause raw-event-per-click growth. Legacy-only, aggregate-only and mixed data are covered, including partial buckets and rollover.

The 51-click synthetic fixture remained 487 BSON bytes from click 1 to click 51. This does not promise every document is 487 bytes: large old raw arrays remain large, numeric representations can change size, and legacy statistics reads can still scan those immutable events. Existing snapshots already written by earlier versions remain readable; erased history cannot be reconstructed. External imports must honor the total-per-day contract.

302/no-store avoids newly cacheable permanent redirects. Historic cached 301s cannot be recalled. Failed analytics writes do not stop valid redirects; counts can undercount during failures. HTTP status 307 would preserve methods, but the current redirect flow is GET/HEAD only.

Measured indexing and local/Atlas-test performance are recorded in [verified metrics](./verified-resume-metrics.md). No production request volume, users, uptime or latency were measured. No throughput scaling or percentage latency improvement is claimed.

## Testing, CI and smoke verification

| Final check | Result |
|---|---|
| Clean backend npm ci | Success, 440 packages; transitive development-package deprecation warnings |
| Clean frontend npm ci | Success, 91 packages |
| Backend npm test | 10 suites, 66 tests passed; 13.343 s |
| npm run test:atlas | 1 suite, 6 tests passed; 31.938 s |
| Frontend npm run test:e2e | 4 executions passed; 15.9 s |
| Frontend production build | Passed in 1.51 s; 90 modules; JS 213.92 kB / gzip 70.95 kB |
| git diff --check | Passed |

Some Windows sandbox attempts could not spawn dependency/browser/MongoDB child processes; approved retries outside the sandbox succeeded. Expected memory-mode and terminal-color warnings are not application failures.

The six Atlas tests are the same MongoDB cases included in the 66 backend tests, executed again against Atlas; do not count them as six extra unique tests. Playwright has two workflows at two viewports: 1280×720 and 390×844. Those workflows cover create/copy/redirect/stats/edit/delete, accounts, error/retry recovery, clipboard denial, pagination, focus wrapping, Escape and focus restoration. Normal flow console/runtime checks passed; recovery deliberately injects 503 responses. Screenshots were inspected. Browser plugin was absent; Playwright Chromium was used. Other browsers were not tested.

Existing GitHub Actions workflow triggers on pushes/PRs, installs with npm ci, runs backend tests with disposable MongoDB, builds the frontend with a non-secret example API origin and runs Chromium checks. Real failures propagate; no production credentials or deployment steps are used. Local equivalents were verified after clean installation. No remote workflow run, push or commit was performed.

## Remaining debt, risks and public-deployment prerequisites

- Prior audits reported development-tool advisories needing separate upgrade work; no forced major upgrades were made. Runtime dependencies had zero reported findings in the earlier audit, not a permanent security guarantee.
- Verify live TLS, CORS/public origins, Render proxy hop count, Atlas network/user permissions, and hosted health/smoke behavior only after explicit deployment approval.
- Use a test database user limited to snip_test. Code verifies database names, but effective Atlas role restrictions were not audited.
- Legacy ownerless links redirect but are not automatically assigned to accounts; ownership must be established explicitly before management access is granted.
- Session/password recovery, verified email, abuse monitoring and a shared limiter for multiple instances are not implemented. These are documented limitations, not hidden production-readiness claims.
- The listing index combination may merit a measured compound-index evaluation later; no speculative production index was added. Offset pagination can shift under concurrent inserts.
- Interrupted test runs can leave disposable fixtures; cleanup never sweeps unrelated collections. Browser test accounts are discarded with their isolated memory server.
- Unknown routes still use Express's default not-found behavior; success-path and documented API errors are tested, not every possible malformed request.
- No unresolved failure remains in the executed checks, but this is not a claim of zero bugs or full security/accessibility coverage.

## Complete current change inventory

Includes earlier uncommitted Phase 3–5 work, as shown by final git status.

Modified:
- README.md
- backend/.env.example
- backend/package.json
- backend/src/index.js
- backend/src/routes/redirect.js
- backend/src/routes/url.js
- backend/src/store/index.js
- backend/src/store/memoryUrlStore.js
- backend/src/store/mongoUrlStore.js
- backend/src/utils/analytics.js
- backend/tests/hardening.test.js
- backend/tests/mongo.test.js
- frontend/src/App.jsx
- frontend/src/Dialog.jsx
- frontend/tests/smoke.spec.js

New:
- backend/scripts/benchmark.js
- backend/src/utils/analytics.test.js
- backend/tests/atlasConfig.js
- backend/tests/atlasConfig.test.js
- backend/tests/runAtlas.js
- docs/benchmark-results.json (historical Phase 5)
- docs/benchmark-install-overlap-results.json (background-load run)
- docs/benchmark-current-results.json (post-install repeat)
- docs/verification.md
- docs/final-review.md
- docs/verified-resume-metrics.md

Deleted: none. Secret environment files were not edited. Stop point: deployment remains unapproved and has not been attempted.
