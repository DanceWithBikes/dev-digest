import { PR_483_DISCOUNT, PR_484_CONTRACT } from '../../../server/src/db/seed-fixtures.js';

/** Inputs for the parser golden test (expected outputs live in diff-parse.golden.json). */
export const DIFF_CORPUS: Record<string, string> = {
  empty: '',
  'git diff, one file':
    'diff --git a/src/a.ts b/src/a.ts\nindex 1..2 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,3 +1,4 @@\n line1\n-old\n+new\n+added\n line3\n',
  'git diff, multi file':
    'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-x\n+y\n z\n@@ -10 +10,2 @@\n ctx\n+more\ndiff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -0,0 +1,2 @@\n+one\n+two\n',
  'headerless @@ patch': '@@ -1,2 +1,3 @@\n a\n+b\n c',
  'add from /dev/null':
    'diff --git a/n.ts b/n.ts\nnew file mode 100644\n--- /dev/null\n+++ b/n.ts\n@@ -0,0 +1,2 @@\n+a\n+b\n',
  'delete to /dev/null':
    'diff --git a/d.ts b/d.ts\ndeleted file mode 100644\n--- a/d.ts\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-a\n-b\n',
  'no newline marker':
    'diff --git a/m.ts b/m.ts\n--- a/m.ts\n+++ b/m.ts\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n',
  'plus-plus-plus line without diff --git': '--- a/p.ts\n+++ b/p.ts\n@@ -1 +1,2 @@\n a\n+b',
  'single-count hunk header': 'diff --git a/s.ts b/s.ts\n+++ b/s.ts\n@@ -3 +3 @@\n-a\n+b',
  ...Object.fromEntries(
    [PR_483_DISCOUNT, PR_484_CONTRACT].flatMap((pr) =>
      pr.files
        .filter((f) => f.patch)
        .map((f) => [
          `fixture ${f.path}`,
          `diff --git a/${f.path} b/${f.path}\n--- a/${f.path}\n+++ b/${f.path}\n${f.patch}\n`,
        ]),
    ),
  ),
  ...Object.fromEntries(
    [PR_483_DISCOUNT, PR_484_CONTRACT].flatMap((pr) =>
      pr.files
        .filter((f) => f.patch)
        .map((f) => [`fixture headerless ${f.path}`, f.patch as string]),
    ),
  ),
};
