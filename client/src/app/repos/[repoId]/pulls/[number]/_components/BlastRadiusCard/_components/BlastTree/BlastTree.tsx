/* BlastTree — the Tree view: one SymbolNode per changed symbol, in the
   server's rank order (never re-sorted). The first symbol opens by default. */
import React from "react";
import type { BlastRadius } from "@devdigest/shared";
import { SymbolNode } from "./_components/SymbolNode";
import { s } from "./styles";

export function BlastTree({
  downstream,
  repoFullName,
  headSha,
}: {
  downstream: BlastRadius["downstream"];
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  return (
    <div style={s.tree}>
      {downstream.map((group, i) => (
        <SymbolNode
          key={group.symbol}
          group={group}
          defaultOpen={i === 0}
          repoFullName={repoFullName}
          headSha={headSha}
        />
      ))}
    </div>
  );
}
