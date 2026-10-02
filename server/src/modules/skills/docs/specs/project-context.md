# Spec: Project Context — server/modules/skills

Spec ID: SPEC-01
Status: approved
Overview: [../../../../../../docs/specs/project-context.md](../../../../../../docs/specs/project-context.md)

## Scope in this module

This module's behaviour does not change. The skill attachment store (AC-17–AC-21, AC-72) moved on 2026-10-01 to the new `project-context` module, whose part is [`../../../project-context/docs/specs/project-context.md`](../../../project-context/docs/specs/project-context.md). A skill's attachments reach a run only through the agents it is linked to, and only while the skill is enabled; the reviews module applies that rule (AC-24). This file remains as a pointer for anyone looking for the feature from the skills side.

## Acceptance criteria (EARS)

- None. No criterion of SPEC-01 is satisfied by this module.

## Module notes

- Skills are workspace-wide (no repo column) and carry an `enabled` flag, which gates whether their attachments are used (AC-24 in the overview) — `server/src/db/schema/skills.ts:5`, `server/src/db/schema/skills.ts:17`.
- This module has no `AGENTS.md` or `docs/insights.md` yet; that is a finding for `doc-writer`, not a constraint on this spec.
