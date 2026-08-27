// @decision(DL-024) @decision(DL-023)
// The dispatch guard with bounded re-delivery, extracted as a pure state
// machine. The guard prevents the loop from spamming an identical dispatch
// when a turn ends without advancing the item, while allowing one re-delivery
// before surfacing a wedge.
//
// The policy: first suppression re-delivers (the turn may have ended for
// reasons unrelated to the work); second suppression surfaces a wedge
// message and the loop stays quiet. Never two re-deliveries in a row.

export type GuardVerdict = "new" | "redeliver" | "suppress" | "wedged";

export class DispatchGuard {
	/** Which item each session was last told to work. */
	private lastDispatch = new Map<string, string>();
	/** Session+item keys that have used their one re-delivery. */
	private redispatched = new Set<string>();
	/** Session+item keys that have been surfaced as wedged. */
	private wedged = new Set<string>();

	/**
	 * Classify a potential dispatch. The caller acts on the verdict:
	 * - "new": dispatch normally, then call record()
	 * - "redeliver": re-dispatch once, then call record()
	 * - "suppress": do not dispatch; the item is in-flight
	 * - "wedged": do not dispatch; surface the wedge to the user
	 */
	classify(session: string, dispatchKey: string): GuardVerdict {
		if (this.lastDispatch.get(session) !== dispatchKey) return "new";
		const sessionKey = `${session}:${dispatchKey}`;
		if (!this.redispatched.has(sessionKey)) {
			// First suppression: allow one re-delivery.
			this.redispatched.add(sessionKey);
			return "redeliver";
		}
		if (!this.wedged.has(sessionKey)) {
			// Second suppression: surface the wedge once.
			this.wedged.add(sessionKey);
			return "wedged";
		}
		return "suppress";
	}

	/** Record that a dispatch was made. */
	record(session: string, dispatchKey: string): void {
		this.lastDispatch.set(session, dispatchKey);
	}

	/** Clear a session's dispatch state — on resume, pause, or retry. */
	clearSession(session: string): void {
		this.lastDispatch.delete(session);
		// Clear re-delivery and wedge state for this session. The key format
		// is `${session}:${dispatchKey}` — match the session exactly.
		const prefix = `${session}:`;
		for (const key of this.redispatched) {
			if (key.startsWith(prefix)) this.redispatched.delete(key);
		}
		for (const key of this.wedged) {
			if (key.startsWith(prefix)) this.wedged.delete(key);
		}
	}

	/** Clear all state — on new run or explicit reset. */
	clear(): void {
		this.lastDispatch.clear();
		this.redispatched.clear();
		this.wedged.clear();
	}
}
