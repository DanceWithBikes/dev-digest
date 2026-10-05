import React from "react";
import { Markdown } from "@devdigest/ui";
import { isRepoLink } from "../../helpers";

/** Model-written Markdown: no raw HTML, and only links into this repo stay links (AC-99, AC-100). */
export function TourMarkdown({ children, fullName }: { children: string; fullName: string }) {
  return <Markdown isAllowedHref={(href) => isRepoLink(href, fullName)}>{children}</Markdown>;
}
