import { describe, expect, test } from "bun:test";
import { version } from "../package.json";
import { EXIT_OK, EXIT_USAGE, type Io, run } from "./cli.ts";

function capture(): Io & { out: string; err: string } {
  const io = {
    out: "",
    err: "",
    stdout(text: string) {
      io.out += text;
    },
    stderr(text: string) {
      io.err += text;
    },
  };
  return io;
}

describe("run", () => {
  test("--version prints the package version", () => {
    const io = capture();
    expect(run(["--version"], io)).toBe(EXIT_OK);
    expect(io.out).toBe(`${version}\n`);
    expect(io.err).toBe("");
  });

  test("-v is an alias for --version", () => {
    const io = capture();
    expect(run(["-v"], io)).toBe(EXIT_OK);
    expect(io.out).toBe(`${version}\n`);
  });

  test("--help prints usage and succeeds", () => {
    const io = capture();
    expect(run(["--help"], io)).toBe(EXIT_OK);
    expect(io.out).toContain("Usage: dld");
  });

  test("no arguments prints usage and exits with a usage error", () => {
    const io = capture();
    expect(run([], io)).toBe(EXIT_USAGE);
    expect(io.out).toContain("Usage: dld");
  });

  test("an unknown command is reported on stderr", () => {
    const io = capture();
    expect(run(["frobnicate"], io)).toBe(EXIT_USAGE);
    expect(io.out).toBe("");
    expect(io.err).toContain("unknown command or option 'frobnicate'");
  });
});
