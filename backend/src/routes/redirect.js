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

    // HEAD probes should not count as visits. Analytics failure must not break links.
    if (req.method !== "HEAD") {
      try { await store.recordClick(url._id); }
      catch (err) { console.error("Click recording failed:", err.name); }
    }

    res.set("Cache-Control", "no-store").redirect(302, url.originalUrl);
  } catch (err) {
    console.error("GET /:code redirect", "Request failed; database details withheld");
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
