import { describe, expect, test } from "bun:test";
import { fakeContext, memoryFs } from "../test-helpers.ts";
import { loadConfig, parseConfig } from "./config.ts";
import { DldError } from "./errors.ts";

function parseError(text: string): string {
  try {
    parseConfig(text);
  } catch (error) {
    if (error instanceof DldError) return error.message;
    throw error;
  }
  throw new Error("expected parseConfig to throw");
}

describe("parseConfig", () => {
  test("reads a flat config and applies defaults", () => {
    expect(parseConfig("decisions_dir: decisions\nmode: flat\n")).toEqual({
      decisionsDir: "decisions",
      mode: "flat",
      namespaces: [],
      annotationPrefix: "@decision",
      annotationExclude: [],
      implementReview: true,
      decisionEdits: "block",
      snapshotArtifacts: [],
    });
  });

  test("reads quoted values", () => {
    const config = parseConfig(
      "decisions_dir: \"my-decisions\"\nmode: 'flat'\nannotation_prefix: '@why'\n",
    );
    expect(config.decisionsDir).toBe("my-decisions");
    expect(config.annotationPrefix).toBe("@why");
  });

  test("reads the full documented schema, including folded block scalars", () => {
    const config = parseConfig(`# comment
decisions_dir: decisions
mode: namespaced
namespaces:
  - billing
  - auth
annotation_prefix: "@decision"
annotation_exclude:
  - docs/**
  - "*.md"
implement_review: false
decision_edits: ask
snapshot_artifacts:
  - title: ONBOARDING.md
    prompt: >
      Generate a developer onboarding guide
      from scratch.
`);
    expect(config.mode).toBe("namespaced");
    expect(config.namespaces).toEqual(["billing", "auth"]);
    expect(config.implementReview).toBe(false);
    expect(config.decisionEdits).toBe("ask");
    expect(config.annotationExclude).toEqual(["docs/**", "*.md"]);
    expect(config.snapshotArtifacts).toEqual([
      { title: "ONBOARDING.md", prompt: "Generate a developer onboarding guide from scratch.\n" },
    ]);
  });

  test("ignores unknown keys", () => {
    expect(parseConfig("decisions_dir: d\nmode: flat\nfuture_key: 1\n").decisionsDir).toBe("d");
  });

  test.each([
    ["", "expected a mapping"],
    ["- a\n- b\n", "expected a mapping"],
    ["decisions_dir: [unclosed\n", "not valid YAML"],
    ["decisions_dir: !custom d\nmode: flat\n", "not valid YAML"],
    ["mode: flat\n", "'decisions_dir' is required"],
    ["decisions_dir: ''\nmode: flat\n", "'decisions_dir' must be a non-empty string"],
    ["decisions_dir: 12\nmode: flat\n", "'decisions_dir' must be a non-empty string"],
    ["decisions_dir: d\n", "'mode' must be 'flat' or 'namespaced'"],
    ["decisions_dir: d\nmode: nested\n", "'mode' must be 'flat' or 'namespaced'"],
    ["decisions_dir: d\nmode: namespaced\n", "'namespaces' must list at least one"],
    ["decisions_dir: d\nmode: flat\nnamespaces: billing\n", "'namespaces' must be a list"],
    ["decisions_dir: d\nmode: flat\nnamespaces: [1]\n", "'namespaces' must be a list of non-empty"],
    [
      "decisions_dir: d\nmode: flat\nimplement_review: yes\n",
      "'implement_review' must be true or false",
    ],
    [
      "decisions_dir: d\nmode: flat\ndecision_edits: strict\n",
      "'decision_edits' must be one of block, ask, allow",
    ],
    [
      "decisions_dir: d\nmode: flat\nannotation_exclude: docs\n",
      "'annotation_exclude' must be a list",
    ],
    [
      "decisions_dir: d\nmode: flat\nannotation_exclude: [../x]\n",
      "must be relative to the repository root, got '../x'",
    ],
    [
      "decisions_dir: d\nmode: flat\nannotation_exclude: [/tmp]\n",
      "must be relative to the repository root, got '/tmp'",
    ],
    [
      "decisions_dir: d\nmode: flat\nsnapshot_artifacts: x\n",
      "'snapshot_artifacts' must be a list",
    ],
    [
      "decisions_dir: d\nmode: flat\nsnapshot_artifacts: [{title: A}]\n",
      "'snapshot_artifacts[].prompt' is required",
    ],
  ])("rejects %j", (text, message) => {
    const error = parseError(text);
    expect(error).toStartWith("dld.config.yaml: ");
    expect(error).toContain(message);
  });
});

describe("loadConfig", () => {
  test("fails with the /dld-init hint when the file is missing", () => {
    const ctx = fakeContext();
    expect(() => loadConfig(ctx, "/project")).toThrow(
      "dld.config.yaml not found. Run /dld-init first.",
    );
  });

  test("reads the file at the project root", () => {
    const ctx = fakeContext({
      fs: memoryFs({ "/project/dld.config.yaml": "decisions_dir: d\nmode: flat\n" }),
    });
    expect(loadConfig(ctx, "/project").decisionsDir).toBe("d");
  });
});
