// Sample annotated source file for guardrail tests.
// Mirrors the real-world pattern used in the Genie repos: a single
// annotation block at the top of a function and a multi-decision block
// further down.

// @decision(DL-001)
export function issueSession(userId: string): string {
	// pretend to sign a JWT
	return `jwt:${userId}`;
}

// @decision(DL-001) @decision(DL-003)
export function validateSession(_token: string): boolean {
	// pretend to validate
	return true;
}
