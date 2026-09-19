---
id: PTQ-0767
title: The minimal subagent-mode precondition-control fixture builder is restated in three of the in-scope discovery live cells
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:126-131
  - tests/live/discovery-entry-lstat-failure-live-cell.test.ts:142-147
  - tests/live/discovery-symlinked-root-live-cell.test.ts:32-37
sites: 3
fix_scope: localized
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The minimal subagent-mode precondition-control fixture builder is restated in three of the in-scope discovery live cells

## Observation
Three of the in-scope discovery live cells declare a `subagentTheta()` function that returns the identical five-line `.theta` source (`mode: subagent`, a single `@` query reading "Reply with a short one-line greeting."). All three bodies are byte-identical; only the one-line doc comment above the function differs slightly in wording.

## Evidence
tests/live/discovery-cli-override-prefix-missing-source-live-cell.test.ts:126-131:
```
/** A minimal subagent-mode `.theta` — the precondition control's body. */
function subagentTheta(): string {
  return ["---", "mode: subagent", "---", "@`Reply with a short one-line greeting.`", ""].join(
    "\n",
  );
}
```

tests/live/discovery-entry-lstat-failure-live-cell.test.ts:142-147 (same body):
```
/** A minimal subagent-mode `.theta` — the precondition control's body. */
function subagentTheta(): string {
  return ["---", "mode: subagent", "---", "@`Reply with a short one-line greeting.`", ""].join(
    "\n",
  );
}
```

tests/live/discovery-symlinked-root-live-cell.test.ts:32-37 (same body, comment reworded):
```
/** A minimal subagent-mode `.theta` — registration-only, spends no tokens. */
function subagentTheta(): string {
  return ["---", "mode: subagent", "---", "@`Reply with a short one-line greeting.`", ""].join(
    "\n",
  );
}
```

## Why this is a problem
Each of the three functions produces the identical `.theta` source string used as either a registration-only precondition control or (in discovery-symlinked-root's case) the planted fixture itself, with no per-file variation in the returned text. All three files already import shared symbols from the same `./harness` module (`bootShippedExtension`, `plantThetaWorkspace`/`requireLiveProvider`), which is the module the near-identical `systemNoteContents` reader in these same files is also restated from (a separate finding) — the natural home for a fixture string with zero per-caller variation is that same shared module, as one export instead of three re-typed copies.

## Suggested direction (non-binding, optional)
A single exported `minimalSubagentTheta()` (or an equivalent named constant) in `tests/live/harness.ts` would let all three call sites use one source instead of retyping the same five-element array-join.

## False-positive check
Gate-pin check: none of the three files matches `*gate*.test.ts` or kin. Recording-double check: this is a fixture string, not a recording double or negative witness. docs/bugs/ signature search: the three files' governing bug docs (0078, 0075/0113) describe the discovery-classification fixes under test and do not call for a per-file fixture restatement. coverage-matrix/bug-doc citation search: `subagentTheta` is not cited by name in `docs/reference/coverage-matrix.md`; this finding does not propose merging, renaming, or deleting any of the three tests, only that the fixture string is already produced identically by each of the other two.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all three excerpts match at the cited lines and the function bodies diff byte-identical (only the doc comment differs); git lineage shows all three cells added 2026-08-22 (63122660, cfa110b1, e69bb4ba) copying the same fixture from tests/live/live-production-acceptance.test.ts:241-249 (added 7d19dc2f 2026-07-02, a fourth semantically identical copy the filing did not cite, differing only in array formatting); tests/live/harness.ts exports no theta-source builder (only plantThetaWorkspace/systemNoteEntry etc.), so no shared export was overlooked; none of the cited files is a *gate* test, `subagentTheta` appears in neither docs/reference/coverage-matrix.md nor docs/bugs/*.md, and no merge/rename/delete is proposed; sibling same-wave filings d7-71/d7-73/d7-97-01 cover systemNoteContents and the registry fragment helper — distinct root causes — so this is not a duplicate; D7 copy-paste-fixture class, mechanical dedupe (triage: claude-fable-5-1)
