import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { REQUIRED_SCRIPTS, missingScripts, packageRoot, scriptPath, scriptsDir } from "./paths.ts";

const originalCwd = process.cwd();

afterEach(() => {
	process.chdir(originalCwd);
});

describe("paths", () => {
	test("package root resolves from the module, not the working directory", () => {
		// pi loads the extension from wherever the package is installed, which is
		// almost never the workspace the user is in.
		const fromRepoRoot = packageRoot();
		process.chdir(tmpdir());

		expect(packageRoot()).toBe(fromRepoRoot);
		expect(existsSync(join(packageRoot(), "package.json"))).toBe(true);
		expect(existsSync(join(packageRoot(), "dld.config.yaml"))).toBe(true);
	});

	test("scripts directory points at the dld-goal skill", () => {
		expect(scriptsDir()).toBe(join(packageRoot(), "skills", "dld-goal", "scripts"));
	});

	test("every required script exists in the shipped skill", () => {
		expect(missingScripts()).toEqual([]);
	});

	test("script paths are absolute and real, under any loader", () => {
		// Under bun, import.meta.dir exists; under pi's jiti loader it does not.
		// paths.ts resolves through import.meta.url, which both provide, so a
		// regression to import.meta.dir would produce undefined/... paths at
		// runtime rather than a test failure. Assert the outcome, not the field.
		const path = scriptPath("run-state.sh");
		expect(path.startsWith("/")).toBe(true);
		expect(path.includes("undefined")).toBe(false);
		expect(existsSync(path)).toBe(true);
	});

	test("required scripts carry an executable bit", () => {
		for (const name of REQUIRED_SCRIPTS) {
			expect(statSync(scriptPath(name)).mode & 0o111).toBeGreaterThan(0);
		}
	});

	test("missingScripts names what is absent rather than only counting", () => {
		// Guards the failure branch the doctor reports to the user.
		expect(missingScripts()).not.toContain("next-item.sh");
		expect(REQUIRED_SCRIPTS).toContain("next-item.sh");
	});
});
