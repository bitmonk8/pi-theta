---
id: PTQ-0801
title: Both bug-0257/0237 witness files reimplement e2e-s1's exported diagLines under a local declaration instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-empty-entry-slot-refusal.test.ts:9,338-344
  - tests/inline-object-empty-field-type-truncation.test.ts:8,404-410
  - tests/helpers/e2e-s1.ts:123-125
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Both bug-0257/0237 witness files reimplement e2e-s1's exported diagLines under a local declaration instead of importing it

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc: ThetaDocument): string[]`,
rendering every diagnostic as `` `${severity} ${code}: ${message}` ``. Both
files in this review's scope import `parseDoc` from that exact module
(`./helpers/e2e-s1`) but do not import `diagLines`; each instead declares its
own module-local function with a byte-identical body (differing only in an
explicit `Diagnostic` parameter type annotation the export omits), then
builds an identical `lines(src, path)` convenience wrapper on top of its own
local copy rather than on the export.

## Evidence
`tests/helpers/e2e-s1.ts:123-125` (the canonical, already-exported helper):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

`tests/inline-object-empty-entry-slot-refusal.test.ts:9` (the import that
omits `diagLines`) and `:338-344` (the local reimplementation plus its
wrapper):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "test.theta"): string[] {
  return diagLines(parseDoc(src, path));
}
```

`tests/inline-object-empty-field-type-truncation.test.ts:8` (the import that
omits `diagLines`) and `:404-410` (byte-identical local reimplementation and
wrapper, re-read immediately before filing):
```ts
import { parseDoc } from "./helpers/e2e-s1";
...
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`);
}

function lines(src: string, path = "test.theta"): string[] {
  return diagLines(parseDoc(src, path));
}
```

Exact search: `grep -n "^function diagLines(doc: ThetaDocument): string\[\] {$" tests/inline-object-empty-entry-slot-refusal.test.ts tests/inline-object-empty-field-type-truncation.test.ts` returns exactly one declaration per file — the entire in-scope set for this review. (A repo-wide search for the same fixed string returns 40 `tests/*.test.ts` files in total; only these two are in this review's scope.)

## Why this is a problem
Both files already reach into `tests/helpers/e2e-s1` for `parseDoc` in the
same import statement the canonical `diagLines` is exported from, so the
reimplementation is not a case of the helper being hard to find. The map
expression `doc.diagnostics.map((d) => \`${d.severity} ${d.code}: ${d.message}\`)`
is typed out a second time, identically, in each file, and each file then
composes its own local copy into a `lines()` wrapper rather than composing
the already-imported export.

## Suggested direction (non-binding, optional)
Each site could add `diagLines` to its existing `./helpers/e2e-s1` import
and have its local `lines(src, path)` wrapper call `diagLines(parseDoc(src,
path))` against the imported function, rather than against a locally
restated one.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: not applicable — `diagLines`/`lines` renders an
  already-produced diagnostics array for a positive assertion; it records no
  calls and backs no "never called" witness.
- docs/bugs/ signature search: `grep -n "diagLines"
  docs/bugs/0257-empty-inline-object-entry-slot-silently-tolerated.md
  docs/bugs/0237-empty-inline-field-type-truncates-interior.md` → 0 hits; no
  documented correct-reason red cites the local reimplementation.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-empty-entry-slot-refusal\|inline-object-empty-field-type-truncation"
  docs/reference/coverage-matrix.md` → 0 hits. Both files ARE named by path in
  their own bug documents' witness lists
  (`docs/bugs/0257-...md:141,704,727` and `docs/bugs/0237-...md:504,509`);
  this finding proposes no merge, rename, or deletion of either file or any
  `it()`/`describe()` block, only that each site's existing
  `./helpers/e2e-s1` import could additionally name `diagLines` — so no
  citation is disturbed.
- Coverage check: the claim is entirely about a repeated function
  DEFINITION; every copy is exercised by its own file's tests, and no
  behaviour path is claimed untested.
- Overlap check: `grep -rl "inline-object-empty-entry-slot-refusal\|inline-object-empty-field-type-truncation" quality/` finds PTQ-0555 (FM/theta/paramsSrc fixture) and PTQ-0596 (Cell/expectGroup harness) citing these two files for different root causes, and the resolved PTQ-0473 (four-page REGISTRY read, already fixed — both files now import `REGISTRY` from `tests/helpers/registry-oracle`), plus PTQ-0759/PTQ-0776 citing unrelated sibling/live files. None of those, nor
  `qw20260917154546-d7-90-diaglines-reimplements-e2e-s1-helper.md` (four
  `tests/live/*.test.ts` files, a different `(text, path)` signature) or
  resolved PTQ-0205 (22 files by path, neither of these two), name this
  pair's `diagLines`/`lines` declarations — this is the first filing to cite
  this specific pair for this root cause.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: tests/helpers/e2e-s1.ts:123-125 exports diagLines(doc) verbatim as excerpted; inline-object-empty-entry-slot-refusal.test.ts:338-344 and inline-object-empty-field-type-truncation.test.ts:404-410 each declare a local diagLines with the byte-identical `${d.severity} ${d.code}: ${d.message}` map (differing only in the `d: Diagnostic` annotation) plus an identical lines(src, path) wrapper, while each file's sole `./helpers/e2e-s1` import (:9 / :8) names parseDoc alone; both local copies are live (lines() called at :369/:951/:952 and :435), the stated decl grep returns exactly one hit per file (40 repo-wide), docs/bugs 0257/0237 have 0 diagLines hits, coverage-matrix has 0 hits for either file, neither is a gate test, no recording double, and no merge/rename/delete is proposed so the bug-doc witness citations stand; not a duplicate — resolved PTQ-0205's fix commit 2594cd44 touched neither file, PTQ-0555/0596/0473/0776 cite these files for different root causes (0596 mentions diagLines only incidentally as an existing export), PTQ-0591/0663/0664/0674/0732/0733/0770 name disjoint files, and same-wave siblings d7-01-generic-argument-rules and d7-03-both-in-scope-files cite disjoint pairs; per the accepted residual-site convention (PTQ-0732/0733/0770) this is D7 boilerplate duplication with a mechanical import-and-delete fix; stray d4_class on a D7 filing is non-blocking (triage: claude-fable-5-1)
