const mongoose = require("mongoose");

let mode = "memory";
let store = null;

function getStore() {
  if (!store) throw new Error("URL store not initialized — call initStore() first");
  return store;
}

function getStoreMode() {
  return mode;
}

// A serverless or production environment cannot rely on the in-memory store:
// data lives only in a single process, so links created on one instance (or
// before a cold start/restart) are lost on the next request -> 404. In those
// environments a durable store (MONGODB_URI) is mandatory. NODE_ENV === "test"
// is treated as local development so unit/integration tests can use memory mode.
function requiresDurableStore() {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

async function initStore() {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    mode = "mongo";
    store = require("./mongoUrlStore");
    console.log("✅ Connected to MongoDB");
    return;
  }

  if (requiresDurableStore()) {
    throw new Error(
      "MONGODB_URI is required in serverless/production environments. " +
        "The in-memory store is non-durable: short links would be lost across " +
        "serverless instances or restarts, causing 404s. Set MONGODB_URI to a " +
        "MongoDB connection string to enable durable storage."
    );
  }

  mode = "memory";
  store = require("./memoryUrlStore");
  console.warn(
    "⚠️  MONGODB_URI not set — using in-memory URL store (links are lost when the server stops). Add MONGODB_URI to backend/.env for persistence."
  );
}

module.exports = { initStore, getStore, getStoreMode };
