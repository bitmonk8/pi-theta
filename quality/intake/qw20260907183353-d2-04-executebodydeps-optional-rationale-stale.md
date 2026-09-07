---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: ExecuteBodyDeps' emitDiagnostic and invokeChain docs justify their optionality with "existing constructors of this interface omit it" while every src constructor now supplies both
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/statement-executor.ts:200-217
  - src/extension/production-theta-producer.ts:2155-2177
  - src/extension/production-theta-producer.ts:2482-2503
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# ExecuteBodyDeps' emitDiagnostic and invokeChain docs justify their optionality with "existing constructors of this interface omit it" while every src constructor now supplies both

## Observation
`ExecuteBodyDeps` declares two optional fields, `emitDiagnostic?` (bug 0324)
and `invokeChain?` (bug 0354). Each field's doc comment states, in present
tense, that it is "OPTIONAL because existing constructors of this interface
omit it; a required field would flip every one of them outside this fix's
enumerated scope". The repository has exactly two src constructors of
`ExecuteBodyDeps` — the prompt-mode and subagent-mode `executeDeps` literals in
production-theta-producer.ts — and both supply both fields, each under its own
bug-0324 / bug-0354 wiring comment. No src constructor omits either field.

## Evidence
src/runtime/statement-executor.ts:200-217 — the two stale rationale sentences:

```ts
  /**
   * The runtime-diagnostic channel (bug 0324): `evalParFor`'s width resolve
   * calls this on a non-number `max` value (the clamp-to-1 disposition) so the
   * clamp is not silent. OPTIONAL because existing constructors of this
   * interface omit it; a required field would flip every one of them outside
   * this fix's enumerated scope.
   */
  readonly emitDiagnostic?: (diagnostic: Diagnostic) => void;
  /**
   * The per-chain INV-4 depth counter (bug 0354), passed down so
   * `evalUserFnCall` can push a countable frame for a CROSS-FILE `.thetalib`
   * `fn` call before its body runs. OPTIONAL because existing constructors of
   * this interface omit it (the `emitDiagnostic?` precedent) — a required
   * field would flip every one of them outside this fix's enumerated scope.
```

src/extension/production-theta-producer.ts:2155-2177 — src constructor 1
(prompt mode) supplies both (abridged to the two fields and their comments):

```ts
    const executeDeps: ExecuteBodyDeps = {
      ...
      // Bug 0324: thread the real runtime-diagnostic channel so a non-number
      // `par for` `max` value's clamp-to-1 is not silent.
      emitDiagnostic: this.#input.emitDiagnostic ?? ((): void => {}),
      // Bug 0354, INV-4: seed the cross-file `.thetalib` fn accounting with
      // THIS invocation's own chain (already seeded at
      // `subagentInboundInvokeDepth` above), so an invoke child's fn frames
      // share the same per-chain counter its invoke frames increment.
      invokeChain: chain,
    };
```

src/extension/production-theta-producer.ts:2482-2503 — src constructor 2
(subagent mode), same two fields supplied (`emitDiagnostic:` at :2498,
`invokeChain: chain` at :2502).

Constructor census: `grep -rn "ExecuteBodyDeps" src` → the declaring module,
the type-only import + the two object literals in production-theta-producer.ts
(:2155, :2482), and a type reference in theta-composition-producer.ts:238 (a
field type on `ThetaBinding`, populated by the producer's two literals). No
other src construction exists.

## Why this is a problem
Historical narration whose stated justification the code has outgrown: the
sentences were true when bugs 0324/0354 landed (the then-existing constructors
omitted the new fields, and widening the interface to required would have
touched files outside those fixes' scope), but today they assert a
present-tense fact — "existing constructors of this interface omit it" — that
is false of every src constructor. A reader deciding whether the optionality is
still needed, or whether an absent `invokeChain` is a real production state
(`evalUserFnCall` and `evalSubagentFnCall` each carry a
`deps.invokeChain !== undefined` fallback arm), is pointed at constructors that
no longer exist in the claimed state. This is the same claim-vs-roster drift
family as the already-confirmed stale-caller-roster findings, at a new site.

## Suggested direction (non-binding, optional)
Reword each rationale to the surviving truth — the fields stay optional for the
recording-double constructors in tests (e.g. tests/b0370-reassign-target-scope
.test.ts:810-818 omits both) — or drop the justification sentence and keep the
behavioural description. Comment-only change; whether the optionality itself
should be retired is a separate question this finding does not raise.

## False-positive check
- Constructor census: `ExecuteBodyDeps` searched across src/, extensions/,
  tools/ — object literals only at production-theta-producer.ts:2155 and :2482;
  both include `emitDiagnostic:` (:2171, :2498) and `invokeChain:` (:2176,
  :2502). theta-composition-producer.ts:238 is a type annotation on a field the
  producer's literals populate, not a construction.
- Optionality-liveness check: tests construct `ExecuteBodyDeps` omitting both
  fields (tests/b0370-reassign-target-scope.test.ts:810-818,
  tests/b0316-match-scrutinee-inline-composite-ok-wrapped.test.ts:407, and
  siblings), so the `?` itself is exercised — this finding claims only that the
  written RATIONALE ("existing constructors ... omit it") is stale, not that
  the optionality is dead.
- Git intent: the rationale sentences date from the bug-0324 and bug-0354
  fixes; the producer's two literals gained `emitDiagnostic` (bug 0324 wiring
  comment in place) and `invokeChain` (bug 0354/0388 wiring comments in place)
  in later fixes that did not revisit the interface docs.
- Duplicate check: intake findings citing statement-executor.ts cover other
  root causes (spawn-session id unread :173/:612, evaluateForLoop passthrough
  :2341-2355, countable-frame count :627, cancellable-sequence generality
  :1240/:1583, checkpointed-for-loop :2271, applyBinaryScalar citation drift);
  none cites the :200-217 field docs.

## Triage
