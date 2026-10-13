// Opt-in runner. Never print errors from the driver: they may include credentials.
process.env.NODE_ENV = "test";
process.env.SNIP_TEST_TARGET = "atlas";
try {
  require("./atlasConfig").loadAtlasTestUri();
  require("jest").run(["--runInBand", "--runTestsByPath", "tests/mongo.test.js"]);
} catch { console.error("Atlas test configuration rejected; check database isolation privately."); process.exitCode = 1; }
