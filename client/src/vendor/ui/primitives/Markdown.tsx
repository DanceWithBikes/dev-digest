import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown renderer (replaces prototype mdLite). Inline + GFM, no raw HTML.
 * `isAllowedHref` is an optional link policy: a link it rejects renders its
 * text without an anchor. Omitted = every link is kept (unchanged default).
 */
export function Markdown({
  children,
  isAllowedHref,
}: {
  children?: string | null;
  isAllowedHref?: (href: string) => boolean;
}) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => (
            <code
              className="mono"
              style={{
                fontSize: "0.92em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--bg-hover)",
                color: "var(--accent-text)",
              }}
            >
              {children}
            </code>
          ),
          a: ({ children, href }) =>
            isAllowedHref && !(href && isAllowedHref(href)) ? (
              <>{children}</>
            ) : (
              <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
                {children}
              </a>
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
