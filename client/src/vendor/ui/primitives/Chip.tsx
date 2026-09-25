import React from "react";
import { Icon, type IconName } from "../icons";

export function Chip({
  children,
  active,
  onClick,
  icon,
  count,
  color,
  href,
}: {
  children?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  icon?: IconName;
  count?: number;
  color?: string;
  /** When set, renders an anchor that opens in a new tab (middle-click works) instead of a button. */
  href?: string;
}) {
  const I = icon ? Icon[icon] : null;
  const [h, setH] = React.useState(false);
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 12px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    transition: "all .12s",
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
    background: active ? "var(--accent-bg)" : h ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--accent-text)" : h ? "var(--text-primary)" : "var(--text-secondary)",
  };
  const content = (
    <>
      {I && <I size={13} style={color ? { color } : undefined} />}
      {children}
      {count != null && (
        <span className="tnum" style={{ opacity: 0.7, fontSize: 12 }}>
          {count}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setH(true)}
        onMouseLeave={() => setH(false)}
        style={{ ...style, textDecoration: "none" }}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={style}
    >
      {content}
    </button>
  );
}
