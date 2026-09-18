---
id: PTQ-0940
title: calleeWrap/record/hop invoke_callee-chain builders are byte-identical between e2e-s5-slsh-chain-suffix and err-note-render
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/e2e-s5-slsh-chain-suffix.test.ts:66-76
  - tests/err-note-render.test.ts:96-105
sites: 2
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# calleeWrap/record/hop invoke_callee-chain builders are byte-identical between e2e-s5-slsh-chain-suffix and err-note-render

## Observation
`tests/e2e-s5-slsh-chain-suffix.test.ts` declares three module-scope builder functions — `calleeWrap(callee_path, inner)`, `record(parentPath, callSiteLine)` and `hop(calleePath, parentPath, callSiteLine)` — that construct an `InvokeCalleeError` wrapper, an `InvocationRecord`, and a `ChainHop` (which itself calls `record`). `tests/err-note-render.test.ts` declares the same three functions, byte-identical body-for-body. The in-scope file's own header comment names `tests/err-note-render.test.ts` as the file covering "the REQ-SLSH-22 surface" these three builders construct, rather than an independently-chosen fixture shape.

## Evidence

`tests/e2e-s5-slsh-chain-suffix.test.ts:66-76`:
```ts
/** The `invoke_callee` cascade wrapper (the REQ-SLSH-22 surface). */
function calleeWrap(callee_path: string, inner: QueryError): InvokeCalleeError {
  return { kind: "invoke_callee", message: "callee returned Err", callee_path, inner };
}

function record(parentPath: string, callSiteLine: number): InvocationRecord {
  return { parentPath, callSiteLine };
}

function hop(calleePath: string, parentPath: string, callSiteLine: number): ChainHop {
  return { calleePath, record: record(parentPath, callSiteLine) };
}
```

`tests/err-note-render.test.ts:96-105` — byte-identical (the one-line doc comment above `calleeWrap` is absent here, every executable line matches):
```ts
function calleeWrap(callee_path: string, inner: QueryError): InvokeCalleeError {
  return { kind: "invoke_callee", message: "callee returned Err", callee_path, inner };
}

function record(parentPath: string, callSiteLine: number): InvocationRecord {
  return { parentPath, callSiteLine };
}

function hop(calleePath: string, parentPath: string, callSiteLine: number): ChainHop {
  return { calleePath, record: record(parentPath, callSiteLine) };
}
```

Exact search and hit count: `grep -n "function calleeWrap\|function hop(\|function record(" tests/*.test.ts` returns exactly these two files (2 hits per function name, 6 total), confirming no third copy and no `tests/helpers/` export of any of the three.

## Why this is a problem
The three-function chain-fixture group — the `invoke_callee` wrapper, the `InvocationRecord` builder, and the `ChainHop` builder that composes the two — is typed twice, byte-for-byte, rather than imported once. `tests/helpers/query-error-fixtures.ts` already exports the sibling leaf-error builders (`transport`, `modelTool`, `codeTool`) both files import, so a home for shared `QueryError`/chain fixtures already exists and already holds the leaf half of what both files need; only the cascade-wrapper/chain half is left to redeclare per file. A change to `InvokeCalleeError`'s field set or `ChainHop`'s shape needs the identical edit applied in both files.

## Suggested direction (non-binding, optional)
Noting that `tests/helpers/query-error-fixtures.ts` already exports the leaf-error builders both files use, and holds no `calleeWrap`/`record`/`hop` export, is an observation that the cascade-wrapper half of the same fixture family has no paired export there yet, not a design for adding one.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; the cited code is fixture-builder functions, not a pinned count or inventory.
- Recording-double check: `calleeWrap`/`record`/`hop` construct plain value fixtures; none records a call or backs a "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "calleeWrap\|InvocationRecord" docs/bugs/*.md` → 0 hits; no doc marks this builder trio's duplication as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "e2e-s5-slsh-chain-suffix\|err-note-render" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()`, only that the three builder functions be imported rather than retyped.
- Coverage check: the claim is about a repeated fixture-builder DEFINITION; both files' own tests already exercise their own copy of it (REQ-SLSH-23's empty-chain rows in the in-scope file, REQ-SLSH-22's populated-chain rows in the sibling file).
- Prior-finding check: `grep -rl "calleeWrap" quality/issues/*.md quality/resolved/*.md quality/intake/*.md` → 0 hits; no existing PTQ names this builder trio or this file pair.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (e2e-s5-slsh-chain-suffix:67-76 / err-note-render:96-105) and a mktemp `diff` of the two 10-line spans is empty; both copies are live (calleeWrap/hop/record called 2/2/2 and 6/6/2 times respectively); the `function calleeWrap\|function hop(\|function record(` search across src/ extensions/ tools/ tests/ reproduces at exactly these two files (the only other `function record(` is an unrelated local in tools/quality/size-scan.mjs:158), and none of the three other ChainHop/InvocationRecord-touching tests (b0295 maps hops inline, b0391 uses production recordInvocationProvenance/ledger.attach, slsh5-invoke-cascade has only a hopSuffix string builder) is a renamed copy, so sites: 2 is accurate; tests/helpers/query-error-fixtures.ts exports only transport/modelTool/codeTool, confirming no helper home yet; both sites under tests/, D7 copy-paste-fixture class, no gate/recording-double/red-test carve-out (the candidate's docs/bugs grep actually returns 3 hits, not 0, but all are bug 0088's production-side `InvocationRecord` mentions, irrelevant to a carve-out); coverage-matrix → 0; not a duplicate — resolved PTQ-0609 covered only the leaf trio in these same files and its fix created the helpers module, leaving the cascade-wrapper half untracked (triage: claude-fable-5-1)
