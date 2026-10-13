function validateDestination(value) {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function parseExpiry(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("expiresAt must be a future date");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date <= new Date()) throw new Error("expiresAt must be a future date");
  return date;
}

module.exports = { validateDestination, parseExpiry };
