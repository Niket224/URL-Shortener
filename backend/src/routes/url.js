const express = require("express");
const router = express.Router();
const { nanoid } = require("nanoid");
const { getStore } = require("../store");

function baseUrl() {
  return process.env.BASE_URL || `http://localhost:${process.env.PORT || 5001}`;
}

// POST /api/urls — shorten a URL
router.post("/", async (req, res) => {
  try {
    const { originalUrl, customCode } = req.body;
    const store = getStore();

    if (!originalUrl) {
      return res.status(400).json({ error: "originalUrl is required" });
    }

    try {
      new URL(originalUrl);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    const trimmedCustom = typeof customCode === "string" ? customCode.trim() : "";
    const shortCode = trimmedCustom || nanoid(6);

    if (trimmedCustom) {
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedCustom)) {
        return res.status(400).json({
          error: "Custom code can only contain letters, numbers, hyphens, and underscores",
        });
      }
      const existing = await store.findByShortCode(shortCode);
      if (existing) {
        return res.status(409).json({ error: "Custom code already taken" });
      }
    }

    const url = await store.createUrl({ originalUrl, shortCode });

    res.status(201).json({
      _id: url._id,
      originalUrl: url.originalUrl,
      shortCode: url.shortCode,
      shortUrl: `${baseUrl()}/${url.shortCode}`,
      clicks: url.clicks,
      createdAt: url.createdAt,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Short code conflict, please try again" });
    }
    console.error("POST /api/urls", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/urls — list all URLs
router.get("/", async (req, res) => {
  try {
    const store = getStore();
    const urls = await store.listActive(50);

    res.json(
      urls.map((u) => ({
        _id: u._id,
        originalUrl: u.originalUrl,
        shortCode: u.shortCode,
        shortUrl: `${baseUrl()}/${u.shortCode}`,
        clicks: u.clicks,
        createdAt: u.createdAt,
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
    if (!url) return res.status(404).json({ error: "URL not found" });

    const now = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split("T")[0];
    });

    const history = url.clickHistory || [];
    const clicksByDay = days.map((day) => ({
      date: day,
      clicks: history.filter((c) => new Date(c.timestamp).toISOString().split("T")[0] === day).length,
    }));

    res.json({
      _id: url._id,
      originalUrl: url.originalUrl,
      shortCode: url.shortCode,
      shortUrl: `${baseUrl()}/${url.shortCode}`,
      totalClicks: url.clicks,
      clicksByDay,
      createdAt: url.createdAt,
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
    const url = await store.softDelete(req.params.id);
    if (!url) return res.status(404).json({ error: "URL not found" });
    res.json({ message: "URL deleted successfully" });
  } catch (err) {
    console.error("DELETE /api/urls/:id", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
