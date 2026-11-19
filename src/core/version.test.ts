import { describe, expect, test } from "bun:test";
import { parseVersion, satisfiesMinimum, tooOldMessage } from "./version.ts";

// @decision(DL-098)
describe("versions", () => {
  test("parses a plain three-part version and nothing else", () => {
    expect(parseVersion("1.10.0")).toEqual([1, 10, 0]);
    for (const text of ["1.1", "v1.1.0", "1.1.0-rc.1", "1.01.0", "1.1.0 ", "latest", ""]) {
      expect(parseVersion(text)).toBeUndefined();
    }
  });

  test("compares major, minor and patch as numbers", () => {
    expect(satisfiesMinimum("1.1.0", "1.1.0")).toBe(true);
    expect(satisfiesMinimum("1.10.0", "1.9.3")).toBe(true);
    expect(satisfiesMinimum("2.0.0", "1.99.99")).toBe(true);
    expect(satisfiesMinimum("1.1.1", "1.1.0")).toBe(true);
    expect(satisfiesMinimum("1.0.9", "1.1.0")).toBe(false);
    expect(satisfiesMinimum("1.1.0", "1.1.1")).toBe(false);
    expect(satisfiesMinimum("1.9.9", "2.0.0")).toBe(false);
  });

  test("a pre-release counts as its base version, and an unreadable version as too old", () => {
    expect(satisfiesMinimum("1.2.0-rc.1", "1.2.0")).toBe(true);
    expect(satisfiesMinimum("1.2.0+build.5", "1.2.0")).toBe(true);
    expect(satisfiesMinimum("1.1.9-rc.1", "1.2.0")).toBe(false);
    expect(satisfiesMinimum("dev", "1.0.0")).toBe(false);
    expect(satisfiesMinimum("1.0.0", "soon")).toBe(false);
  });

  test("the message names both versions and how to update", () => {
    expect(tooOldMessage("1.1.0", "1.3.0")).toBe(
      "this project needs dld 1.3.0 or newer; this is dld 1.1.0. Update dld-kit (npx dld-kit@latest update, or your plugin manager) and try again.",
    );
  });
});
