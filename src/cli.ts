import { version } from "../package.json";

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
}

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;

const USAGE = `Usage: dld <command> [options]

Options:
  -h, --help     Show this help
  -v, --version  Show the dld version
`;

export function run(argv: readonly string[], io: Io): number {
  const [first] = argv;

  if (first === undefined) {
    io.stderr(USAGE);
    return EXIT_USAGE;
  }

  if (first === "-h" || first === "--help") {
    io.stdout(USAGE);
    return EXIT_OK;
  }

  if (first === "-v" || first === "--version") {
    io.stdout(`${version}\n`);
    return EXIT_OK;
  }

  io.stderr(`dld: unknown command or option '${first}'\n\n${USAGE}`);
  return EXIT_USAGE;
}
