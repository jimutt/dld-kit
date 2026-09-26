// Plugin and marketplace manifests, rendered from package.json.

/** The package.json fields the manifests are rendered from. */
export interface PackageMeta {
  name: string;
  version: string;
  description: string;
  author: { name: string; url?: string };
  homepage: string;
  repository: { url: string };
  license: string;
  keywords: readonly string[];
}

/** The plugin's name in every marketplace; the marketplace itself is named after the package. */
export const PLUGIN_NAME = "dld";
/** The generated Claude Code plugin, relative to the repository root (DL-048). */
export const CLAUDE_PLUGIN_DIR = "claude-plugin";
/** Where the plugin's skills are generated with the claude-code adapter. */
export const CLAUDE_PLUGIN_SKILLS = `${CLAUDE_PLUGIN_DIR}/skills`;

const CATEGORY = "development";
/** Keywords that describe the npm package rather than the plugin. */
const PACKAGE_ONLY_KEYWORDS = new Set(["cli", "pi-package"]);

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** `git+https://host/owner/repo.git` as a browsable URL. */
export function repositoryUrl(meta: PackageMeta): string {
  return meta.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
}

function pluginInfo(meta: PackageMeta) {
  return {
    name: PLUGIN_NAME,
    version: meta.version,
    description: meta.description,
    author: meta.author,
    homepage: meta.homepage,
    repository: repositoryUrl(meta),
    license: meta.license,
    keywords: meta.keywords.filter((keyword) => !PACKAGE_ONLY_KEYWORDS.has(keyword)),
  };
}

// @decision(DL-049)
/** The command the Claude Code plugin's SessionStart hook runs. */
export const SESSION_START_COMMAND = `node "\${CLAUDE_PLUGIN_ROOT}/skills/dld-common/scripts/dld.mjs" session-context --agent claude`;

// @decision(DL-048) @decision(DL-050) @decision(DL-052)
/**
 * Every generated manifest, keyed by path relative to the repository root. Versions and
 * metadata come from `meta`, so they cannot disagree with package.json.
 */
export function renderPluginFiles(meta: PackageMeta): Map<string, string> {
  const info = pluginInfo(meta);
  const owner = { name: meta.author.name };
  const summary = {
    name: PLUGIN_NAME,
    description: meta.description,
    version: meta.version,
    category: CATEGORY,
    tags: info.keywords,
  };
  return new Map([
    [
      ".claude-plugin/marketplace.json",
      json({
        $schema: "https://json.schemastore.org/claude-code-marketplace.json",
        name: meta.name,
        description: meta.description,
        owner,
        plugins: [{ ...summary, source: `./${CLAUDE_PLUGIN_DIR}`, homepage: meta.homepage }],
      }),
    ],
    [
      `${CLAUDE_PLUGIN_DIR}/.claude-plugin/plugin.json`,
      json({ $schema: "https://json.schemastore.org/claude-code-plugin-manifest.json", ...info }),
    ],
    [
      `${CLAUDE_PLUGIN_DIR}/hooks/hooks.json`,
      json({
        description:
          "Adds the DLD rule to the session context in projects that use DLD and do not load it already.",
        hooks: {
          SessionStart: [{ hooks: [{ type: "command", command: SESSION_START_COMMAND }] }],
        },
      }),
    ],
    [
      "plugin.json",
      json({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", ...info }),
    ],
    [
      ".agents/plugins/marketplace.json",
      json({
        name: meta.name,
        interface: { displayName: "DLD Kit" },
        plugins: [
          {
            name: PLUGIN_NAME,
            source: { source: "url", url: `${repositoryUrl(meta)}.git` },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
            category: "Productivity",
          },
        ],
      }),
    ],
    [
      ".github/plugin/marketplace.json",
      json({
        name: meta.name,
        owner,
        metadata: { description: meta.description, version: meta.version },
        plugins: [{ ...summary, source: "./" }],
      }),
    ],
  ]);
}
