import type {
	ExecOptions,
	ExecResult,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionUIContext,
	RegisteredCommand,
} from "@earendil-works/pi-coding-agent";

/**
 * The slice of pi's API that dld-goal actually uses.
 *
 * Picked from the real interfaces rather than redeclared, and assigned into
 * these annotated types without assertions, so the compiler rejects a fake
 * that has drifted from the harness it stands in for. Widening this list is
 * deliberate: anything added here has to be faked as well.
 */
export type PiSurface = Pick<
	ExtensionAPI,
	| "on"
	| "registerCommand"
	| "registerEntryRenderer"
	| "sendMessage"
	| "appendEntry"
	| "exec"
>;

export type UiSurface = Pick<ExtensionUIContext, "notify" | "setStatus" | "setWidget">;

export type CommandSurface = Pick<
	ExtensionCommandContext,
	"cwd" | "hasUI" | "mode" | "isIdle" | "hasPendingMessages" | "abort"
> & { ui: UiSurface };

export interface ExecCall {
	command: string;
	args: string[];
	options?: ExecOptions;
}

export interface Notification {
	message: string;
	type: "info" | "warning" | "error";
}

export interface SentMessage {
	customType: string;
	content: string | unknown[];
	display: boolean;
	details?: unknown;
	triggerTurn?: boolean;
	deliverAs?: "steer" | "followUp" | "nextTurn";
}

export interface AppendedEntry {
	customType: string;
	data: unknown;
}

export type ExecResponder = (call: ExecCall) => ExecResult | Promise<ExecResult>;

export interface FakePiOptions {
	cwd?: string;
	idle?: boolean;
	pendingMessages?: boolean;
	hasUI?: boolean;
	/** Default result for exec calls with no registered responder. */
	exec?: ExecResponder;
}

export interface FakePi {
	api: PiSurface;
	ctx: CommandSurface;

	readonly commands: Map<string, Omit<RegisteredCommand, "name" | "sourceInfo">>;
	readonly events: Map<string, ((event: unknown, ctx: unknown) => unknown)[]>;
	readonly entryRenderers: Map<string, unknown>;

	readonly execCalls: ExecCall[];
	readonly notifications: Notification[];
	readonly statuses: Map<string, string | undefined>;
	readonly widgets: Map<string, string[] | undefined>;
	readonly messages: SentMessage[];
	readonly entries: AppendedEntry[];

	/** Queue a result for the next exec whose command and args match.
	 * argsInclude matches whole elements; argsContain matches substrings of
	 * elements — useful when the fake cannot know an absolute script path. */
	onExec(
		match: { command?: string; argsInclude?: string[]; argsContain?: string[] },
		result: Partial<ExecResult>,
	): void;
	/** Replace the fallback exec responder. */
	setExec(responder: ExecResponder): void;

	setIdle(value: boolean): void;
	setPendingMessages(value: boolean): void;
	/** Whether ctx.abort() was called. */
	wasAborted(): boolean;

	/** Fire a registered event handler. Returns each handler's result. */
	emit(event: string, payload?: unknown): Promise<unknown[]>;
	/** Invoke a registered command by name. */
	invokeCommand(name: string, args?: string): Promise<void>;

	/** Status text for a key, or undefined when unset or cleared. */
	status(key: string): string | undefined;
	/** Widget lines for a key, or undefined when unset or cleared. */
	widget(key: string): string[] | undefined;
}

const okResult: ExecResult = { stdout: "", stderr: "", code: 0, killed: false };

// @decision(DL-006)
export function createFakePi(options: FakePiOptions = {}): FakePi {
	const commands = new Map<string, Omit<RegisteredCommand, "name" | "sourceInfo">>();
	const events = new Map<string, ((event: unknown, ctx: unknown) => unknown)[]>();
	const entryRenderers = new Map<string, unknown>();

	const execCalls: ExecCall[] = [];
	const notifications: Notification[] = [];
	const statuses = new Map<string, string | undefined>();
	const widgets = new Map<string, string[] | undefined>();
	const messages: SentMessage[] = [];
	const entries: AppendedEntry[] = [];

	const scripted: {
		match: { command?: string; argsInclude?: string[]; argsContain?: string[] };
		result: ExecResult;
	}[] = [];
	// git rev-parse answers with the fake's cwd so projectRoot resolution
	// works without each test scripting it.
	let fallbackExec: ExecResponder =
		options.exec ??
		((call) => {
			if (call.command === "git" && call.args.includes("rev-parse")) {
				return { ...okResult, stdout: `${options.cwd ?? process.cwd()}\n` };
			}
			return okResult;
		});

	let idle = options.idle ?? true;
	let pendingMessages = options.pendingMessages ?? false;

	const setWidget = (key: string, content: unknown) => {
		// Only the string[] form is recorded. Component widgets render against a
		// real TUI and are verified by hand.
		widgets.set(key, Array.isArray(content) ? (content as string[]) : undefined);
	};

	const ui: UiSurface = {
		notify(message, type) {
			notifications.push({ message, type: type ?? "info" });
		},
		setStatus(key, text) {
			statuses.set(key, text);
		},
		setWidget,
	};

	let aborted = false;
	const ctx: CommandSurface = {
		cwd: options.cwd ?? process.cwd(),
		hasUI: options.hasUI ?? true,
		mode: "tui",
		isIdle: () => idle,
		hasPendingMessages: () => pendingMessages,
		abort: () => {
			aborted = true;
		},
		ui,
	};

	// biome-ignore lint/suspicious/noExplicitAny: handler parameters are
	// contravariant, so `any` is what makes one implementation assignable to
	// every overload in ExtensionAPI["on"] without an assertion.
	const on = (event: string, handler: (e: any, c: any) => unknown) => {
		const list = events.get(event) ?? [];
		list.push(handler);
		events.set(event, list);
	};

	const api: PiSurface = {
		on,
		registerCommand(name, commandOptions) {
			commands.set(name, commandOptions);
		},
		registerEntryRenderer(customType: string, renderer: unknown) {
			entryRenderers.set(customType, renderer);
		},
		sendMessage(
			message: { customType: string; content: string | unknown[]; display: boolean; details?: unknown },
			sendOptions,
		) {
			messages.push({ ...message, ...(sendOptions ?? {}) });
		},
		appendEntry(customType: string, data?: unknown) {
			entries.push({ customType, data });
		},
		async exec(command: string, args: string[], execOptions?: ExecOptions) {
			execCalls.push({ command, args, options: execOptions });
			const hit = scripted.find(
				(s) =>
					(s.match.command === undefined || s.match.command === command) &&
					(s.match.argsInclude === undefined || s.match.argsInclude.every((a) => args.includes(a))) &&
					(s.match.argsContain === undefined ||
						s.match.argsContain.every((needle) => args.some((arg) => arg.includes(needle)))),
			);
			if (hit) return hit.result;
			return fallbackExec({ command, args, options: execOptions });
		},
	};

	return {
		api,
		ctx,
		commands,
		events,
		entryRenderers,
		execCalls,
		notifications,
		statuses,
		widgets,
		messages,
		entries,

		onExec(match, result) {
			scripted.push({ match, result: { ...okResult, ...result } });
		},
		setExec(responder) {
			fallbackExec = responder;
		},
		setIdle(value) {
			idle = value;
		},
		wasAborted() {
			return aborted;
		},
		setPendingMessages(value) {
			pendingMessages = value;
		},

		async emit(event, payload) {
			const handlers = events.get(event) ?? [];
			const results: unknown[] = [];
			for (const handler of handlers) {
				results.push(await handler(payload, ctx));
			}
			// Extensions that defer work past the handler (timers, microtasks)
			// need a beat for the deferred callback to run before assertions.
			await new Promise((resolve) => setTimeout(resolve, 250));
			return results;
		},
		async invokeCommand(name, args = "") {
			const command = commands.get(name);
			if (!command) throw new Error(`No command registered named "${name}"`);
			await command.handler(args, ctx as unknown as ExtensionCommandContext);
		},

		status(key) {
			return statuses.get(key);
		},
		widget(key) {
			return widgets.get(key);
		},
	};
}
