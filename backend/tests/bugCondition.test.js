/**
 * Bug Condition Exploration Tests — short-link-404-fix
 *
 * These tests encode the EXPECTED (correct) behavior described by Property 1
 * and Property 2 in design.md. They are written BEFORE the fix.
 *
 * CRITICAL: On the UNFIXED code these tests are expected to FAIL (or demonstrate
 * divergent behavior). Each failure confirms a root cause of the short-link 404 bug:
 *   - Root cause 1: non-durable in-memory storage is silently used in serverless/prod.
 *   - Root cause 2: the short-code constraint diverges across the API, the stores,
 *     the Mongo schema, and vercel.json, so out-of-range codes are accepted
 *     (unroutable) in memory mode and rejected inconsistently in Mongo mode.
 *
 * DO NOT fix the code or the tests here — the goal is only to surface counterexamples.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3
 */

// Disable the rate limiter and ensure no durable store is configured for the
// in-memory exploration scenarios. Must be set before requiring the app/store.
process.env.NODE_ENV = "test";
delete process.env.MONGODB_URI;

const request = require("supertest");
const fc = require("fast-check");

const { app } = require("../src/index");
const { initStore, getStoreMode } = require("../src/store");
const memoryStore = require("../src/store/memoryUrlStore");
const Url = require("../src/models/Url");

// The single canonical constraint that the API, stores, schema, and vercel.json
// must all agree on. vercel.json forwards only paths matching this pattern.
const CANONICAL_CODE = /^[a-zA-Z0-9_-]{4,12}$/;
const VERCEL_ROUTE = /^\/([a-zA-Z0-9_-]{4,12})$/;

beforeAll(async () => {
  // No MONGODB_URI -> in-memory store (the unfixed default everywhere).
  await initStore();
});

describe("Property 1 (Bug Condition): Durable, Routable Resolution", () => {
  // --- Durability contract -------------------------------------------------
  // Expected behavior (2.1/2.2): in a serverless/production environment with no
  // durable store, the system must NOT silently hand back a non-durable link.
  // initStore must fail loudly instead of selecting the in-memory store.
  test("serverless/production without a durable store must refuse to initialize (no silent in-memory fallback)", async () => {
    jest.resetModules();
    const saved = {
      VERCEL: process.env.VERCEL,
      NODE_ENV: process.env.NODE_ENV,
      MONGODB_URI: process.env.MONGODB_URI,
    };
    try {
      delete process.env.MONGODB_URI;
      process.env.VERCEL = "1";
      process.env.NODE_ENV = "production";

      // Fresh copy of the store module so it re-reads the environment.
      const freshStore = require("../src/store");

      // EXPECTED: rejects with a clear error. UNFIXED: resolves to memory mode.
      await expect(freshStore.initStore()).rejects.toThrow();
    } finally {
      process.env.VERCEL = saved.VERCEL;
      if (saved.VERCEL === undefined) delete process.env.VERCEL;
      process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.MONGODB_URI === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = saved.MONGODB_URI;
    }
  });

  // --- Documentation of non-durability (root-cause demonstration) ----------
  // This demonstrates WHY the durability bug occurs: data created in the
  // in-memory store is lost when a new instance / restart re-initializes it.
  test("DEMONSTRATION: in-memory store loses data across a fresh instance/restart", async () => {
    const res = await request(app)
      .post("/api/urls")
      .send({ originalUrl: "https://example.com" });
    expect(res.status).toBe(201);
    const code = res.body.shortCode;

    // Simulate a brand new serverless instance / process restart.
    jest.resetModules();
    const freshMemoryStore = require("../src/store/memoryUrlStore");
    const found = await freshMemoryStore.findByShortCode(code);

    // Counterexample: the mapping is gone -> a later GET /:code yields 404.
    expect(found).toBeNull();
  });

  // --- Routability of accepted codes --------------------------------------
  // Expected behavior (2.2): every code the API accepts must be routable, i.e.
  // it must match vercel.json's route pattern.
  test("a too-short custom code ('go') must be rejected so it can never become an unroutable link", async () => {
    expect(getStoreMode()).toBe("memory");

    const res = await request(app)
      .post("/api/urls")
      .send({ originalUrl: "https://example.com", customCode: "go" });

    // Document the unroutability: vercel.json would never forward "/go".
    expect(VERCEL_ROUTE.test("/go")).toBe(false);

    // EXPECTED: 400. UNFIXED: 201 (accepted -> unroutable link -> 404 when visited).
    expect(res.status).toBe(400);
  });

  test("a too-long custom code (>12 chars) must be rejected so it can never become an unroutable link", async () => {
    const longCode = "my-really-long-custom-code"; // 26 chars

    const res = await request(app)
      .post("/api/urls")
      .send({ originalUrl: "https://example.com", customCode: longCode });

    expect(VERCEL_ROUTE.test(`/${longCode}`)).toBe(false);

    // EXPECTED: 400. UNFIXED: 201 (accepted -> unroutable link).
    expect(res.status).toBe(400);
  });
});

describe("Property 2 (Bug Condition): Consistent Custom-Code Validation", () => {
  // --- Cross-store consistency --------------------------------------------
  // Expected behavior (2.3): an out-of-range code must be rejected identically
  // by BOTH stores. UNFIXED: memory accepts (201) while Mongo throws a
  // ValidationError that the route maps to a generic 500 -> inconsistent.
  test("out-of-range code 'ab' must be rejected consistently across the in-memory store and the Mongo schema", () => {
    // Mongo side: the schema already rejects (minlength: 4).
    const mongoError = new Url({
      originalUrl: "https://example.com",
      shortCode: "ab",
    }).validateSync();
    expect(mongoError).toBeDefined();
    expect(mongoError.errors.shortCode).toBeDefined();

    // Memory side: EXPECTED to reject the same input (defense in depth) so the
    // two stores agree. UNFIXED: createUrl accepts it without complaint.
    expect(() => memoryStore.createUrl({ originalUrl: "https://example.com", shortCode: "ab" }))
      .toThrow();
  });

  // --- Property-based: universal rejection of out-of-range codes -----------
  // Expected behavior (2.3): ANY code failing the canonical constraint is
  // rejected with a consistent 400. UNFIXED: charset-valid but out-of-length
  // codes are accepted (201) or collide (409) — never a consistent 400.
  test("PBT: any custom code outside the canonical pattern is rejected with 400", async () => {
    const validChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split("");
    const charArb = fc.constantFrom(...validChars);

    // Charset-valid codes whose LENGTH is outside [4, 12] (too short or too long).
    const outOfRangeCode = fc.oneof(
      fc.stringOf(charArb, { minLength: 1, maxLength: 3 }),
      fc.stringOf(charArb, { minLength: 13, maxLength: 24 })
    );

    await fc.assert(
      fc.asyncProperty(outOfRangeCode, async (code) => {
        // Sanity: the generated code really does violate the canonical rule.
        fc.pre(!CANONICAL_CODE.test(code));

        const res = await request(app)
          .post("/api/urls")
          .send({ originalUrl: "https://example.com", customCode: code });

        // EXPECTED: a consistent 400 validation error for every out-of-range code.
        expect(res.status).toBe(400);
      }),
      { numRuns: 40 }
    );
  });
});
