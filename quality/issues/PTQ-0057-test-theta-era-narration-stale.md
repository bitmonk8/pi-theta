---
id: PTQ-0057
title: "Two comments in the production producer still describe the 'test thetas' era and contradict the code beneath them"
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:690
  - src/extension/production-theta-producer.ts:7901-7909
sites: 2
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Two comments in the production producer still describe the 'test thetas' era and contradict the code beneath them

## Observation

The module header (line 1) declares this file "the production
`ThetaProducerDeps` for the shipped composition root". Two comments inside it
still justify their code by properties of "the test thetas" / "the shipped test
thetas" — text from the early increment when this producer only served bundled
test thetas. Both justifications are contradicted by the current code they
annotate.

## Evidence

Site 1 — src/extension/production-theta-producer.ts:690:

```ts
/** A fresh `ToolLoweringSink` that discards every channel — the test thetas carry no code-tool calls. */
function noopSink(): ToolLoweringSink {
```

The claim "no code-tool calls" is false for the hosts this sink is installed
into: all three `EffectfulStatementHostDeps` records pair `sink: noopSink()`
with a live code-side tool-call resolver a few lines below — lines 2092/2126
(prompt bind), 2443/2460 (subagent bind), 3090/3104 (`subagent fn` spawn), e.g.
lines 2092 and 2126-2127:

```ts
      sink: noopSink(),
```
```ts
      resolveToolCall: (expr, env, evaluatedToolArgs) =>
        this.#resolveToolCall(theta, expr, env, signal, evaluatedToolArgs),
```

Site 2 — src/extension/production-theta-producer.ts:7901-7909:

```ts
/**
 * Evaluate a pure (non-checkpointed) sub-expression against the environment.
 * The shipped test thetas' pure sub-expressions are literal / identifier reads;
 * an identifier that resolves to a local binding yields its value, any other
 * resolution arm (a bare `fn` / callable name, or an unresolved name) has no
 * first-class readable value and yields `null` — this evaluator's own inert
 * fallback (bug 0116: no such rule is stated in expressions.md) — rather than
 * throwing out of the executor.
 */
```

The function beneath it (declared at line 7910) implements the full expression
grammar, not "literal / identifier reads": its switch covers `number`,
`string`/`bool`, `null`, `ident`, `array`, `object`, `member`, `index`, `call`
(user `fn` bodies), `result-ctor`, `method-call`, `try`, `binary`, `ternary`,
and `block`.

## Why this is a problem

Historical narration comments that no longer match the code. Both sentences
state load-bearing rationale ("discards every channel — the test thetas carry
no code-tool calls"; "the shipped test thetas' pure sub-expressions are literal
/ identifier reads") that a reader would use to reason about what can reach
these paths, and both are contradicted by the same file today: production
thetas drive code-side tool calls through the very host records that install
`noopSink()`, and the pure evaluator handles fifteen expression forms. Git
shows both sentences predate the Loom→Theta rename (commit 2bc69157) — original
increment text that survived the module's promotion to the production producer
and the evaluator's growth.

## Suggested direction (non-binding, optional)

Reword each comment to state the current rationale (for `noopSink`: which
channels the production composition intentionally leaves silent and why; for
`evaluatePureExpression`: what the pure host covers and where the inert-`null`
fallback applies) instead of appealing to the retired test-theta context.

## False-positive check

- Verified site 1's contradiction mechanically: `grep -n "sink: noopSink()"`
  → 2092, 2443, 3090; `grep -n "resolveToolCall: (expr"` → 2126, 2460, 3104 —
  every host that installs the sink also wires the code-tool resolver.
  `EffectfulStatementHostDeps.sink` is consumed by the code-side tool-call
  lowering (`src/runtime/effectful-statement-host.ts:407` threads it to
  `runCodeSideToolCall`), so the sink is on a reachable production path — the
  comment's premise, not the sink itself, is what is stale. No behavior change
  is claimed (out of scope).
- Verified site 2's contradiction by reading the full switch (7914-8100): the
  case list is as cited; "literal / identifier reads" describes none of the
  twelve later-added arms.
- Git intent: `git log -S "the test thetas carry no code-tool calls"` and
  `-S "shipped test thetas"` reach back past the corpus rename (2bc69157) with
  no later edit updating the sentences — stale survival, not recent intent.
- Not filed as dead code: `noopSink` and `evaluatePureExpression` are both
  heavily referenced; only the narration is claimed stale.

## Triage
verdict: confirmed — both excerpts verified verbatim (now :690 and :7969-7977; exact at wave commit bd671ad3): all three `EffectfulStatementHostDeps` records pair `noopSink()` with the live `#resolveToolCall` (2099/2133, 2450/2467, 3097/3111) and tests/tool-return-shape-one-note-production-wired.test.ts drives `sink.diagnostic` through the real producer, while `evaluatePureExpression` grew from the original literal/ident-only switch (3a8732da) to 15 arms; no duplicate in intake (triage: claude-opus-5)

