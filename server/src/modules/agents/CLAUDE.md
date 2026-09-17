# modules/agents — agent CRUD

Routes: `/agents` · `/agents/:id` · `/agents/:id/versions[/:version]` · `/agents/:id/skills` · `/providers/:id/models`

- Agent = provider + model + system_prompt + strategy + `repo_intel` + `ciFailOn` + skills.
- Config changes are versioned in `agent_versions` (via the repository) — never update an agent row around it.
- Provider model lists (`/providers/:id/models`) are served here too, via the LLM adapter.
- `AgentsRepository` is shared: other modules use `container.agentsRepo`.
- Built-in agent prompts: `server/src/db/seed-prompts.ts`; write-ups in `/docs/agent-prompts/`.

Docs: docs/specs/ · docs/insights.md
