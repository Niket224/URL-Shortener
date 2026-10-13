const Url = require("../models/Url");

function toLean(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    _id: o._id,
    originalUrl: o.originalUrl,
    ownerId: o.ownerId,
    shortCode: o.shortCode,
    clicks: o.clicks,
    clickHistory: o.clickHistory || [],
    dailyClicks: o.dailyClicks,
    isActive: o.isActive,
    expiresAt: o.expiresAt,
    createdAt: o.createdAt,
  };
}

async function createUrl({ originalUrl, shortCode, expiresAt = null, ownerId }) {
  const url = await Url.create({ originalUrl, shortCode, expiresAt, ownerId, dailyClicks: [] });
  return toLean(url);
}

async function findByShortCode(code) {
  const u = await Url.findOne({ shortCode: code, isActive: true }).lean();
  return u ? toLean(u) : null;
}

async function findById(id) {
  const u = await Url.findById(id).lean();
  return u ? toLean(u) : null;
}

async function listActive(limit, offset = 0, ownerId) {
  const rows = await Url.find({ isActive: true, ...(ownerId ? { ownerId } : {}) })
    .sort({ createdAt: -1, _id: -1 })
    .skip(offset)
    .limit(limit)
    .select("-clickHistory")
    .lean();
  return rows.map((u) => toLean(u));
}

async function softDelete(id, ownerId) {
  const url = await Url.findOneAndUpdate({ _id: id, ...(ownerId ? { ownerId } : {}) }, { isActive: false }, { new: true }).lean();
  return url ? toLean(url) : null;
}

async function recordClick(id) {
  const { recentDays } = require("../utils/analytics");
  const days = recentDays();
  // Non-destructive, atomic daily totals. Raw legacy events are never rewritten.
  const legacyCount = date => ({ $size: { $filter: {
    input: { $ifNull: ["$clickHistory", []] }, as: "click",
    cond: { $eq: [{ $dateToString: { format: "%Y-%m-%d", date: "$$click.timestamp", timezone: "UTC" } }, date] },
  } } });
  await Url.findByIdAndUpdate(id, [
    { $set: {
      clicks: { $add: ["$clicks", 1] },
      dailyClicks: days.map(date => ({ date, clicks: { $add: [
        { $let: {
          vars: { buckets: { $filter: { input: { $ifNull: ["$dailyClicks", []] }, as: "day", cond: { $eq: ["$$day.date", date] } } } },
          in: { $cond: [
            { $gt: [{ $size: "$$buckets" }, 0] },
            { $sum: { $map: { input: "$$buckets", as: "day", in: "$$day.clicks" } } },
            legacyCount(date),
          ] },
        } },
        date === days[6] ? 1 : 0,
      ] } })),
    } },
  ]);
}

async function updateUrl(id, changes, ownerId) {
  return toLean(await Url.findOneAndUpdate({ _id: id, isActive: true, ...(ownerId ? { ownerId } : {}) }, { $set: changes }, { new: true, runValidators: true }).lean());
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
