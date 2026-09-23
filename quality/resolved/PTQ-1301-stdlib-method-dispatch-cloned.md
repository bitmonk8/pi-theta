---
id: PTQ-1301
title: Stdlib method dispatch duplicated across pure and effectful expression evaluators
lens: D4
status: fixed
verdict: confirmed
locations:
  - src/runtime/pure-expression-evaluator.ts:472-490
  - src/runtime/statement-executor.ts:1293-1307
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# Stdlib method dispatch duplicated across pure and effectful expression evaluators

## Observation
The runtime has two expression-evaluation hosts: the synchronous pure evaluator
(`src/runtime/pure-expression-evaluator.ts`) used for non-checkpointed
sub-expressions, and the async effectful executor
(`src/runtime/statement-executor.ts`) used for statement/effect positions.
Both hosts need to dispatch a `target.method(args)` call to the stdlib member
surfaces (`stdlib-string`, `stdlib-array`, `stdlib-object`) by receiver runtime
type. The dispatch logic is implemented twice, once in each host, with only the
function name changed.

## Evidence
**Site 1 — `src/runtime/pure-expression-evaluator.ts:472-490` (`evaluateStdlibMethod`):**
```ts
function evaluateStdlibMethod(
  receiver: ThetaValue,
  method: string,
  args: readonly ThetaValue[],
): ThetaValue {
  if (typeof receiver === "string") {
    return evaluateStringMember(receiver, method, args);
  }
  if (Array.isArray(receiver)) {
    return evaluateArrayMember(receiver, method, args);
  }
  if (typeof receiver === "object" && receiver !== null) {
    if (!isObjectValue(receiver)) {
      throw nonObjectReceiverRejection(`.${method}()`, receiver);
    }
    return evaluateObjectMember(receiver as { readonly [k: string]: ThetaValue }, method, args);
  }
  throw nonObjectReceiverRejection(`.${method}()`, receiver);
}
```

**Site 2 — `src/runtime/statement-executor.ts:1293-1307` (`applyStdlibMethod`):**
```ts
function applyStdlibMethod(receiver: ThetaValue, method: string, args: readonly ThetaValue[]): ThetaValue {
  if (typeof receiver === "string") {
    return evaluateStringMember(receiver, method, args);
  }
  if (Array.isArray(receiver)) {
    return evaluateArrayMember(receiver, method, args);
  }
  if (typeof receiver === "object" && receiver !== null) {
    if (!isObjectValue(receiver)) {
      throw nonObjectReceiverRejection(`.${method}()`, receiver);
    }
    return evaluateObjectMember(receiver as { readonly [k: string]: ThetaValue }, method, args);
  }
  throw nonObjectReceiverRejection(`.${method}()`, receiver);
}
```

**Diff verdict:** renamed-only (clone-map group **G013**). The function bodies are
identical except for the function name and formatting; both call
`evaluateStringMember` / `evaluateArrayMember` / `evaluateObjectMember` and throw
`nonObjectReceiverRejection` for non-object receivers. The preceding comments in
both places state the two hosts must "move in lockstep" on this gate.

## Why this is a problem
The comments in both places explicitly call out a lockstep obligation: the pure
host and the effectful executor must classify receivers the same way for a
`target.method(args)` call. If the dispatch rules diverge, the same method call
in a pure position (e.g., an interpolation operand or an `invoke` argument) and
an effect position (e.g., a statement expression) will classify the receiver
differently or surface different errors. Because the logic is duplicated rather
than shared, a bug fix or a new receiver-type rule must be edited in both
places.

## Suggested direction (non-binding, optional)
Move the single dispatch helper to a shared runtime module or export it from one
host and import it into the other. The natural shared home is `src/runtime`,
since both callers already live there.

## False-positive check
- Re-read both cited spans immediately before filing; both copies are live and
called from their respective `method-call` arms (`pure-expression-evaluator.ts:215`,
`statement-executor.ts:964`).
- Verified only two definitions exist in `src/` (grep for `evaluateStdlibMethod` /
`applyStdlibMethod`).
- The clone-map group G013 was re-verified at the cited lines.
- Searched `quality/intake/` and `quality/resolved/` for existing filings
mentioning `evaluateStdlibMethod`, `applyStdlibMethod`, or stdlib method dispatch
duplication; none found.
- Both cited files are production `src/` sources; no `tests/` files are involved.

## Triage
verdict: confirmed — both excerpts byte-exact at pure-expression-evaluator.ts:472-490 and statement-executor.ts:1293-1307; clone-scan map on pure-expression-evaluator.ts reproduces `G013 — 82 tokens — renamed-only (1)` at 476-489 / 1293-1306 and my own diff of the two bodies is identical modulo the function name and parameter-list line-wrapping; both copies are live (sole callers pure-expression-evaluator.ts:215 and statement-executor.ts:964, no other definitions in src/extensions/tools/tests); it is receiver-classification logic with an explicit lockstep obligation in both doc comments, not a spec vector table; no tracked issue shares this root cause (PTQ-1119 is the arity/kind belt inside the three stdlib-*.ts modules, a different clone) — note the same-wave sibling qw20260922211400-d4-09-stdlib-top-dispatcher-cloned.md (shard-22, written 26 s later, same G013) is a duplicate of this filing and should be ruled so (triage: claude-fable-5-1)
