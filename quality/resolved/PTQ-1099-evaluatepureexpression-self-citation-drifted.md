---
id: PTQ-1099
title: "#resolveRuntimeToolCall's comment cites production-theta-producer.ts:3965 for the '.theta-callable path' evaluatePureExpression map, but that line is unrelated code"
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:4354-4356
  - src/extension/production-theta-producer.ts:3960-3970
  - src/extension/production-theta-producer.ts:4825
sites: 1
fix_scope: localized
wave: qw20260920183643
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-20
---

# #resolveRuntimeToolCall's comment cites production-theta-producer.ts:3965 for the '.theta-callable path' evaluatePureExpression map, but that line is unrelated code

## Observation
Inside `#resolveRuntimeToolCall`, a comment justifies evaluating positional
args left-to-right by pointing at "the `.theta`-callable path's
`evaluatePureExpression` map" and cites its own file at line 3965. Line 3965
of the current file is inside `#resolvePromptQuery`'s follow-up-drive closure
construction, not any `.theta`-callable arm's argument-evaluation map. The
`.theta`-callable call's own `evaluatePureExpression` map (the one the comment
means to point at) is in `#resolveCallAsInvoke`, at line 4825.

## Evidence
`src/extension/production-theta-producer.ts:4354-4358` (the citing comment and
its own call, inside `#resolveRuntimeToolCall`):
```ts
    // Evaluate positional args left-to-right (the `.theta`-callable path’s
    // `evaluatePureExpression` map, production-theta-producer.ts:3965).
    const argValues: ThetaValue[] = expr.args.map((a) =>
      evaluatePureExpression(a, env),
    );
```

`src/extension/production-theta-producer.ts:3960-3970` (what line 3965 actually
is today — inside `#resolvePromptQuery`, building the typed follow-up-drive
closure, unrelated to any `.theta`-callable argument map):
```ts
    // Only `#buildTypedValidation` consults this closure, and it is built only
    // when `lowered !== undefined` — which implies `respond !== undefined`, so
    // no respond-less (degraded) follow-up drive is reachable. Untyped queries
    // build no validation collaborator at all.
    const driveFollowUp = (
      prompt: string,
    ): Promise<string | FollowUpDriveFailure | FollowUpRespondOutcome> =>
      liveModel.driveRepairAttempt(prompt);
    const validation =
      lowered !== undefined
```

`src/extension/production-theta-producer.ts:4807-4825` (`#resolveCallAsInvoke`,
the actual ".theta-callable" call-resolution method, whose own
`evaluatePureExpression` map is at line 4825):
```ts
  #resolveCallAsInvoke(
    theta: ConversationBindInput["theta"],
    expr: CallExpr,
    env: LexicalEnvironment,
    ctx: ExtensionCommandContext,
    chain: InvokeChain,
    parentSignal: AbortSignal,
    /** The invoking theta's own `mode:` — threaded to `#driveCallee`. */
    callerMode: ThetaMode,
    ...
  ): InvokeChild {
    const calleePath = thetaCalleePath(theta, expr.callee) ?? `./${expr.callee}.theta`;
    const argValues = expr.args.map((arg) => evaluatePureExpression(arg, env, chain));
```

## Why this is a problem
The comment's citation is a pointer meant to let a reader confirm the
"mirrors the `.theta`-callable path" claim by following the line number to
the actual sibling map call. Following `production-theta-producer.ts:3965`
today lands on an unrelated closure inside a different method
(`#resolvePromptQuery`), not on any argument-evaluation map, so the citation
no longer supports the claim it anchors — the file has grown/shifted since
the comment was written and the number was not updated.

## Suggested direction (non-binding, optional)
Update the citation to the current line of the `.theta`-callable map
(`#resolveCallAsInvoke`, line 4825), or replace the raw line number with a
symbol reference (e.g. "`#resolveCallAsInvoke`'s `evaluatePureExpression`
map") that survives future line shifts.

## False-positive check
- `grep -n "evaluatePureExpression" src/extension/production-theta-producer.ts`
  enumerated every call site of `evaluatePureExpression` in the file; the only
  `.theta`-callable-call-resolution site is `#resolveCallAsInvoke`'s map at
  line 4825 (`#resolveInvoke`'s own map at line 4779 handles `invoke(...)`,
  a different call form).
- Read lines 3955-3975 in full: confirmed line 3965 sits inside
  `#resolvePromptQuery`, unrelated to any callable-call argument map.
- Confirmed the citing comment (lines 4354-4355) and its call
  (4356-4358) are the only occurrence of this exact citation
  (`grep -n "production-theta-producer.ts:3965"` returns one hit, the
  citation itself).
- Not a test-reachability question: this is a comment-only claim, no code
  behaviour is affected either way.

## Triage
<!-- triage appends its note below this line -->
verdict: confirmed — re-verified: comment at 4354-4355 (inside #resolveRuntimeToolCall, decl 4327) cites :3965, which sits in #resolvePromptQuery's driveFollowUp closure (decl 3835), not an arg map; the `.theta`-callable evaluatePureExpression map is #resolveCallAsInvoke:4825 (only other candidate 4779 is invoke(...)); git log -S shows the pointer was already off at introducing commit 6b219884; no existing PTQ tracks it (triage: claude-fable-5-1)
