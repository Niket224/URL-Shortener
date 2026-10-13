const { validateTestUris } = require("./atlasConfig");
test("rejects normal, missing, implicit, and same database test targets", () => {
  for (const testUri of [undefined, "mongodb://localhost/snip", "mongodb://localhost/", "mongodb://localhost/other"]) {
    expect(() => validateTestUris("mongodb://localhost/snip", testUri)).toThrow();
  }
  expect(() => validateTestUris("mongodb://localhost/snip_test", "mongodb://localhost/snip_test")).toThrow();
});
test("accepts only explicit isolated snip_test", () => {
  expect(validateTestUris("mongodb://localhost/snip", "mongodb://localhost/snip_test")).toBe("mongodb://localhost/snip_test");
});
test("storage refuses the normal database before opening a connection in test mode", async () => {
  const saved = process.env.MONGODB_URI;
  process.env.MONGODB_URI = "mongodb://localhost/snip";
  try { await expect(require("../src/store").initStore()).rejects.toThrow("Test mode refuses"); }
  finally { if (saved === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = saved; }
});
