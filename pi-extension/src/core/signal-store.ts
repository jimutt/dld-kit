// SignalStore: append-only, reactive store for DLD signals emitted by
// the agent during long /dld-plan and /dld-implement runs.
//
// Pi-agnostic by design — the audit JSONL write (pi.appendEntry) and
// the overlay/footer wiring live in features/, not here. This module
// exists so we can unit-test the data model + reactivity without any
// Pi runtime.
//

/**
 * Kinds of signal an agent can emit. Each maps to a default urgency
 * level (see DEFAULT_URGENCY) so skills can omit `urgency` at the
 * call site.
 */
export type SignalKind =
	/** Passive update; "I did X". Rarely actioned. */
	| "progress"
	/** Soft heads-up: "look at this when you have a moment". */
	| "review"
	/** "I think we should revisit DL-N before/after this run". */
	| "amend-needed"
	/** Audit trail: "reviewer said X, I skipped because Y". */
	| "review-skipped"
	/** Soft question: "two options, picking default unless you say so". */
	| "question"
	/** Hard halt: "I literally cannot continue without input". */
	| "blocked";

export type SignalUrgency =
	/** Skim, ignore in most cases. */
	| "info"
	/** Worth a glance; intervention optional. */
	| "review"
	/** Human must respond. Only `blocked` defaults to this. */
	| "act-now";

/**
 * Default-urgency mapping. Skill authors can omit `urgency` and rely
 * on these. They can also override per-call (e.g. a `progress` event
 * that's actually a milestone worth flagging as `review`).
 */
export const DEFAULT_URGENCY: Readonly<Record<SignalKind, SignalUrgency>> = {
	progress: "info",
	review: "review",
	"amend-needed": "review",
	"review-skipped": "info",
	question: "review",
	blocked: "act-now",
};

/**
 * A recorded signal. `id` and `ts` are assigned by the store; `read`
 * and `resolved` start false.
 */
export type Signal = Readonly<{
	id: string;
	ts: string;
	kind: SignalKind;
	urgency: SignalUrgency;
	title: string;
	detail?: string;
	decisionRef?: string;
	suggestedAction?: string;
	read: boolean;
	resolved: boolean;
}>;

/**
 * Input accepted by `add()`. `urgency` is optional and defaults to
 * `DEFAULT_URGENCY[kind]` if omitted.
 */
export type SignalInput = {
	kind: SignalKind;
	title: string;
	detail?: string;
	decisionRef?: string;
	suggestedAction?: string;
	urgency?: SignalUrgency;
};

export type ChangeReason =
	| { type: "added"; signal: Signal }
	| { type: "read"; id: string }
	| { type: "resolved"; id: string; note?: string };

export type ChangeListener = (reason: ChangeReason) => void;

/**
 * Append-only, in-memory store with reactive change notifications.
 *
 * Insertion order is preserved by `list()`; the panel chooses how to
 * render (we render newest-at-bottom, like a chat log).
 *
 * Read/resolved flags are bitflags on existing signals — they
 * mutate the record in place via a private setter, but the public
 * `Signal` type is Readonly to keep consumers honest.
 */
export class SignalStore {
	#signals: MutableSignal[] = [];
	#byId = new Map<string, MutableSignal>();
	#listeners = new Set<ChangeListener>();
	#counter = 0;
	#now: () => Date;

	constructor(opts: { now?: () => Date } = {}) {
		this.#now = opts.now ?? (() => new Date());
	}

	/**
	 * Append a new signal. Assigns id + ts, applies default urgency,
	 * notifies listeners. Returns the recorded signal.
	 */
	add(input: SignalInput): Signal {
		this.#counter += 1;
		const ts = this.#now().toISOString();
		const id = `sig-${this.#counter.toString().padStart(4, "0")}`;
		const urgency = input.urgency ?? DEFAULT_URGENCY[input.kind];

		const sig: MutableSignal = {
			id,
			ts,
			kind: input.kind,
			urgency,
			title: input.title,
			detail: input.detail,
			decisionRef: input.decisionRef,
			suggestedAction: input.suggestedAction,
			read: false,
			resolved: false,
		};
		this.#signals.push(sig);
		this.#byId.set(id, sig);
		this.#emit({ type: "added", signal: snapshot(sig) });
		return snapshot(sig);
	}

	/**
	 * Mark a signal as read. No-op if already read or unknown id.
	 * Returns true if a change occurred.
	 */
	markRead(id: string): boolean {
		const sig = this.#byId.get(id);
		if (!sig || sig.read) return false;
		sig.read = true;
		this.#emit({ type: "read", id });
		return true;
	}

	/**
	 * Mark every unread signal as read in one pass. Useful for the
	 * 'ack all' / 'clear the panel' hotkey. Fires one `read` event per
	 * flipped signal so existing listeners (panel re-render, footer
	 * refresh) work unchanged. Returns the count of signals flipped.
	 */
	markAllAsRead(): number {
		let n = 0;
		for (const sig of this.#signals) {
			if (!sig.read) {
				sig.read = true;
				this.#emit({ type: "read", id: sig.id });
				n += 1;
			}
		}
		return n;
	}

	/**
	 * Mark a signal as resolved (e.g. user intervened on a `blocked`
	 * one, or agent emitted a follow-up clarifying the original).
	 * Also marks as read. No-op if already resolved.
	 */
	markResolved(id: string, note?: string): boolean {
		const sig = this.#byId.get(id);
		if (!sig || sig.resolved) return false;
		sig.read = true;
		sig.resolved = true;
		this.#emit({ type: "resolved", id, note });
		return true;
	}

	get(id: string): Signal | undefined {
		const sig = this.#byId.get(id);
		return sig ? snapshot(sig) : undefined;
	}

	/** Oldest-first. Panel reverses for display. */
	list(): readonly Signal[] {
		return this.#signals.map(snapshot);
	}

	/** Number of unread signals (regardless of resolution). */
	unreadCount(): number {
		let n = 0;
		for (const s of this.#signals) if (!s.read) n += 1;
		return n;
	}

	/**
	 * Number of unread, unresolved signals at `act-now` urgency.
	 * Drives the colored footer badge.
	 */
	pendingActNowCount(): number {
		let n = 0;
		for (const s of this.#signals) {
			if (s.urgency === "act-now" && !s.resolved) n += 1;
		}
		return n;
	}

	/**
	 * Most recent unread, unresolved, non-`progress` signal — what
	 * `ctrl+space` (soft-interrupt) targets by default.
	 */
	latestActionable(): Signal | undefined {
		for (let i = this.#signals.length - 1; i >= 0; i -= 1) {
			const s = this.#signals[i]!;
			if (s.resolved) continue;
			if (s.kind === "progress") continue;
			return snapshot(s);
		}
		return undefined;
	}

	onChange(cb: ChangeListener): () => void {
		this.#listeners.add(cb);
		return () => this.#listeners.delete(cb);
	}

	/** Wipe everything. Used by /new session reset. */
	clear(): void {
		this.#signals = [];
		this.#byId.clear();
		this.#counter = 0;
		// No emit — clear is structural, not a per-signal change.
	}

	#emit(reason: ChangeReason): void {
		for (const cb of this.#listeners) {
			try {
				cb(reason);
			} catch {
				// A listener throwing shouldn't break the store or
				// prevent other listeners from running.
			}
		}
	}
}

type MutableSignal = {
	id: string;
	ts: string;
	kind: SignalKind;
	urgency: SignalUrgency;
	title: string;
	detail?: string;
	decisionRef?: string;
	suggestedAction?: string;
	read: boolean;
	resolved: boolean;
};

function snapshot(s: MutableSignal): Signal {
	// Spread freezes a copy so external consumers can't tamper with
	// the live record. Cheap; signals are tiny.
	return Object.freeze({ ...s });
}
