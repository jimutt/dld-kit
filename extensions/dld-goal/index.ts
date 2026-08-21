import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatDoctorReport, runDoctor } from "./doctor.ts";

/**
 * The pi API members this extension uses. Narrower than ExtensionAPI so the
 * test harness can pass its fake directly: anything used here but absent from
 * the fake is a compile error rather than a runtime TypeError.
 */
export type DldGoalApi = Pick<ExtensionAPI, "registerCommand" | "exec" | "appendEntry">;

// @decision(DL-006)
export default function dldGoalExtension(pi: DldGoalApi): void {
	pi.registerCommand("dld-goal-doctor", {
		description: "Check that dld-goal can run: bash, jq, skill scripts, and workspace config",
		handler: async (_args, ctx) => {
			const report = await runDoctor(
				(command, commandArgs, options) => pi.exec(command, commandArgs, options),
				ctx.cwd,
			);
			const text = formatDoctorReport(report);

			// notify() is a no-op without a UI, which would make a diagnostic
			// command silently produce nothing in print and RPC modes.
			if (ctx.hasUI) {
				ctx.ui.notify(text, report.ok ? "info" : "warning");
			} else {
				pi.appendEntry("dld-goal-doctor", { report, text });
			}
		},
	});
}
