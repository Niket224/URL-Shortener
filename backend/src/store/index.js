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

async function initStore() {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    mode = "mongo";
    store = require("./mongoUrlStore");
    console.log("✅ Connected to MongoDB");
    return;
  }

  mode = "memory";
  store = require("./memoryUrlStore");
  console.warn(
    "⚠️  MONGODB_URI not set — using in-memory URL store (links are lost when the server stops). Add MONGODB_URI to backend/.env for persistence."
  );
}

module.exports = { initStore, getStore, getStoreMode };
