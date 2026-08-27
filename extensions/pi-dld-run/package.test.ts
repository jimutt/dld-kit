import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { packageRoot } from "../dld-core/paths.ts";

interface PiManifest {
	extensions?: string[];
	skills?: string[];
}

const manifest = JSON.parse(readFileSync(join(packageRoot(), "package.json"), "utf8")) as {
	keywords?: string[];
	pi?: PiManifest;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

describe("pi package manifest", () => {
	test("declares the pi-package keyword so the gallery can find it", () => {
		expect(manifest.keywords).toContain("pi-package");
	});

	test("declares extensions and skills explicitly rather than by convention", () => {
		expect(manifest.pi?.extensions).toEqual(["./extensions"]);
		expect(manifest.pi?.skills).toEqual(["./skills"]);
	});

	test("every declared resource path exists", () => {
		for (const path of [...(manifest.pi?.extensions ?? []), ...(manifest.pi?.skills ?? [])]) {
			expect(existsSync(join(packageRoot(), path))).toBe(true);
		}
	});

	test("the extension entry point is where pi looks for it", () => {
		// Pi loads only index.ts from an extension subdirectory, which is what
		// keeps colocated *.test.ts files from being loaded as extensions.
		expect(existsSync(join(packageRoot(), "extensions", "pi-dld-run", "index.ts"))).toBe(true);
	});

	test("pi runtime packages are optional peers, never bundled", () => {
		for (const name of ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui"]) {
			expect(manifest.peerDependencies?.[name]).toBe("*");
			expect(manifest.peerDependenciesMeta?.[name]?.optional).toBe(true);
		}
	});

	test("skills declared to pi are the same set the tessl plugin ships", () => {
		const skillDirs = readdirSync(join(packageRoot(), "skills"), { withFileTypes: true })
			.filter((e) => e.isDirectory() && e.name.startsWith("dld-"))
			.map((e) => e.name)
			.sort();
		const plugin = JSON.parse(readFileSync(join(packageRoot(), ".tessl-plugin", "plugin.json"), "utf8")) as {
			skills?: string[];
		};
		const pluginSkills = (plugin.skills ?? []).map((s) => s.replace(/^skills\//, "")).sort();

		expect(skillDirs).toEqual(pluginSkills);
	});
});
