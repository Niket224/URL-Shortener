const { dailyCounts, recentDays } = require("./analytics");

test("UTC window crosses month/year boundaries", () => {
  expect(recentDays(new Date("2026-01-02T00:01:00Z"))).toEqual([
    "2025-12-27", "2025-12-28", "2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02",
  ]);
});
test("empty and aggregate-only data are readable", () => {
  expect(dailyCounts({})).toEqual([]);
  expect(dailyCounts({ dailyClicks: [{ date: "2026-01-01", clicks: 4 }] })).toEqual([{ date: "2026-01-01", clicks: 4 }]);
});
test("legacy fallback and overlapping aggregate totals never double count", () => {
  const clickHistory = [{ timestamp: "2026-01-01T23:00:00Z" }, { timestamp: "2026-01-02T00:00:00Z" }];
  expect(dailyCounts({ clickHistory, dailyClicks: [] })).toEqual([{ date: "2026-01-01", clicks: 1 }, { date: "2026-01-02", clicks: 1 }]);
  expect(dailyCounts({ clickHistory, dailyClicks: [{ date: "2026-01-02", clicks: 3 }] })).toEqual([{ date: "2026-01-01", clicks: 1 }, { date: "2026-01-02", clicks: 3 }]);
});
test("memory adapter preserves legacy events and bounds same-day clicks", async () => {
  const store = require("../store/memoryUrlStore");
  const url = store.createUrl({ originalUrl: "https://example.com", shortCode: "memorylegacy" });
  const legacy = [{ timestamp: new Date("2026-01-01T12:00:00Z"), referrer: "keep", userAgent: "keep" }];
  await store.updateUrl(url._id, { clickHistory: legacy, clicks: 1, dailyClicks: undefined });
  {
    for (let i = 0; i < 100; i++) await store.recordClick(url._id);
    const doc = await store.findById(url._id);
    expect(doc.clickHistory).toEqual(legacy);
    expect(doc.clicks).toBe(101);
    expect(doc.dailyClicks.length).toBeLessThanOrEqual(7);
    expect(doc.dailyClicks.at(-1).clicks).toBe(100);
  }
});
