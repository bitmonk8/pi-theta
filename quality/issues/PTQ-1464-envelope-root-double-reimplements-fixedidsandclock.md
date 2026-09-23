---
id: PTQ-1464
title: subagent-fn-child-regime.ts's envelopeRootDouble() reimplements the file's own fixedIdsAndClock() idSource/clock block inline
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/subagent-fn-child-regime.ts:46-57
  - tests/helpers/subagent-fn-child-regime.ts:59-65
  - tests/helpers/subagent-fn-child-regime.ts:227-237
sites: 3
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# subagent-fn-child-regime.ts's envelopeRootDouble() reimplements the file's own fixedIdsAndClock() idSource/clock block inline

## Observation
`tests/helpers/subagent-fn-child-regime.ts` declares a private `fixedIdsAndClock()` helper (lines 46-57) whose doc comment states its purpose is exactly "fresh id and zero-clock doubles" for a `RuntimeRoot`. Two of the file's three `RuntimeRoot`-building exports already call it via spread (`childRegimeRootDouble()` at line 62, `rootDouble()` at line 170). The third, `envelopeRootDouble()` (lines 227-237), instead re-writes the `idSource`/`clock` fields inline rather than spreading `fixedIdsAndClock()`, in the same file, right after the other two call sites establish the pattern.

## Evidence

`tests/helpers/subagent-fn-child-regime.ts:46-57` (the shared helper):
```ts
function fixedIdsAndClock(newInvocationId = () => "inv-1"): Pick<RuntimeRoot, "idSource" | "clock"> {
  return {
    idSource: { newInvocationId, newToolCallId: () => "tc-1" },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
  };
}
```

`tests/helpers/subagent-fn-child-regime.ts:59-65` (`childRegimeRootDouble`, calls it):
```ts
export function childRegimeRootDouble(): RuntimeRoot {
  return {
    checkpoint: SEAM_NOOP_CHECKPOINT,
    ...fixedIdsAndClock(),
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/subagent-fn-child-regime.ts:227-237` (`envelopeRootDouble`, does not call it):
```ts
export function envelopeRootDouble(schemaValidator: SchemaValidator): RuntimeRoot {
  return {
    checkpoint: SEAM_NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator,
  } as unknown as RuntimeRoot;
}
```

The `idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" }` line is byte-identical to the one inside `fixedIdsAndClock()`, and the `clock` object's `setTimeout`/`clearTimeout` lines are also byte-identical; the only divergence is the omission of the `now: () => 0` field, which is silent under the `as unknown as RuntimeRoot` cast rather than a deliberate narrower type.

## Why this is a problem
`fixedIdsAndClock()` exists in this file specifically to give the `idSource`/`clock` pair one declaration, and two of the file's three `RuntimeRoot` builders already use it via spread; `envelopeRootDouble()` sits 165 lines below the second call site and re-declares the same literal instead, so any future change to the fixed id or clock behaviour (e.g. wiring a fake clock, or changing the fixed invocation id) has a third independently-typed copy in the same file to keep in step, and the missing `now` field is exactly the kind of drift a shared call site would catch statically.

## Suggested direction (non-binding, optional)
`envelopeRootDouble()`'s `idSource`/`clock` fields could spread `fixedIdsAndClock()` the way its two siblings already do — the pattern the file already established twice.

## False-positive check
- Gate-pin check: `subagent-fn-child-regime.ts` is a `tests/helpers/` module, not a `*gate*.test.ts` file or named gate kin; not applicable.
- Recording-double check: none of the three blocks record a call or back a "never called" MUST-NOT witness; all three are inert clock/id stand-ins. The carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "envelopeRootDouble\|fixedIdsAndClock" docs/bugs/*.md` → 0 hits; no documented correct-reason red cites either declaration.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-fn-child-regime" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any function or of any test importing `envelopeRootDouble` — only that it call the sibling helper the same file already declares and its own siblings already call.
- Coverage-drift check: this finding is about a duplicated block inside one existing, passing helper module; it makes no claim that any behaviour or path is untested.
- Prior-filing check: `grep -rl envelopeRootDouble quality/` → 0 hits (PTQ-1006, resolved, covered a different pair — `childRegimeRootDouble`/`rootDouble` before `fixedIdsAndClock()` existed — and is unrelated to `envelopeRootDouble`, which the resolved finding's fix left as the residual third copy).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all three excerpts reproduce verbatim at tests/helpers/subagent-fn-child-regime.ts:46-57 (`fixedIdsAndClock`), :59-65 (`childRegimeRootDouble` spreads it), :170 (`rootDouble` spreads it) and :227-237 (`envelopeRootDouble` inlines the byte-identical `idSource` line and `setTimeout`/`clearTimeout` clock lines, omitting only `now`, silently under the `as unknown as RuntimeRoot` cast); `envelopeRootDouble` is live (imported by subagent-envelope-negative-zero-fidelity, -nonfinite-ok-refusal and -result-carriage tests); docs/bugs, coverage-matrix and quality/ greps for `envelopeRootDouble` → 0 all reproduce; PTQ-1006 (resolved) covered only the childRegimeRootDouble/rootDouble pair at :38-50/:158-170 and its fix introduced `fixedIdsAndClock`, leaving this third copy — a distinct residual, not a duplicate; tests/helpers/ location, D7 copy-paste-fixture class, no gate/recording-double/red-test carve-out, no merge/rename/delete proposed; fix is a mechanical spread of the sibling helper (triage: claude-fable-5-1)
