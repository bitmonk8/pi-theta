---
id: PTQ-1020
title: b0333live/b0334live/b0335live each redeclare importCheckCodes locally despite importing its sibling export fakeThetaLibFs from the same helper module
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/acceptance/b0333live-transitive-reexport-load-refusal.test.ts:184-208
  - tests/live/acceptance/b0334live-multisource-collision-load-refusal.test.ts:203-227
  - tests/live/acceptance/b0335live-own-import-shadow-load-refusal.test.ts:167-191
  - tests/helpers/thetalib-load-harness.ts:141-161
sites: 3
fix_scope: module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0333live/b0334live/b0335live each redeclare importCheckCodes locally despite importing its sibling export fakeThetaLibFs from the same helper module

## Observation
`tests/helpers/thetalib-load-harness.ts` exports both `fakeThetaLibFs` and
`importCheckCodes` (the latter: parse the theta text, assert its frontmatter
parsed, build a `ThetaCompositionInput`, run the real `checkThetaImports`
over `fakeThetaLibFs(libs)`, and return the sorted error-severity codes).
Three files in scope — `b0333live-transitive-reexport-load-refusal.test.ts`,
`b0334live-multisource-collision-load-refusal.test.ts`, and
`b0335live-own-import-shadow-load-refusal.test.ts` — each `import {
fakeThetaLibFs } from "../../helpers/thetalib-load-harness"` for exactly this
purpose, but then declare their own local `async function importCheckCodes`
with a body that is byte-identical to the helper's exported function
(diffed, re-run immediately before filing: `diff` between each file's
extracted local function and the module's exported one, plus a pairwise diff
across all three local copies, returns no output in every comparison).

## Evidence

`tests/helpers/thetalib-load-harness.ts:141-161` (the already-exported helper):
```ts
export async function importCheckCodes(
  thetaText: string,
  thetaPath: string,
  libs: Record<string, string>,
): Promise<readonly string[]> {
  const app = parseDoc(thetaText, thetaPath);
  expect(
    app.frontmatter,
    `attribution: ${thetaPath} frontmatter must parse or the load pass reads nothing`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: thetaPath,
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
```

`tests/live/acceptance/b0333live-transitive-reexport-load-refusal.test.ts:79-84`
(the file's own imports, showing `fakeThetaLibFs` is pulled from the helper
but `importCheckCodes` is not):
```ts
import { requireLiveHost, spawnPiPrint } from "./harness";
import { checkThetaImports } from "../../../src/extension/import-static-checks";
import type { ThetaCompositionInput } from "../../../src/extension/theta-composition-producer";
import type { ParsedFrontmatter } from "../../../src/parser/frontmatter";
import { parseDeps, parseDoc } from "../../helpers/e2e-s1";
import { fakeThetaLibFs } from "../../helpers/thetalib-load-harness";
```

`tests/live/acceptance/b0333live-transitive-reexport-load-refusal.test.ts:184-208`
(the local redeclaration):
```ts
async function importCheckCodes(
  thetaText: string,
  thetaPath: string,
  libs: Record<string, string>,
): Promise<readonly string[]> {
  const app = parseDoc(thetaText, thetaPath);
  expect(
    app.frontmatter,
    `attribution: ${thetaPath} frontmatter must parse or the load pass reads nothing`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: thetaPath,
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return check.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}
```

`tests/live/acceptance/b0334live-multisource-collision-load-refusal.test.ts:203-227`
and `tests/live/acceptance/b0335live-own-import-shadow-load-refusal.test.ts:167-191`
declare the identical function (same signature, same body, same doc comment
"The load-pass diagnostic codes for one theta over an in-memory lib set — the
cross-file attribution channel `parseThetaDocument` alone cannot reach.").
Pairwise `diff` of the three files' extracted function bodies against each
other and against the helper's exported version returns no output in all six
comparisons (3 files × {helper, other two files}).

## Why this is a problem
Each of the three files already imports the sibling export (`fakeThetaLibFs`)
from `tests/helpers/thetalib-load-harness.ts` for the same in-memory
filesystem double `importCheckCodes` closes over, so the module is already on
the import list — the redeclaration is not an independent invention but a
copy of a helper the file is one import away from using directly. The
attribution-guard block in each file (the first thing each `it()` runs,
before the live host is required) calls this local copy rather than the
canonical one, so the same "drive the real `checkThetaImports` over an
in-memory tree and return sorted error codes" logic exists in four places
(the helper plus three local re-declarations) that must be kept in sync by
hand.

## Suggested direction (non-binding, optional)
Importing `importCheckCodes` from `tests/helpers/thetalib-load-harness.ts`
alongside the already-imported `fakeThetaLibFs` and deleting the three local
declarations is the change the existing import line already points at; that
is an observation about the shape, not a design for the fix stage to follow
mechanically.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate-kin patterns; not applicable.
- Recording-double check: `importCheckCodes` renders real `checkThetaImports`
  diagnostics, not a double's call log; not a MUST-NOT witness; not
  applicable.
- docs/bugs/ signature search: `grep -rln "b0333\|b0334\|b0335" docs/bugs/*.md`
  shows each file cited by its own numbered bug doc (0333, 0334, 0335) as
  that bug's H9a acceptance witness; this finding does not propose merging,
  renaming, or deleting any of the three files, their `it()` cells, or the
  helper module — only observes the local function bodies duplicate an
  already-imported-from module's own export.
- coverage-matrix/bug-doc citation search: `grep -n "b0333\|b0334\|b0335" docs/reference/coverage-matrix.md`
  references these files by bug/cell name, not by internal line range, so no
  cited witness line is disturbed by this observation.
- Overlap check: PTQ-0758 (resolved/fixed) covers the same class of
  redundant `importCheckCodes`/`fakeThetaLibFs` reimplementation, but its
  location list names only `b0302live-stem-twin-cycle.test.ts` and
  `b0304live-transitive-load-refusal.test.ts` — both of which now import
  `importCheckCodes` from the helper (confirmed by reading their current
  import lines), so those two files are not re-cited here; this finding
  covers the three still-unmigrated files PTQ-0758 did not touch.
- Coverage drift: this finding does not claim any behaviour is untested; it
  is confined to the duplicated reader function inside tests that already
  exist and already run.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: `export async function importCheckCodes` sits at tests/helpers/thetalib-load-harness.ts:143-167 (2-line drift from the cited :141-161), and mktemp sed-range extractions of b0333live:184-208, b0334live:203-227 and b0335live:167-191 diff empty against each other and against the helper with `export ` stripped (25 lines each, doc comment included); each file imports `{ fakeThetaLibFs }` from that very module (:84/:86/:85) and none imports `importCheckCodes`, whose only importers are b0302live:91, b0304live:70 (PTQ-0758's migrated pair) and the helper's own test; every local copy is live (called at b0333:219/227, b0334:237/246/252, b0335:202/211); not a duplicate — PTQ-0554 (resolved) explicitly scoped itself to the `fakeThetaLibFs` piece of these three files because the helper had no `importCheckCodes` export until PTQ-0758's fix created it, and no open issue (PTQ-0755/0759/0762/0622 mention the name only in fix-log notes) or same-wave sibling (d7-02) tracks this root cause; the fourth local copy at b0428live:153-177 is a signature variant (extra `unreadable` param) so the byte-identical `sites: 3` count stands; no stays-local ruling exists in the helper header; coverage-matrix grep → 0 hits, bug docs 0333/0334/0335 are Status fixed and cite the files only as witnesses, and the import-only direction disturbs no `it()` or citation (triage: claude-fable-5-1)
