---
id: PTQ-0740
title: uppercase-pi-tool-name-refusal.test.ts redeclares the withCode/piTool/thetaCallee/deps/resolveList resolveCallableSet harness byte-for-byte instead of importing it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/uppercase-pi-tool-name-refusal.test.ts:492-538
  - tests/callable-set.test.ts:31-81
  - tests/tools-derived-name-shape.test.ts:479-525
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# uppercase-pi-tool-name-refusal.test.ts redeclares the withCode/piTool/thetaCallee/deps/resolveList resolveCallableSet harness byte-for-byte instead of importing it

## Observation
`tests/uppercase-pi-tool-name-refusal.test.ts` declares five module-scope
helper functions for driving `resolveCallableSet` directly — `withCode`
(find a diagnostic by code), `piTool` (a resolved Pi-tool stand-in),
`thetaCallee` (a resolved `.theta` callee stand-in), `deps` (build
`CallableSetDeps` from a `piTools` array / `thetaCallees` record /
`reservedNames` array), and `resolveList` (wrap a YAML list-form `tools:`
value through `resolveCallableSet`). The identical five functions — same
names, same parameter shapes, same bodies — are independently declared again
in `tests/callable-set.test.ts` and `tests/tools-derived-name-shape.test.ts`.
None of the three files imports these from a shared `tests/helpers/` module.

## Evidence
Exact search: `grep -n "^function piTool(name: string): ResolvedPiTool" tests/*.test.ts` → 3 hits, one per file below (`tests/callable-set.test.ts:36`,
`tests/tools-derived-name-shape.test.ts:484`,
`tests/uppercase-pi-tool-name-refusal.test.ts:497`).

The `deps` function, the most structurally complex of the five, verbatim at
each site (re-read immediately before filing):

`tests/uppercase-pi-tool-name-refusal.test.ts:522-531` (the function
signature at lines 517-521 is identical at all three sites per the `diff`
below; only the body is shown here for length):
```ts
  const piTools = new Set(opts?.piTools ?? []);
  const thetaCallees = opts?.thetaCallees ?? {};
  return {
    resolvePiTool: (name) => (piTools.has(name) ? piTool(name) : undefined),
    resolveThetaCallee: (thetaPath) => {
      const callee = thetaCallees[thetaPath];
      return callee === undefined ? undefined : { ...callee, calleePath: thetaPath };
    },
    reservedNames: new Set(opts?.reservedNames ?? []),
  };
}
```

`tests/callable-set.test.ts:54-68` and
`tests/tools-derived-name-shape.test.ts:504-518` each carry this identical
body: `diff <(sed -n '54,68p' tests/callable-set.test.ts) <(sed -n '504,518p' tests/tools-derived-name-shape.test.ts)` → no output;
`diff <(sed -n '54,68p' tests/callable-set.test.ts) <(sed -n '517,531p' tests/uppercase-pi-tool-name-refusal.test.ts)` → no output.

The other four functions are confirmed byte-identical across all three
files by direct `diff` (no output in any comparison):
- `withCode` — `diff <(sed -n '31,33p' tests/callable-set.test.ts) <(sed -n '479,481p' tests/tools-derived-name-shape.test.ts)` and `<(sed -n '492,494p' tests/uppercase-pi-tool-name-refusal.test.ts)` → no output in either.
- `piTool` — `diff <(sed -n '36,38p' tests/callable-set.test.ts) <(sed -n '484,486p' tests/tools-derived-name-shape.test.ts)` and `<(sed -n '497,499p' tests/uppercase-pi-tool-name-refusal.test.ts)` → no output in either.
- `thetaCallee` — same body (`{ kind: "theta", mode }`), differing only in whether the parameter list is written on one line or wrapped across three (a formatting difference, not a body difference).
- `resolveList` — `diff <(sed -n '78,81p' tests/callable-set.test.ts) <(sed -n '522,525p' tests/tools-derived-name-shape.test.ts)` and `<(sed -n '535,538p' tests/uppercase-pi-tool-name-refusal.test.ts)` → no output in either.

## Why this is a problem
`withCode`, `piTool`, `thetaCallee`, `deps`, and `resolveList` are
byte-for-byte identical across all three files that call `resolveCallableSet`
directly, confirmed by `diff` at every pairing above. `tests/helpers/`
already holds a `registry-oracle.ts`, `compose-workspace-harness.ts`, and
`production-load-harness.ts` centralising exactly this shape of duplication
for sibling harness families; this five-function `resolveCallableSet` test
double has no such home yet, so a change to `CallableSetDeps`'s shape (e.g.
`resolvePiTool` gaining a required field) must be hand-applied in three
places.

## Suggested direction (non-binding, optional)
No `tests/helpers/` module currently exports this `withCode`/`piTool`/
`thetaCallee`/`deps`/`resolveList` quintuple; the three files that redeclare
it identically are the natural set to draw a shared export from.

## False-positive check
- Gate-pin check: none of the three files is named `*gate*.test.ts` or one of
  the named gate kinds; not a census/pin gate.
- Recording-double check: `piTool`/`thetaCallee`/`deps` build plain resolver
  functions with no call-count tracking and back no "never called" witness in
  any of the three files; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "withCode\|resolveCallableSet" docs/bugs/*.md` finds bug reports discussing `resolveCallableSet` behaviourally, but none pins this specific helper-quintuple's duplication as a documented correct-reason red; `tests/callable-set.test.ts` and `tests/tools-derived-name-shape.test.ts` both pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "tests/callable-set\.test\|tests/tools-derived-name-shape\.test\|tests/uppercase-pi-tool-name-refusal\.test" docs/reference/coverage-matrix.md` → 0 hits for `callable-set.test.ts`; `tools-derived-name-shape.test.ts` and `uppercase-pi-tool-name-refusal.test.ts` are both named in `docs/bugs/0108-uppercase-pi-tool-name-mints-unspellable-callable.md`'s witness list (as whole files, and for `tools-derived-name-shape.test.ts` specific cells (C6)/(C6a) at line ranges outside this finding's cited helper functions). This finding proposes no merge, rename, or deletion of any `it()`/`describe()`, cell, or file — only that the identical helper-function bodies could be imported from one place instead of three.
- Coverage check: the claim is about a repeated helper-function DEFINITION duplicated across three files that already exist, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines; the 47-line helper block at tools-derived-name-shape.test.ts:479-525 and uppercase-pi-tool-name-refusal.test.ts:492-538 is byte-identical (`diff` empty) and callable-set.test.ts:31-81 differs only by the `thetaCallee` parameter line-wrap and its extra `resolveScalar`; `deps` body diffs a==b and a==c are empty; the `^function piTool(name: string): ResolvedPiTool` grep returns exactly the 3 cited hits; no tests/helpers/ module mentions CallableSetDeps/ResolvedPiTool; all 3 files pass at HEAD (59/59), none is a gate, recording double, or skip; bug 0108 names the two witness files but pins cells (C6)/(C6a) at :656-691, outside the helper block, and the filing proposes no test merge/rename/delete; store grep finds no PTQ tracking this harness — but pending sibling intake qw20260917154546-d7-140-03 (confirmed) cites the same `deps(opts?)` body in session-control-callable-set.test.ts:103-124 vs callable-set.test.ts:54-76, so the two are one root cause with four live copies: fold at acceptance into a single PTQ, taking this file's five-function inventory as the base (triage: claude-fable-5-1)
