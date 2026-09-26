// Shared fixtures for unit tests. Not part of the CLI bundle.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Io } from "./cli/command.ts";
import type { Context, DirEntry, FileSystem } from "./core/context.ts";
import { FsError } from "./core/errors.ts";
import { createNodeContext } from "./node-context.ts";

export const FLAT_CONFIG = "decisions_dir: decisions\nmode: flat\nannotation_prefix: '@decision'\n";

export const FIXED_NOW = new Date("2026-01-15T10:00:00.123Z");

export interface TempProject {
  root: string;
  /** Runs git in the project with an isolated environment and returns stdout. */
  git(...args: string[]): string;
  ctx: Context;
  write(path: string, content?: string): void;
  cleanup(): void;
}

/** A temporary git repository with a flat dld.config.yaml, like the bats fixtures. */
export function tempProject(
  config: string | null = FLAT_CONFIG,
  overrides: Partial<Context> = {},
): TempProject {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dld-unit-")));
  // Drop GIT_DIR and friends so a surrounding git hook cannot redirect the fixture.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, env, stdio: "ignore" });
  git("init", "--quiet");
  // A local identity, so tests that commit work without a global git config (as on CI).
  git("config", "user.email", "test@test.com");
  git("config", "user.name", "Test");
  git("commit", "--allow-empty", "-m", "init", "--quiet");
  const write = (path: string, content = "") => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  if (config !== null) write("dld.config.yaml", config);
  return {
    root,
    git: (...args: string[]) => execFileSync("git", args, { cwd: root, env, encoding: "utf8" }),
    ctx: {
      ...createNodeContext(root, env),
      now: () => FIXED_NOW,
      readStdin: () => "",
      ...overrides,
    },
    write,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

/**
 * An in-memory filesystem holding the given files. Directories are implied by file paths or
 * created with mkdir. `files` stays live, so tests can inspect writes.
 */
export function memoryFs(files: Record<string, string>): FileSystem & {
  files: Record<string, string>;
} {
  const dirs = new Set<string>();
  const isDirectory = (path: string) =>
    dirs.has(path) || Object.keys(files).some((file) => file.startsWith(`${path}/`));
  const missing = (operation: string, path: string) => new FsError(operation, path, "ENOENT");
  return {
    files,
    exists: (path) => path in files || isDirectory(path),
    isDirectory,
    isRegularFile: (path) => path in files,
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) throw missing("read", path);
      return content;
    },
    readDir: (path) => {
      if (!isDirectory(path)) throw missing("read", path);
      const entries = new Map<string, DirEntry>();
      for (const entry of [...Object.keys(files), ...dirs]) {
        if (!entry.startsWith(`${path}/`)) continue;
        const [name, ...rest] = entry.slice(path.length + 1).split("/");
        if (name === undefined || entries.get(name)?.isDirectory) continue;
        const isFile = rest.length === 0 && entry in files;
        entries.set(name, { name, isFile, isDirectory: !isFile });
      }
      return [...entries.values()];
    },
    writeFile: (path, content) => {
      files[path] = content;
    },
    mkdir: (path) => {
      for (let dir = path; dir !== dirname(dir); dir = dirname(dir)) dirs.add(dir);
    },
    rename: (from, to) => {
      const content = files[from];
      if (content === undefined) throw missing("rename", from);
      files[to] = content;
      delete files[from];
    },
    link: (existing, newPath) => {
      const content = files[existing];
      if (content === undefined) throw missing("create", newPath);
      if (newPath in files) throw new FsError("create", newPath, "EEXIST");
      files[newPath] = content;
    },
    remove: (path) => {
      delete files[path];
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
    readStdin: () => "",
    now: () => FIXED_NOW,
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

export const NAMESPACED_CONFIG =
  "decisions_dir: decisions\nmode: namespaced\nnamespaces:\n  - billing\n  - auth\nannotation_prefix: '@decision'\n";

/** A record in the bats fixture layout. */
export function recordText(id: string, status = "accepted", extra = ""): string {
  return `---
id: ${id}
title: "Test decision ${id}"
timestamp: 2026-01-15T10:00:00Z
status: ${status}
supersedes: []
amends: []
${extra}tags: [test, example]
references: []
---

## Context
Test context for ${id}.
`;
}
