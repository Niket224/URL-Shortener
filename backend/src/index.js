if (process.env.NODE_ENV !== "test") require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { initStore, getStoreMode, isStoreReady } = require("./store");
const { baseUrl, frontendUrl } = require("./config");

// Validate public origins before accepting requests or connecting to MongoDB.
baseUrl();

const urlRoutes = require("./routes/url");
const redirectRoute = require("./routes/redirect");
const auth = require("./auth");

const app = express();
// Render terminates TLS at its reverse proxy. Keep trust opt-in and bounded.
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(proxyHops) || proxyHops < 0) throw new Error("Invalid TRUST_PROXY_HOPS");
app.set("trust proxy", proxyHops);

app.use(
  cors({
    origin: frontendUrl(),
    methods: ["GET", "POST", "PATCH", "DELETE"],
    exposedHeaders: ["X-Has-More"],
  })
);
app.use(express.json({ limit: "16kb" }));
app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

app.get("/api/health", (req, res) => {
  const ready = isStoreReady();
  res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "unavailable", store: getStoreMode() });
});

// Rate limiting is skipped in the test environment so property-based tests
// (which issue many requests) are not throttled.
if (process.env.NODE_ENV !== "test") {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests, please try again later." },
  });
  app.use("/api/", limiter);
}

app.use("/api/auth", auth.router);
app.use("/api/urls", auth.requireUser, urlRoutes);
app.use("/", redirectRoute);
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request body too large" });
  console.error("Request failed:", err.name);
  res.status(500).json({ error: "Server error" });
});

// Default 5001: macOS AirPlay uses port 5000 and returns 403 to API requests.
const PORT = process.env.PORT || 5001;

function start() {
  return initStore()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT} (${getStoreMode()})`);
      });
    })
    .catch((err) => {
      console.error("❌ Failed to start:", err.message);
      process.exit(1);
    });
}

// Only start the server when this file is run directly (e.g. `node src/index.js`).
// When required from tests, the test harness drives `app` and `initStore` itself.
if (require.main === module) {
  start();
}

module.exports = { app, start };
