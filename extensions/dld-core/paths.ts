import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Package root, resolved by walking up from this module's own location until
 * the dld-run scripts directory exists. The walk is existence-checked rather
 * than depth-assumed, so the module works from any nesting level and fails
 * loudly (via missingScripts) when the package layout is wrong — never
 * silently resolving to a directory that happens to be two levels up.
 */
export function packageRoot(): string {
	let dir = dirname(fileURLToPath(import.meta.url));
	for (let i = 0; i < 6; i++) {
		if (existsSync(join(dir, "skills", "dld-run", "scripts", "run-state.sh"))) {
			return dir;
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	// Fall back to the historical two-levels-up resolution so error messages
	// point somewhere plausible; missingScripts() reports the real problem.
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
