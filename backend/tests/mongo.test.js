process.env.NODE_ENV = "test";
process.env.AUTH_MODE = "accounts";
delete process.env.MONGODB_URI;
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const request = require("supertest");
const { app } = require("../src/index");
const { initStore, getStore, isStoreReady } = require("../src/store");
const Url = require("../src/models/Url");
const execFile = require("util").promisify(require("child_process").execFile);
let mongo;
jest.setTimeout(120000);
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri("snip_isolated_test");
  await initStore();
});
afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  delete process.env.MONGODB_URI;
});

test("real MongoDB retains accounts, links, and atomic analytics across reconnect", async () => {
  const account = await request(app).post("/api/auth/register").send({ email: "mongo@example.com", password: "long-test-password" });
  expect(account.status).toBe(201);
  const authorization = `Bearer ${account.body.token}`;
  const created = await request(app).post("/api/urls").set("Authorization", authorization).send({
    originalUrl: "https://example.com/persist", customCode: "persist", expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  expect(created.status).toBe(201);
  const id = created.body._id;
  await mongoose.disconnect();
  // A fresh Node process reads the same database; no module-level Map can satisfy this.
  const child = await execFile(process.execPath, ["-e", `
    const mongoose = require('mongoose');
    (async () => {
      await mongoose.connect(process.env.MONGODB_URI);
      const url = await require('./src/models/Url').findOne({ shortCode: 'persist' }).lean();
      console.log(url.originalUrl);
      await mongoose.disconnect();
    })().catch(() => process.exit(1));
  `], { cwd: require("path").resolve(__dirname, ".."), env: { ...process.env }, timeout: 15000 });
  expect(child.stdout.trim()).toBe("https://example.com/persist");
  expect(isStoreReady()).toBe(false);
  expect((await request(app).get("/api/health")).status).toBe(503);
  await initStore();
  expect((await request(app).get("/api/health")).status).toBe(200);
  const rows = await request(app).get("/api/urls").set("Authorization", authorization);
  expect(rows.body[0].shortUrl).toBe(created.body.shortUrl);
  const visits = await Promise.all(Array.from({ length: 20 }, () => request(app).get("/persist")));
  expect(visits.every(r => r.status === 302)).toBe(true);
  const stats = await request(app).get(`/api/urls/${id}/stats`).set("Authorization", authorization);
  expect(stats.body.totalClicks).toBe(20);
  expect(stats.body.clicksByDay[6].clicks).toBe(20);
  const stored = await Url.findById(id).lean();
  expect(stored.dailyClicks).toHaveLength(7);
  expect(stored.clickHistory).toHaveLength(0);
  await request(app).patch(`/api/urls/${id}`).set("Authorization", authorization).send({ originalUrl: "https://example.com/updated", expiresAt: null });
  expect((await request(app).get("/persist")).headers.location).toBe("https://example.com/updated");
  await Url.findByIdAndUpdate(id, { expiresAt: new Date(0) });
  expect((await request(app).get("/persist")).status).toBe(410);
  expect((await request(app).delete(`/api/urls/${id}`).set("Authorization", authorization)).status).toBe(200);
  expect((await request(app).get("/persist")).status).toBe(404);
});

test("legacy click history migrates without losing seven-day counts", async () => {
  const legacy = await Url.create({ originalUrl: "https://example.com", shortCode: "legacy", clicks: 2,
    clickHistory: [{ timestamp: new Date() }, { timestamp: new Date() }] });
  await getStore().recordClick(legacy._id);
  const stored = await Url.findById(legacy._id).lean();
  expect(stored.clicks).toBe(3);
  expect(stored.dailyClicks.at(-1).clicks).toBe(3);
  expect(stored.clickHistory).toHaveLength(0);
});

test("MongoDB mutations enforce ownership before writing", async () => {
  const link = await getStore().createUrl({ originalUrl: "https://example.com", shortCode: "owned", ownerId: "alice" });
  expect(await getStore().softDelete(link._id, "bob")).toBeNull();
  expect(await getStore().updateUrl(link._id, { originalUrl: "https://bad.example" }, "bob")).toBeNull();
  expect((await getStore().findById(link._id)).isActive).toBe(true);
});
