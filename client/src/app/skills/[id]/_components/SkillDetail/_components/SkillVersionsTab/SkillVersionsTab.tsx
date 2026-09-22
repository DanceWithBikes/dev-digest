/* SkillVersionsTab — every immutable snapshot of this skill's body, newest
   first. The current version is the reference point: it is the only row with no
   Diff and no Restore, because both would be a no-op against itself.

   Restore does not rewrite history server-side — it writes a NEW version
   carrying the old body — so the list grows instead of losing rows. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useToast } from "../../../../../../../lib/toast";
import { useRestoreSkillVersion, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { VersionDiffModal } from "./_components/VersionDiffModal";
import { formatVersionDate } from "./helpers";
import { s } from "./styles";

export function SkillVersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();

  const [diffing, setDiffing] = React.useState<SkillVersion | null>(null);

  if (isLoading) {
    return (
      <div style={s.list}>
        <Skeleton height={54} />
        <Skeleton height={54} />
      </div>
    );
  }

  if (isError) {
    return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;
  }

  if (!versions || versions.length === 0) {
    return <EmptyState icon="History" title={t("versions.emptyTitle")} body={t("versions.emptyBody")} />;
  }

  return (
    <div style={s.list}>
      {versions.map((version) => {
        const current = version.version === skill.version;
        return (
          <div key={version.version} style={s.row(current)}>
            <span className="mono tnum" style={s.version}>
              {t("preview.version", { version: version.version })}
            </span>
            <span style={s.date}>{formatVersionDate(version.created_at)}</span>
            {current && <Badge color="var(--accent)">{t("versions.current")}</Badge>}
            <div style={s.spacer} />
            {!current && (
              <>
                <Button kind="ghost" size="sm" icon="Code" onClick={() => setDiffing(version)}>
                  {t("versions.diff")}
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="History"
                  disabled={restore.isPending}
                  onClick={() =>
                    restore.mutate(
                      { id: skill.id, version: version.version },
                      {
                        onSuccess: (saved) =>
                          toast.success(
                            t("versions.restoredToast", {
                              version: version.version,
                              newVersion: saved.version,
                            }),
                          ),
                      },
                    )
                  }
                >
                  {restore.isPending && restore.variables?.version === version.version
                    ? t("versions.restoring")
                    : t("versions.restore")}
                </Button>
              </>
            )}
          </div>
        );
      })}

      {diffing && (
        <VersionDiffModal
          skillName={skill.name}
          version={diffing.version}
          versionBody={diffing.body}
          currentBody={skill.body}
          currentVersion={skill.version}
          onClose={() => setDiffing(null)}
        />
      )}
    </div>
  );
}
