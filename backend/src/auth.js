const crypto = require("crypto");
const { promisify } = require("util");
const mongoose = require("mongoose");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { getStoreMode } = require("./store");
const scrypt = promisify(crypto.scrypt);
const users = new Map();
const sessions = new Map();
const User = mongoose.model("User", new mongoose.Schema({
  email: { type: String, unique: true, required: true }, salt: String, hash: String,
}));
const Session = mongoose.model("Session", new mongoose.Schema({
  digest: { type: String, unique: true }, userId: String,
  expiresAt: { type: Date, index: { expires: 0 } },
}));
const authMode = process.env.AUTH_MODE || "accounts";
if (!["accounts", "public"].includes(authMode)) throw new Error("AUTH_MODE must be accounts or public");
const isPublic = () => authMode === "public";
const digest = token => crypto.createHash("sha256").update(token).digest("hex");
const router = express.Router();

async function findUser(email) {
  return getStoreMode() === "mongo" ? User.findOne({ email }).lean() : users.get(email);
}

async function identify(req) {
  const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return null;
  const key = digest(token);
  const session = getStoreMode() === "mongo" ? await Session.findOne({ digest: key }).lean() : sessions.get(key);
  if (!session || new Date(session.expiresAt) <= new Date()) { sessions.delete(key); return null; }
  return session.userId;
}

async function requireUser(req, res, next) {
  if (isPublic()) return next();
  try {
    req.userId = await identify(req);
    if (!req.userId) return res.status(401).json({ error: "Please sign in" });
    next();
  } catch { res.status(503).json({ error: "Authentication is temporarily unavailable" }); }
}

router.get("/mode", (req, res) => res.json({ mode: authMode }));
if (process.env.NODE_ENV !== "test") router.use(rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: "Too many sign-in attempts. Try again later." },
}));
router.post(["/register", "/login"], async (req, res) => {
  if (isPublic()) return res.status(400).json({ error: "Accounts are disabled in public demo mode" });
  const { email, password } = req.body || {};
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== "string" || password.length < 12 || password.length > 128) {
    return res.status(400).json({ error: "Enter a valid email and a password of 12–128 characters" });
  }
  try {
    const normalized = email.trim().toLowerCase();
    let user = await findUser(normalized);
    if (req.path === "/register") {
      if (user) return res.status(409).json({ error: "Account already exists" });
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = (await scrypt(password, salt, 64)).toString("hex");
      if (getStoreMode() === "mongo") user = await User.create({ email: normalized, salt, hash });
      else {
        // Recheck after asynchronous hashing so concurrent registrations cannot overwrite.
        if (users.has(normalized)) return res.status(409).json({ error: "Account already exists" });
        user = { _id: crypto.randomBytes(12).toString("hex"), email: normalized, salt, hash };
        users.set(normalized, user);
      }
    } else {
      const hash = await scrypt(password, user?.salt || "missing-user", 64);
      if (!user || !crypto.timingSafeEqual(hash, Buffer.from(user.hash, "hex"))) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
    }
    const token = crypto.randomBytes(32).toString("hex");
    const session = { digest: digest(token), userId: String(user._id), expiresAt: new Date(Date.now() + 86400000) };
    if (getStoreMode() === "mongo") await Session.create(session);
    else {
      for (const [key, value] of sessions) if (value.expiresAt <= new Date()) sessions.delete(key);
      sessions.set(session.digest, session);
    }
    res.set("Cache-Control", "no-store").status(req.path === "/register" ? 201 : 200).json({ token, email: user.email });
  } catch (err) {
    res.status(err.code === 11000 ? 409 : 500).json({ error: err.code === 11000 ? "Account already exists" : "Authentication failed" });
  }
});
router.post("/logout", async (req, res) => {
  try {
    const token = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (token) {
      if (getStoreMode() === "mongo") await Session.deleteOne({ digest: digest(token) });
      else sessions.delete(digest(token));
    }
    res.sendStatus(204);
  } catch { res.status(503).json({ error: "Sign out failed. Try again." }); }
});

module.exports = { router, requireUser, isPublic, User, Session };
