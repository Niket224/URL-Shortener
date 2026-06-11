require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { initStore, getStoreMode } = require("./store");

const urlRoutes = require("./routes/url");
const redirectRoute = require("./routes/redirect");

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST", "DELETE"],
  })
);
app.use(express.json());

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

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    store: getStoreMode(),
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/urls", urlRoutes);
app.use("/", redirectRoute);

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
