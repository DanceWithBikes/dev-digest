/* VersionDiffModal — an older snapshot against the CURRENT body, rendered by
   the shared DiffViewer. The viewer speaks unified-diff text (it was built for
   GitHub patches), so the pair of bodies is turned into one synthetic file
   first; nothing here re-implements diff rendering. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import { DiffViewer } from "@/components/diff-viewer";
import { DIFF_PATH_SUFFIX } from "../../constants";
import { toDiffFile } from "../../helpers";
import { s } from "./styles";

export function VersionDiffModal({
  skillName,
  version,
  versionBody,
  currentBody,
  currentVersion,
  onClose,
}: {
  skillName: string;
  version: number;
  versionBody: string;
  currentBody: string;
  currentVersion: number;
  onClose: () => void;
}) {
  const t = useTranslations("skills");

  // Old on the left (−), current on the right (+): the diff reads as "what has
  // happened since this version", which is what Restore would undo.
  const file = React.useMemo(
    () => toDiffFile(skillName + DIFF_PATH_SUFFIX, versionBody, currentBody),
    [skillName, versionBody, currentBody],
  );

  const identical = file.additions === 0 && file.deletions === 0;

  return (
    <Modal
      width={900}
      title={t("versions.diffTitle", { version })}
      subtitle={t("versions.diffSubtitle", { version, current: currentVersion })}
      onClose={onClose}
    >
      <div style={s.body}>
        {identical ? (
          <div style={s.identical}>{t("versions.diffIdentical")}</div>
        ) : (
          <DiffViewer files={[file]} />
        )}
      </div>
    </Modal>
  );
}
