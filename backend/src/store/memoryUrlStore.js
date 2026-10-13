const crypto = require("crypto");
const { recentDays, dailyCounts } = require("../utils/analytics");
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
    ownerId: doc.ownerId,
    shortCode: doc.shortCode,
    clicks: doc.clicks,
    clickHistory: doc.clickHistory,
    dailyClicks: doc.dailyClicks,
    isActive: doc.isActive,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
  };
}

function createUrl({ originalUrl, shortCode, expiresAt = null, ownerId }) {
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
    ownerId,
    originalUrl,
    shortCode,
    clicks: 0,
    clickHistory: [],
    isActive: true,
    expiresAt,
    dailyClicks: [],
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

async function listActive(limit, offset = 0, ownerId) {
  return [...urlsById.values()]
    .filter((u) => u.isActive && (!ownerId || u.ownerId === ownerId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(offset, offset + limit)
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

async function softDelete(id, ownerId) {
  const doc = urlsById.get(String(id));
  if (!doc) return null;
  if (ownerId && doc.ownerId !== ownerId) return null;
  doc.isActive = false;
  return toLean(doc);
}

async function recordClick(id) {
  const doc = urlsById.get(String(id));
  if (!doc) return;
  doc.clicks += 1;
  const days = recentDays();
  doc.dailyClicks = dailyCounts(doc).filter(c => days.includes(c.date));
  const today = doc.dailyClicks.find(c => c.date === days[6]);
  if (today) today.clicks++;
  else doc.dailyClicks.push({ date: days[6], clicks: 1 });
  // Legacy raw events are immutable; new clicks only update daily totals.
}

async function updateUrl(id, changes, ownerId) {
  const doc = urlsById.get(String(id));
  if (!doc || !doc.isActive) return null;
  if (ownerId && doc.ownerId !== ownerId) return null;
  Object.assign(doc, changes);
  return toLean(doc);
}

module.exports = {
  createUrl,
  findByShortCode,
  findById,
  listActive,
  softDelete,
  recordClick,
  updateUrl,
};
