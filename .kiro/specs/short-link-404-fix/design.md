# Short Link 404 Fix — Bugfix Design

## Overview

Snip is a URL shortener (Node.js/Express backend, React + Vite frontend, deployed on Vercel). Creating a long URL returns a short code, and visiting the short link should issue a `301` redirect to the original URL. Users report that visiting a generated short link returns `404` ("Short URL not found or has been deleted") in both local and Vercel environments.

The same `404` symptom is produced by two independent root causes, and the fix addresses both:

1. **Non-durable storage.** When `MONGODB_URI` is unset the backend uses an in-memory store (`memoryUrlStore.js`) whose data lives only in the current process. On Vercel, create and redirect requests can be served by different serverless instances or after a cold start, so the later lookup returns `null`. Locally, the same loss happens on any restart. The fix guarantees that any short link the system hands back is backed by durable, shared storage in serverless/production environments, so it resolves regardless of which instance serves the redirect or whether the process restarted.

2. **Routing/validation mismatch for custom codes.** Three layers disagree about what a valid code is: the API regex (`/^[a-zA-Z0-9_-]+$/`, no length limit), `vercel.json` routing (`^/([a-zA-Z0-9_-]{4,12})$`), and the Mongo schema (`minlength: 4`, `maxlength: 12`). A custom code outside the 4–12 range is accepted in memory mode (creating an unroutable link) but rejected with a generic `500` in Mongo mode. The fix unifies a single canonical code constraint across all layers so accepted codes are always routable and out-of-range codes are always rejected with a clear `400`, consistently across stores.

The fix is targeted and minimal: it does not redesign the storage abstraction or the API surface. It (a) makes durability a hard requirement in serverless/production rather than silently handing back non-durable links, and (b) centralizes one code-validation rule that all layers share.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a short code that the system accepted at creation but that cannot later be resolved to a `301` redirect (because storage was non-durable across instances/restarts, or because the code is unroutable), or a custom code whose out-of-range length is handled inconsistently across stores.
- **Property (P)**: The desired behavior — every short link the system hands back resolves to a `301` redirect when visited (regardless of serverless instance or restart), and out-of-range custom codes are rejected uniformly with a `400`.
- **Preservation**: Existing behavior that must remain unchanged — valid auto-generated and in-range custom codes redirect correctly, duplicate codes return `409`, invalid `originalUrl` returns `400`, and missing/deleted/expired codes return `404`/`410`.
- **Durable store**: A storage backend whose data survives process restarts and is shared across all serverless instances (MongoDB via `mongoUrlStore.js`).
- **Non-durable store**: The in-memory store (`memoryUrlStore.js`) whose data is bound to a single process lifetime; acceptable only for local single-process development.
- **Canonical code constraint**: A single shared definition of a valid short code — `^[a-zA-Z0-9_-]{4,12}$` — that must hold identically in the API validation, the `vercel.json` route, and the Mongo schema.
- **`initStore` / `getStore` / `getStoreMode`**: Functions in `backend/src/store/index.js` that select and expose the active store backend based on `MONGODB_URI`.
- **`POST /api/urls` handler**: The function in `backend/src/routes/url.js` that validates input and creates a short code.
- **`GET /:code` handler**: The function in `backend/src/routes/redirect.js` that resolves a short code and issues the redirect.

## Bug Details

### Bug Condition

The bug manifests in two distinct but related ways. First, a short link is created and handed back to the user, but a later visit cannot resolve it because the creating store was non-durable (a different serverless instance or a restarted process no longer holds the in-memory mapping). Second, a custom code outside the routable 4–12 character range is accepted in memory mode (producing a link that `vercel.json` never forwards to the redirect handler) while the same input is rejected with an opaque `500` in Mongo mode.

**Formal Specification:**
```
FUNCTION isBugCondition(scenario)
  INPUT: scenario describing a create request and a later visit
  OUTPUT: boolean

  // Root cause 1: non-durable storage in a multi-instance / restart-capable environment
  durabilityBug :=
       scenario.createSucceeded
       AND scenario.environmentIsServerlessOrRestartable
       AND scenario.activeStoreMode == "memory"
       AND scenario.redirectServedByDifferentInstanceOrAfterRestart
       AND scenario.visitResult == 404   // mapping no longer present

  // Root cause 2: code accepted but unroutable, OR inconsistent rejection across stores
  routingBug :=
       scenario.createSucceeded
       AND NOT matchesCanonicalCodeConstraint(scenario.shortCode)
       AND scenario.visitResult == 404   // vercel.json never forwards it

  validationInconsistencyBug :=
       NOT matchesCanonicalCodeConstraint(scenario.customCode)
       AND storeRejectionDiffersAcrossStores(scenario.customCode)
       // memory: accepted; mongo: generic 500

  RETURN durabilityBug OR routingBug OR validationInconsistencyBug
END FUNCTION

FUNCTION matchesCanonicalCodeConstraint(code)
  RETURN code MATCHES /^[a-zA-Z0-9_-]{4,12}$/
END FUNCTION
```

### Examples

- **Durability (serverless):** `POST /api/urls {"originalUrl":"https://example.com"}` returns `shortUrl = https://app.vercel.app/AbC123`. A few seconds later `GET /AbC123` is served by a different serverless instance → `404`. Expected: `301` redirect to `https://example.com`.
- **Durability (local restart):** Create `/abc123` locally with no `MONGODB_URI`, restart `npm start`, visit `/abc123` → `404`. Expected: link should never have been presented as durable, or it should resolve.
- **Routing (too short):** `POST /api/urls {"originalUrl":"https://example.com","customCode":"go"}` succeeds in memory mode and returns `shortUrl = .../go`. Visiting `/go` on Vercel is served by the static frontend (route `^/([a-zA-Z0-9_-]{4,12})$` does not match a 2-char path) → `404`. Expected: creation rejected with `400`.
- **Routing (too long):** `customCode = "my-really-long-custom-code"` (>12 chars) accepted in memory mode → unroutable link. Expected: `400`.
- **Validation inconsistency:** `customCode = "ab"` → memory store creates it (`201`); Mongo store throws schema validation → handler returns generic `500`. Expected: both return `400` with a clear message.
- **Edge case (valid):** `customCode = "promo"` (5 chars, in range, unused) → accepted and `/promo` redirects correctly. This must keep working.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- A valid auto-generated code (nanoid, 6 chars, within 4–12) is created and redirects with `301` when visited.
- A custom code within 4–12 characters that does not already exist is accepted and redirects correctly.
- A custom code that already exists returns `409` "Custom code already taken".
- A missing or invalid `originalUrl` returns a `400` validation error.
- A short code that does not exist or has been soft-deleted returns `404`; an expired short code returns `410`.
- The `GET /api/urls`, `GET /api/urls/:id/stats`, and `DELETE /api/urls/:id` endpoints behave exactly as before.
- The `/favicon.ico` short-circuit in the redirect handler still returns `404`.

**Scope:**
All inputs that do NOT meet the bug condition must be completely unaffected by this fix. This includes:
- Valid in-range codes (auto-generated or custom) in either store mode.
- Non-creation API requests (list, stats, delete, health).
- Requests for genuinely non-existent, deleted, or expired codes (these should still `404`/`410`).
- The local single-process development workflow using the in-memory store, which remains supported.

**Note:** The expected correct behavior for buggy inputs is defined in the Correctness Properties section below.

## Hypothesized Root Cause

Based on the bug description and the code, the most likely issues are:

1. **Silent non-durable storage in production.** `backend/src/store/index.js#initStore` falls back to the in-memory store whenever `MONGODB_URI` is unset, with only a `console.warn`. On Vercel each invocation may be a fresh instance, so the in-memory `Map`s (`urlsById`, `idByCode`) created during `POST` are absent during the later `GET /:code`. The system hands back a link it cannot durably resolve.

2. **Divergent code constraints across layers.** Three definitions disagree:
   - API: `backend/src/routes/url.js` validates only the charset (`/^[a-zA-Z0-9_-]+$/`) with no length bound.
   - Routing: `vercel.json` only forwards `^/([a-zA-Z0-9_-]{4,12})$` to the backend; anything outside 4–12 is served by the static frontend → `404`.
   - Schema: `backend/src/models/Url.js` enforces `minlength: 4`, `maxlength: 12`, so out-of-range codes throw a Mongoose `ValidationError`.

3. **Inconsistent error handling across stores.** The `POST /api/urls` catch block maps only `err.code === 11000` (duplicate) to `409`; a Mongoose `ValidationError` falls through to the generic `500`. The in-memory store performs no length validation at all, so the same input yields `201` in memory mode and `500` in Mongo mode.

4. **No single source of truth for the code rule.** Because the constraint is duplicated in three places, they drift apart and produce unroutable or inconsistently-rejected codes.

## Correctness Properties

Property 1: Bug Condition — Durable, Routable Resolution

_For any_ short link the system accepts and returns at creation time (`isBugCondition` true for the durability or routing cases), visiting that short code SHALL issue a `301` redirect to the original URL, regardless of which serverless instance handles the redirect or whether the process restarted between creation and visit. In serverless/production environments the system SHALL NOT hand back a link backed only by non-durable storage; if no durable store is configured it SHALL fail creation with a clear error rather than return an unresolvable link.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Consistent Custom-Code Validation

_For any_ submitted custom code whose length is outside the canonical 4–12 range (or otherwise fails `^[a-zA-Z0-9_-]{4,12}$`), the system SHALL reject creation with a `400` validation error and a clear message, identically in both the in-memory and Mongo stores, so no unroutable link is ever created.

**Validates: Requirements 2.3**

Property 3: Preservation — Existing Behavior Unchanged

_For any_ input where the bug condition does NOT hold (valid in-range auto-generated or custom codes, duplicate codes, invalid `originalUrl`, and missing/deleted/expired codes), the fixed code SHALL produce the same result as the original code: in-range codes redirect with `301`, duplicates return `409`, invalid URLs return `400`, and absent/deleted codes return `404` while expired codes return `410`.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming the root-cause analysis is correct, the fix introduces one shared code constraint and makes durability a hard requirement in serverless/production.

**File**: `backend/src/store/index.js`

**Function**: `initStore`

**Specific Changes**:
1. **Require durability in serverless/production.** When `MONGODB_URI` is unset, detect a serverless/production environment (e.g. `process.env.VERCEL` is set, or `process.env.NODE_ENV === "production"`). In that case, throw a clear startup/initialization error instead of silently selecting the in-memory store, so the system never hands back non-durable links. The in-memory store remains the explicit fallback only for local development.

**File**: `backend/src/routes/url.js`

**Function**: `POST /api/urls` handler

**Specific Changes**:
2. **Centralize and enforce the canonical code constraint.** Introduce a single shared validator (e.g. `isValidCode(code)` returning whether `^[a-zA-Z0-9_-]{4,12}$` matches) used for custom codes. Replace the charset-only `/^[a-zA-Z0-9_-]+$/` check with the canonical check that also enforces the 4–12 length, returning `400` with a clear message ("Custom code must be 4–12 characters and contain only letters, numbers, hyphens, and underscores") for any violation. This makes out-of-range rejection consistent before either store is touched.
3. **Map schema validation errors to `400`.** In the catch block, detect Mongoose `ValidationError` (`err.name === "ValidationError"`) and return `400` with a clear message, so the Mongo store no longer leaks a generic `500` for the same input that the API now rejects up front.

**File**: `backend/src/store/memoryUrlStore.js`

**Function**: `createUrl`

**Specific Changes**:
4. **Mirror the canonical constraint for defense in depth.** Have the in-memory store reject codes that fail the canonical constraint with the same error shape the API expects, so memory mode cannot create an unroutable link even if called directly. This keeps memory and Mongo behavior identical.

**File**: `backend/src/models/Url.js`

**Specific Changes**:
5. **Keep the schema constraint aligned.** Confirm the `shortCode` `minlength: 4` / `maxlength: 12` and charset match the canonical constraint. Optionally add a `match` validator for the charset so the schema and API rule are identical. No widening of the range.

**File**: `vercel.json`

**Specific Changes**:
6. **Keep routing aligned with the canonical constraint.** The route `^/([a-zA-Z0-9_-]{4,12})$` already matches the canonical rule; confirm it stays in sync with the API/schema. Since the API now refuses to create codes outside this pattern, every accepted code is routable.

### Shared Constraint (single source of truth)

To prevent future drift, define the canonical pattern once (e.g. a small constant/helper in the backend) and reference it from the API validation and the schema `match`; document that `vercel.json` must mirror it. This is the structural fix that keeps all three layers in agreement.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on the unfixed code, then verify the fix works correctly and preserves existing behavior. Because true cross-instance/cold-start behavior cannot be reproduced in a unit test, durability is validated at the contract level: the unfixed system hands back a link from a non-durable store in a serverless context, and the fixed system either resolves durably or refuses to create.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and confirm or refute the root-cause analysis. If refuted, re-hypothesize.

**Test Plan**: Drive the `POST /api/urls` and `GET /:code` handlers directly against each store, and assert behavior against `vercel.json`'s route pattern. Run these on the UNFIXED code to observe the failures.

**Test Cases**:
1. **Non-durable resolution (simulated):** Create a code via the memory store, then resolve it through a fresh store instance (simulating a new serverless instance / restart) and assert the lookup returns `null` → `404`. (will fail to resolve on unfixed code)
2. **Unroutable short code:** Create `customCode = "go"` (2 chars) in memory mode; assert it succeeds (`201`) yet the path `/go` does NOT match `^/([a-zA-Z0-9_-]{4,12})$`. (demonstrates unroutable link on unfixed code)
3. **Too-long code:** Create a >12-char custom code in memory mode and assert the same unroutable mismatch. (will demonstrate the bug on unfixed code)
4. **Cross-store inconsistency:** Submit `customCode = "ab"` to the memory store (`201`) and to the Mongo path (Mongoose `ValidationError` → generic `500`); assert the responses differ. (will fail consistency on unfixed code)

**Expected Counterexamples**:
- A created short code resolves to `404` after a store/instance change.
- A code outside 4–12 chars is accepted but its path is not forwarded by `vercel.json`.
- The same out-of-range input yields `201` (memory) vs `500` (Mongo).
- Possible causes: silent in-memory fallback in production, length constraint missing from API validation, `ValidationError` not mapped to `400`.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed system produces the expected behavior.

**Pseudocode:**
```
FOR ALL scenario WHERE isBugCondition(scenario) DO
  IF scenario is a durability case THEN
    // production/serverless with no durable store
    ASSERT createUrl_fixed(scenario) rejects with a clear error
            OR resolves via durable store to 301
  ELSE IF scenario is a routing / out-of-range case THEN
    ASSERT POST_fixed(scenario) == 400 with clear message
    ASSERT no unroutable link was created
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed system produces the same result as the original system.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handle_original(input) == handle_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many code/URL combinations automatically across the input domain.
- It catches edge cases (boundary lengths 4 and 12, allowed special characters) that manual tests might miss.
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs.

**Test Plan**: Observe behavior on the UNFIXED code for valid in-range codes, duplicates, invalid URLs, and missing/deleted/expired codes, then write tests capturing that behavior and assert it is unchanged after the fix.

**Test Cases**:
1. **Auto-generated code redirect:** Create without a custom code (nanoid, 6 chars) and assert `GET /:code` → `301` before and after the fix.
2. **In-range custom code redirect:** Create `customCode = "promo"` (5 chars) and assert it is accepted and redirects, unchanged.
3. **Boundary lengths:** Codes of exactly 4 and exactly 12 chars are accepted and redirect, unchanged.
4. **Duplicate code:** Re-submitting an existing code returns `409`, unchanged.
5. **Invalid `originalUrl`:** Missing or malformed URL returns `400`, unchanged.
6. **Missing / deleted / expired:** Non-existent or soft-deleted code returns `404`; expired code returns `410`, unchanged.

### Unit Tests

- `POST /api/urls`: out-of-range custom codes (too short, too long) return `400` with a clear message in both store modes.
- `POST /api/urls`: Mongoose `ValidationError` is mapped to `400`, not `500`.
- `initStore`: throws a clear error when `MONGODB_URI` is unset in a serverless/production environment, and still selects the in-memory store in local development.
- `GET /:code`: in-range codes redirect; `/favicon.ico`, missing, deleted, and expired codes return their existing statuses.

### Property-Based Tests

- Generate random codes matching `^[a-zA-Z0-9_-]{4,12}$` and assert creation succeeds and the link is routable and resolves (`Property 1` / preservation).
- Generate random codes outside the canonical constraint and assert both stores reject with `400` (`Property 2`).
- Generate random valid `originalUrl` values with in-range codes and assert memory-mode and Mongo-mode responses are equivalent (preservation of `Property 3`).

### Integration Tests

- Full create-then-visit flow with an auto-generated code resolves to `301`.
- Create-then-visit flow with an in-range custom code resolves to `301`; an out-of-range custom code is rejected at creation with `400` and never produces a visitable link.
- With a durable store configured, a created link resolves after re-initializing the store (simulating a new instance/restart), confirming the durability guarantee.
