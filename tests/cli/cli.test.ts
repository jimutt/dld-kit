// @decision(DL-004)
// Runs the built bundle under node; build first with `npm run build`.
import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { version } from "../../package.json";

const BIN = resolve(import.meta.dirname, "../../dist/dld.mjs");

const WORKDIR = mkdtempSync(join(tmpdir(), "dld-cli-"));
afterAll(() => rmSync(WORKDIR, { recursive: true, force: true }));

function dld(...args: string[]) {
  const result = spawnSync("node", [BIN, ...args], { cwd: WORKDIR, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

describe("dld (built, under node)", () => {
  test("--version matches package.json", () => {
    const result = dld("--version");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${version}\n`);
  });

  test("--help prints usage", () => {
    const result = dld("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: dld");
  });

  test("unknown command exits 2 with a message on stderr", () => {
    const result = dld("frobnicate");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown command or option 'frobnicate'");
  });
});
