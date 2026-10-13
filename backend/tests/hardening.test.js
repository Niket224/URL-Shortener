process.env.NODE_ENV = "test";
process.env.AUTH_MODE = "public";
delete process.env.MONGODB_URI;
const request = require("supertest");
const { app } = require("../src/index");
const { initStore, getStore } = require("../src/store");
beforeAll(() => initStore());
afterEach(() => jest.restoreAllMocks());

test.each(["javascript:alert(1)", "file:///tmp/test", "ftp://example.com", 42, [], "https://user:pass@example.com"])("rejects unsafe destination %p", async originalUrl => {
  expect((await request(app).post("/api/urls").send({ originalUrl })).status).toBe(400);
});
test("malformed JSON and ids return client errors", async () => {
  expect((await request(app).post("/api/urls").set("Content-Type", "application/json").send('{')).status).toBe(400);
  expect((await request(app).delete("/api/urls/not-an-id")).status).toBe(400);
  expect((await request(app).get("/api/urls/not-an-id/stats")).status).toBe(400);
});
test("expiration, editing, pagination, and daily counters work end to end", async () => {
  const originalUrl = "https://example.com/first";
  const created = await request(app).post("/api/urls").send({ originalUrl, expiresAt: new Date(Date.now() + 60000).toISOString() });
  expect(created.status).toBe(201);
  const id = created.body._id;
  expect((await request(app).patch(`/api/urls/${id}`).send({ originalUrl: "https://example.com/edited" })).status).toBe(200);
  for (let i = 0; i < 3; i++) {
    const visit = await request(app).get(`/${created.body.shortCode}`);
    expect(visit.status).toBe(302);
    expect(visit.headers["cache-control"]).toBe("no-store");
    expect(visit.headers.location).toBe("https://example.com/edited");
  }
  await request(app).head(`/${created.body.shortCode}`);
  const stats = await request(app).get(`/api/urls/${id}/stats`);
  expect(stats.body.totalClicks).toBe(3);
  expect(stats.body.clicksByDay[6].clicks).toBe(3);
  expect((await getStore().findById(id)).clickHistory).toHaveLength(0);
  expect((await request(app).post("/api/urls").send({ originalUrl, expiresAt: "2000-01-01" })).status).toBe(400);
  await getStore().updateUrl(id, { expiresAt: new Date(0) });
  expect((await request(app).get(`/${created.body.shortCode}`)).status).toBe(410);
  await request(app).post("/api/urls").send({ originalUrl });
  const first = await request(app).get("/api/urls?page=1&limit=1");
  const second = await request(app).get("/api/urls?page=2&limit=1");
  expect(first.headers["x-has-more"]).toBe("true");
  expect(first.body[0]._id).not.toBe(second.body[0]._id);
  expect((await request(app).get("/api/urls?page=-1")).status).toBe(400);
});
test("analytics write failures do not block redirects", async () => {
  const created = await request(app).post("/api/urls").send({ originalUrl: "https://example.com" });
  jest.spyOn(getStore(), "recordClick").mockRejectedValue(new Error("offline"));
  jest.spyOn(console, "error").mockImplementation(() => {});
  expect((await request(app).get(`/${created.body.shortCode}`)).status).toBe(302);
});
test("generated-code collisions retry automatically", async () => {
  const real = getStore().createUrl;
  const spy = jest.spyOn(getStore(), "createUrl").mockImplementationOnce(() => { throw Object.assign(new Error(), { code: 11000 }); }).mockImplementation(real);
  expect((await request(app).post("/api/urls").send({ originalUrl: "https://example.com" })).status).toBe(201);
  expect(spy).toHaveBeenCalledTimes(2);
});
