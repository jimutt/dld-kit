import { loadProject } from "../../core/project.ts";
import { formatReviewSettings, REVIEW_STEPS, reviewSettings } from "../../core/review-settings.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";

// @decision(DL-088)
export const reviewSettingsCommand: Command = {
  name: "review-settings",
  summary: "Print whether a review step runs, and on which model",
  internal: true,
  usage: `Usage: dld review-settings <${REVIEW_STEPS.join("|")}>

Print the effective review settings for a step, with dld.local.yaml over dld.config.yaml
over the defaults (implement reviews, plan does not):

  review: on|off
  review_from: dld.local.yaml|dld.config.yaml|default
  model: <name>|default
  model_from: dld.local.yaml|dld.config.yaml|default
`,
  run(args, io, ctx) {
    const { positionals } = parseCommandArgs({
      args: [...args],
      options: {},
      allowPositionals: true,
    });
    const [step, ...rest] = positionals;
    if (step === undefined || rest.length > 0) {
      throw new UsageError(`expected one review step: ${REVIEW_STEPS.join(" or ")}`);
    }
    io.stdout(formatReviewSettings(reviewSettings(ctx, loadProject(ctx), step)));
    return EXIT_OK;
  },
};
