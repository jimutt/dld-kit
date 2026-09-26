import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NAMESPACED_CONFIG, type TempProject, tempProject } from "../test-helpers.ts";
import { parseConfig } from "./config.ts";
import { createConfig, createDirectories, parseMode, renderConfig } from "./init.ts";
import { loadProject } from "./project.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

describe("renderConfig", () => {
  test("matches create-config.sh and parses back", () => {
    expect(renderConfig("flat", [])).toBe(
      "decisions_dir: decisions\nmode: flat\nannotation_prefix: '@decision'\n",
    );
    const namespaced = renderConfig("namespaced", ["billing", "auth"]);
    expect(namespaced).toBe(
      "decisions_dir: decisions\nmode: namespaced\nnamespaces:\n  - billing\n  - auth\nannotation_prefix: '@decision'\n",
    );
    expect(parseConfig(namespaced).namespaces).toEqual(["billing", "auth"]);
  });
});

describe("parseMode", () => {
  test("accepts flat and namespaced only", () => {
    expect(parseMode("flat")).toBe("flat");
    expect(() => parseMode("nested")).toThrow("mode must be 'flat' or 'namespaced', got 'nested'.");
  });
});

describe("createConfig", () => {
  test("writes the config and refuses to overwrite it", () => {
    project = tempProject(null);
    const { ctx, root } = project;
    expect(createConfig(ctx, root, "flat", [])).toBe(join(root, "dld.config.yaml"));
    writeFileSync(join(root, "dld.config.yaml"), "edited");
    expect(() => createConfig(ctx, root, "flat", [])).toThrow("dld.config.yaml already exists.");
    expect(readFileSync(join(root, "dld.config.yaml"), "utf8")).toBe("edited");
  });

  test("requires a namespace in namespaced mode", () => {
    project = tempProject(null);
    const { ctx, root } = project;
    expect(() => createConfig(ctx, root, "namespaced", [])).toThrow(
      "namespaced mode requires at least one namespace.",
    );
  });
});

describe("createDirectories", () => {
  test("creates records and namespace directories with .gitkeep, keeping existing files", () => {
    project = tempProject(NAMESPACED_CONFIG);
    project.write("decisions/records/auth/.gitkeep", "kept");
    createDirectories(project.ctx, loadProject(project.ctx));
    const records = join(project.root, "decisions/records");
    expect(readFileSync(join(records, "billing/.gitkeep"), "utf8")).toBe("");
    expect(readFileSync(join(records, "auth/.gitkeep"), "utf8")).toBe("kept");
  });

  test("creates only the records directory in flat mode", () => {
    project = tempProject();
    createDirectories(project.ctx, loadProject(project.ctx));
    expect(existsSync(join(project.root, "decisions/records"))).toBe(true);
  });
});
