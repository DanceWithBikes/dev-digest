import type { CiExportInputBody } from "@devdigest/shared";

/** Wizard step keys, in order (labels under `ci.exportWizard.steps`). */
export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;
export const LAST_STEP = STEP_KEYS.length - 1;
export const CONFIGURE_STEP = 2;

/** Trigger chips in display order; `reopened` is off by default (AC-96). */
export const TRIGGER_VALUES = ["opened", "synchronize", "reopened"] as const;
export type Trigger = (typeof TRIGGER_VALUES)[number];
export const DEFAULT_TRIGGERS: readonly Trigger[] = ["opened", "synchronize"];

export type PostAs = NonNullable<CiExportInputBody["post_as"]>;
export type InstallMode = NonNullable<CiExportInputBody["mode"]>;

/** "Post results as" choices; the first is recommended and the default (AC-100). */
export const POST_AS_OPTIONS: readonly { value: PostAs; labelKey: string }[] = [
  { value: "github_review", labelKey: "githubReview" },
  { value: "pr_comment", labelKey: "prComment" },
  { value: "none", labelKey: "none" },
];
export const DEFAULT_POST_AS: PostAs = "github_review";

/** The one secret the workflow needs; named here, never asked for (AC-98, AC-108). */
export const SECRET_NAME = "OPENROUTER_API_KEY";
export const GITHUB_TOKEN_NAME = "GITHUB_TOKEN";
