// Explicit opt-in. All fixtures and index changes are confined to snip_test.
const { loadAtlasTestUri } = require("../tests/atlasConfig");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { performance } = require("perf_hooks");
const crypto = require("crypto");

async function main() {
  const uri = loadAtlasTestUri();
  process.env.NODE_ENV = "test";
  process.env.AUTH_MODE = "public";
  process.env.MONGODB_URI = uri;
  process.env.BASE_URL = "http://127.0.0.1";
  const mongoose = require("mongoose");
  const { initStore, getStore, closeStore } = require("../src/store");
  const { app } = require("../src/index");
  const Url = require("../src/models/Url");
  const runId = crypto.randomBytes(4).toString("hex");
  const collectionName = `snip_benchmark_${runId}`;
  let server, fixture, collection;
  const result = { measuredAt: new Date().toISOString(), classification: "SYNTHETIC BENCHMARK DATA; NOT PRODUCTION",
    environment: { api: "local Express on loopback", database: "MongoDB Atlas snip_test", node: process.version,
      platform: os.platform(), mongoose: mongoose.version, rateLimiter: "disabled (test mode)", redirectFollowing: false } };
  function explainSummary(explain) {
    const plan = explain.queryPlanner.winningPlan;
    const stages = new Set(), indexes = new Set();
    function walk(value) {
      if (!value || typeof value !== "object") return;
      if (value.stage) stages.add(value.stage);
      if (value.indexName) indexes.add(value.indexName);
      Object.values(value).forEach(walk);
    }
    walk(plan);
    const { executionTimeMillis, nReturned, totalDocsExamined, totalKeysExamined } = explain.executionStats;
    return { executionTimeMillis, nReturned, totalDocsExamined, totalKeysExamined, stages: [...stages], indexes: [...indexes] };
  }
  try {
    await initStore();
    if (mongoose.connection.name !== "snip_test") throw new Error("Isolation guard rejected benchmark");
    collection = mongoose.connection.db.collection(collectionName);
    const size = 2000;
    const records = Array.from({ length: size }, (_, i) => ({
      shortCode: `b${i.toString(36).padStart(5, "0")}`, originalUrl: "https://example.com/benchmark",
      isActive: true, ownerId: `synthetic-owner-${i % 20}`, clicks: 0, createdAt: new Date(1700000000000 + i),
    }));
    const inserted = await collection.insertMany(records);
    const filter = { shortCode: records[size - 1].shortCode, isActive: true };
    const before = explainSummary(await collection.find(filter).explain("executionStats"));
    await collection.createIndex({ shortCode: 1 }, { unique: true });
    const after = explainSummary(await collection.find(filter).explain("executionStats"));
    result.mongo = { datasetSize: size, query: filter, before, after,
      documentsExaminedReductionPercent: (before.totalDocsExamined - after.totalDocsExamined) / before.totalDocsExamined * 100,
      latencyPercentageClaim: "Not made: explain timing is coarse and affected by cache/network", additionalQueries: {
        recentActiveListing: explainSummary(await collection.find({ isActive: true, ownerId: "synthetic-owner-0" }).sort({ createdAt: -1, _id: -1 }).limit(12).explain("executionStats")),
        statsOrDeletionIdLookup: explainSummary(await collection.find({ _id: inserted.insertedIds[0] }).explain("executionStats")),
      } };
    fixture = await getStore().createUrl({ originalUrl: "https://example.com/benchmark", shortCode: `r${runId}` });
    server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    const endpoint = `http://127.0.0.1:${server.address().port}/${fixture.shortCode}`;
    for (let i = 0; i < 10; i++) { const response = await fetch(endpoint, { redirect: "manual" }); await response.arrayBuffer(); if (response.status !== 302) throw new Error("Warmup failed"); }
    const durations = []; let next = 0, successful = 0, failed = 0;
    const count = 100, concurrency = 2;
    const start = performance.now();
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (next++ < count) {
        const begin = performance.now();
        try {
          const response = await fetch(endpoint, { redirect: "manual", signal: AbortSignal.timeout(15000) });
          await response.arrayBuffer();
          if (response.status === 302 && response.headers.get("location") === "https://example.com/benchmark") successful++;
          else failed++;
        } catch { failed++; }
        durations.push(performance.now() - begin);
      }
    }));
    const elapsedMs = performance.now() - start;
    durations.sort((a, b) => a - b);
    const quantile = q => durations[Math.ceil(q * durations.length) - 1];
    const persisted = await getStore().findById(fixture._id);
    result.redirect = { sampleSize: count, warmupRequests: 10, concurrency, successful, failed, elapsedMs,
      requestsPerSecond: count / (elapsedMs / 1000), averageLatencyMs: durations.reduce((a, b) => a + b, 0) / count,
      p50LatencyMs: quantile(.5), p95LatencyMs: quantile(.95), p99LatencyMs: quantile(.99),
      persistedClicksIncludingWarmup: persisted.clicks,
      limitations: "Single run; includes local host and Atlas network/write latency. p99 is low-confidence at n=100. Not production throughput or capacity." };
    if (failed || persisted.clicks !== count + 10) throw new Error("Benchmark correctness checks failed");
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === "snip_test") {
      if (fixture) await Url.deleteOne({ _id: fixture._id });
      if (collection) await collection.drop().catch(err => { if (err.code !== 26) throw err; });
    }
    await closeStore();
  }
  const output = path.resolve(__dirname, "../../docs/benchmark-current-results.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
}
main().catch(() => { console.error("Benchmark failed; raw driver details withheld. Check isolated test configuration."); process.exitCode = 1; });
