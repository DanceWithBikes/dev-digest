import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { OnboardingStatus, OnboardingTour } from '@devdigest/shared';
import type { OnboardingStore, RepoInfo } from './ports.js';
import { overlayColumns, type StoredTour } from './helpers.js';

/**
 * Onboarding data-access. Owns the `onboarding` table (one row per repo);
 * reads the repo's coordinates from `repos`. Workspace-scoped throughout.
 * The `status` / `commit_sha` / `last_failed_*` columns win over the JSON body.
 */
export class OnboardingRepository implements OnboardingStore {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoInfo | null> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  /** A stored body that no longer parses is treated as "no tour" rather than an error. */
  async getTour(workspaceId: string, repoId: string): Promise<StoredTour> {
    const [row] = await this.db
      .select()
      .from(t.onboarding)
      .where(and(eq(t.onboarding.workspaceId, workspaceId), eq(t.onboarding.repoId, repoId)));
    if (!row) return { tour: null, lastFailed: null };

    const failedStatus = OnboardingStatus.safeParse(row.lastFailedStatus);
    const lastFailed =
      failedStatus.success && row.lastFailedAt
        ? { status: failedStatus.data, at: row.lastFailedAt.toISOString() }
        : null;

    const parsed = OnboardingTour.safeParse(row.json);
    if (!parsed.success) return { tour: null, lastFailed };
    return {
      tour: overlayColumns(parsed.data, { status: row.status, commitSha: row.commitSha }),
      lastFailed,
    };
  }

  async replaceTour(workspaceId: string, repoId: string, tour: OnboardingTour): Promise<void> {
    const values = {
      json: tour,
      commitSha: tour.commit_sha,
      status: tour.status,
      generatedAt: new Date(tour.generated_at),
      lastFailedStatus: null,
      lastFailedAt: null,
    };
    await this.db
      .insert(t.onboarding)
      .values({ repoId, workspaceId, ...values })
      .onConflictDoUpdate({
        target: t.onboarding.repoId,
        set: values,
        setWhere: eq(t.onboarding.workspaceId, workspaceId),
      });
  }

  async recordFailedAttempt(
    workspaceId: string,
    repoId: string,
    status: OnboardingStatus,
    at: Date,
  ): Promise<void> {
    await this.db
      .update(t.onboarding)
      .set({ lastFailedStatus: status, lastFailedAt: at })
      .where(and(eq(t.onboarding.workspaceId, workspaceId), eq(t.onboarding.repoId, repoId)));
  }
}
