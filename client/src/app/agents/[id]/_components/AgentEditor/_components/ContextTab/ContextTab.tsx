/* ContextTab — attach a repo's Project Context documents to this agent. The
   picker defaults to the active repo; the panel owns the list, totals and Save. */
"use client";

import React from "react";
import type { Agent } from "@devdigest/shared";
import { ContextSelectionPanel } from "@/components/context-selection";
import { useActiveRepo } from "@/lib/repo-context";

export function ContextTab({ agent }: { agent: Agent }) {
  const { activeRepo } = useActiveRepo();
  const [picked, setPicked] = React.useState<string | null>(null);
  return (
    <div style={{ maxWidth: 720 }}>
      <ContextSelectionPanel
        ownerKind="agent"
        ownerId={agent.id}
        repoId={picked ?? activeRepo?.id ?? null}
        onRepoChange={setPicked}
      />
    </div>
  );
}
