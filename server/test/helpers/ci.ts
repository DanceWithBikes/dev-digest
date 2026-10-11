import type { CiRunInsert, InstallationRecord, RepoRecord, UpsertInstallation } from '../../src/modules/ci/domain.js';
import type { AgentForCi, AgentSource, CiLog, CiStore } from '../../src/modules/ci/ports.js';

export const AGENT: AgentForCi = {
  id: 'agent-1', name: 'Reviewer', provider: 'openrouter', model: 'm',
  systemPrompt: 'p', strategy: 'auto', ciFailOn: 'critical', version: 2,
};
export const REPO: RepoRecord = { id: 'repo-1', owner: 'acme', name: 'api', fullName: 'acme/api', defaultBranch: 'main' };

export class FakeStore implements CiStore {
  installations: InstallationRecord[] = [];
  runs: CiRunInsert[] = [];
  upserts = 0;
  states: Record<string, string> = {};
  async findRepoByFullName(_w: string, n: string) { return n === REPO.fullName ? REPO : undefined; }
  async memoryForRepo() { return []; }
  async findInstallationByRepo(_w: string, repo: string) { return this.installations.find((i) => i.repo === repo); }
  async upsertInstallation(u: UpsertInstallation) {
    this.upserts += 1;
    const rec: InstallationRecord = {
      id: u.id, agentId: u.agentId, agentName: 'Reviewer', currentAgentVersion: u.agentVersion, repo: u.repo,
      githubRepoId: u.githubRepoId, state: 'pr_open', agentVersion: u.agentVersion, runnerVersion: u.runnerVersion,
      prUrl: u.prUrl, prNumber: u.prNumber, installedAt: new Date(), updatedAt: new Date(), latestRun: null,
    };
    this.installations = [...this.installations.filter((i) => i.repo !== u.repo), rec];
    return rec;
  }
  async listInstallations(_w: string, agentId?: string) {
    return this.installations.filter((i) => !agentId || i.agentId === agentId);
  }
  async ingestedKeys(_w: string, id: string) {
    return new Set(this.runs.filter((r) => r.installationId === id).map((r) => `${r.githubRunId}:${r.runAttempt}`));
  }
  async insertCiRun(r: CiRunInsert) {
    if (this.runs.some((x) => x.installationId === r.installationId && x.githubRunId === r.githubRunId && x.runAttempt === r.runAttempt)) return false;
    this.runs.push(r);
    return true;
  }
  async setInstallationState(_w: string, id: string, state: any) {
    this.states[id] = state;
    this.installations = this.installations.map((i) => (i.id === id ? { ...i, state } : i));
  }
  async hasIngestedRun(_w: string, id: string) { return this.runs.some((r) => r.installationId === id); }
  async listCiRuns() { return { rows: [], hasMore: false }; }
}

export function fakeAgents(skills: { id: string; name: string; body: string; enabled: boolean }[] = []): AgentSource {
  return {
    getById: async (_w, id) => (id === AGENT.id ? AGENT : undefined),
    linkedSkills: async () => skills.map((skill) => ({ skill })),
  };
}

export class CapturingLog implements CiLog {
  lines: { level: string; obj: Record<string, unknown>; msg?: string }[] = [];
  warn(obj: Record<string, unknown>, msg?: string) { this.lines.push({ level: 'warn', obj, msg }); }
  info(obj: Record<string, unknown>, msg?: string) { this.lines.push({ level: 'info', obj, msg }); }
}
