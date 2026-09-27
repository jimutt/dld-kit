import { describe, expect, test } from "bun:test";
import pkg from "../../package.json";
import {
  CLAUDE_PLUGIN_DIR,
  type PackageMeta,
  PLUGIN_NAME,
  renderPluginFiles,
  repositoryUrl,
  SESSION_START_COMMAND,
  SESSION_START_MATCHER,
} from "./plugins.ts";

const META: PackageMeta = {
  name: "dld-kit",
  version: "1.2.3-rc.1",
  description: "Decisions next to code",
  author: { name: "A. Author", url: "https://example.com" },
  homepage: "https://example.com/dld-kit#readme",
  repository: { url: "git+https://github.com/owner/dld-kit.git" },
  license: "MIT",
  keywords: ["dld", "cli", "pi-package", "agent-skills"],
};

const files = renderPluginFiles(META);
const parse = (path: string) => {
  const content = files.get(path);
  if (content === undefined) throw new Error(`${path} not rendered`);
  return JSON.parse(content);
};

describe("renderPluginFiles", () => {
  test("renders every manifest as JSON with a trailing newline", () => {
    expect([...files.keys()].sort()).toEqual([
      ".agents/plugins/marketplace.json",
      ".claude-plugin/marketplace.json",
      ".github/plugin/marketplace.json",
      `${CLAUDE_PLUGIN_DIR}/.claude-plugin/plugin.json`,
      `${CLAUDE_PLUGIN_DIR}/hooks/hooks.json`,
      "plugin.json",
    ]);
    for (const content of files.values()) expect(content.endsWith("}\n")).toBe(true);
  });

  test("takes the version and metadata from package.json in every manifest", () => {
    const claude = parse(`${CLAUDE_PLUGIN_DIR}/.claude-plugin/plugin.json`);
    const portable = parse("plugin.json");
    for (const manifest of [claude, portable]) {
      expect(manifest).toMatchObject({
        name: PLUGIN_NAME,
        version: META.version,
        description: META.description,
        author: META.author,
        repository: "https://github.com/owner/dld-kit",
        license: "MIT",
        keywords: ["dld", "agent-skills"],
      });
    }
    expect(portable.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(parse(".claude-plugin/marketplace.json").plugins[0].version).toBe(META.version);
    expect(parse(".github/plugin/marketplace.json").metadata.version).toBe(META.version);
  });

  test("points the Claude Code marketplace at the generated plugin directory", () => {
    const marketplace = parse(".claude-plugin/marketplace.json");
    expect(marketplace.name).toBe("dld-kit");
    expect(marketplace.owner).toEqual({ name: "A. Author" });
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0]).toMatchObject({ name: PLUGIN_NAME, source: "./claude-plugin" });
  });

  test("points the Codex and Copilot marketplaces at the repository root", () => {
    const codex = parse(".agents/plugins/marketplace.json").plugins[0];
    expect(codex.source).toEqual({ source: "url", url: "https://github.com/owner/dld-kit.git" });
    expect(codex.policy).toEqual({ installation: "AVAILABLE", authentication: "ON_INSTALL" });
    expect(parse(".github/plugin/marketplace.json").plugins[0].source).toBe("./");
  });

  test("runs session-context from the plugin's SessionStart hook", () => {
    const { hooks } = parse(`${CLAUDE_PLUGIN_DIR}/hooks/hooks.json`);
    expect(hooks.SessionStart).toEqual([
      {
        matcher: SESSION_START_MATCHER,
        hooks: [{ type: "command", command: SESSION_START_COMMAND }],
      },
    ]);
    expect(SESSION_START_COMMAND).toContain(
      `\${CLAUDE_PLUGIN_ROOT}/skills/dld-common/scripts/dld.mjs`,
    );
  });

  test("renders from the real package.json", () => {
    const real = renderPluginFiles(pkg).get("plugin.json") ?? "";
    expect(JSON.parse(real).version).toBe(pkg.version);
  });
});

describe("repositoryUrl", () => {
  test("strips the git+ prefix and .git suffix", () => {
    expect(repositoryUrl(META)).toBe("https://github.com/owner/dld-kit");
    expect(repositoryUrl({ ...META, repository: { url: "https://x.test/r" } })).toBe(
      "https://x.test/r",
    );
  });
});
