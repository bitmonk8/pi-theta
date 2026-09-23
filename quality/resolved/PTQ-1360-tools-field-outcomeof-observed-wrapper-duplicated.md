---
id: PTQ-1360
title: tools-field-shape-refusal and tools-field-zero-entry-scalar-refusal each redeclare an identical per-row outcome-map/outcomeOf/observed wrapper around the canonical production-load harness
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/tools-field-shape-refusal.test.ts:653-686
  - tests/tools-field-zero-entry-scalar-refusal.test.ts:626-659
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# tools-field-shape-refusal and tools-field-zero-entry-scalar-refusal each redeclare an identical per-row outcome-map/outcomeOf/observed wrapper around the canonical production-load harness

## Observation
Both in-scope files, having already migrated their single-workspace load call
to the shared `tests/helpers/production-load-harness.ts` exports
(`plantThetaWorkspace`, `runProductionLoad`, `disposeWorkspace`), each also
declare an identical outer wrapper around a per-row multi-workspace run: a
module-level `outcomes` map, a `workspaces` array, a `beforeAll` that plants
and loads one workspace per row into the map, an `afterAll` that disposes
every workspace, an `outcomeOf(stem)` that throws naming the missing stem, and
an `observed(stem)` that renders the row's registered/notified sets for a
failure message. The two blocks are byte-identical apart from the
`theta-bug0104-`/`theta-bug0206-` mkdtemp-prefix literal.

## Evidence
`tests/tools-field-shape-refusal.test.ts:653-686`:
```ts
const outcomes = new Map<string, LoadOutcome>();
const workspaces: string[] = [];

beforeAll(async () => {
  for (const row of PRODUCTION_ROWS) {
    // An absent settings file is silent; "{}" pins the fixture's settings read.
    const workspaceDir = plantThetaWorkspace(`theta-bug0104-${row.stem}-`, [row], "{}");
    workspaces.push(workspaceDir);
    outcomes.set(row.stem, await runProductionLoad(workspaceDir));
  }
});

afterAll(() => {
  for (const dir of workspaces) {
    disposeWorkspace(dir);
  }
});

/** One row's load outcome, or a loud failure naming the row. */
function outcomeOf(stem: string): LoadOutcome {
  const found = outcomes.get(stem);
  if (found === undefined) {
    throw new Error(
      `no production-load outcome for '${stem}': the planted workspace was never loaded, ` +
        `so no assertion below it witnesses anything. Loaded: ${JSON.stringify([...outcomes.keys()])}`,
    );
  }
  return found;
}

/** A row's registered / notified sets, rendered for an assertion message. */
function observed(stem: string): string {
  const o = outcomeOf(stem);
  return (
    ` Registered: ${JSON.stringify(o.registered)}` +
    ` Notified: ${JSON.stringify(o.notifications)}`
  );
}
```

`tests/tools-field-zero-entry-scalar-refusal.test.ts:626-659` — the same
block, only the `mkdtemp` prefix literal differing (verified line-by-line):
```ts
const outcomes = new Map<string, LoadOutcome>();
const workspaces: string[] = [];

beforeAll(async () => {
  for (const row of PRODUCTION_ROWS) {
    // An absent settings file is silent; "{}" pins the fixture's settings read.
    const workspaceDir = plantThetaWorkspace(`theta-bug0206-${row.stem}-`, [row], "{}");
    workspaces.push(workspaceDir);
    outcomes.set(row.stem, await runProductionLoad(workspaceDir));
  }
});

afterAll(() => {
  for (const dir of workspaces) {
    disposeWorkspace(dir);
  }
});

/** One row's load outcome, or a loud failure naming the row. */
function outcomeOf(stem: string): LoadOutcome {
  const found = outcomes.get(stem);
  if (found === undefined) {
    throw new Error(
      `no production-load outcome for '${stem}': the planted workspace was never loaded, ` +
        `so no assertion below it witnesses anything. Loaded: ${JSON.stringify([...outcomes.keys()])}`,
    );
  }
  return found;
}

/** A row's registered / notified sets, rendered for an assertion message. */
function observed(stem: string): string {
  const o = outcomeOf(stem);
  return (
    ` Registered: ${JSON.stringify(o.registered)}` +
    ` Notified: ${JSON.stringify(o.notifications)}`
  );
}
```

## Why this is a problem
Both files independently define the same "plant one workspace per row, keep a
`stem -> LoadOutcome` map, and expose a fail-loudly `outcomeOf`/`observed`
pair over it" wrapper, on top of the already-shared single-workspace
`runProductionLoad`/`plantThetaWorkspace`/`disposeWorkspace` triad. A change to
this per-row wrapper — e.g. widening the failure message, changing what
`observed` renders, or changing how missing stems are reported — needs the
identical edit applied twice, and the migration that consolidated the
single-workspace call (tracked separately) did not reach this outer layer, so
the byte-identical copy survived that consolidation untouched.

## Suggested direction (non-binding, optional)
A shared per-row load helper (something like `loadPlantedRows(rows, prefix)`
returning a `stem -> LoadOutcome` map plus its own `outcomeOf`/`observed`
accessors) would give both call sites one definition to change; that is an
observation about a natural extension of the existing
`tests/helpers/production-load-harness.ts` home, not a design this filing
owns.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin
  patterns; not applicable.
- Recording-double check: `outcomes`/`outcomeOf` reads a plain outcome value
  (registered names, notification strings), not a call-recording double used
  for a MUST-NOT witness; not applicable.
- docs/bugs/ signature search: `grep -n "Status:" docs/bugs/0104-*.md
  docs/bugs/0206-*.md` — both `Status: fixed`; the reds these files carry are
  behavioural (D3/D4/E5 rows), not this scaffolding, so this is not a
  documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn
  "tools-field-shape-refusal\|tools-field-zero-entry-scalar-refusal"
  docs/reference/coverage-matrix.md docs/bugs/` — each file is named in its
  own bug doc as that bug's witness file, but no citation pins the
  `outcomeOf`/`observed`/`outcomes` block or a line range inside it; this
  finding proposes no merge, rename, or deletion of either test.
- This is a duplication claim about existing harness code in two files that
  are both in scope; no assertion is made about a missing test or an
  untested path.

## Triage
<!-- triage appends here -->
verdict: confirmed — independently re-verified: both excerpts match at 653-686 / 626-659 and are byte-identical apart from the `theta-bug0104-`/`theta-bug0206-` prefix literal; both files already import `plantThetaWorkspace`/`runProductionLoad`/`disposeWorkspace`/`LoadOutcome` from tests/helpers/production-load-harness.ts (line 1 of each) yet neither imports its exported `observedLoad` (harness:295-300), whose body is verbatim the local `observed()` render, and the per-row outcomes-map/`beforeAll`/`afterAll`/`outcomeOf` loop has no harness counterpart (`productionLoadSuite` at 303-327 is single-workspace); the wrapper is live (`outcomeOf(`/`observed(` ×25 and ×17 call sites); not a duplicate — PTQ-0723 (status fixed) covered only the inner `LoadOutcome`/`runProductionLoad`/mkdtemp plant-dispose layer and REVIEW_LOG.md:348 explicitly deferred this outcomeOf/observed pair as a fold-candidate that the fix never reached; neither file is a gate test, bugs 0104/0206 are both `Status: fixed`, bug docs cite the files as witnesses but not this block, and no merge/rename/delete is proposed — D7 boilerplate-duplication class with a mechanical dedupe (triage: claude-fable-5-1)
