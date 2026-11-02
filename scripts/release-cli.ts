// Entry point for .github/workflows/release.yml: bun scripts/release-cli.ts info | notes <version>
import { existsSync, readFileSync } from "node:fs";
import { releaseInfo, releaseNotes } from "./release.ts";

const [command, argument] = process.argv.slice(2);
if (command === "info") {
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  const info = releaseInfo(version);
  console.log(`version=${info.version}\ndist-tag=${info.distTag}\nprerelease=${info.prerelease}`);
} else if (command === "notes" && argument !== undefined) {
  const changelog = existsSync("CHANGELOG.md") ? readFileSync("CHANGELOG.md", "utf8") : "";
  process.stdout.write(releaseNotes(changelog, argument));
} else {
  console.error("Usage: bun scripts/release-cli.ts info | notes <version>");
  process.exit(2);
}
