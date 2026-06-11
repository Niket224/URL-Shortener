/**
 * Canonical short-code constraint — single source of truth.
 *
 * A valid short code is 4–12 characters long and may contain only ASCII
 * letters, digits, hyphens, and underscores.
 *
 * This is the ONE place the rule is defined. It must be referenced by:
 *   - the API validation in `routes/url.js` (POST /api/urls)
 *   - the in-memory store in `store/memoryUrlStore.js`
 *   - the Mongo schema `match` validator in `models/Url.js`
 *
 * IMPORTANT: `vercel.json`'s route pattern `^/([a-zA-Z0-9_-]{4,12})$` MUST be
 * kept in sync with this constraint. `vercel.json` cannot import this module
 * (it is static JSON consumed by the Vercel build), so any change to the
 * pattern below must be mirrored there by hand. Keeping them aligned is what
 * guarantees every accepted code is routable to the redirect handler.
 */

// Canonical pattern for a valid short code. Anchored so it matches the whole
// string. Do not change without mirroring the update in vercel.json.
const CODE_PATTERN = /^[a-zA-Z0-9_-]{4,12}$/;

// Human-readable message returned to clients when a code violates the rule.
const CODE_CONSTRAINT_MESSAGE =
  "Custom code must be 4–12 characters and contain only letters, numbers, hyphens, and underscores";

/**
 * Returns true when `code` satisfies the canonical short-code constraint.
 *
 * @param {unknown} code - The candidate short code.
 * @returns {boolean} `true` if `code` is a string matching `CODE_PATTERN`.
 */
function isValidCode(code) {
  return typeof code === "string" && CODE_PATTERN.test(code);
}

module.exports = {
  CODE_PATTERN,
  CODE_CONSTRAINT_MESSAGE,
  isValidCode,
};
