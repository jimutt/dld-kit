// Release helpers for .github/workflows/release.yml. Not part of the CLI bundle.
export interface ReleaseInfo {
  version: string;
  /** The npm dist-tag to publish under. */
  distTag: "latest" | "next";
  /** Whether the GitHub release is a prerelease (and not marked latest). */
  prerelease: boolean;
}

// @decision(DL-081) @decision(DL-062)
/**
 * Where a version is published. Until 1.0.0, each candidate (`1.0.0-*`) is the default install:
 * npm `latest` and the latest GitHub release. After that, prereleases go to `next`.
 */
export function releaseInfo(version: string): ReleaseInfo {
  const isPrerelease = version.includes("-");
  if (!isPrerelease) return { version, distTag: "latest", prerelease: false };
  if (version.startsWith("1.0.0-")) return { version, distTag: "latest", prerelease: false };
  return { version, distTag: "next", prerelease: true };
}

// @decision(DL-081)
/** The body of `## <version>` in a Changesets CHANGELOG.md, or "" when there is none. */
export function releaseNotes(changelog: string, version: string): string {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return `${(end === -1 ? rest : rest.slice(0, end)).join("\n").trim()}\n`.replace(/^\n$/, "");
}
