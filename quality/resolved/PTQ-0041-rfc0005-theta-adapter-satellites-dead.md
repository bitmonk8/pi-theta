---
id: PTQ-0041
title: "`#emitThetaCallableSetupThrow`, `ResolvedThetaCallable`, and the `runInvokeChild` import survive in production-theta-producer.ts with no callers since the RFC-0005 child-process rework"
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:1795-1821
  - src/extension/production-theta-producer.ts:4656-4669
  - src/extension/production-theta-producer.ts:182
  - src/extension/production-theta-producer.ts:281
  - src/extension/production-theta-producer.ts:4746-4754
sites: 5
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# `#emitThetaCallableSetupThrow`, `ResolvedThetaCallable`, and the `runInvokeChild` import survive in production-theta-producer.ts with no callers since the RFC-0005 child-process rework

## Observation

The parent-side model-driven `.theta` adapter loop was deleted by commit
`fda23a4b` ("feat: child-process subagent sessions (RFC 0005) — v0.8.0"): the
subagent drive now spawns a child `pi` process instead of registering
model-facing `.theta` tools in the parent. That deletion removed every caller
of the private method `#emitThetaCallableSetupThrow`, every user of the
interface `ResolvedThetaCallable`, and the only call of `runInvokeChild` in
this module, but left all three declarations (and two now-single-consumer
satellites) in place.

## Evidence

`tsc --noEmit --noUnusedLocals --noUnusedParameters` over the repo reports, for
this file (three of its four hits belong to this root cause; the fourth is
filed separately):

```
src/extension/production-theta-producer.ts(182,1): error TS6133: 'runInvokeChild' is declared but its value is never read.
src/extension/production-theta-producer.ts(1795,3): error TS6133: '#emitThetaCallableSetupThrow' is declared but its value is never read.
src/extension/production-theta-producer.ts(4657,11): error TS6196: 'ResolvedThetaCallable' is declared but never used.
```

src/extension/production-theta-producer.ts:1795-1802 — the uncalled private
method (its body runs through line 1821):

```ts
  #emitThetaCallableSetupThrow(
    thrown: unknown,
    callableName: string,
    theta: ConversationBindInput["theta"],
  ): LoweredThetaCallableResult {
    let captured: Diagnostic | undefined;
    const sink: ToolLoweringSink = {
      runtimeEvent: (): void => {},
```

src/extension/production-theta-producer.ts:4656-4663 — the unreferenced
interface (non-exported; zero references anywhere in the repo):

```ts
/** SUBAG-2: a resolved model-callable `.theta` in a subagent's callable set. */
interface ResolvedThetaCallable {
  /** The callable-set name the model calls (post-`as`, post-hyphen→underscore). */
  readonly presentedName: string;
  /** The callee `.theta` path relative to the caller's directory. */
  readonly calleePath: string;
```

src/extension/production-theta-producer.ts:182 — the unused value import
(`runInvokeChild` appears elsewhere in this file only inside two comments, at
lines 1782 and 4258):

```ts
import { runInvokeChild } from "../runtime/invoke-cancellation";
```

Transitively single-consumer satellites:

src/extension/production-theta-producer.ts:281 — `routeThetaCallableSetupThrow`
is imported here and called only at line 1812, inside the dead method:

```ts
import { routeThetaCallableSetupThrow } from "../runtime/tool-call-off-surface";
```

src/extension/production-theta-producer.ts:4746-4754 — this module's
`ZERO_BODY_RANGE` const has exactly one user, line 1815 inside the dead method
(the `theta-composition-producer.ts` const of the same name is a separate
declaration):

```ts
/**
 * The zero-width body range for a `.theta`-adapter internal-error diagnostic that
 * carries no source position of its own (mirrors the top-level panic-note site's
 * `ZERO_BODY_RANGE` in `theta-composition-producer.ts`).
 */
const ZERO_BODY_RANGE: SourceRange = {
  start: { line: 0, column: 0 },
  end: { line: 0, column: 0 },
} as const;
```

Commit `fda23a4b`'s diff of this file removes the sole users of all of the
above (excerpt of deleted lines):

```
-    const thetaCallables: ResolvedThetaCallable[] = [];
-            const outcome = await runInvokeChild(
-            this.#emitThetaCallableSetupThrow(thrown, callable.presentedName, theta),
```

## Why this is a problem

Dead code, proven dead. An ES-`#`-private method admits no dynamic,
string-keyed, or external access, and repo-wide search finds no call; the
non-exported interface has zero references; the `runInvokeChild` import is
referenced only by comments. The compiler confirms all three under
`noUnusedLocals` (the project's tsconfig does not enable that flag, and
eslint.config.js enables only the three `theta-local` rules, so nothing red
flags them in CI). The method's own doc block (lines 1778-1794, 17 lines of
SUBAG-2 routing narrative) describes an adapter that no longer exists in this
process, misleading readers about what the production producer does today.

## Suggested direction (non-binding, optional)

Delete the method, the interface, the `runInvokeChild` import, and — once the
method is gone — the now-unused `routeThetaCallableSetupThrow` import and
`ZERO_BODY_RANGE` const in this module. The setup-throw routing leaf
(`src/runtime/tool-call-off-surface.ts`) and its tests are untouched; if a
future parent-side adapter returns, the leaf is where the behavior lives.

## False-positive check

- `grep -rn "emitThetaCallableSetupThrow"` across the repo (src/, extensions/,
  tools/, tests/): 1 hit — the definition at
  src/extension/production-theta-producer.ts:1795. `#`-private: string-keyed /
  dynamic access impossible; not exported; no re-export.
- `grep -rn "ResolvedThetaCallable"` across the repo: 1 hit — the declaration
  at line 4657. Not exported; no re-export.
- `grep -n "runInvokeChild" src/extension/production-theta-producer.ts`: lines
  182 (import), 1782 and 4258 (comments only). The function itself is alive
  elsewhere (`src/runtime/effectful-statement-host.ts:347,466`) — only the
  local import is claimed dead.
- `ZERO_BODY_RANGE` in src/extension/: users are line 1815 (inside the dead
  method) plus theta-composition-producer.ts's own separate const — no other
  consumer of this module's const.
- `routeThetaCallableSetupThrow`: in this file only at 281 (import) and 1812
  (inside the dead method); the runtime module and its witness tests
  (tests/tool-calls-off-surface-routing.test.ts) call the leaf directly and are
  out of this claim.
- Test-only-caller rule: `lowerModelDrivenThetaCall`, `ModelDrivenThetaCall`,
  and `LoweredThetaCallableResult` in the same region ARE imported by
  tests/subagent-model-theta-tool.test.ts and
  tests/b0409-omitted-defaulted-binds-default.test.ts — witness tests are
  legitimate callers, so those are deliberately NOT claimed dead here.
  `LoweredThetaCallableResult` is also the dead method's return type but stays
  alive through those exports.
- Git intent: `git log -S` shows commit fda23a4b (RFC 0005) deleted the
  adapter loop that was the sole caller/user of all three; no later commit
  reintroduced a caller. Not a spec-mandated fail-closed branch — the
  tool-calls.md:30 setup-throw row is now served in the spawned child.

## Triage
verdict: confirmed — independently reproduced: `tsc --noUnusedLocals` still flags all three (182, 1802, 4685), repo-wide greps find zero callers in src/tests/tools/extensions (only dist/ build output and .pi scratch copies), `#`-private forbids dynamic access, satellites `routeThetaCallableSetupThrow`/`ZERO_BODY_RANGE` are used solely inside the dead method, and `git show fda23a4b` confirms it deleted the sole users; cited lines have drifted ~7-30 but every excerpt matches verbatim. (triage: claude-opus-5)

