# Implementation Plan

## Overview

This plan fixes short-link 404s caused by two independent root causes: (1) the backend silently falls back to a non-durable in-memory store in serverless/production, and (2) the short-code constraint diverges across the API, the memory store, the Mongo schema, and `vercel.json`. The plan follows the exploratory bugfix methodology: write bug-condition exploration tests and preservation tests BEFORE the fix, implement the fix, then verify the same tests confirm the fix and preserve existing behavior.

## Tasks

- [x] 1. Write bug condition exploration tests (BEFORE implementing the fix)
  - **Property 1: Bug Condition** - Durable, Routable Resolution
  - **Property 2: Bug Condition** - Consistent Custom-Code Validation
  - **CRITICAL**: These tests MUST FAIL (or demonstrate the inconsistent behavior) on the UNFIXED code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails** — the goal here is only to surface counterexamples
  - **NOTE**: These tests encode the expected behavior — they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate both root causes (non-durable storage and code-constraint divergence) and confirm/refute the root-cause analysis
  - Set up a test runner first (no framework exists yet): add `jest` and `supertest` as backend devDependencies and a `"test": "jest --run"` style script (single-run, not watch). Add `fast-check` for the property-based portions.
  - Refactor `backend/src/index.js` minimally if needed to export the Express `app` (without calling `listen`) so handlers can be driven directly in tests.
  - **Scoped PBT Approach**: For the deterministic routing/validation cases, scope properties to concrete failing inputs for reproducibility; use generators for the universal claims.
  - Test cases to encode (from design "Exploratory Bug Condition Checking"):
    - **Non-durable resolution (simulated):** Create a code via the memory store, then resolve it through a fresh store instance (simulating a new serverless instance / restart) and assert the lookup returns `null` → `GET /:code` yields `404`. (will fail to resolve on unfixed code)
    - **Unroutable short code (too short):** Create `customCode = "go"` (2 chars) in memory mode; assert it succeeds (`201`) yet the path `/go` does NOT match `vercel.json`'s `^/([a-zA-Z0-9_-]{4,12})$`. (demonstrates unroutable link)
    - **Unroutable short code (too long):** Create a >12-char custom code in memory mode and assert the same unroutable mismatch against the route pattern.
    - **Cross-store inconsistency:** Submit `customCode = "ab"` to the memory path (`201`) and to the Mongo path (Mongoose `ValidationError` → generic `500`); assert the responses differ.
    - **PBT (Property 2):** Generate random codes OUTSIDE `^[a-zA-Z0-9_-]{4,12}$` and assert the unfixed system does NOT reject them with a consistent `400` across stores.
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL / show divergent behavior (this is correct — it proves the bug exists)
  - Document counterexamples found (e.g., "created code resolves to 404 after store re-init", "`/go` accepted as 201 but unroutable", "`ab` → 201 in memory vs 500 in Mongo") to understand root cause
  - Mark task complete when tests are written, run, and the failures/counterexamples are documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing the fix)
  - **Property 3: Preservation** - Existing Behavior Unchanged
  - **IMPORTANT**: Follow the observation-first methodology — run the UNFIXED code with non-bug-condition inputs, record the actual outputs, then assert those outputs
  - Observe and capture baseline behavior on the UNFIXED code for inputs where `isBugCondition` is false:
    - **Auto-generated code redirect:** Create without a custom code (nanoid, 6 chars) and observe `GET /:code` → `301` to the original URL.
    - **In-range custom code redirect:** Create `customCode = "promo"` (5 chars) and observe it is accepted (`201`) and redirects (`301`).
    - **Boundary lengths:** Codes of exactly 4 and exactly 12 chars are accepted and redirect.
    - **Duplicate code:** Re-submitting an existing in-range code returns `409` "Custom code already taken".
    - **Invalid `originalUrl`:** Missing or malformed URL returns `400`.
    - **Missing / deleted / expired:** Non-existent or soft-deleted code → `404`; expired code → `410`; `/favicon.ico` → `404`.
  - Write property-based tests capturing observed behavior patterns (recommended per design "Preservation Checking"):
    - Generate random codes matching `^[a-zA-Z0-9_-]{4,12}$` and assert creation succeeds and the link resolves with `301`.
    - Generate random valid `originalUrl` values with in-range codes and assert memory-mode and Mongo-mode responses are equivalent.
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix short-link 404s (non-durable storage + divergent code constraints)

  - [x] 3.1 Introduce a single canonical code constraint (source of truth)
    - Define the canonical pattern `^[a-zA-Z0-9_-]{4,12}$` once in a small backend helper/constant (e.g. `isValidCode(code)`), to be referenced by API validation and the Mongo schema; document that `vercel.json` must mirror it.
    - _Bug_Condition: isBugCondition(scenario) where NOT matchesCanonicalCodeConstraint(shortCode)_
    - _Expected_Behavior: matchesCanonicalCodeConstraint(code) returns code MATCHES /^[a-zA-Z0-9_-]{4,12}$/_
    - _Preservation: in-range codes (incl. boundaries 4 and 12) remain valid_
    - _Requirements: 2.3, 3.2_

  - [x] 3.2 Require a durable store in serverless/production
    - In `backend/src/store/index.js#initStore`, when `MONGODB_URI` is unset, detect a serverless/production environment (e.g. `process.env.VERCEL` set or `process.env.NODE_ENV === "production"`) and throw a clear initialization error instead of silently selecting the in-memory store.
    - Keep the in-memory store as the explicit fallback only for local development.
    - _Bug_Condition: durabilityBug — createSucceeded AND environmentIsServerlessOrRestartable AND activeStoreMode == "memory"_
    - _Expected_Behavior: in serverless/production, never hand back a non-durable link; fail creation with a clear error or resolve via durable store_
    - _Preservation: local single-process dev with in-memory store remains supported_
    - _Requirements: 2.1, 2.2_

  - [x] 3.3 Enforce the canonical constraint and map ValidationError in the API
    - In `backend/src/routes/url.js` (`POST /api/urls`), replace the charset-only `/^[a-zA-Z0-9_-]+$/` check with `isValidCode(...)` that also enforces the 4–12 length; return `400` with a clear message ("Custom code must be 4–12 characters and contain only letters, numbers, hyphens, and underscores") for any violation.
    - In the catch block, detect Mongoose `ValidationError` (`err.name === "ValidationError"`) and return `400` with a clear message instead of falling through to the generic `500`.
    - _Bug_Condition: routingBug / validationInconsistencyBug — NOT matchesCanonicalCodeConstraint(customCode)_
    - _Expected_Behavior: out-of-range codes rejected with 400 and clear message, identically across stores_
    - _Preservation: duplicate → 409; invalid originalUrl → 400; in-range custom codes still accepted_
    - _Requirements: 2.2, 2.3, 3.3, 3.4_

  - [x] 3.4 Mirror the canonical constraint in the stores and schema
    - In `backend/src/store/memoryUrlStore.js#createUrl`, reject codes that fail the canonical constraint with the same error shape the API expects (defense in depth), so memory mode cannot create an unroutable link even if called directly.
    - In `backend/src/models/Url.js`, confirm `shortCode` `minlength: 4` / `maxlength: 12` align with the canonical rule; optionally add a charset `match` validator. No widening of the range.
    - Confirm `vercel.json` route `^/([a-zA-Z0-9_-]{4,12})$` stays in sync with the canonical constraint (no change expected).
    - _Bug_Condition: validationInconsistencyBug — storeRejectionDiffersAcrossStores(customCode)_
    - _Expected_Behavior: memory and Mongo behavior identical; every accepted code is routable_
    - _Preservation: existing schema indexes and valid-code creation unchanged_
    - _Requirements: 2.2, 2.3_

  - [x] 3.5 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Durable, Routable Resolution
    - **Property 2: Expected Behavior** - Consistent Custom-Code Validation
    - **IMPORTANT**: Re-run the SAME tests from task 1 — do NOT write new tests
    - The tests from task 1 encode the expected behavior; when they pass, the fix is confirmed
    - Run the bug condition exploration tests from task 1
    - **EXPECTED OUTCOME**: Tests PASS (confirms durability is enforced and out-of-range codes are rejected with a consistent `400`)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 3: Preservation** - Existing Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run the preservation property tests from task 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm valid in-range codes redirect (`301`), duplicates → `409`, invalid URLs → `400`, missing/deleted → `404`, expired → `410`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Add integration tests for the full create-then-visit flow
  - Full create-then-visit flow with an auto-generated code resolves to `301`.
  - Create-then-visit flow with an in-range custom code resolves to `301`; an out-of-range custom code is rejected at creation with `400` and never produces a visitable link.
  - With a durable store configured, a created link resolves after re-initializing the store (simulating a new instance/restart), confirming the durability guarantee.
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run the full backend test suite (unit + property-based + integration) in single-run mode.
  - Confirm Property 1 and Property 2 (bug condition) tests pass, Property 3 (preservation) tests pass, and there are no regressions.
  - Ensure all tests pass; ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "description": "Write exploration and preservation tests BEFORE the fix (independent, can run in parallel)",
      "tasks": ["1", "2"]
    },
    {
      "wave": 2,
      "description": "Establish the canonical code constraint and require durable storage (independent of each other)",
      "tasks": ["3.1", "3.2"]
    },
    {
      "wave": 3,
      "description": "Apply the canonical constraint across the API, stores, and schema (depend on 3.1)",
      "tasks": ["3.3", "3.4"]
    },
    {
      "wave": 4,
      "description": "Verify the fix: bug-condition tests now pass and preservation tests still pass",
      "tasks": ["3.5", "3.6"]
    },
    {
      "wave": 5,
      "description": "Integration tests for the full create-then-visit and durability flow",
      "tasks": ["4"]
    },
    {
      "wave": 6,
      "description": "Final checkpoint ensuring the entire suite passes",
      "tasks": ["5"]
    }
  ]
}
```

## Notes

- Tasks 1 and 2 MUST be completed before any fix work: task 1 tests must FAIL on the unfixed code (confirming the bug), and task 2 tests must PASS on the unfixed code (capturing baseline behavior to preserve).
- Tasks 3.5 and 3.6 re-run the SAME tests written in tasks 1 and 2 — do not author new tests for verification.
- Property labels (`Property 1`, `Property 2`, `Property 3`) map directly to the Correctness Properties in `design.md`.
- No widening of the 4–12 code range is permitted; the fix unifies the existing constraint rather than changing it.
- Durability cannot be reproduced with true cold starts in a unit test; it is validated at the contract level by re-initializing the store to simulate a new instance/restart.
