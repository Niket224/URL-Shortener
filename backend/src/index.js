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

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

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

initStore()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} (${getStoreMode()})`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to start:", err.message);
    process.exit(1);
  });
