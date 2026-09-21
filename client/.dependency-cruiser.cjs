/**
 * Architecture gate for the client - the import-boundary rules, checked mechanically.
 *
 *   pnpm arch:check       fail on any violation
 *
 * The client currently has zero violations, so there is no baseline file (unlike the
 * server). If a rule is ever added that existing code breaks, either fix the code or
 * record a baseline with `pnpm exec depcruise-baseline src --config .dependency-cruiser.cjs`
 * and add `--ignore-known` to the script and the CI step.
 *
 * Scopes, most shared first: design system (src/vendor) -> shared (src/components,
 * src/lib) -> routes (src/app/**). Imports may only point towards the more shared
 * scope, and a folder is entered through its index.ts. The rule set and the
 * reasoning behind each rule: .claude/skills/frontend-ui-architecture/
 * (references/boundaries-and-imports.md). Same tool and workflow as
 * server/.dependency-cruiser.cjs.
 */

/** Files a child component may import from its parent's folder without going through index.ts. */
const FOLDER_SHARED_FILES = 'index|styles|constants|helpers|types';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Dependency direction ────────────────────────────────────────────────
    {
      name: 'shared-never-imports-routes',
      severity: 'error',
      comment:
        'src/components, src/lib and src/vendor are shared: they must not know any route exists. ' +
        'Move the needed code down into the shared scope and let the route import it from there.',
      from: { path: '^src/(components|lib|vendor)/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'design-system-knows-nothing-about-the-app',
      severity: 'error',
      comment:
        'src/vendor/ui and src/vendor/shared are consumed like packages. They never import ' +
        'application code; pass what they need as props or arguments.',
      from: { path: '^src/vendor/' },
      to: { path: '^src/(app|components|lib)/' },
    },
    {
      name: 'routes-do-not-import-each-other',
      severity: 'error',
      comment:
        "A route area never reaches into another route area's files. Needed in two places? " +
        'Promote it to src/components (a move, not a copy) or compose the two one level up.',
      from: { path: '^src/app/([^/]+)/' },
      to: { path: '^src/app/[^/]+/', pathNot: '^src/app/$1/' },
    },

    // ── Public surface of a folder ──────────────────────────────────────────
    // Three rules, because dependency-cruiser substitutes $1 into the target pattern
    // unescaped: a captured "[repoId]" would turn into a character class. Rule 1
    // therefore captures only the bracket-free tail of the importer's directory.
    {
      name: 'enter-route-components-through-index',
      severity: 'error',
      comment:
        'Import a route-private component folder through its index.ts, never a file inside it. ' +
        "Inside the folder use relative imports; a child may also import its parent folder's " +
        'styles/constants/helpers/types. No index.ts yet? Add one with explicit named exports.',
      from: { path: '([^\\[\\]]+)/[^/]+$' },
      to: {
        path: `/_components/[^/]+/(?!(${FOLDER_SHARED_FILES})\\.tsx?$)[^/]+$`,
        pathNot: '$1/',
      },
    },
    {
      name: 'route-files-enter-components-through-index',
      severity: 'error',
      comment:
        'page.tsx, layout.tsx and segment-level helpers sit directly in a [dynamic] folder and are ' +
        'never inside a component folder, so they always import _components/<Name> via its index.ts.',
      from: { path: '\\][^/]*/[^/]+$' },
      to: { path: `/_components/[^/]+/(?!(${FOLDER_SHARED_FILES})\\.tsx?$)[^/]+$` },
    },
    {
      name: 'enter-shared-components-through-index',
      severity: 'error',
      comment:
        'Import src/components/<name> through its index.ts. Files inside the same shared component ' +
        'import each other by relative path.',
      from: { pathNot: '^src/components/' },
      to: { path: '^src/components/[^/]+/(?!index\\.ts$).+' },
    },
    {
      name: 'shared-components-enter-each-other-through-index',
      severity: 'error',
      comment: 'One shared component uses another only through its index.ts.',
      from: { path: '^src/components/([^/]+)/' },
      to: { path: '^src/components/[^/]+/(?!index\\.ts$).+', pathNot: '^src/components/$1/' },
    },
    {
      name: 'design-system-only-through-its-entry-point',
      severity: 'error',
      comment:
        'Import UI primitives from the @devdigest/ui entry point, never from files inside src/vendor/ui.',
      from: { pathNot: '^src/vendor/ui/' },
      to: { path: '^src/vendor/ui/(?!index\\.ts$|styles\\.css$)' },
    },

    // Not checked here: "components never call fetch". src/lib/api.ts also exports the ApiError
    // class, which views legitimately import for `instanceof`, and dependency-cruiser sees
    // modules, not named imports. That rule stays a review item (client/AGENTS.md).

    // ── Cycles ──────────────────────────────────────────────────────────────
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A runtime import cycle - most often a file importing a sibling through its own folder index.ts. ' +
        'Import the sibling by relative path instead.',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
  ],

  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(\\.next|node_modules)/' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
