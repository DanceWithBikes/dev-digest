/**
 * Architecture gate — the Onion dependency rule, checked mechanically.
 *
 *   pnpm arch:check       fail on NEW violations (known ones are baselined)
 *   pnpm arch:baseline    re-record .dependency-cruiser-known-violations.json
 *
 * Rings, inside → out: domain → application → infrastructure / presentation →
 * composition root. Imports may only point inwards. The rule set and the
 * reasoning behind each rule: .claude/skills/backend-onion-architecture/.
 *
 * NOTE: this is the repo's own lint config. It is unrelated to
 * src/adapters/depgraph, which uses dependency-cruiser as a runtime library
 * to graph the repositories users index.
 */

const MODULE = '^src/modules/[^/]+/';
const PERSISTENCE = ['^src/db/', 'node_modules/(drizzle-orm|postgres)/'];
const HTTP = ['node_modules/(fastify|fastify-[^/]+|@fastify/[^/]+)/'];
const IO_LIBRARIES = [
  'node_modules/(octokit|simple-git|openai|@anthropic-ai/[^/]+|@vscode/ripgrep|@ast-grep/[^/]+|dependency-cruiser)/',
];
const IO_BUILTINS = '^(node:)?(fs|child_process|net|http|https|dgram|worker_threads)(/|$)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Presentation ────────────────────────────────────────────────────────
    {
      name: 'routes-only-talk-to-services',
      severity: 'error',
      comment:
        'routes.ts is transport: parse the request, call a service, return a DTO. ' +
        'It never reaches a repository or an adapter — move the work into service.ts.',
      from: { path: `${MODULE}routes\\.ts$` },
      to: { path: [`${MODULE}repository(\\.ts$|/)`, '^src/adapters/'] },
    },

    // ── Persistence stays in the outer ring ─────────────────────────────────
    {
      name: 'only-repositories-touch-the-database',
      severity: 'error',
      comment:
        'Drizzle, postgres and src/db/** (schema, row types, client) are infrastructure. ' +
        'Inside a module only repository.ts / repository/** may import them; everything ' +
        'else receives domain types from the repository. This includes `import type`.',
      from: { path: MODULE, pathNot: `${MODULE}repository(\\.ts$|/)` },
      to: { path: PERSISTENCE },
    },

    // ── HTTP stays in the outer ring ────────────────────────────────────────
    {
      name: 'only-routes-know-fastify',
      severity: 'error',
      comment:
        'Services, repositories and helpers must run without an HTTP server. ' +
        'Fastify types belong to routes.ts and the request helpers in modules/_shared.',
      from: {
        path: '^src/modules/',
        // modules/index.ts is the static plugin registry — part of the composition root.
        pathNot: ['/routes\\.ts$', '^src/modules/_shared/', '^src/modules/index\\.ts$'],
      },
      to: { path: HTTP },
    },

    // ── Ports, not implementations ──────────────────────────────────────────
    {
      name: 'modules-depend-on-ports-not-adapters',
      severity: 'error',
      comment:
        'A module codes against a port (an interface in @devdigest/shared or its own ports.ts). ' +
        'Concrete adapters are constructed only in platform/container.ts.',
      from: { path: '^src/modules/' },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'services-take-ports-not-the-container',
      severity: 'error',
      comment:
        'A service that receives the whole Container is a service locator: its real dependencies ' +
        'are invisible and a unit test has to fake everything. Declare a narrow deps object and ' +
        'let routes.ts / compose.ts (the module entry point) pick the pieces off the container.',
      from: {
        path: '^src/modules/',
        pathNot: ['/(routes|compose)\\.ts$', '^src/modules/_shared/', '^src/modules/index\\.ts$'],
      },
      to: { path: '^src/platform/container\\.ts$' },
    },
    {
      name: 'application-has-no-direct-io',
      severity: 'error',
      comment:
        'A service that calls fs, child_process or an SDK directly cannot be tested without ' +
        'the real thing. Put the call behind a port and implement it in src/adapters/.',
      from: { path: '^src/modules/', pathNot: `${MODULE}repository(\\.ts$|/)` },
      to: { path: [IO_BUILTINS, ...IO_LIBRARIES] },
    },

    // ── Domain ring ─────────────────────────────────────────────────────────
    {
      name: 'domain-files-are-pure',
      severity: 'error',
      comment:
        'domain.ts, ports.ts, helpers.ts and constants.ts are the centre of the module: ' +
        'types, rules, pure functions. No container, no db, no adapters, no framework.',
      from: { path: `${MODULE}(domain|ports|helpers|constants)\\.ts$` },
      to: {
        path: [
          ...PERSISTENCE,
          ...HTTP,
          ...IO_LIBRARIES,
          IO_BUILTINS,
          '^src/adapters/',
          '^src/platform/(?!errors\\.ts$)',
          `${MODULE}(routes|service|repository)(\\.ts$|/)`,
        ],
      },
    },

    // ── Module isolation ────────────────────────────────────────────────────
    {
      name: 'no-cross-module-imports',
      severity: 'error',
      comment:
        "Never import another module's folder. Share through a port exposed on the container " +
        '(agentsRepo, reviewRepo, repoIntel) or promote the shared piece to modules/_shared.',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/', pathNot: '^src/modules/($1|_shared)/' },
    },

    // ── Inner infrastructure must not know the features ─────────────────────
    {
      name: 'adapters-do-not-know-modules',
      severity: 'error',
      comment: 'An adapter implements a port; it has no business importing a feature module.',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'platform-does-not-know-modules',
      severity: 'error',
      comment:
        'platform/** is shared infrastructure. Only the composition root (container.ts) wires modules in.',
      from: { path: '^src/platform/', pathNot: '^src/platform/container\\.ts$' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'shared-contracts-are-self-contained',
      severity: 'error',
      comment:
        '@devdigest/shared is copied verbatim into client/. It can import nothing from the server.',
      from: { path: '^src/vendor/shared/' },
      to: { path: '^src/', pathNot: '^src/vendor/shared/' },
    },

    // ── reviewer-core: the pure engine ──────────────────────────────────────
    {
      name: 'reviewer-core-only-through-its-index',
      severity: 'error',
      comment:
        'Import @devdigest/reviewer-core, never @devdigest/reviewer-core/<file> — index.ts is the public API.',
      from: { path: '^src/' },
      to: { path: 'reviewer-core/src/', pathNot: 'reviewer-core/src/index\\.ts$' },
    },
    {
      name: 'reviewer-core-has-no-io',
      severity: 'error',
      comment:
        'The engine receives everything as arguments; its only side effect is the injected LLMProvider. ' +
        '(llm/ holds the OpenRouter provider — a known adapter-in-the-core, kept out of this rule.)',
      from: { path: 'reviewer-core/src/', pathNot: 'reviewer-core/src/llm/' },
      // The vendored contracts are the one server path the engine may read (types + zod schemas).
      to: { path: [IO_BUILTINS, '^src/(?!vendor/shared/)', ...PERSISTENCE, ...HTTP] },
    },
  ],

  options: {
    // `import type` counts: a row type in a service signature is still a dependency on the schema.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(clones|dist)/' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
