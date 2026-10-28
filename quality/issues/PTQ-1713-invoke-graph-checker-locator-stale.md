---
id: PTQ-1713
title: buildInvokeGraph's comment locates the callee warning push in a file that now delegates it.
lens: D2
status: open
verdict: confirmed
locations:
  - src/extension/invoke-static-checks.ts:253-261
  - src/extension/invoke-static-checks.ts:700-710
  - src/extension/invoke-expr-call-surface.ts:249-259
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# buildInvokeGraph's comment locates the callee warning push in a file that now delegates it.

## Observation
The `buildInvokeGraph` header identifies the invoke-surface `checkCalleeHasErrors` push as belonging to “this file,” inside `checkInvokeStaticResolution` below (`src/extension/invoke-static-checks.ts:253-261`). That function now delegates invoke-expression checks to `checkInvokeExprCallSurface` (`src/extension/invoke-static-checks.ts:700-710`). The actual warning push is in `invoke-expr-call-surface.ts` (`src/extension/invoke-expr-call-surface.ts:249-259`).

## Evidence
`src/extension/invoke-static-checks.ts:253-261` — the header's local ownership claim:
```ts
 * The returned graph's `unresolvable` set is always empty here. `InvokeGraph`'s
 * own doc (`../runtime/invoke-depth-cycle.ts`) treats a member as a LEAF
 * because it produced `theta/load/callee-has-errors`, but that diagnostic
 * (this file's `checkCalleeHasErrors` push on the `invoke` surface, in
 * `checkInvokeStaticResolution` below) fires only for a callee whose
 * realpath-based containment check rejected it — one this pass never
 * discovered, so never a member of `inputs` and never one of the nodes `edges`
 * covers above. This builder's own leaf-termination is the edge-drop just
 * described, not this field.
```

`src/extension/invoke-static-checks.ts:700-710` — the current delegation:
```ts
    diagnostics.push(
      ...(await checkInvokeExprCallSurface(
        callSites.invokeExprs,
        callerPath,
        typeEnv,
        typePass,
        {
          fs: deps.fs,
          activeRoots: deps.activeRoots,
          resolveCalleeArity: deps.resolveCalleeArity,
          resolveCalleeAbsolute,
```

`src/extension/invoke-expr-call-surface.ts:249-259` — the warning's current location:
```ts
    if (containment === undefined) {
      diagnostics.push(
        ...checkCalleeHasErrors({
          calleePath: invoke.path,
          surface: "invoke",
          relatedSites: [],
          site,
        }),
      );
      continue;
    }
```

The exact search `rg -n 'checkCalleeHasErrors' src/extension/invoke-static-checks.ts src/extension/invoke-expr-call-surface.ts` returns four matching lines: two prose references in `invoke-static-checks.ts` (256 and 588), and the import and invocation in `invoke-expr-call-surface.ts` (7 and 251). There is no local invocation at the header's stated destination.

## Why this is a problem
The stale ownership pointer directs inspection of the warning's admission condition to an orchestrator rather than the function containing that condition. This is current-code header drift after extraction: the named check remains live, but its claimed local push no longer exists. The finding does not challenge the deliberately empty `unresolvable` set or the graph's leaf-termination policy.

## Suggested direction (non-binding, optional)
Bring the header's checker-location reference into agreement with the delegated implementation.

## False-positive check
- Ran the four-hit identifier search stated in Evidence and inspected its complete result, distinguishing the two prose mentions from the import and executable call.
- Read `checkInvokeStaticResolution` through its end and the delegated invoke-expression loop; the header's “this file” / “below” wording does not identify the module that contains the warning push.
- History intent check: `git blame -L 248,261 src/extension/invoke-static-checks.ts` attributes the locator paragraph to `5e674077`. `git show f7aae3fc -- src/extension/invoke-static-checks.ts` shows the subsequent removal of the `checkCalleeHasErrors` import and warning push into the extracted call-surface module.
- Checked `quality/resolved/PTQ-0295-invoke-graph-unresolvable-always-empty.md` and `quality/issues/PTQ-1545-invoke-callee-unparseable-no-callee-has-errors.md`: those concern the graph field and warning coverage respectively, not the post-extraction location reference. Neither behavior is challenged here.
- This is not a deadness claim or a proposal to remove a live/test-only checker; no runtime or spec behavior change is proposed.

## Triage
verdict: confirmed — All three excerpts and the four-hit identifier search reproduce; buildInvokeGraph still claims a local checkCalleeHasErrors push, but f7aae3fc extracted it into checkInvokeExprCallSurface, leaving only delegation in checkInvokeStaticResolution. This is mechanically verified D2 stale ownership prose, distinct from PTQ-0295's empty graph field and PTQ-1545's warning coverage. (triage: claude-opus-5-5)
