import { join } from "node:path";
import { CONFIG_FILE, LOCAL_FILE, type PersonalSettings, parseLocalSettings } from "./config.ts";
import type { Context } from "./context.ts";
import { DldError, EXIT_USAGE } from "./errors.ts";
import type { Project } from "./project.ts";

export const REVIEW_STEPS = ["implement", "plan"] as const;
export type ReviewStep = (typeof REVIEW_STEPS)[number];

export type SettingSource = typeof LOCAL_FILE | typeof CONFIG_FILE | "default";

export interface ReviewSettings {
  review: boolean;
  reviewFrom: SettingSource;
  /** The model to review with, or undefined for the harness's default. */
  model?: string;
  modelFrom: SettingSource;
}

const STEP_KEYS = {
  implement: { review: "implementReview", model: "implementReviewModel" },
  plan: { review: "planReview", model: "planReviewModel" },
} as const;

/** Reviews that run when no file sets them (DL-089: plans are not reviewed by default). */
const REVIEWS_BY_DEFAULT: Record<ReviewStep, boolean> = { implement: true, plan: false };

export function isReviewStep(value: string): value is ReviewStep {
  return REVIEW_STEPS.some((step) => step === value);
}

// @decision(DL-087)
/** The settings in the project's `dld.local.yaml`, or none when it doesn't exist. */
export function readLocalSettings(ctx: Context, project: Project): PersonalSettings {
  const path = join(project.paths.root, LOCAL_FILE);
  if (!ctx.fs.exists(path)) return {};
  return parseLocalSettings(ctx.fs.readFile(path), (message) => ctx.warn(message));
}

// @decision(DL-087) @decision(DL-088) @decision(DL-089)
/**
 * A review step's effective settings: `dld.local.yaml` over `dld.config.yaml` over the default.
 * Within a file, the step's own model key wins over `review_model`.
 */
export function reviewSettings(ctx: Context, project: Project, step: string): ReviewSettings {
  if (!isReviewStep(step)) {
    throw new DldError(
      `unknown review step '${step}'; expected ${REVIEW_STEPS.join(" or ")}.`,
      EXIT_USAGE,
    );
  }
  const keys = STEP_KEYS[step];
  const layers: [SettingSource, PersonalSettings][] = [
    [LOCAL_FILE, readLocalSettings(ctx, project)],
    [CONFIG_FILE, project.config.personal],
  ];
  let review: Pick<ReviewSettings, "review" | "reviewFrom"> = {
    review: REVIEWS_BY_DEFAULT[step],
    reviewFrom: "default",
  };
  const reviewLayer = layers.find(([, settings]) => settings[keys.review] !== undefined);
  if (reviewLayer !== undefined) {
    const [from, settings] = reviewLayer;
    review = { review: settings[keys.review] === true, reviewFrom: from };
  }
  for (const [from, settings] of layers) {
    const model = settings[keys.model] ?? settings.reviewModel;
    if (model !== undefined) return { ...review, model, modelFrom: from };
  }
  return { ...review, modelFrom: "default" };
}

/** The lines `dld review-settings` prints. */
export function formatReviewSettings(settings: ReviewSettings): string {
  return [
    `review: ${settings.review ? "on" : "off"}`,
    `review_from: ${settings.reviewFrom}`,
    `model: ${settings.model ?? "default"}`,
    `model_from: ${settings.modelFrom}`,
    "",
  ].join("\n");
}
