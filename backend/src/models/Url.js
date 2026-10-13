const mongoose = require("mongoose");
const { CODE_PATTERN, CODE_CONSTRAINT_MESSAGE } = require("../utils/code");

const clickSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  referrer: { type: String, default: "direct" },
  userAgent: { type: String, default: "" },
});

const urlSchema = new mongoose.Schema(
  {
    originalUrl: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: { type: String, index: true },
    shortCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 4,
      maxlength: 12,
      // Charset + length mirror the canonical constraint (single source of
      // truth in utils/code.js). No widening of the 4–12 range.
      match: [CODE_PATTERN, CODE_CONSTRAINT_MESSAGE],
    },
    clicks: {
      type: Number,
      default: 0,
    },
    clickHistory: [clickSchema],
    dailyClicks: { type: [{ date: String, clicks: Number, _id: false }], default: undefined },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// shortCode already has a unique index; only add secondary indexes here
urlSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Url", urlSchema);
