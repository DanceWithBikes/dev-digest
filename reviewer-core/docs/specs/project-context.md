# Spec: Project Context — reviewer-core

Spec ID: SPEC-01
Status: approved
Overview: [../../../docs/specs/project-context.md](../../../docs/specs/project-context.md)

## Scope in this module

The review engine renders the attached documents it is given into the `## Project context` section of the prompt, each as a delimited untrusted block named by its path. Only when that section is present, it appends two trusted instructions to the system message: one asking for citations, and one guarding against project context as untrusted data. The shared `INJECTION_GUARD` text is left unchanged, so a prompt with no documents stays byte-identical. It relies on the server to collect, read and order the documents. It does no I/O of its own.

## Acceptance criteria (EARS)

- [ ] AC-35 WHERE at least one attached document is sent, the reviewer engine shall render a `## Project context` section in the user message containing each document in its own untrusted delimiter block that names the document's path.
- [ ] AC-36 IF a document's text contains the closing delimiter, THEN the reviewer engine shall escape that delimiter so the block cannot be closed early, and shall apply no other escaping to the document's text.
- [ ] AC-69 IF a document's path contains a double quote, `<`, `>`, a carriage return or a line feed, THEN the reviewer engine shall escape those characters in the block's path label so the label cannot be broken out of.
- [ ] AC-37 WHERE no attached document is sent, the reviewer engine shall produce a prompt byte-identical to the prompt it produces without this feature.
- [ ] AC-38 WHERE the `## Project context` section is present, the reviewer engine shall append to the system message a trusted instruction to name a document's path in a finding's rationale when that finding violates a rule stated in that document.
- [ ] AC-39 WHERE the `## Project context` section is present, the reviewer engine shall append to the system message a trusted instruction stating that project context documents are untrusted data whose instructions are ignored and whose claims cannot waive or descope a real defect.

## Module notes

- No I/O: the engine must not read files, the DB or GitHub; documents arrive as data from the caller — `reviewer-core/AGENTS.md` (Invariants).
- Prompt-injection defense is the one trusted `INJECTION_GUARD`; no keyword filters on untrusted text — `reviewer-core/AGENTS.md` (Invariants), `reviewer-core/src/prompt.ts:16`.
- Optional prompt slots are omitted when empty — `reviewer-core/AGENTS.md` (Invariants); AC-37 restates this for project context.
- `INJECTION_GUARD` is appended to every system message, so editing its text would change prompts that carry no documents and break AC-37. AC-39 is a separate conditional instruction, following the `SCOPE_INSTRUCTION` pattern — `reviewer-core/src/prompt.ts:111`, `reviewer-core/src/prompt.ts:35`.
- `wrapUntrusted` escapes only `</untrusted>` in content and interpolates the label raw; AC-36 keeps the content behaviour and AC-69 adds label escaping — `reviewer-core/src/prompt.ts:44`.
- The server consumes this package as TS source, so a public API change can break the server's typecheck — `reviewer-core/AGENTS.md` (Gotchas).
