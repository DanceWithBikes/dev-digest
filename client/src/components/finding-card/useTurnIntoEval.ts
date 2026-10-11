"use client";

import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { useCreateEvalCaseFromFinding } from "@/lib/hooks/evals";
import { notify } from "@/lib/toast";

/** "Turn into eval case" for one finding: the mutation plus its toasts. The agent
    is resolved server-side from the finding's review. `ownerId` is set once the
    case exists (it drives the "Open in Evals" link). */
export function useTurnIntoEval(f: FindingRecord) {
  const t = useTranslations("prReview");
  const create = useCreateEvalCaseFromFinding();
  const decided = !!f.accepted_at || !!f.dismissed_at;

  return {
    ownerId: create.data?.owner_id ?? null,
    pending: create.isPending,
    // AC-72/74: needs a decision first, and no double submit.
    disabled: !decided || create.isPending,
    hint: decided ? undefined : t("finding.evalNeedsDecision"),
    turnIntoEval: () =>
      create.mutate(
        { findingId: f.id },
        {
          onSuccess: () => notify.success(t("finding.evalCreated")),
          onError: (err) => notify.error(err.message),
        },
      ),
  };
}
