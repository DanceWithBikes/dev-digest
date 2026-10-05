import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from './constants.js';
import type { BriefGate } from './ports.js';

/** Per-process state: a per-workspace sliding window of POSTs and per-PR generation tokens. */
export class InMemoryBriefGate implements BriefGate {
  private tokens = new Map<string, number>();
  private posts = new Map<string, number[]>();
  private counter = 0;

  admit(workspaceId: string, now: number): boolean {
    // Workspaces whose newest POST is out of the window hold nothing worth keeping.
    for (const [ws, at] of this.posts) {
      if (ws !== workspaceId && now - at[at.length - 1]! >= RATE_LIMIT_WINDOW_MS) this.posts.delete(ws);
    }
    const recent = (this.posts.get(workspaceId) ?? []).filter((at) => now - at < RATE_LIMIT_WINDOW_MS);
    // Every POST counts, including the rejected ones: pruned by age only.
    recent.push(now);
    // More than MAX + 1 entries cannot change a decision (the newest ones stay), so cap them.
    const kept = recent.length > RATE_LIMIT_MAX + 1 ? recent.slice(-(RATE_LIMIT_MAX + 1)) : recent;
    this.posts.set(workspaceId, kept);
    return recent.length <= RATE_LIMIT_MAX;
  }

  tryBegin(prId: string): number | null {
    if (this.tokens.has(prId)) return null;
    this.counter += 1;
    this.tokens.set(prId, this.counter);
    return this.counter;
  }

  isCurrent(prId: string, token: number): boolean {
    return this.tokens.get(prId) === token;
  }

  end(prId: string, token: number): void {
    if (this.tokens.get(prId) === token) this.tokens.delete(prId);
  }
}
