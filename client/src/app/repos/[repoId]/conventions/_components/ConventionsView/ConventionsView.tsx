/* /repos/:repoId/conventions — the Skills Lab's Conventions page.

   Scan the repo for house rules, triage the candidates, and assemble the
   accepted ones into a single skill. Triage state lives on the server, not in
   this component: a rejection has to survive a reload, which is the whole point
   of rejecting rather than ignoring. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useToast } from "@/lib/toast";
import {
  useConventions,
  useExtractConventions,
  usePatchConvention,
} from "@/lib/hooks/conventions";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { acceptedCandidates, hasScanned, pendingCandidates } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const toast = useToast();
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;

  const { data: candidates, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const patch = usePatchConvention(repoId);
  const [creating, setCreating] = React.useState(false);

  const pending = pendingCandidates(candidates ?? []);
  const accepted = acceptedCandidates(candidates ?? []);
  const scanned = hasScanned(candidates);

  const runScan = () =>
    extract.mutate(undefined, {
      onSuccess: (scan) =>
        toast.success(t("page.scanDone", { count: scan.candidates.length, files: scan.sampled_files.length })),
    });

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
      <div style={s.wrap}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          {/* Two buttons, one request: the first scan and a re-scan promise
              different things to someone who has already triaged a list. */}
          {scanned ? (
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={extract.isPending}
              disabled={extract.isPending}
              onClick={runScan}
            >
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          ) : (
            <Button
              kind="primary"
              size="sm"
              icon="Search"
              loading={extract.isPending}
              disabled={extract.isPending}
              onClick={runScan}
            >
              {extract.isPending ? t("page.scanning") : t("page.runScan")}
            </Button>
          )}
          {/* Appears only once something has been accepted — there is nothing to
              assemble before that. */}
          {accepted.length > 0 && (
            <Button kind="primary" size="sm" icon="Sparkles" onClick={() => setCreating(true)}>
              {t("page.createSkill")}
            </Button>
          )}
        </div>

        {extract.isError && <div style={s.scanError}>{t("page.scanFailed")}</div>}

        {isLoading && <Skeleton height={140} />}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}

        {!isLoading && !isError && !scanned && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.runScan")}
            onCta={runScan}
          />
        )}

        {accepted.length > 0 && (
          <>
            <div style={s.sectionLabel}>{t("page.acceptedSection", { count: accepted.length })}</div>
            <div style={s.acceptedNote}>{t("page.acceptedNote")}</div>
            <div style={s.grid}>
              {accepted.map((c) => (
                <ConventionCard
                  key={c.id}
                  candidate={c}
                  busy={patch.isPending}
                  onAccept={() => patch.mutate({ id: c.id, patch: { status: "accepted" } })}
                  onUnaccept={() => patch.mutate({ id: c.id, patch: { status: "pending" } })}
                  onReject={() => patch.mutate({ id: c.id, patch: { status: "rejected" } })}
                  onEdit={(p) => patch.mutate({ id: c.id, patch: p })}
                />
              ))}
            </div>
          </>
        )}

        {pending.length > 0 && (
          <>
            <div style={s.sectionLabel}>{t("page.pendingSection", { count: pending.length })}</div>
            <div style={s.grid}>
              {pending.map((c) => (
                <ConventionCard
                  key={c.id}
                  candidate={c}
                  busy={patch.isPending}
                  onAccept={() => patch.mutate({ id: c.id, patch: { status: "accepted" } })}
                  onReject={() => patch.mutate({ id: c.id, patch: { status: "rejected" } })}
                  onEdit={(p) => patch.mutate({ id: c.id, patch: p })}
                />
              ))}
            </div>
          </>
        )}

        {scanned && pending.length === 0 && accepted.length === 0 && (
          <EmptyState
            icon="ListChecks"
            title={t("page.allTriaged.title")}
            body={t("page.allTriaged.body")}
            cta={t("page.rescan")}
            onCta={runScan}
          />
        )}
      </div>

      {creating && (
        <CreateSkillModal
          repoId={repoId}
          acceptedCount={accepted.length}
          onClose={() => setCreating(false)}
          onCreated={(name) => {
            toast.success(t("page.skillCreated", { name }));
            setCreating(false);
          }}
        />
      )}
    </AppShell>
  );
}
