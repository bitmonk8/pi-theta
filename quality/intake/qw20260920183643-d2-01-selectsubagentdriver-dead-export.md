---
id: pending
title: selectSubagentDriver and its mode field have no production caller; production reimplements the guard inline
lens: D2
status: intake
verdict: pending
locations:
  - src/runtime/subagent-root-regime.ts:110-145
  - src/extension/production-theta-producer.ts:3013-3028
  - src/extension/production-composition.ts:1580-1582
sites: 3
fix_scope: module
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# selectSubagentDriver and its mode field have no production caller; production reimplements the guard inline

## Observation
`subagent-root-regime.ts` exports `SubagentDriverSelection` and
`selectSubagentDriver`, documented as the PIC-58 "mode-regress guard" that
decides whether a `mode: subagent` theta is driven `in-process-root` or
`spawn-child`. `selectSubagentDriver`'s only callers in the whole tree are
three call expressions in `tests/subagent-root-regime.test.ts`; production
code never calls it. Instead, `production-theta-producer.ts` implements the
same guard as its own inline `isSubagentRootFor` method, returning a `boolean`
rather than `selectSubagentDriver`'s two-arm union, and comments in both
`production-theta-producer.ts` and `production-composition.ts` merely cite
`selectSubagentDriver`'s name in prose rather than invoking it. Additionally,
`DriverSelectionInput.mode` (the theta's frontmatter `mode:`) is declared and
documented but never read inside `selectSubagentDriver`'s body — the function
decides purely from `regime.active` and `isProcessRoot`.

## Evidence

`src/runtime/subagent-root-regime.ts:110-145`:
```ts
export type SubagentDriverSelection =
  | { readonly kind: "in-process-root" }
  | { readonly kind: "spawn-child" };

/** The inputs the driver selection reads. */
export interface DriverSelectionInput {
  /** The theta's frontmatter `mode:` (`"prompt"` | `"subagent"`). */
  readonly mode: ThetaMode;
  /** Whether this theta is the ROOT theta of its own process. */
  readonly isProcessRoot: boolean;
  /** The detected regime (from `detectSubagentRootRegime`). */
  readonly regime: RootRegime;
}
...
export function selectSubagentDriver(input: DriverSelectionInput): SubagentDriverSelection {
  if (input.regime.active && input.isProcessRoot) {
    return { kind: "in-process-root" };
  }
  return { kind: "spawn-child" };
}
```
`input.mode` is never referenced in the function body.

`src/extension/production-theta-producer.ts:3013-3028` — the production guard
that actually gates the in-process drive, independent of `selectSubagentDriver`:
```ts
  isSubagentRootFor(theta: ConversationBindInput["theta"]): boolean {
    const regime = this.#input.subagentRootRegime ?? { active: false as const };
    // RFC 0012 §10: a `fn` entry names one of the marked root's `subagent fn`s;
    // the root itself may be prompt-mode (FN-8), so the mode gate is the theta
    // entry's alone.
    const fnEntry = this.#input.subagentControlPlane?.entry.kind === "fn";
    return (
      regime.active &&
      regime.slug === theta.slashName &&
      (theta.frontmatter.mode === "subagent" || fnEntry)
    );
  }
```

`src/extension/production-composition.ts:1581`:
```ts
    // reaches `runBinder` (`selectSubagentDriver`'s no-recursion guarantee
```
A comment naming the function, not a call.

Exact searches:
- `grep -rn "selectSubagentDriver(" --include=*.ts src extensions tools tests` →
  4 hits: the declaration in `subagent-root-regime.ts:137`, and three call
  expressions in `tests/subagent-root-regime.test.ts:52,64,75`. No hit under
  `src/extension/` or `extensions/`.
- `grep -rn "in-process-root|SubagentDriverSelection" --include=*.ts src extensions tools` →
  only the declaration and its own two usages inside `subagent-root-regime.ts`
  (the type definition and the one `return` producing it); no consumer reads a
  `SubagentDriverSelection` value anywhere.

## Why this is a problem
The module header for `subagent-root-regime.ts` and this function's own doc
comment present `selectSubagentDriver` as the mechanism that "selects the
driver" for the mode-regress guard, but production reimplements the identical
decision as a differently-shaped boolean (`isSubagentRootFor`) that never
calls it. The function and its return type are therefore reachable from tests
only, and the `mode` field threaded through `DriverSelectionInput` is dead
weight even inside the function that declares it — the check never inspects
`mode` at all, contradicting the doc comment "Select the driver for a `mode:
subagent` invocation."

## Suggested direction (non-binding, optional)
Either wire `isSubagentRootFor`'s dispatch through `selectSubagentDriver` so
the documented mechanism is the one production runs, or fold the guard's logic
into the one production caller and let `subagent-root-regime.ts`'s conformance
tests exercise `isSubagentRootFor` directly.

## False-positive check
- `grep -rn "selectSubagentDriver(" --include=*.ts src extensions tools tests` — only test call sites found, no production call.
- `grep -rn "SubagentDriverSelection|in-process-root" --include=*.ts src extensions tools` — only declared, never consumed.
- Confirmed production dispatch path (`production-theta-producer.ts` `isSubagentRootFor`, gated ahead of `runBinder` per `production-composition.ts`) is a separate, independently-implemented boolean check that does not call this module's function.
- This is not the `spawnSubagentsInParallel` shape (that function's own header states explicitly "why this seam exists without a direct production call site" as a conformance witness); `selectSubagentDriver` carries no such disclosure and is presented as the live mechanism.
- Since the only callers are tests exercising this function directly (not witness doubles asserting non-invocation), and production independently reimplements the same decision, this is dead production code rather than a deliberate test-only seam.

## Triage
