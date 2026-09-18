---
id: PTQ-1006
title: subagent-fn-child-regime.ts declares two RuntimeRoot builders that repeat the identical idSource/clock block verbatim
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/subagent-fn-child-regime.ts:38-50
  - tests/helpers/subagent-fn-child-regime.ts:158-170
sites: 2
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# subagent-fn-child-regime.ts declares two RuntimeRoot builders that repeat the identical idSource/clock block verbatim

## Observation
`tests/helpers/subagent-fn-child-regime.ts` declares two exported `RuntimeRoot`-building functions, `childRegimeRootDouble()` (lines 38-50) and `rootDouble()` (lines 158-170), 108 lines apart in the same file. Both functions carry an identical five-line `idSource`/`clock` block — same field names, same literal id strings, same arrow-function bodies — differing from each other only in their `checkpoint` and `schemaValidator` fields.

## Evidence
`tests/helpers/subagent-fn-child-regime.ts:38-50`:
```ts
export function childRegimeRootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/subagent-fn-child-regime.ts:158-170`:
```ts
export function rootDouble(checkpoint?: Checkpoint): RuntimeRoot {
  return {
    checkpoint: checkpoint ?? new NoopCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator: { compile: () => ({ validate: () => ({ ok: true as const }) }) },
  } as unknown as RuntimeRoot;
}
```

The `idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" }` line and the entire four-line `clock` object (identical field names, identical bodies, identical formatting) are byte-for-byte identical between the two functions. `grep -n "newToolCallId" tests/helpers/subagent-fn-child-regime.ts` returns exactly these two lines (41 and 161) inside this one file.

## Why this is a problem
The two functions exist as separate exports because their `checkpoint` and `schemaValidator` members genuinely differ (real AJV vs. an always-valid stub, a fixed resolved checkpoint vs. a caller-injectable one) — that split is not itself the duplication. What is duplicated is the `idSource`/`clock` block that carries no variation between the two call sites: any future change to either function's clock or id-minting behaviour (e.g. a different fixed invocation id, or wiring `clearTimeout`/`setTimeout` through a fake clock) has two independently-typed copies in the same file to keep in step.

## Suggested direction (non-binding, optional)
A small shared literal or factory for the `idSource`/`clock` pair, referenced by both `childRegimeRootDouble()` and `rootDouble()`, is the shape the two functions' identical block already points toward — an observation about where the duplication sits, not a design for the fix.

## False-positive check
- Gate-pin check: `subagent-fn-child-regime.ts` is a `tests/helpers/` module, not a `*gate*.test.ts` file or named gate kin; not applicable.
- Recording-double check: neither block records a call or backs a "never called" MUST-NOT witness; both are inert clock/id stand-ins. The carve-out does not apply.
- docs/bugs/ signature search: `grep -n "childRegimeRootDouble\|newToolCallId" docs/bugs/*.md` → 0 hits; no documented correct-reason red cites either declaration or this literal.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-fn-child-regime" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either function or of any test importing them — only a shared home for one repeated inline block.
- Coverage-drift check: this finding is about a duplicated block inside one existing, passing helper module; it makes no claim that any behaviour or path is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/helpers/subagent-fn-child-regime.ts:38-50 and :158-170, and a mktemp sed-extract of the 7-line idSource/clock block (:41-47 vs :161-167) diffs to zero; `grep -n newToolCallId` on the file → exactly lines 41 and 161, docs/bugs grep → 0 and coverage-matrix grep → 0 both reproduce; both builders are live (`childRegimeRootDouble` consumed at :100 inside `driveSubagentFnEntry` plus b0388/session-control-callable-set/subagent-fn-child-launch; `rootDouble` imported by production-subagent-query-model, subagent-child-env-scrub, subagent-root-drive-wiring, subagent-visible-regime) and the importers are green (49/49); no existing helper supplies this exact block — runtime-belt-probe-harness's `rootDouble` clock fires `setTimeout` synchronously, call-with-clause-harness's clock lacks `now`, fixture-dispatch's `rootWith` has no default clock — so this is a genuine in-module copy-paste fixture, not a bypass of a canonical export; location is tests/helpers/, D7 boilerplate-duplication class, not gate kin, no recording-double or red-test carve-out, no merge/rename/delete proposed; the `sites: 2` count is honest for the stated in-file root cause (the filing scopes its grep to "this one file"; the same idSource literal recurs in 38 other files repo-wide, which the store tracks per-file via PTQ-0209/0816/0883 and is a different root cause); not a duplicate — same-wave siblings d7-01 (subagent-visible-regime's hexInvocationRoot) and d7-09 (subagent-child-env-scrub's local rootDouble) cite test files copying FROM this helper, and no quality/issues or resolved row cites the in-file pair; fix is a mechanical hoist of one shared literal (triage: claude-fable-5-1)

