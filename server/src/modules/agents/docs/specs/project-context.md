# Spec: Project Context — server/modules/agents

Spec ID: SPEC-01
Status: approved
Overview: [../../../../../../docs/specs/project-context.md](../../../../../../docs/specs/project-context.md)

## Scope in this module

This module's behaviour does not change. The agent attachment store (AC-16, AC-18–AC-21, AC-70, AC-72) moved on 2026-10-01 to the new `project-context` module, whose part is [`../../../project-context/docs/specs/project-context.md`](../../../project-context/docs/specs/project-context.md). This file remains as a pointer for anyone looking for the feature from the agents side.

## Acceptance criteria (EARS)

- None. No criterion of SPEC-01 is satisfied by this module.

## Module notes

- Agent config changes are versioned in `agent_versions`; a context selection is deliberately not one of them (AC-70 in the overview) — `server/src/modules/agents/AGENTS.md:6`.
- `AgentsRepository` is shared with other modules through `container.agentsRepo` — `server/src/modules/agents/AGENTS.md:8`.
- Agents are workspace-wide (no repo column), which is why attachments are keyed by agent and repo — `server/src/db/schema/agents.ts:8`.
