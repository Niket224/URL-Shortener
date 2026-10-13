const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");

function validateTestUris(normalUri, testUri) {
  if (!normalUri || !testUri) throw new Error("Both MongoDB environment settings are required");
  try {
    const normal = new MongoClient(normalUri);
    const test = new MongoClient(testUri);
    const explicit = value => Boolean(new URL(value).pathname.slice(1));
    if (!explicit(normalUri) || !explicit(testUri) || test.db().databaseName !== "snip_test" ||
        normal.db().databaseName === test.db().databaseName) throw new Error();
    return testUri;
  } catch { throw new Error("Unsafe test configuration: require an explicit snip_test database distinct from the normal database"); }
}

function loadAtlasTestUri() {
  const file = path.resolve(__dirname, "../.env");
  const local = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  return validateTestUris(process.env.MONGODB_URI || local.MONGODB_URI, process.env.TEST_MONGODB_URI || local.TEST_MONGODB_URI);
}
module.exports = { validateTestUris, loadAtlasTestUri };
