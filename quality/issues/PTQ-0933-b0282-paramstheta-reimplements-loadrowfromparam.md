---
id: PTQ-0933
title: b0282's local row/theta/paramsTheta trio restates loadRowFromBody and loadRowFromParam instead of calling the already-exported functions its own sibling file uses
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:2-15
  - tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:199-224
  - tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts:179-193
  - tests/helpers/load-row-harness.ts:125-142
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0282's local row/theta/paramsTheta trio restates loadRowFromBody and loadRowFromParam instead of calling the already-exported functions its own sibling file uses

## Observation
tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts
imports `loadRow` and `LOAD_ROW_FRONTMATTER` from
`tests/helpers/load-row-harness.ts` but not `loadRowFromBody` or
`loadRowFromParam`, and declares a local `row` wrapper plus `theta` and
`paramsTheta` functions that each re-derive, through that wrapper, the exact
computation the two already-exported functions perform. The sibling file in
the same bug family, tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts,
imports `loadRowFromBody` and `loadRowFromParam` directly and its own `theta`
and `paramsTheta` are one-line calls to them.

## Evidence

tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:2-15
— the existing import statement, `loadRowFromBody`/`loadRowFromParam` absent
from it (re-read immediately before filing):
```ts
import {
  createTypePositionMatrix,
  expectCaptured,
  expectRows,
  loadRow,
  LOAD_ROW_FRONTMATTER,
  PARSE_REGISTRY as REGISTRY,
  PARSE_REGISTRY_PATH as REGISTRY_PATH,
  registered,
  registryLineOf,
  registryMessageOf,
  startPositions,
  type LoadRow,
} from "./helpers/load-row-harness";
```

tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:199-224
— the local `row`/`theta`/`paramsTheta` trio, full bodies (re-read
immediately before filing):
```ts
function row(label: string, source: string): LoadRow {
  return loadRow(label, source, "b0282.theta");
}

function theta(label: string, body: string): LoadRow {
  return row(label, `${LOAD_ROW_FRONTMATTER}${body}\n`);
}

function paramsTheta(label: string, typeText: string): LoadRow {
  return row(
    label,
    `---\ndescription: d\nmode: prompt\nparams:\n  p: '${typeText}'\n---\n\nlet z = 1\n"ok"\n`,
  );
}
```

tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts:179-193
— the sibling file's own `theta`/`paramsTheta`, importing and delegating to
the canonical exports instead of restating their bodies (re-read immediately
before filing):
```ts
function theta(label: string, body: string): LoadRow {
  return loadRowFromBody(label, body, "b0281.theta");
}

function paramsTheta(label: string, typeText: string): LoadRow {
  return loadRowFromParam(label, typeText, "b0281.theta");
}
```

tests/helpers/load-row-harness.ts:125-142 — the two canonical exports, the
identical computation, generalised over `fixturePath` (re-read immediately
before filing):
```ts
export function loadRow(label: string, source: string, fixturePath: string): LoadRow {
  return toLoadRow(label, parseDoc(source, fixturePath));
}

export function loadRowFromBody(label: string, body: string, fixturePath: string): LoadRow {
  return loadRow(label, `${LOAD_ROW_FRONTMATTER}${body}\n`, fixturePath);
}

export function loadRowFromParam(label: string, typeText: string, fixturePath: string): LoadRow {
  return loadRow(
    label,
    `---\ndescription: d\nmode: prompt\nparams:\n  p: '${typeText}'\n---\n\nlet z = 1\n"ok"\n`,
    fixturePath,
  );
}
```

Since b0282's local `row(label, source)` is `loadRow(label, source,
"b0282.theta")`, `theta`'s call `row(label, template)` is exactly
`loadRowFromBody(label, body, "b0282.theta")`'s computation and
`paramsTheta`'s call is exactly `loadRowFromParam(label, typeText,
"b0282.theta")`'s — both re-typed by hand instead of called.

## Why this is a problem
tests/helpers/load-row-harness.ts's own header states the module centralises
pieces that "several `b02xx` files independently redeclared … byte-for-byte,"
and both `loadRowFromBody` and `loadRowFromParam` are named exports of it,
already used by b0281 — the bug report immediately adjacent in the same
family, sharing the same nine-position matrix via `createTypePositionMatrix`.
b0282 imports five other symbols from the same module in the same statement,
so the gap is not a missing dependency edge — it is two fixture-string
templates re-typed beside an import list that already reaches the functions
producing those exact strings. A change to either fixture shape (an added
frontmatter field, a renamed binding) applied to the exports' other callers
would not reach b0282's independent copies, and the two sibling files' fixture
shapes could silently diverge from each other.

## Suggested direction (non-binding, optional)
`loadRowFromBody(label, body, "b0282.theta")` and `loadRowFromParam(label,
typeText, "b0282.theta")` already produce the exact rows `theta` and
`paramsTheta` build by hand through the local `row` wrapper; both local
functions could call the already-exported, already-imported-from-the-same-
module functions instead, mirroring what
tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts's own
`theta`/`paramsTheta` already do.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin; the
  cited lines are fixture-string builders, not a pinned count or inventory
  assertion.
- Recording-double check: `row`/`theta`/`paramsTheta`/`loadRowFromBody`/
  `loadRowFromParam` build a parsed `LoadRow` fixture, not a fake or double
  backing a "never called" witness. Not applicable.
- docs/bugs/ signature search: docs/bugs/0282-unknown-applied-generic-head-silent-at-every-position.md,
  Status "fixed (0.280.0)". `npx vitest run
  tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts` →
  11 passed at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0282-unknown-applied-generic-head-gate-at-nine-positions"
  docs/reference/coverage-matrix.md` → 0 hits. Bug 0282's own document cites
  three `it()` blocks inside b0281's file by name in its witness list; this
  finding cites no `it()`/`describe()` body, only the module-scope
  `row`/`theta`/`paramsTheta` helper functions, so that pin is unaffected.
  This finding proposes no merge, rename or deletion of any test.
- Overlap check against already-filed/resolved topics: PTQ-0526 (resolved)
  covered the `Position`/`POSITIONS`/`cells`/`expectMatrix` bundle between
  these same two files; that bundle is now consolidated into
  `createTypePositionMatrix` (confirmed by direct read — both files call it),
  and PTQ-0526's own Evidence never cites `row`, `theta`, `paramsTheta`,
  `loadRowFromBody`, `loadRowFromParam`, or lines 199-224. `grep -rl
  "loadRowFromParam\|loadRowFromBody" quality/issues quality/resolved
  quality/intake` (before this filing) shows no finding citing either
  function by name. This is a distinct, narrower residual left after
  PTQ-0526's fix migrated the larger shared bundle but not these two smaller
  fixture builders.

## Triage
<triage appends: triage note here>
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines; mktemp `diff` of the extracted template literals shows b0282 `theta` :206 vs harness `loadRowFromBody` :131 IDENTICAL and `paramsTheta` :219 vs `loadRowFromParam` :140 IDENTICAL, b0282's import :2-15 reaches the same module but omits both exports while b0281 :6-7/:180-193 and b0284 :204-206 delegate to them; stated searches reproduce (coverage-matrix 0 hits, bug 0282 `fixed (0.280.0)`, 11/11 green); D7 copy-paste-fixture class under tests/ with no gate-pin/recording-double/red-test carve-out; not a duplicate — PTQ-0219 (fixed 9ba6d1c3 2026-09-12) migrated b0282 and deliberately kept the trio local because `paramsTheta` was then "the one piece the shared module does not export", and `loadRowFromParam` was only exported this morning (0e65dd2f 2026-09-18, harness-only change), so this is the post-export residual PTQ-0219/0431/0526 never covered (the candidate's "no finding names either export" claim is inaccurate — resolved PTQ-0219/0228/0429/0430 mention `loadRowFromBody` — but none tracks this residual); fold-in note for the fixer: tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts still carries the same inline `p: '${typeText}'` params template (triage: claude-fable-5-1)
