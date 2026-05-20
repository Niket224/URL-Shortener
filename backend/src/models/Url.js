const mongoose = require("mongoose");

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
    shortCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 4,
      maxlength: 12,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    clickHistory: [clickSchema],
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
