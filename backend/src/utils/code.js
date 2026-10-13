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
 * Render serves all short-code redirects through Express; Vercel hosts only
 * the frontend. The API and both stores share this validation rule.
 */

// Canonical pattern for a valid short code. Anchored so it matches the whole
// string. Keep the API and both storage adapters aligned.
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
