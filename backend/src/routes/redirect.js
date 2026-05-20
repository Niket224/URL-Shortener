const express = require("express");
const router = express.Router();
const { getStore } = require("../store");

// GET /:code — redirect to original URL
router.get("/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const store = getStore();

    // Single-segment paths like /favicon.ico (not used by /api/* which is registered first)
    if (code === "favicon.ico") {
      return res.status(404).end();
    }

    const url = await store.findByShortCode(code);

    if (!url) {
      return res.status(404).json({ error: "Short URL not found or has been deleted" });
    }

    if (url.expiresAt && new Date(url.expiresAt) < new Date()) {
      return res.status(410).json({ error: "This short URL has expired" });
    }

    await store.recordClick(url._id, {
      referrer: req.headers.referer || "direct",
      userAgent: req.headers["user-agent"] || "",
    });

    res.redirect(301, url.originalUrl);
  } catch (err) {
    console.error("GET /:code redirect", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
