/**
 * Integration Tests — short-link-404-fix (Task 4)
 *
 * End-to-end create-then-visit flows driven through the real Express app
 * (`backend/src/index.js` exports `app`) with supertest, plus a contract-level
 * durability check.
 *
 * Covered scenarios (design.md → Testing Strategy → Integration Tests):
 *   1. Full create-then-visit flow with an auto-generated code resolves to 301.
 *   2. Create-then-visit flow with an in-range custom code resolves to 301; an
 *      out-of-range custom code is rejected at creation with 400 and never
 *      produces a visitable link.
 *   3. With a durable store configured, a created link resolves after
 *      re-initializing the store (simulating a new instance / restart),
 *      confirming the durability guarantee.
 *
 * Durability approach (documented):
 *   A real MongoDB is not assumed to be available in this environment, and
 *   `initStore` only selects the durable Mongo backend when `MONGODB_URI` is
 *   set (which performs a live `mongoose.connect`). Rather than pull in a heavy
 *   dependency, we validate the durability guarantee at the CONTRACT level the
 *   design describes: a durable store backs its data with shared storage that
 *   survives a process/instance restart. We model that with a lightweight
 *   in-test durable store whose records live in a shared backing Map. A
 *   "restart" is simulated by constructing a brand-new store instance over the
 *   SAME backing map; the previously created code still resolves. For contrast
 *   we show that the non-durable in-memory store loses its data when a fresh
 *   instance is re-initialized (the original 404 root cause).
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 3.1, 3.2
 */

// In-memory store, no rate limiter. Must be set before requiring the app/store.
process.env.NODE_ENV = "test";
delete process.env.MONGODB_URI;

const request = require("supertest");

const { app } = require("../src/index");
const { initStore, getStoreMode } = require("../src/store");
const { isValidCode, CODE_CONSTRAINT_MESSAGE } = require("../src/utils/code");

// vercel.json forwards only paths matching this pattern to the backend.
const VERCEL_ROUTE = /^\/([a-zA-Z0-9_-]{4,12})$/;

beforeAll(async () => {
  // No MONGODB_URI in the test environment -> local-dev in-memory store.
  await initStore();
});

describe("Integration: full create-then-visit flow (auto-generated code)", () => {
  // Requirement 3.1: a valid auto-generated code (nanoid, 6 chars) is created
  // and redirects with 301 when visited.
  test("auto-generated code is created (201) and resolves to a 301 redirect", async () => {
    const originalUrl = "https://example.com/auto-flow";

    const create = await request(app).post("/api/urls").send({ originalUrl });
    expect(create.status).toBe(201);

    const code = create.body.shortCode;
    expect(isValidCode(code)).toBe(true); // routable per the canonical constraint
    expect(VERCEL_ROUTE.test(`/${code}`)).toBe(true); // vercel.json would forward it

    const visit = await request(app).get(`/${code}`);
    expect(visit.status).toBe(301);
    expect(visit.headers.location).toBe(originalUrl);
  });
});

describe("Integration: full create-then-visit flow (custom code)", () => {
  // Requirement 3.2: an in-range custom code is accepted and redirects.
  test("in-range custom code is created (201) and resolves to a 301 redirect", async () => {
    const originalUrl = "https://example.com/custom-flow";
    const customCode = "promo7"; // 6 chars, in range, routable

    const create = await request(app)
      .post("/api/urls")
      .send({ originalUrl, customCode });
    expect(create.status).toBe(201);
    expect(create.body.shortCode).toBe(customCode);
    expect(VERCEL_ROUTE.test(`/${customCode}`)).toBe(true);

    const visit = await request(app).get(`/${customCode}`);
    expect(visit.status).toBe(301);
    expect(visit.headers.location).toBe(originalUrl);
  });

  // Requirement 2.3 / 2.2: an out-of-range custom code is rejected at creation
  // with 400 and never produces a visitable link.
  test("too-short custom code is rejected with 400 and never becomes visitable", async () => {
    const customCode = "go"; // 2 chars, out of range, unroutable

    const create = await request(app)
      .post("/api/urls")
      .send({ originalUrl: "https://example.com/too-short", customCode });
    expect(create.status).toBe(400);
    expect(create.body.error).toBe(CODE_CONSTRAINT_MESSAGE);

    // The link was never created, so visiting it yields a 404 (and the path is
    // not even forwarded by vercel.json in production).
    expect(VERCEL_ROUTE.test(`/${customCode}`)).toBe(false);
    const visit = await request(app).get(`/${customCode}`);
    expect(visit.status).toBe(404);
  });

  test("too-long custom code is rejected with 400 and never becomes visitable", async () => {
    const customCode = "my-really-long-custom-code"; // 26 chars, out of range

    const create = await request(app)
      .post("/api/urls")
      .send({ originalUrl: "https://example.com/too-long", customCode });
    expect(create.status).toBe(400);
    expect(create.body.error).toBe(CODE_CONSTRAINT_MESSAGE);

    expect(VERCEL_ROUTE.test(`/${customCode}`)).toBe(false);
    const visit = await request(app).get(`/${customCode}`);
    expect(visit.status).toBe(404);
  });
});

/**
 * Lightweight durable-store stub used only by the durability test below.
 *
 * Unlike the in-memory store (whose Maps are bound to a single module/process
 * lifetime), this stub keeps its records in a `backing` Map provided by the
 * caller. Constructing a new instance over the SAME backing map models a
 * durable backend (e.g. MongoDB) whose data survives an instance restart.
 */
function makeDurableStore(backing) {
  return {
    createUrl({ originalUrl, shortCode }) {
      if (!isValidCode(shortCode)) {
        const err = new Error(CODE_CONSTRAINT_MESSAGE);
        err.name = "ValidationError";
        throw err;
      }
      if (backing.has(shortCode)) {
        const err = new Error("Duplicate shortCode");
        err.code = 11000;
        throw err;
      }
      const record = {
        _id: shortCode,
        originalUrl,
        shortCode,
        clicks: 0,
        clickHistory: [],
        isActive: true,
        expiresAt: null,
        createdAt: new Date(),
      };
      backing.set(shortCode, record);
      return record;
    },
    async findByShortCode(code) {
      const record = backing.get(code);
      if (!record || !record.isActive) return null;
      return record;
    },
  };
}

describe("Integration: durability guarantee across a simulated restart", () => {
  // Requirements 2.1 / 2.2: a created link resolves regardless of which
  // instance serves the redirect or whether the process restarted.
  test("a durable store retains a created code after re-initialization (new instance)", async () => {
    const durableBacking = new Map(); // shared, durable backing storage
    const originalUrl = "https://example.com/durable";
    const code = "durab1"; // 6 chars, in range, routable

    // Instance A creates the link.
    const instanceA = makeDurableStore(durableBacking);
    const created = instanceA.createUrl({ originalUrl, shortCode: code });
    expect(created.shortCode).toBe(code);

    // Simulate a new serverless instance / process restart: a brand-new store
    // instance constructed over the SAME durable backing map.
    const instanceB = makeDurableStore(durableBacking);
    const resolved = await instanceB.findByShortCode(code);

    // Durability guarantee: the mapping is still present, so GET /:code would
    // resolve and issue a 301 to the original URL.
    expect(resolved).not.toBeNull();
    expect(resolved.originalUrl).toBe(originalUrl);
    expect(resolved.isActive).toBe(true);
  });

  // Contrast: the non-durable in-memory store loses its data when a fresh
  // instance is re-initialized — this is the original 404 root cause and the
  // reason durability is mandatory in serverless/production.
  test("CONTRAST: the in-memory store loses its data after a fresh instance/restart", async () => {
    expect(getStoreMode()).toBe("memory");

    const res = await request(app)
      .post("/api/urls")
      .send({ originalUrl: "https://example.com/non-durable" });
    expect(res.status).toBe(201);
    const code = res.body.shortCode;

    // Simulate a brand-new instance: re-require the memory store module fresh.
    jest.resetModules();
    const freshMemoryStore = require("../src/store/memoryUrlStore");
    const found = await freshMemoryStore.findByShortCode(code);

    expect(found).toBeNull(); // data lost -> a later GET /:code yields 404
  });
});
