// @decision(DL-002) @decision(DL-007)
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { run } from "./cli/index.ts";
import { DldError } from "./core/errors.ts";
import { createNodeContext } from "./node-context.ts";

// @decision(DL-012)
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit();
    throw error;
  });
}

// @decision(DL-041)
/** One line from the terminal. Ctrl-C or end of input cancels instead of leaving the await unsettled. */
async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise<string>((resolve, reject) => {
      const cancel = () => reject(new DldError("cancelled", 130));
      rl.once("SIGINT", cancel);
      rl.once("close", cancel);
      rl.question(question).then(resolve, reject);
    });
  } finally {
    rl.close();
  }
}

const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;

process.exitCode = await run(
  process.argv.slice(2),
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    // @decision(DL-042)
    cliPath: fileURLToPath(import.meta.url),
    ...(interactive ? { prompt: ask } : {}),
  },
  createNodeContext(process.cwd(), process.env),
);
