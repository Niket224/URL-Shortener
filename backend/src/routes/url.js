const express = require("express");
const router = express.Router();
const { nanoid } = require("nanoid");
const { getStore } = require("../store");
const { isValidCode, CODE_CONSTRAINT_MESSAGE } = require("../utils/code");

const { baseUrl } = require("../config");
const { validateDestination, parseExpiry } = require("../utils/validation");
const { recentDays, dailyCounts } = require("../utils/analytics");

router.param("id", (req, res, next, id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) return res.status(400).json({ error: "Invalid URL id" });
  next();
});

// POST /api/urls — shorten a URL
router.post("/", async (req, res) => {
  try {
    const { originalUrl, customCode } = req.body || {};
    const store = getStore();

    if (!originalUrl) {
      return res.status(400).json({ error: "originalUrl is required" });
    }

    if (!validateDestination(originalUrl)) {
      return res.status(400).json({ error: "Invalid URL format" });
    }
    let expiresAt;
    try { expiresAt = parseExpiry(req.body.expiresAt); }
    catch (err) { return res.status(400).json({ error: err.message }); }
    if (customCode !== undefined && typeof customCode !== "string") {
      return res.status(400).json({ error: CODE_CONSTRAINT_MESSAGE });
    }

    const trimmedCustom = typeof customCode === "string" ? customCode.trim() : "";
    let shortCode = trimmedCustom || nanoid(6);

    if (trimmedCustom) {
      if (!isValidCode(trimmedCustom)) {
        return res.status(400).json({
          error: CODE_CONSTRAINT_MESSAGE,
        });
      }
      const existing = await store.findByShortCode(shortCode);
      if (existing) {
        return res.status(409).json({ error: "Custom code already taken" });
      }
    }

    let url;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        url = await store.createUrl({ originalUrl: originalUrl.trim(), shortCode, expiresAt, ownerId: req.userId });
        break;
      } catch (err) {
        if (err.code !== 11000 || trimmedCustom) throw err;
        shortCode = nanoid(6);
      }
    }
    if (!url) return res.status(503).json({ error: "Could not allocate a short code. Please retry." });

    res.status(201).json({
      _id: url._id,
      originalUrl: url.originalUrl,
      shortCode: url.shortCode,
      shortUrl: `${baseUrl()}/${url.shortCode}`,
      clicks: url.clicks,
      createdAt: url.createdAt,
      expiresAt: url.expiresAt,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Short code conflict, please try again" });
    }
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: CODE_CONSTRAINT_MESSAGE });
    }
    console.error("POST /api/urls", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/urls — list all URLs
router.get("/", async (req, res) => {
  try {
    const store = getStore();
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 50);
    if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ error: "Invalid pagination: page >= 1, limit between 1 and 100" });
    }
    const rows = await store.listActive(limit + 1, (page - 1) * limit, req.userId);
    res.set("X-Has-More", String(rows.length > limit));
    const urls = rows.slice(0, limit);

    res.json(
      urls.map((u) => ({
        _id: u._id,
        originalUrl: u.originalUrl,
        shortCode: u.shortCode,
        shortUrl: `${baseUrl()}/${u.shortCode}`,
        clicks: u.clicks,
        createdAt: u.createdAt,
        expiresAt: u.expiresAt,
      }))
    );
  } catch (err) {
    console.error("GET /api/urls", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/urls/:id/stats — click analytics
router.get("/:id/stats", async (req, res) => {
  try {
    const store = getStore();
    const url = await store.findById(req.params.id);
    if (!url || (req.userId && url.ownerId !== req.userId)) return res.status(404).json({ error: "URL not found" });

    if (!url.isActive) return res.status(404).json({ error: "URL not found" });
    const days = recentDays();
    const counts = dailyCounts(url);
    const clicksByDay = days.map((day) => ({
      date: day,
      clicks: counts.find(c => c.date === day)?.clicks || 0,
    }));

    res.json({
      _id: url._id,
      originalUrl: url.originalUrl,
      shortCode: url.shortCode,
      shortUrl: `${baseUrl()}/${url.shortCode}`,
      totalClicks: url.clicks,
      clicksByDay,
      createdAt: url.createdAt,
      expiresAt: url.expiresAt,
    });
  } catch (err) {
    console.error("GET /api/urls/:id/stats", err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/urls/:id — delete a URL
router.delete("/:id", async (req, res) => {
  try {
    const store = getStore();
    const url = await store.softDelete(req.params.id, req.userId);
    if (!url) return res.status(404).json({ error: "URL not found" });
    res.json({ message: "URL deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/urls/:id", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const changes = {};
    if (req.body?.originalUrl !== undefined) {
      if (!validateDestination(req.body.originalUrl)) return res.status(400).json({ error: "Invalid URL format" });
      changes.originalUrl = req.body.originalUrl.trim();
    }
    if (req.body?.expiresAt !== undefined) {
      try { changes.expiresAt = parseExpiry(req.body.expiresAt); }
      catch (err) { return res.status(400).json({ error: err.message }); }
    }
    if (!Object.keys(changes).length) return res.status(400).json({ error: "No supported changes" });
    const url = await getStore().updateUrl(req.params.id, changes, req.userId);
    if (!url) return res.status(404).json({ error: "URL not found" });
    res.json({ _id: url._id, originalUrl: url.originalUrl, shortCode: url.shortCode,
      shortUrl: `${baseUrl()}/${url.shortCode}`, clicks: url.clicks, expiresAt: url.expiresAt, createdAt: url.createdAt });
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

module.exports = router;
