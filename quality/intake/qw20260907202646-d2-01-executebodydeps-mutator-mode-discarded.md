---
id: pending
title: ExecuteBodyDeps.mutator and .mode are threaded through the whole statement executor to five handlePartialTerminalOutcome calls whose callee discards both parameters
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/statement-executor.ts:186-192
  - src/runtime/statement-executor.ts:1271-1278
  - src/runtime/statement-executor.ts:1597-1599
  - src/runtime/statement-executor.ts:1993-1998
  - src/runtime/statement-executor.ts:2045-2050
  - src/runtime/statement-executor.ts:2273-2275
  - src/runtime/terminal-outcomes.ts:86-89
  - src/runtime/terminal-outcomes.ts:103-105
  - src/extension/production-theta-producer.ts:705-711
  - src/extension/production-theta-producer.ts:2166-2167
  - src/extension/production-theta-producer.ts:2493-2494
sites: 11
fix_scope: cross-module
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# ExecuteBodyDeps.mutator and .mode are threaded through the whole statement executor to five handlePartialTerminalOutcome calls whose callee discards both parameters

## Observation
`ExecuteBodyDeps` declares two required fields, `mutator:
CommittedConversationMutator` and `mode: DrivenConversationMode`. Inside
`statement-executor.ts` neither field is read anywhere except as the two
arguments of `handlePartialTerminalOutcome`, at five call sites that all pass
the same literal shape `{ path: "cancelled", mode: deps.mode, committed: [] }`
plus `deps.mutator`. `handlePartialTerminalOutcome`'s body is `void outcome;
void mutator;` — it reads neither argument. Both production constructions of
`ExecuteBodyDeps` supply `mutator: new NoopConversationMutator()`, a class
whose five methods are all empty.

## Evidence
Declaration — src/runtime/statement-executor.ts:186-192:

```ts
export interface ExecuteBodyDeps {
  readonly env: LexicalEnvironment;
  readonly host: StatementEvalHost;
  readonly checkpoint: Checkpoint;
  readonly signal: AbortSignal;
  readonly mutator: CommittedConversationMutator;
  readonly mode: DrivenConversationMode;
```

The five in-module reads. `grep -n "deps\.mutator\|deps\.mode"
src/runtime/statement-executor.ts` returns exactly 7 matching lines spanning 5
statements — 1276, 1598, 1995+1996, 2047+2048, 2274 — and there is no other
occurrence of either field anywhere in the file.

src/runtime/statement-executor.ts:1271-1278:
```ts
  if (result.error.kind === "cancelled") {
    // A mid-stream cancellation: turns Pi has committed remain final — the
    // runtime mutates no committed surface and injects no compensating turn
    // (ERR-8 / ERR-9 / ERR-10 / ERR-12). `handlePartialTerminalOutcome` calls
    // nothing on the mutator; routing through it makes the contract explicit.
    handlePartialTerminalOutcome({ path: "cancelled", mode: deps.mode, committed: [] }, deps.mutator);
    return { flow: "cancel" };
  }
```

src/runtime/statement-executor.ts:1597-1599:
```ts
  if (result.error.kind === "cancelled") {
    handlePartialTerminalOutcome({ path: "cancelled", mode: deps.mode, committed: [] }, deps.mutator);
    return { flow: "cancel" };
```

src/runtime/statement-executor.ts:1993-1998:
```ts
  if (deps.signal.aborted) {
    handlePartialTerminalOutcome(
      { path: "cancelled", mode: deps.mode, committed: [] },
      deps.mutator,
    );
    return { flow: "cancel" };
```

src/runtime/statement-executor.ts:2045-2050:
```ts
  if (wholeThetaCancelled || deps.signal.aborted) {
    handlePartialTerminalOutcome(
      { path: "cancelled", mode: deps.mode, committed: [] },
      deps.mutator,
    );
    return { flow: "cancel" };
```

src/runtime/statement-executor.ts:2273-2275:
```ts
  if (deps.signal.aborted) {
    handlePartialTerminalOutcome({ path: "cancelled", mode: deps.mode, committed: [] }, deps.mutator);
    return true;
```

The callee's signature — src/runtime/terminal-outcomes.ts:86-89:
```ts
export function handlePartialTerminalOutcome(
  outcome: PartialTerminalOutcome,
  mutator: CommittedConversationMutator,
): void {
```
and its entire executable body, src/runtime/terminal-outcomes.ts:103-105
(lines 90-102 are the explanatory comment, whose last sentence reads "the
contract's whole content is the absence of any mutating call, so the body is
intentionally empty"):
```ts
  void outcome;
  void mutator;
}
```

The values supplied — src/extension/production-theta-producer.ts:705-711:
```ts
class NoopConversationMutator implements CommittedConversationMutator {
  truncate(): void {}
  rewrite(): void {}
  replace(): void {}
  remove(): void {}
  injectCompensatingTurn(_surface: CommittedSurface): void {}
}
```

Both production `ExecuteBodyDeps` literals pass that class:
src/extension/production-theta-producer.ts:2166-2167
```ts
      mutator: new NoopConversationMutator(),
      mode: "prompt",
```
and src/extension/production-theta-producer.ts:2493-2494
```ts
      mutator: new NoopConversationMutator(),
      mode: "subagent",
```

## Why this is a problem
Vestigial field: the value is never read. `mutator` is a required field on the
executor's dependency record, carried through every recursive `deps` hand-off
in a 2417-line module, whose only consumption point provably discards it
(`void mutator;`) and whose only supplied values are instances of a class with
five empty methods. `mode` has the same single consumption point and the same
discard. The interface therefore obliges every constructor of
`ExecuteBodyDeps` to name a collaborator that no code path can observe, and
the five call sites are a pass-through to a function whose entire body is two
`void` statements.

## Suggested direction (non-binding, optional)
The spec obligation these fields encode (ERR-8 … ERR-12: the runtime performs
no mutation on the cancel path) is stated by the absence of mutating calls, not
by the presence of an unread parameter; whether that absence is best witnessed
by threading an unread handle or by a test that observes no mutator method is
the fix stage's call.

## False-positive check
- Identifier searches: `grep -rn "\bmutator\b" src/runtime/statement-executor.ts`
  → the declaration at :191, the header sentence at :182, the comment at :1275,
  and the five argument positions listed above; no other use.
  `grep -rn "deps\.mode" src/runtime/statement-executor.ts` → the same five
  statements only.
- Consumer search: `grep -rn "handlePartialTerminalOutcome" --include=*.ts src
  tests` → definition (terminal-outcomes.ts:86), the five statement-executor
  call sites, comment mentions in production-theta-producer.ts:701 and
  statement-executor.ts:184/999/1274/2267/2383, and two test call sites in
  tests/terminal-outcomes.test.ts. No caller reads a return value (the function
  returns `void`).
- Construction-site search: `grep -rn "mutator:" --include=*.ts src` → exactly
  two production literals (production-theta-producer.ts:2166, :2493), both
  `new NoopConversationMutator()`; plus the two declaration lines.
- Dynamic / string-keyed access: searched for `["mutator"]` and `["mode"]`
  bracket access across src/, extensions/, tools/, tests/ — no hits.
- Re-export check: `grep -rn "export \*" --include=*.ts src extensions tools
  tests` → no hits anywhere in the repository, so no barrel can widen the
  reachable surface.
- Tests-are-callers check: this is not a deadness claim about
  test-only-reachable code — the fields are reached in production; the point is
  that the value they carry is never read by anyone, in src/ or tests/.
  tests/terminal-outcomes.test.ts asserts precisely that no mutator method is
  called.
- Git history: `git log --oneline -- src/runtime/terminal-outcomes.ts` shows the
  seam landed in 3465acf2 (V4c-T) / 4ac46f54 (V4c) and the body has been an
  intentional no-op since; no commit ever removed a read of `mutator`.

## Triage
verdict: questionable — every excerpt and search reproduces and both fields are provably unread in src/, but the "vestigial" anchor is refuted: git history shows the only mutator.* calls were a deliberately non-compliant V4c-T red-stub and the empty body IS the landed ERR-8/ERR-9 contract, while statement-executor.test.ts:585-638 threads a RecordingMutator through these exact fields to witness it (red under the stub, green under the no-op) — leaving a design trade-off across 29 test construction sites for a human to rule (triage: claude-opus-5)
verdict: questionable — re-verified independently: every excerpt reproduces (drifted to :187-193/:1287/:1609/:2005/:2075/:2303, producer :730/:2197/:2528; terminal-outcomes.ts exact), `deps.mutator|deps.mode` is 7 lines/5 statements, no other `.mutator`/`.mode` read on an ExecuteBodyDeps exists in src/extensions/tools (theta-composition-producer.ts only forwards `executeDeps` to `executeBody`), exactly 2 production constructors both `NoopConversationMutator`, no bracket/keyof/Pick access, no `export *`; but the "vestigial" anchor does not hold — the claim "no commit ever removed a read of `mutator`" is false (4ac46f54 removed the V4c-T stub's `mutator.truncate/rewrite/injectCompensatingTurn` calls, yet that stub was a deliberately NON-COMPLIANT red-stub, so the two-`void` body IS the landed ERR-8/ERR-9 contract per coverage-matrix.md:25), and the fields entered ExecuteBodyDeps in 886feda4 (V19c-T) together with tests/statement-executor.test.ts:586-638, which threads a RecordingMutator and `mode: "subagent"` through these exact fields, drives to a mid-stream cancel, and asserts `mutator.calls` is `[]` (ERR-8/9/10/12) — so the value has a deliberate witness observer and was never meant to be read; what remains is a genuine design trade-off (executor-level witness seam vs. the unit-level witness terminal-outcomes.test.ts already gives, which has 4 call sites not the candidate's 2) whose fix would re-home those witnesses across ~31 test constructors plus 2 production literals — for a human to rule; not a duplicate (PTQ-0032 is src/mvp `parsed.mode`, PTQ-0108 is `effectHostDeps`, PTQ-0078 merely quotes one of these lines) (triage: claude-opus-5)
verdict: questionable — re-verified independently against current HEAD: declaration and all 5 statement-executor.ts call sites (:1287/:1609/:2006-2007/:2076-2077/:2303) reproduce exactly, `grep -n "deps\.mutator\|deps\.mode"` = same 7 lines/5 statements with no other read in the file; terminal-outcomes.ts's discarding body (:103-104) is unchanged since 4ac46f54 (V4c), which I confirmed by diff replaced 3465acf2's (V4c-T) deliberately NON-COMPLIANT stub whose `mutator.truncate/rewrite/injectCompensatingTurn` calls were the only calls this parameter's methods ever received — so the two-`void` body is the landed ERR-8…ERR-12 contract (coverage-matrix.md:25 confirmed verbatim), and both fields entered together with their witness in 886feda4 (V19c-T): tests/statement-executor.test.ts:586-638 (confirmed verbatim) threads a RecordingMutator through these exact fields via `executeBody`, including an explicit `mode: "subagent"` case, and asserts `mutator.calls` is `[]` — a deliberate absence-of-mutation seam, not leftover cruft, so I concur "vestigial" is the wrong anchor. New fact neither prior pass had: the since-landed PTQ-0171 fix (commit 35df0ce3, wave qw20260910054544) deleted the candidate's second cited production constructor (former production-theta-producer.ts:2493-2494, the `mode: "subagent"` literal) outright — `grep -rn "mutator:" src` now finds exactly ONE production `ExecuteBodyDeps` construction (:2198-2199, still `NoopConversationMutator`/`mode: "prompt"`), so 1 of 11 cited sites no longer exists in that form (stale evidence, not mere line drift), though the root claim — both fields threaded through live, reached code yet functionally unread — is otherwise fully intact; still a genuine design trade-off (executor-level witness vs. terminal-outcomes.test.ts's own unit-level witness) for a human to rule; not a duplicate of PTQ-0171 (dead whole-object construction on an unreachable arm; its own triage names this file as distinct) or PTQ-0032/PTQ-0108/PTQ-0078 (independently confirmed: different files/fields) (triage: claude-opus-5)
