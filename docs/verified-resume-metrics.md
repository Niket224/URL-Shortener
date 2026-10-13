# VERIFIED RESUME METRICS

Phase 12 evidence, 2026-10-13. No production traffic, users, uptime or latency were measured. Counts below refer to tests or explicitly synthetic datasets. Values rounded for prose are backed by full precision in [current raw results](./benchmark-current-results.json). [Historical results](./benchmark-results.json) and the [installation-overlap run](./benchmark-install-overlap-results.json) are retained; these are not a controlled before/after latency experiment.

| Metric | Exact value | Environment | Dataset/sample | Method/evidence | Reliability | Safe for resume |
|---|---|---|---|---|---|---|
| Backend test cases | 66 passing, 10 suites | Local Windows/Node 22, memory + disposable MongoDB | Entire Jest suite | npm test; [final review](./final-review.md) | High | Yes |
| MongoDB integration cases | 6 passing | Atlas snip_test | Synthetic run-specific fixtures | npm run test:atlas; [suite](../backend/tests/mongo.test.js) | High | Yes; subset of backend cases |
| Browser workflows | 2 workflows × 2 viewports = 4 passing executions | Local Chromium, synthetic memory storage | Desktop 1280×720/mobile 390×844 | [Playwright suite](../frontend/tests/smoke.spec.js), 15.9 s run | High | Yes; state scenarios/viewports |
| Combined execution count | 70 = 66 backend + 4 browser | Above local test environments | One full test cycle | Do not add six Atlas repeats as unique tests | High | Yes, as executions, not 70 distinct scenarios |
| MongoDB persistence | Passed reconnect and fresh-process checks | Atlas snip_test | Same created URL ID, 20 concurrent clicks plus other synthetic cases | Integration assertions retrieve same URL/counters | High | Yes, no production durability/SLA claim |
| Bounded analytics BSON | 487 → 487 bytes | Disposable MongoDB and Atlas snip_test | One new-only fixture, click 1 → 51; seven daily buckets | Server $bsonSize in integration test | High for fixture | Yes, qualify as synthetic test |
| Legacy retention | Exact history/BSON equality after writes; reconnect preservation passed | Atlas snip_test | Legacy-only and mixed synthetic fixtures | History equality and BSON.serialize checks | High | Yes, no claim about uninspected real data |
| Lookup documents examined | 2,000 → 1 | Atlas snip_test dedicated benchmark collection | Same 2,000 synthetic records and filter | explain executionStats, raw results mongo.before/after | High for dataset | Yes, explicitly synthetic benchmark |
| Documents examined reduction | 99.95% | Same | (2000−1)/2000 × 100 | Raw results documentsExaminedReductionPercent | High | Yes; NOT latency reduction |
| Query plan | COLLSCAN → FETCH/IXSCAN; 1 key examined after indexing | Same | Same lookup/filter | Winning plan summary | High | Yes; validates existing app index, no claimed production index rollout |
| Explain execution time | 1 ms before, 1 ms after | Same | Single explain each | Server executionTimeMillis | Low for comparison | No speedup claim |
| Redirect success | 100/100; 0 failures | Local Express → Atlas snip_test | 100 measured requests, concurrency 2, 10 excluded warm-ups | Manual redirects, status/location assertions | High for run | Yes, only test success rate |
| Redirect throughput | 10.792305099414884 requests/sec | Same; limiter disabled in test mode | 100 requests / 9,265.861099999998 ms | Completed requests / wall seconds | Medium | Yes only as single local/Atlas-test run; not capacity |
| Mean latency | 184.92893199999997 ms | Same | n=100 | Client request start through body completion | Medium | Yes with environment and n; not production |
| p50 latency | 180.63420000000042 ms | Same | n=100 | Nearest-rank percentile | Medium | Yes with caveat |
| p95 latency | 194.9362000000001 ms | Same | n=100 | Nearest-rank percentile | Medium | Yes with caveat |
| p99 latency | 332.8814999999995 ms | Same | n=100 | Nearest-rank percentile | Low | No broad claim; sample too small |
| Benchmark click persistence | 110 | Same | 100 measured + 10 warm-up visits | Stored lifetime count assertion | High | Yes as test evidence |
| JS production bundle | 213.92 kB raw / 70.95 kB gzip | Local Vite 5.4.21 production build | 90 transformed modules | Vite build output, 1.51 s run | High for this build | Yes as bundle size, not load speed |
| CSS / HTML build output | CSS 2.09 kB / 0.91 gzip; HTML 0.71 kB / 0.41 gzip | Same | Final build | Vite output | High | Yes, usually unnecessary in resume |

Timing limitations: a single Windows development machine and remote Atlas test cluster, no geographic/instance-capacity characterization, no saturation test and no production configuration. The overlapping-install run measured 6.782400462982935 requests/sec and 523.8869999999988 ms p95; it demonstrates workload variability and is preserved rather than hidden. No percentage latency/throughput improvement is inferred from these runs. Refreshed measurements were taken after npm ci completed and before the final test commands; unrelated host/network activity was not controlled.

## Phase 13: defensible SDE resume bullets

- Built and tested a Node.js/Express REST API with MongoDB persistence, passing 66 backend tests and six Atlas integration cases covering reconnects, concurrent click updates, data isolation and legacy analytics retention.
- Validated MongoDB short-code indexing on 2,000 synthetic records using executionStats, reducing documents examined from 2,000 to 1 (99.95%) and changing the lookup plan from COLLSCAN to IXSCAN.
- Implemented atomic seven-day analytics while preserving legacy events; verified constant 487-byte BSON size from 1 to 51 clicks in a synthetic fixture and exact retention of existing raw history.
- Added React/Vite error recovery and keyboard-accessible dialogs, with four passing desktop/mobile Playwright executions and GitHub Actions configured to run backend tests, production builds and browser smoke checks.

Do not claim production scale, production uptime, real users, a latency percentage improvement, 76 unique tests, a successful remote CI run or an automatic deployment pipeline. CI is configured and locally verified; no deployment occurred.
