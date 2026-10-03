/* FileTree — the document list grouped by directory, with a path search box and
   a token chip per document (the server's figure, never estimated here). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TextInput } from "@devdigest/ui";
import type { ContextDocument } from "@devdigest/shared";
import { buildTree, filterPaths } from "../../helpers";
import { s } from "./styles";

export function FileTree({
  documents,
  selected,
  onSelect,
}: {
  documents: ContextDocument[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("context");
  const [query, setQuery] = React.useState("");
  const shown = filterPaths(documents, query);
  const tokens = new Map(documents.map((d) => [d.path, d.tokens]));
  const tree = buildTree(shown.map((d) => d.path));
  return (
    <nav style={s.panel} aria-label={t("treeLabel")}>
      <TextInput value={query} onChange={setQuery} placeholder={t("search")} aria-label={t("search")} />
      {tree.length === 0 && query.trim() !== "" && <div style={s.none}>{t("noMatches", { q: query.trim() })}</div>}
      {tree.map((g) => (
        <div key={g.dir}>
          {g.dir && <div style={s.dir}>{g.dir}</div>}
          {g.files.map((f) => (
            <button
              key={f.path}
              type="button"
              style={s.file(f.path === selected)}
              aria-current={f.path === selected ? "true" : undefined}
              title={f.path}
              onClick={() => onSelect(f.path)}
            >
              <span style={s.name}>{f.name}</span>
              <span style={s.tokens}>{t("tokens", { count: tokens.get(f.path) ?? 0 })}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
