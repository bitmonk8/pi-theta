---
id: PTQ-1363
title: agent-message-fixtures.ts redefines the module-level USAGE literal inline inside assistantMessage instead of reusing it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/agent-message-fixtures.ts:5-11
  - tests/helpers/agent-message-fixtures.ts:51-58
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# agent-message-fixtures.ts redefines the module-level USAGE literal inline inside assistantMessage instead of reusing it

## Observation
`tests/helpers/agent-message-fixtures.ts` declares a module-level `USAGE` constant (lines 5-11) explicitly so `assistant()` (lines 18-30) can reuse one zero-usage object. `assistantMessage()` (lines 43-65), added later in the same file, builds its own `AssistantMessage` and spells the identical six-field usage object inline (lines 51-58) instead of referencing `USAGE`.

## Evidence
`tests/helpers/agent-message-fixtures.ts:5-11`:
```ts
const USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
} as const;
```

`tests/helpers/agent-message-fixtures.ts:51-58` (inside `assistantMessage`):
```ts
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
```

The two object literals are byte-for-byte identical apart from indentation. Exact search: `grep -n "cacheWrite: 0" tests/helpers/agent-message-fixtures.ts` returns two hits (line 9 inside `USAGE`, line 56 inside `assistantMessage`).

## Why this is a problem
`USAGE` exists in this file for exactly one purpose — a shared zero-usage fixture value other builders in the same file can reuse — but the second builder added to the same file re-derives it by hand instead of referencing the constant that already serves that role. Both call sites read the same seven-field zero-usage shape only because a maintainer keeps typing the same seven fields; a future edit to the usage shape (e.g. a new cost sub-field) has two sites to update in one file instead of one.

## Suggested direction (non-binding, optional)
`assistantMessage`'s `usage:` field could reference the existing `USAGE` constant the same way `assistant()` does, as an observation about where the shared value already lives in this file.

## False-positive check
Gate-pin check: this file matches no `*gate*.test.ts` naming and is not a census/pin file — n/a. Recording-double check: neither builder is a recording double witnessing a MUST-NOT-call — n/a. docs/bugs/ signature search: `grep -rn "assistantMessage\|USAGE" docs/bugs/` returns no hits tying this duplication to a documented correct-reason red. coverage-matrix/bug-doc citation search: `grep -n "agent-message-fixtures" docs/reference/coverage-matrix.md docs/bugs/*.md` returns no hits, so no citation pins either function's current shape. The claim is confined to duplication inside this one helper file's existing code, not a coverage gap.

## Triage
verdict: confirmed — re-verified independently: `USAGE` (tests/helpers/agent-message-fixtures.ts:5-12) and the inline `usage:` literal inside `assistantMessage` reproduce verbatim (the inline copy sits at :54-61, a 3-line drift from the cited 51-58 — content matches; `grep -n "cacheWrite: 0"` gives lines 9/11 and 59/61, i.e. exactly the two copies claimed), and `assistant()` at :28 already passes the `as const` `USAGE` as `AssistantMessage["usage"]` so the reuse typechecks; the sole docs/bugs hit for `assistantMessage` (0287:210) is the unrelated `assistantMessageEvent` field, `agent-message-fixtures` has no coverage-matrix/bug-doc citation, the file is a plain helper (no gate/recording-double/red-witness carve-out applies), and no merge/rename/delete is proposed; dedupe: PTQ-0693 and PTQ-0697 (both resolved) are the fixes that lifted these builders into this helper — this residual inline copy left inside the lifted `assistantMessage` is a distinct, untracked root cause; D7 copy-paste-fixture class in tests/ only, fix is a mechanical one-line reference to the existing constant (triage: claude-fable-5-1)
