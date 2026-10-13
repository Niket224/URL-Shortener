const mongoose = require("mongoose");

let mode = process.env.MONGODB_URI ? "mongo" : "memory";
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
  store = null;
  if (process.env.MONGODB_URI) {
    if (process.env.NODE_ENV === "test") {
      const { MongoClient } = require("mongodb");
      let name;
      try { name = new MongoClient(process.env.MONGODB_URI).db().databaseName; }
      catch { throw new Error("Invalid isolated test database configuration"); }
      if (!["snip_test", "snip_isolated_test"].includes(name)) {
        throw new Error("Test mode refuses any database other than snip_test or snip_isolated_test");
      }
    }
    mode = "mongo";
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await require("../models/Url").init();
    const { User, Session } = require("../auth");
    await Promise.all([User.init(), Session.init()]);
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

function isStoreReady() {
  return Boolean(store) && (mode === "memory" || mongoose.connection.readyState === 1);
}

async function closeStore() {
  store = null;
  await mongoose.disconnect();
}

module.exports = { initStore, getStore, getStoreMode, isStoreReady, closeStore };
