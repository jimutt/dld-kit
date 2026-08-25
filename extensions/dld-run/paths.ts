import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Package root, resolved from this module's own location rather than the
 * process working directory: pi loads the extension from wherever the package
 * is installed, which is rarely the workspace the user is working in.
 */
export function packageRoot(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** Directory holding the dld-run skill scripts that own every state mutation. */
export function scriptsDir(): string {
	return join(packageRoot(), "skills", "dld-run", "scripts");
}

/** Absolute path to one dld-run skill script. */
export function scriptPath(name: string): string {
	return join(scriptsDir(), name);
}

/** Scripts the extension depends on. Verified together by the doctor command. */
export const REQUIRED_SCRIPTS = [
	"append-event.sh",
	"block-item.sh",
	"create-run.sh",
	"decision-hash.sh",
	"guard-preconditions.sh",
	"next-item.sh",
	"resolve-block.sh",
	"run-state.sh",
	"verify-hashes.sh",
	"verify-item.sh",
] as const;

/** Names of required scripts that are not present on disk. */
export function missingScripts(): string[] {
	return REQUIRED_SCRIPTS.filter((name) => !existsSync(scriptPath(name)));
}
