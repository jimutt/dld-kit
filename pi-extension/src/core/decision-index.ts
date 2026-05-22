// DecisionIndex — the shared, Pi-agnostic parser and in-memory index for
// decisions/records/**/DL-*.md. This is the foundation reused by the
// autocomplete provider, the pre-edit guardrail, the ambient status
// widget, and background watchers.
//
//
// No imports from @earendil-works/* — pure Node + js-yaml. This module
// stays unit-testable in isolation.

import { existsSync, watch, type FSWatcher } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import yaml from "js-yaml";

export type DecisionStatus = "proposed" | "accepted" | "superseded" | "deprecated";

/**
 * Pre-edit guardrail mode (plan 02). Stored here because it's defined by
 * the harness: block of dld.config.yaml that this module parses.
 */
export type GuardrailMode = "off" | "surface" | "strict";

export type DecisionReference = {
	path: string;
	symbol?: string;
};

export type Decision = {
	id: string; // "DL-185"
	numericId: number; // 185
	title: string;
	status: DecisionStatus;
	tags: string[];
	timestamp: string; // ISO 8601 (empty string if missing)
	supersedes: string[];
	amends: string[];
	references: DecisionReference[];
	namespace?: string; // namespaced mode only
	filePath: string; // absolute path to the .md file
	body?: string; // markdown body after the YAML frontmatter
};

export type IndexChange =
	| { kind: "added"; decision: Decision }
	| { kind: "updated"; decision: Decision; previous: Decision }
	| { kind: "removed"; id: string };

export type HarnessConfig = {
	guardrail_mode?: GuardrailMode;
	lookback_turns?: number;
};

export interface DecisionIndex {
	list(): Decision[];
	get(id: string): Decision | undefined;
	byStatus(status: DecisionStatus): Decision[];
	byTag(tag: string): Decision[];
	byPath(repoRelativePath: string): Decision[];
	search(query: string): Decision[];
	recent(limit: number): Decision[];
	onChange(handler: (change: IndexChange) => void): () => void;
	ready(): Promise<void>;
	close(): void;
	readonly harnessConfig: HarnessConfig | undefined;
	/** Annotation prefix from dld.config.yaml, e.g. `@decision`. */
	readonly annotationPrefix: string;
}

// ──────────────────────────────────────────────────────────────────────
// Config parsing
// ──────────────────────────────────────────────────────────────────────

type DldConfig = {
	decisions_dir: string;
	mode: "flat" | "namespaced";
	annotation_prefix: string;
	namespaces?: string[];
	harness?: HarnessConfig;
};

const DEFAULT_ANNOTATION_PREFIX = "@decision";

async function loadConfig(repoRoot: string): Promise<DldConfig | null> {
	const configPath = join(repoRoot, "dld.config.yaml");
	let text: string;
	try {
		text = await readFile(configPath, "utf8");
	} catch {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = yaml.load(text);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const obj = parsed as Record<string, unknown>;
	const mode = obj.mode === "namespaced" ? "namespaced" : "flat";
	return {
		decisions_dir: typeof obj.decisions_dir === "string" ? obj.decisions_dir : "decisions",
		mode,
		annotation_prefix:
			typeof obj.annotation_prefix === "string"
				? obj.annotation_prefix
				: DEFAULT_ANNOTATION_PREFIX,
		namespaces: Array.isArray(obj.namespaces) ? (obj.namespaces as string[]) : undefined,
		harness:
			obj.harness && typeof obj.harness === "object"
				? (obj.harness as HarnessConfig)
				: undefined,
	};
}

// ──────────────────────────────────────────────────────────────────────
// Decision file parsing
// ──────────────────────────────────────────────────────────────────────

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const VALID_STATUSES: ReadonlySet<DecisionStatus> = new Set<DecisionStatus>([
	"proposed",
	"accepted",
	"superseded",
	"deprecated",
]);
const ID_RE = /^DL-(\d+)$/;

function parseDecisionFile(content: string, filePath: string): Decision | null {
	const m = content.match(FRONTMATTER_RE);
	if (!m) return null;

	let raw: Record<string, unknown>;
	try {
		const loaded = yaml.load(m[1]) ?? {};
		if (typeof loaded !== "object" || Array.isArray(loaded)) return null;
		raw = loaded as Record<string, unknown>;
	} catch {
		return null;
	}

	const id = typeof raw.id === "string" ? raw.id : null;
	const title = typeof raw.title === "string" ? raw.title : null;
	if (!id || !title) return null;

	const idMatch = id.match(ID_RE);
	if (!idMatch) return null;
	const numericId = parseInt(idMatch[1], 10);

	const statusRaw = typeof raw.status === "string" ? raw.status : "accepted";
	if (!VALID_STATUSES.has(statusRaw as DecisionStatus)) return null;
	const status = statusRaw as DecisionStatus;

	const tags = Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string") : [];
	const supersedes = Array.isArray(raw.supersedes)
		? raw.supersedes.filter((s): s is string => typeof s === "string")
		: [];
	const amends = Array.isArray(raw.amends)
		? raw.amends.filter((a): a is string => typeof a === "string")
		: [];
	const references: DecisionReference[] = Array.isArray(raw.references)
		? raw.references
				.filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
				.map((r) => ({
					path: typeof r.path === "string" ? r.path : "",
					symbol: typeof r.symbol === "string" ? r.symbol : undefined,
				}))
				.filter((r) => r.path.length > 0)
		: [];

	// YAML scalars that look like ISO timestamps (unquoted in the file) are
	// parsed by js-yaml as Date objects. Genie's real decision files use the
	// unquoted form, so we must accept both. Canonicalize through
	// Date.toISOString() so the in-memory form is uniform regardless of how
	// the YAML was written. This matters for lexicographic ordering in
	// recent() — mixing "...:00Z" and "...:00.000Z" would mis-sort.
	let timestamp = "";
	const rawTs = raw.timestamp;
	if (rawTs instanceof Date) {
		timestamp = rawTs.toISOString();
	} else if (typeof rawTs === "string") {
		const parsed = new Date(rawTs);
		timestamp = Number.isNaN(parsed.getTime()) ? rawTs : parsed.toISOString();
	}

	return {
		id,
		numericId,
		title,
		status,
		tags,
		timestamp,
		supersedes,
		amends,
		references,
		filePath,
		body: m[2] ?? "",
	};
}

// ──────────────────────────────────────────────────────────────────────
// Filesystem walk
// ──────────────────────────────────────────────────────────────────────

const DL_FILE_RE = /^DL-\d+\.md$/;

async function walkRecords(recordsDir: string): Promise<string[]> {
	const out: string[] = [];
	async function walk(dir: string): Promise<void> {
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const p = join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(p);
			} else if (entry.isFile() && DL_FILE_RE.test(entry.name)) {
				out.push(p);
			}
		}
	}
	await walk(recordsDir);
	return out;
}

function inferNamespace(
	recordsDir: string,
	filePath: string,
	mode: "flat" | "namespaced",
): string | undefined {
	if (mode !== "namespaced") return undefined;
	const rel = relative(recordsDir, filePath);
	const segments = rel.split(sep);
	return segments.length > 1 ? segments[0] : undefined;
}

function normalizePath(p: string): string {
	return p.replace(/^\.\//, "").replace(/\\/g, "/");
}

// ──────────────────────────────────────────────────────────────────────
// Index implementation
// ──────────────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<DecisionStatus, number> = {
	proposed: 0,
	accepted: 1,
	superseded: 2,
	deprecated: 3,
};

const WATCH_DEBOUNCE_MS = 100;

class InMemoryDecisionIndex implements DecisionIndex {
	private decisions = new Map<string, Decision>();
	private watcher: FSWatcher | null = null;
	private readonly changeHandlers = new Set<(change: IndexChange) => void>();
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly pendingFiles = new Set<string>();
	private readonly readyPromise: Promise<void>;

	constructor(
		private readonly recordsDir: string,
		private readonly mode: "flat" | "namespaced",
		public readonly harnessConfig: HarnessConfig | undefined,
		public readonly annotationPrefix: string,
	) {
		this.readyPromise = this.initialLoad();
		this.startWatcher();
	}

	private async initialLoad(): Promise<void> {
		const files = await walkRecords(this.recordsDir);
		await Promise.all(files.map((f) => this.loadFileInto(f, this.decisions)));
	}

	private async loadFileInto(filePath: string, into: Map<string, Decision>): Promise<void> {
		let content: string;
		try {
			content = await readFile(filePath, "utf8");
		} catch {
			return;
		}
		const decision = parseDecisionFile(content, filePath);
		if (!decision) return;
		decision.namespace = inferNamespace(this.recordsDir, filePath, this.mode);
		into.set(decision.id, decision);
	}

	private startWatcher(): void {
		try {
			this.watcher = watch(
				this.recordsDir,
				{ recursive: true },
				(_event, filename) => {
					if (!filename) return;
					// We get the path relative to recordsDir. Only watch DL-*.md files.
					if (!DL_FILE_RE.test(filename.split(sep).pop() ?? "")) return;
					this.pendingFiles.add(join(this.recordsDir, filename));
					if (this.debounceTimer) clearTimeout(this.debounceTimer);
					this.debounceTimer = setTimeout(() => {
						void this.processPending();
					}, WATCH_DEBOUNCE_MS);
				},
			);
		} catch {
			// fs.watch unavailable on this FS (some Docker volumes, network mounts).
			// TODO: add a TTL-based polling fallback for non-fs.watch platforms.
			this.watcher = null;
		}
	}

	private async processPending(): Promise<void> {
		const files = Array.from(this.pendingFiles);
		this.pendingFiles.clear();
		this.debounceTimer = null;

		for (const file of files) {
			let exists = false;
			try {
				await stat(file);
				exists = true;
			} catch {
				exists = false;
			}

			if (!exists) {
				for (const [id, d] of this.decisions) {
					if (d.filePath === file) {
						this.decisions.delete(id);
						this.emit({ kind: "removed", id });
						break;
					}
				}
				continue;
			}

			let content: string;
			try {
				content = await readFile(file, "utf8");
			} catch {
				continue;
			}
			const decision = parseDecisionFile(content, file);
			if (!decision) continue;
			decision.namespace = inferNamespace(this.recordsDir, file, this.mode);

			const previous = this.decisions.get(decision.id);
			this.decisions.set(decision.id, decision);
			if (previous) {
				this.emit({ kind: "updated", decision, previous });
			} else {
				this.emit({ kind: "added", decision });
			}
		}
	}

	private emit(change: IndexChange): void {
		for (const h of this.changeHandlers) {
			try {
				h(change);
			} catch {
				// handlers must not throw; if they do, skip and continue
			}
		}
	}

	list(): Decision[] {
		return Array.from(this.decisions.values());
	}

	get(id: string): Decision | undefined {
		return this.decisions.get(id);
	}

	byStatus(status: DecisionStatus): Decision[] {
		return this.list().filter((d) => d.status === status);
	}

	byTag(tag: string): Decision[] {
		return this.list().filter((d) => d.tags.includes(tag));
	}

	byPath(repoRelativePath: string): Decision[] {
		const norm = normalizePath(repoRelativePath);
		return this.list().filter((d) =>
			d.references.some((r) => normalizePath(r.path) === norm),
		);
	}

	search(query: string): Decision[] {
		const q = query.trim().toLowerCase();
		if (!q) return this.list();
		if (/^\d+$/.test(q)) {
			return this.list().filter((d) => String(d.numericId).startsWith(q));
		}
		return this.list().filter((d) => {
			const hay = `${d.id} ${d.title} ${d.tags.join(" ")} ${d.namespace ?? ""}`.toLowerCase();
			return hay.includes(q);
		});
	}

	recent(limit: number): Decision[] {
		return [...this.list()]
			.sort((a, b) => {
				const sa = STATUS_ORDER[a.status];
				const sb = STATUS_ORDER[b.status];
				const liveA = sa < 2 ? 0 : 1;
				const liveB = sb < 2 ? 0 : 1;
				if (liveA !== liveB) return liveA - liveB;
				if (a.timestamp !== b.timestamp) return b.timestamp.localeCompare(a.timestamp);
				return sa - sb;
			})
			.slice(0, limit);
	}

	onChange(handler: (change: IndexChange) => void): () => void {
		this.changeHandlers.add(handler);
		return () => {
			this.changeHandlers.delete(handler);
		};
	}

	async ready(): Promise<void> {
		await this.readyPromise;
	}

	close(): void {
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this.changeHandlers.clear();
	}
}

/**
 * Load and start watching a DLD project rooted at `repoRoot`.
 *
 * Returns `null` (silent no-op) when:
 *  - no `dld.config.yaml` is found at the repo root
 *  - the config exists but the records directory does not
 *
 * The extension activates only in DLD-using projects.
 */
export async function loadDecisionIndex(repoRoot: string): Promise<DecisionIndex | null> {
	const config = await loadConfig(repoRoot);
	if (!config) return null;
	const recordsDir = resolve(repoRoot, config.decisions_dir, "records");
	if (!existsSync(recordsDir)) return null;
	const index = new InMemoryDecisionIndex(
		recordsDir,
		config.mode,
		config.harness,
		config.annotation_prefix,
	);
	await index.ready();
	return index;
}
