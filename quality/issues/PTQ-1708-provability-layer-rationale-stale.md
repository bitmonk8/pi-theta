---
id: PTQ-1708
title: provableArgType still describes the parser-owned collector as an extension-only dependency.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/type-layer-provable.ts:47-54
  - src/parser/static-type-inference.ts:982-988
  - src/parser/with-clause-static-checks.ts:17-21
  - src/extension/invoke-expr-call-surface.ts:24-28
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# provableArgType still describes the parser-owned collector as an extension-only dependency.

## Observation
The documentation of `provableArgType` says `collectProvableArgTypes` is an extension-layer function that cannot be imported into the parser without reversing the dependency direction. The function is now declared in `parser/static-type-inference.ts`, and another parser module already imports it from that sibling. The extension call-surface module re-exports the parser declaration. This finding concerns the stated dependency rationale, not the choice to retain separate proof channels.

## Evidence

`src/parser/type-layer-provable.ts:47-54`:
```ts
 * Emitting on an erased read would refuse a theta whose runtime value the
 * emission misdescribes: bug 0072's landed soundness lesson at the
 * `.theta`-callable argument sink (`collectProvableArgTypes`,
 * `../extension/invoke-static-checks.ts`) applied here at a new sink. That
 * function is an extension-layer answer over the SET of types an expression
 * can take and cannot be imported into this parser-layer module without
 * inverting the dependency direction, so the same discipline is applied
 * in-layer as an EXACTNESS test instead (`isProvenReduction` below).
```

`src/parser/static-type-inference.ts:982-988`:
```ts
export function collectProvableArgTypes(
  expr: Expr,
  env: TypeEnv,
  pass: StaticTypeInferencePass,
): CompatType[] | undefined {
  return pass.collectProvableArgTypes(expr, env);
}
```

`src/parser/with-clause-static-checks.ts:17-21`:
```ts
import {
  collectProvableArgTypes,
  renderCollectedTypes,
  type StaticTypeInferencePass,
} from "./static-type-inference";
```

`src/extension/invoke-expr-call-surface.ts:24-28`:
```ts
// The provable value-type collection forward (`collectProvableArgTypes`) and
// the `<actual>`-placeholder renderer for a collected value-type set live beside
// the collection itself (../parser/static-type-inference.ts); re-exported so
// every extension call-surface consumer keeps its existing import shape.
export { collectProvableArgTypes, renderCollectedTypes } from "../parser/static-type-inference";
```

## Why this is a problem
Under the simplicity-and-cruft principle, a rationale naming a dependency restriction that no longer exists is stale implementation prose. The cited declaration, parser import, and extension re-export establish the opposite dependency direction from the one the comment presents as the reason for this implementation. No change to the live provability mechanism is implied.

## Suggested direction (non-binding, optional)
Bring the dependency explanation into agreement with the collector's current ownership while preserving any independently applicable proof-channel rationale.

## False-positive check
- Ran `rg -n '^export function collectProvableArgTypes\(' src/ extensions/ tools/ tests/`: one hit, `src/parser/static-type-inference.ts:982`. This checks the declaration's owner, not whether the declaration is dead.
- Read the parser import and extension re-export quoted above; the extension path is still a valid compatibility path, but it no longer owns the function.
- Ran `git blame -L 45,54 src/parser/type-layer-provable.ts`: the explanation was carried into this file by `33548129a`. Ran `git log -3 --oneline -S 'export function collectProvableArgTypes' -- src/parser/static-type-inference.ts` and `git show --stat --oneline 647a6f8e --`: `647a6f8e` subsequently moved the forward into the parser module and updated the parser consumers.
- PTQ-1534 covers the collector's former placement and is resolved; this report does not re-argue that placement or the live parallel mechanisms. It identifies the explanation left behind after that move. No deadness, test-only-reachability, or unused-export claim is made.

## Triage
verdict: confirmed — type-layer-provable.ts:51-54 still claims the collector is extension-owned and cannot be imported in-layer, but commit 647a6f8e moved its declaration to parser/static-type-inference.ts:982, with a live sibling-parser import and an extension re-export; all excerpts and stated searches reproduce, and resolved PTQ-1534 covers the placement move, not this leftover rationale. (triage: claude-opus-5-5)
