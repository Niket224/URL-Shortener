const Url = require("../models/Url");

function toLean(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    _id: o._id,
    originalUrl: o.originalUrl,
    shortCode: o.shortCode,
    clicks: o.clicks,
    clickHistory: o.clickHistory || [],
    isActive: o.isActive,
    expiresAt: o.expiresAt,
    createdAt: o.createdAt,
  };
}

async function createUrl({ originalUrl, shortCode }) {
  const url = await Url.create({ originalUrl, shortCode });
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

async function listActive(limit) {
  const rows = await Url.find({ isActive: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("-clickHistory")
    .lean();
  return rows.map((u) => toLean(u));
}

async function softDelete(id) {
  const url = await Url.findByIdAndUpdate(id, { isActive: false }, { new: true }).lean();
  return url ? toLean(url) : null;
}

async function recordClick(id, { referrer, userAgent }) {
  await Url.findByIdAndUpdate(id, {
    $inc: { clicks: 1 },
    $push: {
      clickHistory: {
        timestamp: new Date(),
        referrer: referrer || "direct",
        userAgent: userAgent || "",
      },
    },
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
