/** Pure ordering rules for the agent's attached skill list. The list is the
    source of truth: every mutation produces a full ordered id array, which is
    exactly what POST /agents/:id/skills accepts. */

/** Append a skill to the end of the attached list (idempotent). */
export function attach(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

/** Remove a skill from the attached list. */
export function detach(ids: string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/** Move the item at `from` to `to`, clamping both ends. A no-op move returns
    the same array so callers can skip a pointless request. */
export function reorder(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || from >= ids.length) return ids;
  const target = Math.max(0, Math.min(ids.length - 1, to));
  if (target === from) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved!);
  return next;
}
