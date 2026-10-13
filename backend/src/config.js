function getOrigin(name, fallback) {
  const value = process.env[name]?.trim();
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`${name} is required in production`);
    }
    return fallback;
  }
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) throw new Error();
    return url.origin;
  } catch {
    throw new Error(`${name} must be an HTTP(S) origin without a path or credentials`);
  }
}

const baseUrl = () => getOrigin('BASE_URL', `http://localhost:${process.env.PORT || 5001}`);
const frontendUrl = () => getOrigin('FRONTEND_URL', 'http://localhost:5173');

module.exports = { baseUrl, frontendUrl };
