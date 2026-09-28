---
id: pending
title: The tool-return-shape internal-error diagnostic is delivered two ways from one seam — `runCodeSideToolCall` emits it on the `ToolLoweringSink` AND returns it on the `return-shape-defect` arm that `runToolCallEffect` rethrows as a `ToolReturnShapeDefectError` carrier — so production has to supply `noopSink()` to avoid a double note, and a commit that wired a real sink was reverted for exactly that
lens: D1
status: intake
verdict: pending
locations:
  - src/runtime/tool-call-execute.ts:128-137
  - src/runtime/tool-call-execute.ts:529-533
  - src/runtime/effectful-statement-host.ts:422-437
  - src/extension/dispatch-defect-surface.ts:97-101
  - src/extension/production-producer-deps.ts:492-505
  - src/extension/production-theta-producer.ts:707-710
  - tests/tool-return-shape-one-note-production-wired.test.ts:1-17
sites: 4
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The tool-return-shape internal-error diagnostic is delivered two ways from one seam — `runCodeSideToolCall` emits it on the `ToolLoweringSink` AND returns it on the `return-shape-defect` arm that `runToolCallEffect` rethrows as a `ToolReturnShapeDefectError` carrier — so production has to supply `noopSink()` to avoid a double note, and a commit that wired a real sink was reverted for exactly that

## Observation
When a code-side `<name>(args)` call resolves a non-conforming envelope, `runCodeSideToolCall` (`src/runtime/tool-call-execute.ts`) both calls `sink.diagnostic(shape.diagnostic)` and returns `{ kind: "return-shape-defect", diagnostic }`. Its only production consumer, `runToolCallEffect` (`src/runtime/effectful-statement-host.ts`), turns that arm into `throw new ToolReturnShapeDefectError(outcome.diagnostic)`, and the top-level dispatch-defect surface (`src/extension/dispatch-defect-surface.ts`) reads `thrown.diagnostic` to frame the single operator note. The same diagnostic object therefore travels on two channels out of one seam. Production resolves the duplication by making the first channel inert: the only production `ToolLoweringSink` is `noopSink()`, whose doc states that "an independently-delivering sink here would double-deliver". The repository's history contains the wrong call this width invites: commit `5e17a746` replaced `noopSink()` with a delivering `runtimeDefectSink` because the diagnostic "was constructed correctly but discarded in production"; commit `81e817c9` reverted it because the result was "a DOUBLE note at top level (sink note + framed panic note) and a SPURIOUS note in the invoke context", and added `tests/tool-return-shape-one-note-production-wired.test.ts` to pin the no-op sink.

## Evidence

**The seam's contract — a sink the lowering "could reach".** `src/runtime/tool-call-execute.ts:128-137` (re-read before filing):
```ts
/**
 * The runtime's normative side channels the accepted-path lowering could reach.
 * Non-text-block discard is NOT a `QueryError` and is not in the always-log
 * set: the lowering MUST NOT call ANY of these on the discard path
 * (host-interfaces-core.md §"Tool execution from theta code"). Passed in so a
 * test can witness that a compliant lowering never touches it.
 */
export interface ToolLoweringSink {
  diagnostic(diag: Diagnostic): void;
  systemNote(message: string): void;
}
```

**Channel 1 — emit on the sink; Channel 2 — return on the arm.** `src/runtime/tool-call-execute.ts:529-533`:
```ts
  // Emit the runtime-defect diagnostic on the lowering sink (the designated
  // channel) and surface the defect on its own outcome arm. `runToolCallEffect`
  // routes it as the internal-error path — NOT a bound `Err(CodeToolError)`.
  sink.diagnostic(shape.diagnostic);
  return { kind: "return-shape-defect", diagnostic: shape.diagnostic, committed: [] };
```

**Channel 2's consumer rethrows the same diagnostic as a carrier.** `src/runtime/effectful-statement-host.ts:422-437` (excerpt):
```ts
    case "return-shape-defect":
      // … The diagnostic
      // (already emitted on the lowering sink by `runCodeSideToolCall`) rides on
      // the carrier so a catch site owning a live diagnostic channel can surface
      // it verbatim with its `details.kind = "tool-return-shape"`.
      throw new ToolReturnShapeDefectError(outcome.diagnostic);
```
`src/extension/dispatch-defect-surface.ts:97-101`:
```ts
  const diagnostic =
    thrown instanceof ToolReturnShapeDefectError
      ? thrown.diagnostic
      : surfaceUnexpectedThrow(thrown, site);
```

**Production neutralises Channel 1 and says why.** `src/extension/production-producer-deps.ts:492-505`:
```ts
/**
 * A fresh `ToolLoweringSink` that discards every channel. The one channel a
 * compliant lowering reaches is `sink.diagnostic` on a non-conforming
 * `execute()` return shape, and that diagnostic also rides on the
 * `ToolReturnShapeDefectError` carrier the seam throws — the top-level catch
 * frames it as the single operator note, so an independently-delivering sink
 * here would double-deliver.
 */
export function noopSink(): ToolLoweringSink {
  return {
    diagnostic(): void {},
    systemNote(): void {},
  };
}
```
`src/extension/production-theta-producer.ts:707-710`:
```ts
    const hostDeps: EffectfulStatementHostDeps = {
      checkpoint,
      signal,
      sink: noopSink(),
```

**Counts, both ways.** Production implementations of `ToolLoweringSink`: search `grep -rn "noopSink" src/` → 4 hits:
```
src/extension/production-producer-deps.ts:7:// `noopSink`, `NoopConversationMutator`, the typed `SubagentSpawnFailedError`
src/extension/production-producer-deps.ts:500:export function noopSink(): ToolLoweringSink {
src/extension/production-theta-producer.ts:62:  noopSink,
src/extension/production-theta-producer.ts:710:      sink: noopSink(),
```
(1 implementation, 1 production construction site — the only one.) Emitters on the sink: search `grep -rn "sink\.diagnostic(\|sink\.systemNote(" src/` → 3 hits:
```
src/runtime/tool-call-execute.ts:532:  sink.diagnostic(shape.diagnostic);
src/runtime/tool-call-off-surface.ts:135:  sink.diagnostic({
src/runtime/tool-call-off-surface.ts:143:  sink.systemNote(framing);
```
The latter two are inside `routeThetaCallableSetupThrow`; search `grep -rn "routeThetaCallableSetupThrow(" src/` → 1 hit (its declaration, `src/runtime/tool-call-off-surface.ts:106`) — no production caller, so `:532` is the only production emission on the sink, and it is the one the carrier duplicates. Production consumers of the `return-shape-defect` arm: `src/runtime/effectful-statement-host.ts:422` (the one `case`); production callers of `runCodeSideToolCall`: search `grep -rn "runCodeSideToolCall(" src/` → 2 hits (`effectful-statement-host.ts:395` call, `tool-call-execute.ts:407` declaration).

**The drift that already happened.** `git log --oneline -S'runtimeDefectSink'` → 2 commits:
```
81e817c9 feat(runtime): frame top-level runtime defects as one loom-system-note; supersede the 1c1a1d70 sink note
5e17a746 fix(tool-call): surface tool-return-shape internal-error diagnostic to the operator (V14c observability)
```
`5e17a746`'s message: "The V14c tool-return-shape defect diagnostic … was constructed correctly but discarded in production because the tool-lowering sink was noopSink() … Replace noopSink() with runtimeDefectSink(systemNote)". `81e817c9`'s message: "1c1a1d70 had wired the code-side tool-lowering sink from noopSink() to a runtimeDefectSink … With change (1) that became a DOUBLE note at top level (sink note + framed panic note) and a SPURIOUS note in the invoke context … the sink is restored to noopSink() (discardable — the diagnostic rides the ToolReturnShapeDefectError carrier)". The regression pin, `tests/tool-return-shape-one-note-production-wired.test.ts:10-17`:
```
// `theta /<name> aborted with internal error: <msg>` panic note (error-model.md
// §"Runtime panics"). The carrier — NOT the sink — is the single operator
// surface: the production code-side lowering sink is `noopSink()`, so the sink
// touch delivers NO note. This test drives the malformed return through the REAL
// production producer (`createProductionProducerDeps`) with a spy
// `pi.sendMessage`, so if the lowering sink were re-wired to an
// independently-delivering sink (the reverted 1c1a1d70 `runtimeDefectSink`) the
// operator would observe TWO notes and this test would red.
```

**Self-inconsistency statement.** No written rule names one delivery channel for a runtime-defect diagnostic raised inside a lowering seam; the anchor is self-inconsistency — the same seam delivers the same diagnostic on a sink it calls "the designated channel" (`:529`) and on a thrown carrier its consumer calls the single surface — plus the cost cited below.

## Why this is a problem
One diagnostic, two delivery mechanisms out of one function, and the correctness of the operator surface depends on the production wiring keeping one of them inert. The width invited the wrong call and the repository took it: a maintainer read `sink.diagnostic(...)` with its comment "the designated channel", saw the production sink was a no-op, concluded the diagnostic was being discarded, and wired a delivering sink (`5e17a746`); the result was a double note plus a spurious note in the invoke context, reverted in `81e817c9`, after which a production-wired regression test and a doc block on `noopSink` had to be added to keep the seam's first channel muted. The sink emission at `tool-call-execute.ts:532` survives as production-dead-by-wiring but test-live, so the trap remains armed for the next reader of that line.

## Suggested direction (non-binding, optional)
Unproven hypothesis: if the carrier is the single surface (as `81e817c9`, `noopSink`'s doc, and the one-note test all state), the seam could stop emitting on the sink for the return-shape defect and let the arm/carrier be the only channel, which would let `ToolLoweringSink` shrink to the MUST-NOT-touch witness role its own doc describes; whether any test that reads the sink on this path should instead read the arm is for the fix stage.

## False-positive check
- **Injected clone map:** no group covers `tool-call-execute.ts`, `effectful-statement-host.ts`, `production-producer-deps.ts`, or `dispatch-defect-surface.ts`; the two channels are mechanism-shaped (sink call vs. returned-arm-then-throw), not token copies.
- **D9-affinity check:** not a wrong-home claim — the emission, the rethrow, and the framing each sit in the module that owns that step; the claim is that one seam delivers one payload twice.
- **D2-deadness check:** both channels live — `sink.diagnostic` at `:532` is reached in production (with a no-op receiver) and read by tests that install recording sinks (`grep -rln "runCodeSideToolCall" tests/` → 9 files); the carrier path is the production operator surface (`dispatch-defect-surface.ts:97-101`).
- **Export-style exemption:** n/a (divergent-solutions).
- **Prior filings:** the qw20260921183818 D8 shard-16 note lists `tool-call-execute` under KEEP for its truncation semantics and does not mention the dual delivery; PTQ-1152 (`run-tool-call-effect-three-routes`, D9) is about `runToolCallEffect`'s size, and PTQ-1302 (swallowing-handler seams) is about `cancellation-core` aliases — neither fix touched the sink/carrier pairing. Search `grep -rln "noopSink\|runtimeDefectSink\|ToolLoweringSink" quality/intake/ quality/issues/` → 1 hit (this file only). Search `grep -rln "noopSink\|runtimeDefectSink" quality/resolved/` → 6 hits (PTQ-0057, PTQ-0171, PTQ-0190, PTQ-1150, PTQ-1188, PTQ-1285); the one about this interface, PTQ-0190 (D2, "ToolLoweringSink's runtimeEvent member … invoked at no call site"), removed the unread `runtimeEvent` member and did not address the `diagnostic` channel's duplication with the carrier — its fix scope was the dead member, not the dual delivery.
- **Spec check:** `error-model.md §"Runtime panics"` (cited by `81e817c9` and the one-note test) pins ONE framed note per top-level defect; it does not name the sink as a second channel.
- **Git history intent:** `5e17a746` → `81e817c9` is the documented drift-and-revert; the current shape (emit-and-mute) is what the revert left in place, with the one-note test guarding it.
- **Self-inconsistency statement:** no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All excerpts match: tool-call-execute.ts:128-137, :529-533 (sink.diagnostic then the return-shape-defect arm), effectful-statement-host.ts:422-437 (rethrow as ToolReturnShapeDefectError), dispatch-defect-surface.ts:97-101, production-producer-deps.ts:492-505 (noopSink doc says a delivering sink "would double-deliver"), production-theta-producer.ts:710, one-note test :1-17. Every stated search reproduces with its pasted lines (noopSink 4, sink emitters 3, routeThetaCallableSetupThrow 1 = declaration only, runCodeSideToolCall 2, -S runtimeDefectSink 2 commits, 9 test files). clone-scan on tool-call-execute.ts shows no clone groups. Cost is real: 81e817c9 reverted the delivering sink after it caused a double note plus a spurious invoke note. One caveat: 5e17a746 landed while the carrier still escaped uncaught (its own message says so), so the double note came when the top-level catch was added, not only from misreading the sink comment. No overlapping D2/D4/D8/D9 filing or PTQ; PTQ-1556 (D6) is about the unguarded lowering reads, a different root cause (triage: claude-opus-5-5)
