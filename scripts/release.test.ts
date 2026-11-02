import { describe, expect, test } from "bun:test";
import { releaseInfo, releaseNotes } from "./release.ts";

// @decision(DL-081) @decision(DL-062)
describe("releaseInfo", () => {
  test("1.0.0 candidates are the default install; later prereleases go to next", () => {
    expect(releaseInfo("1.0.0-rc.6")).toEqual({
      version: "1.0.0-rc.6",
      distTag: "latest",
      prerelease: false,
    });
    expect(releaseInfo("1.0.0")).toEqual({
      version: "1.0.0",
      distTag: "latest",
      prerelease: false,
    });
    expect(releaseInfo("1.2.3")).toEqual({
      version: "1.2.3",
      distTag: "latest",
      prerelease: false,
    });
    expect(releaseInfo("1.1.0-rc.0")).toEqual({
      version: "1.1.0-rc.0",
      distTag: "next",
      prerelease: true,
    });
  });
});

describe("releaseNotes", () => {
  const changelog = `# dld-kit

## 1.0.0-rc.7

### Patch Changes

- Second fix

## 1.0.0-rc.6

### Minor Changes

- First change
`;

  test("returns one version's section, up to the next version", () => {
    expect(releaseNotes(changelog, "1.0.0-rc.7")).toBe("### Patch Changes\n\n- Second fix\n");
    expect(releaseNotes(changelog, "1.0.0-rc.6")).toBe("### Minor Changes\n\n- First change\n");
    expect(releaseNotes(changelog.replace(/\n/g, "\r\n"), "1.0.0-rc.6")).toBe(
      "### Minor Changes\n\n- First change\n",
    );
  });

  test("is empty for a version without a section, or an empty one", () => {
    expect(releaseNotes(changelog, "1.0.0-rc.5")).toBe("");
    expect(releaseNotes("## 1.0.0\n\n## 0.9.0\n- x\n", "1.0.0")).toBe("");
    expect(releaseNotes("", "1.0.0")).toBe("");
  });
});
