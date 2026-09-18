---
id: PTQ-0995
title: empty-chain renderTopLevelErrNote wrapper (boundary/boundaryNoChain) duplicated between err-note-render.test.ts and e2e-s5-slsh-chain-suffix.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/err-note-render.test.ts:94-96
  - tests/e2e-s5-slsh-chain-suffix.test.ts:65-67
sites: 2
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# empty-chain renderTopLevelErrNote wrapper (boundary/boundaryNoChain) duplicated between err-note-render.test.ts and e2e-s5-slsh-chain-suffix.test.ts

## Observation
`tests/err-note-render.test.ts` and `tests/e2e-s5-slsh-chain-suffix.test.ts`
each declare a local one-line wrapper around `renderTopLevelErrNote` that
fixes `chain: []` and forwards `thetaName`/`error` — under two different
local names (`boundary` and `boundaryNoChain`). Both files already import
other fixtures from the shared `tests/helpers/query-error-fixtures.ts` module.

## Evidence
`tests/err-note-render.test.ts:94-96`:
```ts
function boundary(name: string, error: QueryError): string {
  return renderTopLevelErrNote({ thetaName: name, error, chain: [] });
}
```

`tests/e2e-s5-slsh-chain-suffix.test.ts:65-67`:
```ts
function boundaryNoChain(name: string, error: QueryError): string {
  return renderTopLevelErrNote({ thetaName: name, error, chain: [] });
}
```
The two function bodies are byte-identical (`renderTopLevelErrNote({ thetaName: name, error, chain: [] })`); only the enclosing function's own name differs. Search: `grep -rn "renderTopLevelErrNote({ thetaName: name, error, chain: \[\] })" tests/*.test.ts` returns exactly these two lines — no third file wraps the call this way (other files that call `renderTopLevelErrNote` do so inline with a non-empty `chain` variable, per-callsite).

## Why this is a problem
Both files already import shared fixtures (`calleeWrap`, `hop`, `modelTool`,
`transport`, ...) from `tests/helpers/query-error-fixtures.ts`, which is the
module that already centralises the `QueryError`/`ChainHop` fixture surface
these two tests are built on. The same one-line "render with an empty chain"
helper is retyped under a different name in each file instead of living once
alongside the fixtures it composes.

## Suggested direction (non-binding, optional)
Exporting the empty-chain wrapper once from `tests/helpers/query-error-fixtures.ts`
would let both files import the same declaration instead of retyping it under
two different local names.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds; not applicable.
- Recording-double check: the wrapper is a pure render-and-return helper, not
  a recording double used for a MUST-NOT witness; the carve-out does not
  apply.
- docs/bugs/ signature search: `grep -n "boundary\b" docs/bugs/0088-slsh5-chain-suffix-never-emitted.md docs/bugs/0177-err-note-render-string-coercion-on-record-error-fields.md` —
  both docs use "boundary" only as prose describing the slash-dispatch
  boundary concept, never citing either test file's `boundary`/`boundaryNoChain`
  function by name; neither doc pins this helper as a documented
  correct-reason artifact.
- coverage-matrix citation search: `grep -n "err-note-render.test.ts\|e2e-s5-slsh-chain-suffix" docs/reference/coverage-matrix.md` →
  0 hits; neither file is pinned by name there, so no merge/rename/delete
  concern arises (none is proposed — the test bodies and their assertions are
  untouched; only the duplicated wrapper function is cited).
- Not a coverage claim: no assertion or test case is disputed by this
  finding.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/err-note-render.test.ts:94-96 and tests/e2e-s5-slsh-chain-suffix.test.ts:65-67 with byte-identical bodies (only the function name differs), both copies are live (15 / 10 references; both files green, 45/45), and the stated body-literal grep reproduces at exactly these two lines; a `renderTopLevelErrNote` caller sweep across src/ extensions/ tools/ tests/ finds no third wrapper function (b0382:80, b0383:240/255/269, b0399:260 do call it inline with a literal `chain: []` — so the candidate's parenthetical "non-empty chain variable" is inaccurate — but none wraps it, so `sites: 2` for the wrapper is correct and the inline callers only widen the shared helper's adopter pool); tests/helpers/query-error-fixtures.ts exists, exports transport/modelTool/codeTool/calleeWrap/record/hop, holds no render wrapper, and is already imported by both files, so the fold is a mechanical export+import; both sites under tests/, D7 copy-paste-fixture/boilerplate class; no gate/recording-double/red-test carve-out; docs/bugs `boundary\b` hits in 0088/0177 are prose only (reproduced), coverage-matrix → 0 (reproduced); not a duplicate — resolved PTQ-0609 covered the leaf trio and PTQ-0940 the calleeWrap/record/hop trio in this same file pair, neither cited the `boundary`/`boundaryNoChain` wrapper (triage: claude-fable-5-1)
