const fc = require("fast-check");
const { isValidCode, CODE_PATTERN, CODE_CONSTRAINT_MESSAGE } = require("./code");

describe("canonical code constraint (isValidCode)", () => {
  describe("unit examples", () => {
    test("accepts in-range codes", () => {
      expect(isValidCode("promo")).toBe(true); // 5 chars
      expect(isValidCode("AbC123")).toBe(true); // mixed case + digits
      expect(isValidCode("a-b_c")).toBe(true); // hyphen + underscore
    });

    test("accepts boundary lengths 4 and 12", () => {
      expect(isValidCode("abcd")).toBe(true); // exactly 4
      expect(isValidCode("abcdefghijkl")).toBe(true); // exactly 12
    });

    test("rejects too-short codes (< 4)", () => {
      expect(isValidCode("go")).toBe(false); // 2 chars
      expect(isValidCode("abc")).toBe(false); // 3 chars
      expect(isValidCode("")).toBe(false); // empty
    });

    test("rejects too-long codes (> 12)", () => {
      expect(isValidCode("abcdefghijklm")).toBe(false); // 13 chars
      expect(isValidCode("my-really-long-custom-code")).toBe(false);
    });

    test("rejects disallowed characters", () => {
      expect(isValidCode("ab cd")).toBe(false); // space
      expect(isValidCode("a.b.c")).toBe(false); // dots
      expect(isValidCode("a/b/c")).toBe(false); // slashes
      expect(isValidCode("café1")).toBe(false); // non-ASCII
    });

    test("rejects non-string inputs", () => {
      expect(isValidCode(undefined)).toBe(false);
      expect(isValidCode(null)).toBe(false);
      expect(isValidCode(12345)).toBe(false);
      expect(isValidCode({})).toBe(false);
    });

    test("exposes the canonical pattern and a clear message", () => {
      expect(CODE_PATTERN.source).toBe("^[a-zA-Z0-9_-]{4,12}$");
      expect(typeof CODE_CONSTRAINT_MESSAGE).toBe("string");
      expect(CODE_CONSTRAINT_MESSAGE.length).toBeGreaterThan(0);
    });
  });

  describe("property: isValidCode matches /^[a-zA-Z0-9_-]{4,12}$/", () => {
    test("accepts all in-range codes from the allowed charset", () => {
      fc.assert(
        fc.property(
          fc.stringOf(
            fc.constantFrom(
              ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split("")
            ),
            { minLength: 4, maxLength: 12 }
          ),
          (code) => {
            expect(isValidCode(code)).toBe(true);
          }
        )
      );
    });

    test("rejects codes shorter than 4 from the allowed charset", () => {
      fc.assert(
        fc.property(
          fc.stringOf(
            fc.constantFrom(..."abcABC012_-".split("")),
            { minLength: 0, maxLength: 3 }
          ),
          (code) => {
            expect(isValidCode(code)).toBe(false);
          }
        )
      );
    });

    test("rejects codes longer than 12 from the allowed charset", () => {
      fc.assert(
        fc.property(
          fc.stringOf(
            fc.constantFrom(..."abcABC012_-".split("")),
            { minLength: 13, maxLength: 30 }
          ),
          (code) => {
            expect(isValidCode(code)).toBe(false);
          }
        )
      );
    });
  });
});
