// Shared fixtures for unit tests. Not part of the CLI bundle.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Io } from "./cli/command.ts";
import type { Context, DirEntry, FileSystem } from "./core/context.ts";
import { createNodeContext } from "./node-context.ts";

export const FLAT_CONFIG = "decisions_dir: decisions\nmode: flat\nannotation_prefix: '@decision'\n";

export interface TempProject {
  root: string;
  ctx: Context;
  write(path: string, content?: string): void;
  cleanup(): void;
}

/** A temporary git repository with a flat dld.config.yaml, like the bats fixtures. */
export function tempProject(config: string | null = FLAT_CONFIG): TempProject {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dld-unit-")));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "--quiet");
  git(
    "-c",
    "user.email=test@test.com",
    "-c",
    "user.name=Test",
    "commit",
    "--allow-empty",
    "-m",
    "init",
    "--quiet",
  );
  const write = (path: string, content = "") => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  if (config !== null) write("dld.config.yaml", config);
  return {
    root,
    ctx: createNodeContext(root, {}),
    write,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** An in-memory filesystem holding the given files; directories are implied by their paths. */
export function memoryFs(files: Record<string, string>): FileSystem {
  const isDirectory = (path: string) =>
    Object.keys(files).some((file) => file.startsWith(`${path}/`));
  return {
    exists: (path) => path in files || isDirectory(path),
    isDirectory,
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    readDir: (path) => {
      const entries = new Map<string, DirEntry>();
      for (const file of Object.keys(files)) {
        if (!file.startsWith(`${path}/`)) continue;
        const [name, ...rest] = file.slice(path.length + 1).split("/");
        if (name === undefined) continue;
        entries.set(name, { name, isFile: rest.length === 0, isDirectory: rest.length > 0 });
      }
      return [...entries.values()];
    },
  };
}

export function fakeContext(overrides: Partial<Context> = {}): Context {
  return {
    cwd: "/project",
    fs: memoryFs({}),
    git: () => {
      throw new Error("git not expected in this test");
    },
    env: {},
    ...overrides,
  };
}

export function captureIo(): Io & { out: string; err: string } {
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
