import type { IconName } from "@devdigest/ui";

/** Accent colour + icon given to an agent by its position in the list (modulo
    the length), so a card on Configure run and its column/tab on the results
    page look alike. */
export const PALETTE: readonly { color: string; icon: IconName }[] = [
  { color: "var(--accent)", icon: "Sparkles" },
  { color: "var(--ok)", icon: "Shield" },
  { color: "var(--warn)", icon: "Zap" },
  { color: "var(--info)", icon: "Brain" },
  { color: "var(--crit)", icon: "Bug" },
  { color: "var(--sugg)", icon: "Target" },
];
