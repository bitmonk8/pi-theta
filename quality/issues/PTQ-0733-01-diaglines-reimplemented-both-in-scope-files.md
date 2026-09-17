---
id: PTQ-0733
title: Both in-scope files reimplement e2e-s1's exported diagLines under a local declaration instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/union-generic-arm-lowering.test.ts:15
  - tests/union-generic-arm-lowering.test.ts:234-237
  - tests/unresolvable-operand-structural-target-adjudication.test.ts:26
  - tests/unresolvable-operand-structural-target-adjudication.test.ts:389-392
  - tests/helpers/e2e-s1.ts:99-102
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# Both in-scope files reimplement e2e-s1's exported diagLines under a local declaration instead of importing it

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
rendering every diagnostic as `` `${severity} ${code}: ${message}` ``. Both
files in this review's scope import `parseDoc` from that exact module
(`./helpers/e2e-s1`) but do not import `diagLines`; each instead declares its
own module-local function with a byte-identical body — one keeping the name
`diagLines`, the other renaming it to `lines` — that performs the identical
projection.

## Evidence
`tests/helpers/e2e-s1.ts:99-102` (the canonical, already-exported helper):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/union-generic-arm-lowering.test.ts:15` (the import that omits `diagLines`)
and `:234-237` (the local reimplementation, same name, same body):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/unresolvable-operand-structural-target-adjudication.test.ts:26` (the
import that omits `diagLines`) and `:389-392` (the local reimplementation,
renamed to `lines`, identical body):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
/** `severity code: message` for EVERY diagnostic, in emission order. */
function lines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

Exact search: `grep -n "^function diagLines\|^function lines(doc" tests/union-generic-arm-lowering.test.ts tests/unresolvable-operand-structural-target-adjudication.test.ts` returns exactly these two declarations, one per file — the entire in-scope set for this review.

## Why this is a problem
Both files already reach into `tests/helpers/e2e-s1` for `parseDoc` in the same
import statement the canonical `diagLines` is exported from, so the
reimplementation is not a case of the helper being hard to find. The map
expression `doc.diagnostics.map((d) => \`${d.severity} ${d.code}: ${d.message}\`)`
is typed out a second and third time (once under the same name, once under a
different name for the identical purpose) rather than called once from the
already-imported module.

## Suggested direction (non-binding, optional)
Each site could add `diagLines` to its existing `./helpers/e2e-s1` import and
call it directly (the second file's local `lines` calls would become
`diagLines(...)`), rather than restating the render expression under a
separate local declaration.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: not applicable — `diagLines`/`lines` renders an
  already-produced diagnostics array for a positive assertion; it records no
  calls and backs no "never called" witness.
- docs/bugs/ signature search: `grep -rl "diagLines" docs/bugs/` returns no
  hits; no documented correct-reason red cites either local reimplementation.
- coverage-matrix/bug-doc citation search: `grep -n
  "union-generic-arm-lowering\|unresolvable-operand-structural-target-adjudication"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any `it()`/`describe()` — only that each site
  could call the already-imported module's `diagLines` directly — so no
  citation is disturbed.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION; every copy is exercised by its own file's tests, and no
  behaviour path is claimed untested.
- Overlap check: grepped `quality/intake` and `quality/resolved` for
  `diagLines` together with either file's own name — the existing
  `qw20260917154546-d7-90-diaglines-reimplements-e2e-s1-helper.md` finding
  cites four `tests/live/*.test.ts` files with a different `(text, path)`
  signature, and PTQ-0205 (resolved) cites three different files
  (`annotation-nontype-text-refusal.test.ts`,
  `binder-param-line-newline-normalisation.test.ts`,
  `schema-body-nontype-text-refusal.test.ts`); neither names either file in
  this review's scope, so this is the first filing to cite this specific
  pair.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all five excerpts match byte-for-byte at the cited lines (e2e-s1.ts:99-102 exports diagLines(doc); union-generic-arm-lowering.test.ts:15 and unresolvable-operand-structural-target-adjudication.test.ts:26 each import only parseDoc from that module, and :235 / :390 declare a local diagLines / lines with a body identical to the export, live at 8 and 3 call sites), the stated decl grep returns exactly those two declarations, docs/bugs/ has no diagLines hits and coverage-matrix.md has 0 hits for either file, neither file is a gate test, and no tracked issue covers this pair — resolved PTQ-0205 names 22 files by path but not these two and its fix commit 2594cd44 touched neither, while intake d7-90 cites four tests/live/ files with a different (text, path) signature; genuine D7 boilerplate duplication against an already-imported helper, mechanical dedupe (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
