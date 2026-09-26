// @decision(DL-002) @decision(DL-007)
import { run } from "./cli/index.ts";
import { createNodeContext } from "./node-context.ts";

// @decision(DL-012)
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit();
  throw error;
});

process.exitCode = run(
  process.argv.slice(2),
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
  createNodeContext(process.cwd(), process.env),
);
