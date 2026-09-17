# server/adapters — ports to the outside world

- Each adapter implements an interface from `@devdigest/shared` (`adapters.ts`) or a local one (`depgraph`, `tokenizer`); services depend on the interface, not the class.
- Adapters are constructed only in `platform/container.ts`; modules never `new` an adapter.
- New adapter → interface + implementation + mock in `mocks.ts` + a field in `ContainerOverrides`.
- `llm/pricing.ts`: `estimateCost` returns `null` for unknown models on purpose — never coerce it to `0`.
- `secrets/local.ts` is the only place keys are read.
- Unit tests hit mocks only: no real LLM/GitHub calls.

Docs: ../../README.md (Request & DI flow) · ../../docs/insights.md
