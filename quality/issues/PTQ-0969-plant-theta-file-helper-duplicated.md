---
id: PTQ-0969
title: tools-entry-containment.test.ts's plant() single-file writer is redeclared byte-for-byte in nested-tools-entry-containment.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/tools-entry-containment.test.ts:176-178
  - tests/nested-tools-entry-containment.test.ts:215-217
sites: 2
fix_scope: localized
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# tools-entry-containment.test.ts's plant() single-file writer is redeclared byte-for-byte in nested-tools-entry-containment.test.ts

## Observation
tests/tools-entry-containment.test.ts declares a module-scope `function
plant(dir, stem, text)` that writes `${stem}.theta` under `dir` with
`writeFileSync`. tests/nested-tools-entry-containment.test.ts declares a
function of the identical name, signature, and body. Both files use it in
`beforeAll` to plant individual `.theta` fixtures into more than one
directory (an in-root project directory and a second, separate temp
directory the discovery walk never visits), a shape `tests/helpers/
production-load-harness.ts`'s array-at-once `plantThetaWorkspace` does not
cover.

## Evidence

tests/tools-entry-containment.test.ts:176-178 (re-read immediately before
filing):
```ts
function plant(dir: string, stem: string, text: string): void {
  writeFileSync(join(dir, `${stem}.theta`), text, "utf8");
}
```

tests/nested-tools-entry-containment.test.ts:215-217 (re-read immediately
before filing — byte-identical):
```ts
function plant(dir: string, stem: string, text: string): void {
  writeFileSync(join(dir, `${stem}.theta`), text, "utf8");
}
```

Exact search: `grep -rn "^function plant(dir" tests/*.ts` → exactly these
two hits, one per file, with byte-identical three-line bodies. `grep -n
"plant(" tests/helpers/production-load-harness.ts` → 0 hits; that module's
own `plantThetaWorkspace` takes the full fixture array up front and writes
under one workspace's `.pi/theta/`, which cannot express either file's
second, out-of-workspace directory or the per-cell incremental planting both
files do.

## Why this is a problem
Both files are the two members of the bug-0110/0111 "tools:-entry
containment" pair (one for direct `tools:` entries, one for nested
`invoke`/`tools:` chains) and already plant fixtures into an out-of-root
second directory the shared `plantThetaWorkspace` cannot reach. Each
redeclares the identical three-line single-file writer independently rather
than drawing it from one place; a change to the write encoding or the
`.theta` suffix convention has to be applied to both copies by hand, with
nothing to signal a copy left unchanged.

## Suggested direction (non-binding, optional)
A single-file `.theta` writer beside `tests/helpers/production-load-harness.ts`'s
existing `plantThetaWorkspace` — as a smaller sibling for callers planting
into directories outside the one-shot workspace array — is the shape both
files already converge on independently.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin;
  the cited lines are a fixture-writing utility, not a pinned count or
  inventory assertion.
- Recording-double check: `plant` writes a file to disk; it is not a
  call-recording double and backs no "never called" witness.
- docs/bugs/ signature search: `grep -rl "tools-entry-containment\|nested-tools-entry-containment" docs/bugs/*.md` → hits on docs/bugs/0110 and docs/bugs/0111, each naming the file as its own witness/reproduction target; neither documents this helper duplication as a correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "tools-entry-containment\.test\.ts\|nested-tools-entry-containment" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any `describe()`/`it()` — only that the identical three-line writer could be imported once instead of re-derived twice.
- Prior-finding overlap check: `grep -rli "function plant(dir" quality/issues/*.md quality/resolved/*.md quality/intake/*.md` → 0 hits before this filing. PTQ-0820 (open) covers a different, larger root cause in tests/nested-tools-entry-containment.test.ts — the `LoadOutcome`/`makePi`/`runProductionLoad` fake-host wiring — and does not mention `plant`; tests/tools-entry-containment.test.ts already imports the canonical `runProductionLoad`/`plantThetaWorkspace`/`disposeWorkspace` from tests/helpers/production-load-harness.ts for that separate concern, so this filing is scoped to the one remaining local helper neither file has migrated.
- Coverage-drift check: the claim is about a repeated function DEFINITION both files' own `beforeAll` blocks already call to build fixtures their `it()` bodies assert against; no claim that any containment path is untested.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (tools-entry-containment:176-178, nested-tools-entry-containment:215-217) and sed-extracted bodies diff byte-identical in a mktemp scratch dir; both copies are live (15 and 24 `plant(` call sites respectively, both used in `beforeAll` to write into an out-of-root `mkdtempSync` dir and a `nested/` subdir that `plantThetaWorkspace` cannot reach); `grep -rn "^function plant(dir" tests/*.ts` → exactly these two hits; `grep -n plant tests/helpers/production-load-harness.ts` shows only the array-at-once `plantThetaWorkspace`, and the only other helper writing `${stem}.theta` (package-merge-e2e-harness.ts `plantPackageThetaAt`) also mkdirs and writes a `package.json`, so no canonical single-file writer exists; the other same-named `plant(` locals (arg-mismatch-diagnostic-count-by-surface, b0329, b0331, e2e-s5) have different signatures/semantics, so `sites: 2` for the byte-identical body is accurate; neither file is a *gate* test, coverage-matrix → 0 hits, and while the docs/bugs grep actually returns 14 files (not just 0110/0111 — the candidate under-reported the prose mentions) none pins or names the `plant` helper, so no carve-out applies; no it()/describe() change proposed; dedupe: PTQ-0820 covers the disjoint LoadOutcome/makePi/runProductionLoad wiring in the nested file and never mentions `plant`, PTQ-0722/0517/0578/0641 cite other files or other helpers, `grep -rli "function plant(dir" quality/{issues,resolved,intake}` → only this filing; D7 copy-paste-fixture class inside tests/ with a mechanical dedupe, same shape as confirmed PTQ-0782 (byte-identical 3-line `theta()` joiner in two files) — note for acceptance: both files also carry the byte-identical `theta(...lines)` joiner at :133 / :114 that PTQ-0606/PTQ-0782's repo-wide theta() consolidation may fold together with this (triage: claude-fable-5-1)
