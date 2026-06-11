const crypto = require("crypto");
const { isValidCode, CODE_CONSTRAINT_MESSAGE } = require("../utils/code");

/** In-memory store when MongoDB is not configured (local dev / quick try). */

function newId() {
  return crypto.randomBytes(12).toString("hex");
}

const urlsById = new Map();
const idByCode = new Map();

function toLean(doc) {
  return {
    _id: doc._id,
    originalUrl: doc.originalUrl,
    shortCode: doc.shortCode,
    clicks: doc.clicks,
    clickHistory: doc.clickHistory,
    isActive: doc.isActive,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
  };
}

function createUrl({ originalUrl, shortCode }) {
  // Defense in depth: mirror the canonical code constraint so the in-memory
  // store can never create an unroutable link, even if called directly. The
  // error is shaped like a Mongoose ValidationError so the API maps it to a
  // consistent 400 (matching Mongo-mode behavior). Thrown synchronously so
  // callers see the same failure regardless of store backend.
  if (!isValidCode(shortCode)) {
    const err = new Error(CODE_CONSTRAINT_MESSAGE);
    err.name = "ValidationError";
    throw err;
  }
  if (idByCode.has(shortCode)) {
    const err = new Error("Duplicate shortCode");
    err.code = 11000;
    throw err;
  }
  const _id = newId();
  const now = new Date();
  const doc = {
    _id,
    originalUrl,
    shortCode,
    clicks: 0,
    clickHistory: [],
    isActive: true,
    expiresAt: null,
    createdAt: now,
  };
  urlsById.set(_id, doc);
  idByCode.set(shortCode, _id);
  return toLean(doc);
}

async function findByShortCode(code) {
  const id = idByCode.get(code);
  if (!id) return null;
  const doc = urlsById.get(id);
  if (!doc || !doc.isActive) return null;
  return toLean(doc);
}

async function findById(id) {
  const doc = urlsById.get(String(id));
  if (!doc) return null;
  return toLean(doc);
}

async function listActive(limit) {
  return [...urlsById.values()]
    .filter((u) => u.isActive)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map((u) => ({
      _id: u._id,
      originalUrl: u.originalUrl,
      shortCode: u.shortCode,
      clicks: u.clicks,
      isActive: u.isActive,
      expiresAt: u.expiresAt,
      createdAt: u.createdAt,
    }));
}

async function softDelete(id) {
  const doc = urlsById.get(String(id));
  if (!doc) return null;
  doc.isActive = false;
  return toLean(doc);
}

async function recordClick(id, { referrer, userAgent }) {
  const doc = urlsById.get(String(id));
  if (!doc) return;
  doc.clicks += 1;
  doc.clickHistory.push({
    timestamp: new Date(),
    referrer: referrer || "direct",
    userAgent: userAgent || "",
  });
}

module.exports = {
  createUrl,
  findByShortCode,
  findById,
  listActive,
  softDelete,
  recordClick,
};
