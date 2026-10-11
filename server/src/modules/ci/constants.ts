/** Branch the export PR lives on. The module never writes to any other branch. */
export const CI_BRANCH = 'devdigest/ci';

export const WORKFLOW_FILE = 'devdigest-review.yml';
export const WORKFLOW_PATH = `.github/workflows/${WORKFLOW_FILE}`;
export const RUNNER_PATH = '.devdigest/runner/index.js';
/** Makes the ESM runner bundle loadable in a repo whose root package.json says commonjs. */
export const RUNNER_PACKAGE_PATH = '.devdigest/runner/package.json';
export const RUNNER_PACKAGE_JSON = '{\n  "type": "module"\n}\n';
export const MEMORY_PATH = '.devdigest/memory.jsonl';
export const AGENTS_DIR = '.devdigest/agents/';
export const SKILLS_DIR = '.devdigest/skills/';

/** The command the workflow's run step executes (and the validator looks for). */
export const RUNNER_COMMAND = 'node .devdigest/runner/index.js';

export const ARTIFACT_NAME = 'devdigest-result';
export const ARTIFACT_FILE = 'devdigest-result.json';
/** Largest artifact entry the server will inflate and parse (AC-132). */
export const MAX_ARTIFACT_BYTES = 65_536;
/** Largest runner bundle the export will ship (NFR-1). */
export const MAX_RUNNER_BYTES = 5_242_880;

export const PR_TITLE = 'Add DevDigest CI review';
/** Commit-message trailer marking commits written by this export (AC-42). */
export const BUNDLE_MARKER = 'DevDigest-Bundle: v1';
export const RUNS_PAGE_SIZE = 50;
export const INGEST_RUNS_PER_PAGE = 30;

/** Same-repo guard of the review job: fork PRs get no secrets, so they are skipped. */
export const SAME_REPO_GUARD =
  'github.event.pull_request.head.repo.full_name == github.repository';
export const BASE_SHA_REF = '${{ github.event.pull_request.base.sha }}';

/** Pinned third-party actions (40-hex SHAs resolved with `git ls-remote`). */
export const ACTION_CHECKOUT = 'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5'; // v4.3.1
export const ACTION_SETUP_NODE = 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'; // v4.4.0
export const ACTION_UPLOAD_ARTIFACT = 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'; // v4.6.2
