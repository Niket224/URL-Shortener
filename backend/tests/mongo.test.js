const atlasUri = process.env.SNIP_TEST_TARGET === "atlas" ? require("./atlasConfig").loadAtlasTestUri() : null;
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
const suffix = require("crypto").randomBytes(3).toString("hex");
const codes = { persist: `p${suffix}`, legacy: `l${suffix}`, owned: `o${suffix}` };
const email = `mongo-${suffix}@example.com`;
const createdIds = [];
jest.setTimeout(120000);
beforeAll(async () => {
  if (atlasUri) process.env.MONGODB_URI = atlasUri;
  else {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri("snip_isolated_test");
  }
  try { await initStore(); }
  catch { throw new Error("Isolated MongoDB initialization failed; raw connection details withheld"); }
});
afterAll(async () => {
  if (atlasUri && mongoose.connection.readyState !== 1) {
    try { await mongoose.connect(atlasUri, { serverSelectionTimeoutMS: 8000 }); }
    catch { throw new Error("Test cleanup could not reconnect to snip_test; no other database was used"); }
  }
  if (atlasUri && mongoose.connection.readyState === 1) {
    if (mongoose.connection.name !== "snip_test") throw new Error("Refusing cleanup outside snip_test");
    await Url.deleteMany({ _id: { $in: createdIds } });
    const { User, Session } = require("../src/auth");
    const user = await User.findOne({ email }).lean();
    if (user) { await Session.deleteMany({ userId: String(user._id) }); await User.deleteOne({ _id: user._id }); }
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  delete process.env.MONGODB_URI;
});

test("real MongoDB retains accounts, links, and atomic analytics across reconnect", async () => {
  const account = await request(app).post("/api/auth/register").send({ email, password: "long-test-password" });
  expect(account.status).toBe(201);
  const authorization = `Bearer ${account.body.token}`;
  const created = await request(app).post("/api/urls").set("Authorization", authorization).send({
    originalUrl: "https://example.com/persist", customCode: codes.persist, expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  expect(created.status).toBe(201);
  const id = created.body._id;
  createdIds.push(id);
  expect(Number.isFinite(Date.parse(created.body.createdAt))).toBe(true);
  const duplicate = await request(app).post("/api/urls").set("Authorization", authorization).send({ originalUrl: "https://example.com/duplicate", customCode: codes.persist });
  expect(duplicate.status).toBe(409);
  await expect(Url.create({ originalUrl: "https://example.com", shortCode: codes.persist })).rejects.toMatchObject({ code: 11000 });
  await mongoose.disconnect();
  // A fresh Node process reads the same database; no module-level Map can satisfy this.
  const child = await execFile(process.execPath, ["-e", `
    const mongoose = require('mongoose');
    (async () => {
      await mongoose.connect(process.env.MONGODB_URI);
      const url = await require('./src/models/Url').findOne({ shortCode: ${JSON.stringify(codes.persist)} }).lean();
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
  const visits = await Promise.all(Array.from({ length: 20 }, () => request(app).get(`/${codes.persist}`)));
  expect(visits.every(r => r.status === 302)).toBe(true);
  const stats = await request(app).get(`/api/urls/${id}/stats`).set("Authorization", authorization);
  expect(stats.body.totalClicks).toBe(20);
  expect(stats.body.clicksByDay[6].clicks).toBe(20);
  const stored = await Url.findById(id).lean();
  expect(stored.dailyClicks).toHaveLength(7);
  expect(stored.clickHistory).toHaveLength(0);
  expect(stored.updatedAt).toBeInstanceOf(Date);
  await mongoose.disconnect();
  await initStore();
  const persisted = await getStore().findByShortCode(codes.persist);
  expect(String(persisted._id)).toBe(id);
  expect(persisted.clicks).toBe(20);
  expect(persisted.dailyClicks.at(-1).clicks).toBe(20);
  await request(app).patch(`/api/urls/${id}`).set("Authorization", authorization).send({ originalUrl: "https://example.com/updated", expiresAt: null });
  expect((await request(app).get(`/${codes.persist}`)).headers.location).toBe("https://example.com/updated");
  await Url.findByIdAndUpdate(id, { expiresAt: new Date(0) });
  expect((await request(app).get(`/${codes.persist}`)).status).toBe(410);
  expect((await request(app).delete(`/api/urls/${id}`).set("Authorization", authorization)).status).toBe(200);
  expect((await request(app).get(`/${codes.persist}`)).status).toBe(404);
});

test("legacy click history is preserved exactly while new counters persist", async () => {
  const legacy = await Url.create({ originalUrl: "https://example.com", shortCode: codes.legacy, clicks: 2,
    clickHistory: [{ timestamp: new Date() }, { timestamp: new Date() }] });
  createdIds.push(legacy._id);
  const before = await Url.findById(legacy._id).lean();
  await getStore().recordClick(legacy._id);
  const stored = await Url.findById(legacy._id).lean();
  expect(stored.clicks).toBe(3);
  expect(stored.dailyClicks.at(-1).clicks).toBe(3);
  expect(stored.clickHistory).toEqual(before.clickHistory);
  await mongoose.disconnect(); await initStore();
  await getStore().recordClick(legacy._id);
  const reconnected = await Url.findById(legacy._id).lean();
  expect(reconnected.clickHistory).toEqual(before.clickHistory);
  expect(reconnected.clicks).toBe(4);
  expect(require("../src/utils/analytics").dailyCounts(reconnected).at(-1).clicks).toBe(4);
});

test("mixed partial aggregates use legacy fallback and preserve BSON history without double counting", async () => {
  const { recentDays, dailyCounts } = require("../src/utils/analytics");
  const days = recentDays();
  const raw = [
    { timestamp: new Date(`${days[5]}T12:00:00Z`), referrer: "legacy", userAgent: "preserved" },
    { timestamp: new Date(`${days[6]}T00:00:00Z`) }, { timestamp: new Date(`${days[6]}T00:01:00Z`) },
  ];
  const user = await require("../src/auth").User.findOne({ email }).lean();
  const link = await Url.create({ originalUrl: "https://example.com", shortCode: `m${suffix}`, clicks: 5, ownerId: String(user._id),
    clickHistory: raw, dailyClicks: [{ date: days[6], clicks: 4 }] });
  createdIds.push(link._id);
  const before = await Url.findById(link._id).lean();
  await getStore().recordClick(link._id);
  const after = await Url.findById(link._id).lean();
  expect(require("mongodb").BSON.serialize({ history: after.clickHistory })).toEqual(require("mongodb").BSON.serialize({ history: before.clickHistory }));
  expect(after.clicks).toBe(6);
  expect(dailyCounts(after).find(d => d.date === days[5]).clicks).toBe(1);
  expect(dailyCounts(after).find(d => d.date === days[6]).clicks).toBe(5);
  const login = await request(app).post("/api/auth/login").send({ email, password: "long-test-password" });
  const stats = await request(app).get(`/api/urls/${link._id}/stats`).set("Authorization", `Bearer ${login.body.token}`);
  expect(stats.status).toBe(200);
  expect(stats.body.totalClicks).toBe(6);
  expect(stats.body.clicksByDay.map(d => d.clicks)).toEqual([0, 0, 0, 0, 0, 1, 5]);
});

test("document size and bucket count stay bounded after 50 additional clicks", async () => {
  const link = await getStore().createUrl({ originalUrl: "https://example.com", shortCode: `s${suffix}` });
  createdIds.push(link._id);
  await getStore().recordClick(link._id);
  const size = async () => (await Url.aggregate([{ $match: { _id: link._id } }, { $project: { bytes: { $bsonSize: "$$ROOT" } } }]))[0].bytes;
  const beforeBytes = await size();
  for (let batch = 0; batch < 10; batch++) await Promise.all(Array.from({ length: 5 }, () => getStore().recordClick(link._id)));
  const doc = await Url.findById(link._id).lean();
  expect(doc.clicks).toBe(51); expect(doc.dailyClicks).toHaveLength(7); expect(doc.clickHistory).toHaveLength(0);
  const afterBytes = await size();
  expect(afterBytes).toBe(beforeBytes);
  console.log(`Bounded analytics fixture: clicks=1 to 51, BSON bytes=${beforeBytes} to ${afterBytes}, buckets=7, raw events=0`);
});

test("MongoDB mutations enforce ownership before writing", async () => {
  const link = await getStore().createUrl({ originalUrl: "https://example.com", shortCode: codes.owned, ownerId: "alice" });
  createdIds.push(link._id);
  expect(await getStore().softDelete(link._id, "bob")).toBeNull();
  expect(await getStore().updateUrl(link._id, { originalUrl: "https://bad.example" }, "bob")).toBeNull();
  expect((await getStore().findById(link._id)).isActive).toBe(true);
});

test("daily counters roll across UTC days while raw history remains intact", async () => {
  const analytics = require("../src/utils/analytics");
  const window = analytics.recentDays;
  const link = await Url.create({ originalUrl: "https://example.com", shortCode: `d${suffix}`, clicks: 1,
    clickHistory: [{ timestamp: new Date("2025-12-25T12:00:00Z") }] });
  createdIds.push(link._id);
  const initial = await Url.findById(link._id).lean();
  const spy = jest.spyOn(analytics, "recentDays");
  try {
    for (let i = 0; i < 9; i++) {
      spy.mockReturnValue(window(new Date(Date.UTC(2026, 0, 1 + i, 12))));
      await getStore().recordClick(link._id);
    }
  } finally { spy.mockRestore(); }
  const doc = await Url.findById(link._id).lean();
  expect(doc.clicks).toBe(10);
  expect(doc.dailyClicks.map(d => d.date)).toEqual(window(new Date("2026-01-09T12:00:00Z")));
  expect(doc.dailyClicks.every(d => d.clicks === 1)).toBe(true);
  expect(doc.clickHistory).toEqual(initial.clickHistory);
});
