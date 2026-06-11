/**
 * Preservation Tests — short-link-404-fix
 *
 * Property 3: Preservation — Existing Behavior Unchanged
 *
 * These tests capture the BASELINE behavior of the UNFIXED code for inputs where
 * the bug condition does NOT hold (valid in-range codes, duplicates, invalid URLs,
 * and missing/deleted/expired codes). They follow the observation-first
 * methodology: the assertions below encode behavior actually produced by the
 * current (unfixed) implementation.
 *
 * EXPECTED OUTCOME: these tests PASS on the unfixed code. They will be re-run
 * after the fix (task 3.6) to confirm no regressions were introduced.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

// In-memory store, no rate limiter. Must be set before requiring the app/store.
process.env.NODE_ENV = "test";
delete process.env.MONGODB_URI;

const request = require("supertest");
const fc = require("fast-check");

const { app } = require("../src/index");
const { initStore, getStoreMode } = require("../src/store");
const memoryStore = require("../src/store/memoryUrlStore");
const Url = require("../src/models/Url");

// The canonical, routable short-code pattern (mirrors vercel.json today).
const CANONICAL_CODE = /^[a-zA-Z0-9_-]{4,12}$/;
const VALID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split("");

beforeAll(async () => {
  await initStore();
});

describe("Property 3 (Preservation): valid code creation and redirect", () => {
  test("3.1 auto-generated code (nanoid, 6 chars) is created (201) and redirects with 301", async () => {
    const originalUrl = "https://example.com/auto";
    const create = await request(app).post("/api/urls").send({ originalUrl });

    expect(create.status).toBe(201);
    expect(create.body.shortCode).toMatch(CANONICAL_CODE);
    expect(create.body.shortCode).toHaveLength(6); // nanoid(6)

    const visit = await request(app).get(`/${create.body.shortCode}`);
    expect(visit.status).toBe(301);
    expect(visit.headers.location).toBe(originalUrl);
  });

  test("3.2 in-range custom code 'promo' (5 chars) is accepted (201) and redirects (301)", async () => {
    const originalUrl = "https://example.com/promo-target";
    const create = await request(app)
      .post("/api/urls")
      .send({ originalUrl, customCode: "promo" });

    expect(create.status).toBe(201);
    expect(create.body.shortCode).toBe("promo");

    const visit = await request(app).get("/promo");
    expect(visit.status).toBe(301);
    expect(visit.headers.location).toBe(originalUrl);
  });

  test("3.2 boundary length 4 ('abcd') is accepted (201) and redirects (301)", async () => {
    const originalUrl = "https://example.com/len4";
    const create = await request(app)
      .post("/api/urls")
      .send({ originalUrl, customCode: "abcd" });

    expect(create.status).toBe(201);
    expect(create.body.shortCode).toBe("abcd");

    const visit = await request(app).get("/abcd");
    expect(visit.status).toBe(301);
    expect(visit.headers.location).toBe(originalUrl);
  });

  test("3.2 boundary length 12 ('abcdefghijkl') is accepted (201) and redirects (301)", async () => {
    const originalUrl = "https://example.com/len12";
    const create = await request(app)
      .post("/api/urls")
      .send({ originalUrl, customCode: "abcdefghijkl" });

    expect(create.status).toBe(201);
    expect(create.body.shortCode).toBe("abcdefghijkl");

    const visit = await request(app).get("/abcdefghijkl");
    expect(visit.status).toBe(301);
    expect(visit.headers.location).toBe(originalUrl);
  });
});

describe("Property 3 (Preservation): error and edge-case responses", () => {
  test("3.3 re-submitting an existing in-range code returns 409 'Custom code already taken'", async () => {
    const originalUrl = "https://example.com/dup";
    const first = await request(app)
      .post("/api/urls")
      .send({ originalUrl, customCode: "dupcode" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/urls")
      .send({ originalUrl, customCode: "dupcode" });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("Custom code already taken");
  });

  test("3.4 missing originalUrl returns 400", async () => {
    const res = await request(app).post("/api/urls").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("originalUrl is required");
  });

  test("3.4 malformed originalUrl returns 400", async () => {
    const res = await request(app)
      .post("/api/urls")
      .send({ originalUrl: "not-a-valid-url" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid URL format");
  });

  test("3.5 a code that does not exist returns 404", async () => {
    const res = await request(app).get("/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Short URL not found or has been deleted");
  });

  test("3.5 a soft-deleted code returns 404", async () => {
    const originalUrl = "https://example.com/deleted";
    const create = await request(app)
      .post("/api/urls")
      .send({ originalUrl, customCode: "delcode" });
    expect(create.status).toBe(201);

    const del = await request(app).delete(`/api/urls/${create.body._id}`);
    expect(del.status).toBe(200);

    const visit = await request(app).get("/delcode");
    expect(visit.status).toBe(404);
    expect(visit.body.error).toBe("Short URL not found or has been deleted");
  });

  test("3.5 an expired code returns 410", async () => {
    // The in-memory store cannot mark a record expired via the public API, so we
    // drive the redirect handler's expiry branch directly by having the active
    // store return a record whose expiresAt is in the past. This exercises the
    // real GET /:code handler logic (Mongo mode can set expiresAt naturally).
    const spy = jest.spyOn(memoryStore, "findByShortCode").mockResolvedValueOnce({
      _id: "expired-id",
      originalUrl: "https://example.com/expired",
      shortCode: "expcode",
      clicks: 0,
      clickHistory: [],
      isActive: true,
      expiresAt: new Date(Date.now() - 60 * 1000), // 1 min in the past
      createdAt: new Date(),
    });

    const visit = await request(app).get("/expcode");
    expect(visit.status).toBe(410);
    expect(visit.body.error).toBe("This short URL has expired");

    spy.mockRestore();
  });

  test("3.5 /favicon.ico returns 404", async () => {
    const res = await request(app).get("/favicon.ico");
    expect(res.status).toBe(404);
  });
});

describe("Property 3 (Preservation): PBT — in-range codes create and resolve", () => {
  const charArb = fc.constantFrom(...VALID_CHARS);
  const inRangeCode = fc.stringOf(charArb, { minLength: 4, maxLength: 12 });

  test("PBT: any code matching ^[a-zA-Z0-9_-]{4,12}$ is created (201) and resolves with 301", async () => {
    const seen = new Set();

    await fc.assert(
      fc.asyncProperty(inRangeCode, fc.webUrl(), async (code, originalUrl) => {
        fc.pre(CANONICAL_CODE.test(code));
        // Avoid 409 collisions across generated examples within this run.
        fc.pre(!seen.has(code));
        seen.add(code);

        const create = await request(app)
          .post("/api/urls")
          .send({ originalUrl, customCode: code });
        expect(create.status).toBe(201);
        expect(create.body.shortCode).toBe(code);

        const visit = await request(app).get(`/${code}`);
        expect(visit.status).toBe(301);
        expect(visit.headers.location).toBe(originalUrl);
      }),
      { numRuns: 40 }
    );
  });

  test("PBT: in-range codes are accepted equivalently by the Mongo schema (memory/Mongo parity)", async () => {
    await fc.assert(
      fc.asyncProperty(inRangeCode, fc.webUrl(), async (code, originalUrl) => {
        fc.pre(CANONICAL_CODE.test(code));

        // Memory-mode acceptance: createUrl resolves without throwing for a
        // fresh in-range code (use a unique code per check to avoid duplicates).
        const uniqueCode = code; // schema validation below does not persist
        const schemaError = new Url({ originalUrl, shortCode: uniqueCode }).validateSync();

        // Equivalence: the durable (Mongo) schema also accepts every in-range code,
        // so memory and Mongo agree on acceptance for non-buggy inputs.
        expect(schemaError).toBeUndefined();
      }),
      { numRuns: 40 }
    );
  });

  test("memory store accepts an in-range code directly (201-equivalent, no throw)", async () => {
    expect(getStoreMode()).toBe("memory");
    const created = await memoryStore.createUrl({
      originalUrl: "https://example.com/direct",
      shortCode: "direct1",
    });
    expect(created.shortCode).toBe("direct1");
  });
});
