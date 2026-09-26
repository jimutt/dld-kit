import { afterEach, describe, expect, test } from "bun:test";
import { version } from "../../package.json";
import { DldError } from "../core/errors.ts";
import { captureIo, fakeContext, type TempProject, tempProject } from "../test-helpers.ts";
import { type Command, EXIT_OK, EXIT_USAGE, parseCommandArgs, UsageError } from "./command.ts";
import { COMMANDS, INTERNAL_NOTE, run } from "./index.ts";

const ctx = fakeContext();

describe("run", () => {
  test("--version prints the package version", () => {
    const io = captureIo();
    expect(run(["--version"], io, ctx)).toBe(EXIT_OK);
    expect(io.out).toBe(`${version}\n`);
    expect(io.err).toBe("");
  });

  test("-v is an alias for --version", () => {
    const io = captureIo();
    expect(run(["-v"], io, ctx)).toBe(EXIT_OK);
    expect(io.out).toBe(`${version}\n`);
  });

  test("--help prints usage listing every command", () => {
    const io = captureIo();
    expect(run(["--help"], io, ctx)).toBe(EXIT_OK);
    expect(io.out).toContain("Usage: dld");
    for (const command of COMMANDS) expect(io.out).toContain(command.name);
  });

  test("--help lists the setup commands apart from the internal ones", () => {
    const io = captureIo();
    run(["--help"], io, ctx);
    const [setup, internal] = io.out.split(
      "Commands the skills run (internal; may change in minor releases):\n",
    );
    const names = (text = "") => [...text.matchAll(/^ {2}([a-z-]+) /gm)].map((m) => m[1]);
    expect(names(setup)).toEqual(["init", "update", "install-rule", "session-context"]);
    expect(names(internal)).toEqual(
      COMMANDS.filter((command) => command.internal).map((command) => command.name),
    );
    expect(names(internal)).toContain("next-id");
  });

  test("no arguments prints usage on stderr and exits with a usage error", () => {
    const io = captureIo();
    expect(run([], io, ctx)).toBe(EXIT_USAGE);
    expect(io.out).toBe("");
    expect(io.err).toContain("Usage: dld");
  });

  test("an unknown command is reported on stderr", () => {
    const io = captureIo();
    expect(run(["frobnicate"], io, ctx)).toBe(EXIT_USAGE);
    expect(io.out).toBe("");
    expect(io.err).toContain("unknown command or option 'frobnicate'");
  });
});

describe("command dispatch", () => {
  function withCommand(behaviour: Command["run"], argv: string[]) {
    const command: Command = {
      name: "probe",
      summary: "",
      usage: "Usage: dld probe\n",
      run: behaviour,
    };
    const io = captureIo();
    return { code: run(["probe", ...argv], io, ctx, [command]), io };
  }

  const parsing: Command["run"] = (args) => {
    parseCommandArgs({
      args: [...args],
      options: { title: { type: "string" } },
      allowPositionals: true,
    });
    return 7;
  };

  test("-h and --help as options print the command's usage", () => {
    for (const argv of [["-h"], ["x", "--help"], ["--title", "t", "-h"]]) {
      const { code, io } = withCommand(parsing, argv);
      expect(code).toBe(EXIT_OK);
      expect(io.out).toBe("Usage: dld probe\n");
    }
  });

  test("--help after -- or as an option's value is not a help request", () => {
    expect(withCommand(parsing, ["--", "--help"]).code).toBe(7);
    expect(withCommand(parsing, ["--title=--help"]).code).toBe(7);
    const { code, io } = withCommand(parsing, ["--title", "--help"]);
    expect(code).toBe(EXIT_USAGE);
    expect(io.err).toContain("dld probe: ");
  });

  test("every registered command answers --help", async () => {
    for (const command of COMMANDS) {
      const io = captureIo();
      expect(await run([command.name, "--help"], io, ctx)).toBe(EXIT_OK);
      expect(io.out).toBe(command.internal ? `${command.usage}\n${INTERNAL_NOTE}` : command.usage);
    }
  });

  test("errors from an async command are reported like synchronous ones", async () => {
    const { code, io } = withCommand(async () => {
      throw new DldError("async broke", 3);
    }, []);
    expect(await code).toBe(3);
    expect(io.err).toBe("Error: async broke\n");
    const ok = withCommand(async () => EXIT_OK, []);
    expect(await ok.code).toBe(EXIT_OK);
  });

  test("a DldError prints 'Error:' on stderr with its exit code", () => {
    const { code, io } = withCommand(() => {
      throw new DldError("it broke", 3);
    }, []);
    expect(code).toBe(3);
    expect(io.err).toBe("Error: it broke\n");
  });

  test("a UsageError prints the message and the command's usage, exit 2", () => {
    const { code, io } = withCommand(() => {
      throw new UsageError("bad flag");
    }, []);
    expect(code).toBe(EXIT_USAGE);
    expect(io.err).toBe("dld probe: bad flag\n\nUsage: dld probe\n");
  });

  test("any other exception is reported as a bug with its stack, exit 1", () => {
    const { code, io } = withCommand(() => {
      throw new Error("unexpected");
    }, []);
    expect(code).toBe(1);
    expect(io.err).toContain("this is a bug");
    expect(io.err).toContain("Error: unexpected\n    at ");
  });
});

describe("next-id", () => {
  let project: TempProject | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
  });

  test("prints the next ID", () => {
    project = tempProject();
    project.write("decisions/records/DL-004.md");
    const io = captureIo();
    expect(run(["next-id"], io, project.ctx)).toBe(EXIT_OK);
    expect(io.out).toBe("DL-005\n");
  });

  test("rejects unexpected arguments", () => {
    project = tempProject();
    const io = captureIo();
    expect(run(["next-id", "extra"], io, project.ctx)).toBe(EXIT_USAGE);
    expect(io.err).toContain("dld next-id:");
  });

  test("fails when the config is missing", () => {
    project = tempProject(null);
    const io = captureIo();
    expect(run(["next-id"], io, project.ctx)).toBe(1);
    expect(io.err).toBe("Error: dld.config.yaml not found. Run /dld-init first.\n");
  });
});
