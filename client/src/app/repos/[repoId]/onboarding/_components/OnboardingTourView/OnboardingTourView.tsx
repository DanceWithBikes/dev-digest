/* /repos/:repoId/onboarding — the Onboarding Tour page (SPEC-02 AC-72..AC-107).

   Everything shown comes from GET /repos/:id/onboarding. A generation is only
   ever requested by a click on "Generate onboarding tour" or "Regenerate". */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { OnboardingSectionId, OnboardingTour } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useGenerateOnboardingTour } from "@/lib/hooks/onboarding";
import { SECTION_IDS } from "./constants";
import { sectionIdFromHash } from "./helpers";
import { s } from "./styles";
import { useGenerationPolling } from "./useGenerationPolling";
import { ArchitectureSection } from "./_components/ArchitectureSection";
import { FirstTasksSection } from "./_components/FirstTasksSection";
import { PathListSection } from "./_components/PathListSection";
import { RunLocallySection } from "./_components/RunLocallySection";
import { StatusBanner } from "./_components/StatusBanner";
import { TourHeader } from "./_components/TourHeader";
import { TourToc } from "./_components/TourToc";

function Sections({ tour }: { tour: OnboardingTour }) {
  const [architecture, critical, run, reading, tasks] = tour.sections;
  const common = { fullName: tour.repo_full_name, commitSha: tour.commit_sha };
  const unavailable = tour.status === "unsupported_language";
  return (
    <>
      <ArchitectureSection section={architecture} fullName={tour.repo_full_name} />
      <PathListSection id="critical-paths" origin={critical.origin} entries={critical.entries} unavailable={unavailable} {...common} />
      <RunLocallySection section={run} />
      <PathListSection id="reading-path" origin={reading.origin} entries={reading.entries} unavailable={unavailable} {...common} />
      <FirstTasksSection section={tasks} {...common} />
    </>
  );
}

export function OnboardingTourView() {
  const t = useTranslations("onboarding");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const { query, generating, begin, timedOut } = useGenerationPolling(repoId);
  const generate = useGenerateOnboardingTour(repoId);
  const [activeId, setActiveId] = React.useState<OnboardingSectionId>("architecture");

  const { data, isLoading, isError, refetch } = query;
  const busy = generating || generate.isPending;
  const tour = data?.tour ?? null;
  const crumb = [{ label: activeRepo?.full_name ?? "" }, { label: t("title") }];

  const generateError = generate.isError && (
    <div role="alert" style={{ ...s.banner, ...s.bannerWarn }}>
      {t("generateError", {
        message: generate.error instanceof Error ? generate.error.message : t("unknownError"),
      })}
    </div>
  );

  const requestGeneration = () => generate.mutate(undefined, { onSuccess: begin });

  const goTo = React.useCallback((id: OnboardingSectionId) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
    setActiveId(id);
  }, []);

  // A URL fragment naming a section scrolls to it once the sections exist (AC-77).
  const hasTour = tour !== null;
  React.useEffect(() => {
    if (!hasTour) return;
    const id = sectionIdFromHash(window.location.hash, SECTION_IDS);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
    setActiveId(id as OnboardingSectionId);
  }, [hasTour]);

  return (
    <AppShell crumb={crumb}>
      {isLoading && (
        <div style={s.page}>
          <Skeleton height={240} />
        </div>
      )}
      {isError && <ErrorState title={t("loadError.title")} onRetry={() => refetch()} />}

      {data && !tour && (
        <>
          {(timedOut || generateError) && (
            <div style={{ ...s.page, paddingBottom: 0 }}>
              <div style={s.main}>
                {generateError}
                <StatusBanner status="ready" stale={false} lastFailed={data.last_failed} timedOut={timedOut} />
              </div>
            </div>
          )}
          <EmptyState
            icon="Boxes"
            title={t("generate.title")}
            body={t("generate.body")}
            cta={busy ? t("generating") : t("generate.cta")}
            ctaLoading={busy}
            onCta={busy ? undefined : requestGeneration}
          />
        </>
      )}

      {data && tour && (
        <div style={s.page}>
          <TourToc activeId={activeId} onSelect={goTo} />
          <div style={s.main}>
            <TourHeader tour={tour} busy={busy} onRegenerate={requestGeneration} />
            {generateError}
            <StatusBanner status={tour.status} stale={data.stale} lastFailed={data.last_failed} timedOut={timedOut} />
            <Sections tour={tour} />
          </div>
        </div>
      )}

    </AppShell>
  );
}
