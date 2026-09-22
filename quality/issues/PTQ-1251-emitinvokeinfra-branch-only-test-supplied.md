---
id: PTQ-1251
title: routeSubagentSpawnFailure's emitInvokeInfra branch is supplied only by a test, never by the sole production caller
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-place.ts:134-139
  - src/runtime/subagent-place.ts:153-177
  - src/extension/production-theta-producer.ts:2689-2691
  - tests/subagent-child-launch.test.ts:555-558
sites: 2
fix_scope: localized
wave: qw20260922150013
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# routeSubagentSpawnFailure's emitInvokeInfra branch is supplied only by a test, never by the sole production caller

## Observation

`SpawnFailureRoutingDeps.emitInvokeInfra` is an optional callback documented as
the `invoke`-parent sink for a dually-routed spawn failure ("absent at a
top-level slash/prompt surface", implying it is present at an `invoke`-parent
surface). `routeSubagentSpawnFailure` has exactly one production call site
(`production-theta-producer.ts:2689`), which supplies only `{ emitDiagnostic }`
and never `emitInvokeInfra`. Repo-wide, `routeSubagentSpawnFailure(` occurs at
only two sites total: that production call and one in
`tests/subagent-child-launch.test.ts`, which is the only site that ever passes
a value for `emitInvokeInfra`.

## Evidence

`src/runtime/subagent-place.ts:134-139`:
```ts
/** Collaborators the spawn-failure routing drives. */
export interface SpawnFailureRoutingDeps {
  /** Runtime-defect sink for the `theta/runtime/internal-error` diagnostic. */
  readonly emitDiagnostic: (diagnostic: Diagnostic) => void;
  /** `invoke`-parent sink; absent at a top-level slash/prompt surface. */
  readonly emitInvokeInfra?: (error: InvokeInfraError) => void;
}
```

`src/runtime/subagent-place.ts:167-177` (the branch this parameter guards):
```ts
  // At an `invoke` parent, additionally surface the `invoke_infra` envelope.
  if (deps.emitInvokeInfra !== undefined) {
    const message = error instanceof Error ? error.message : String(error);
    deps.emitInvokeInfra({
      kind: "invoke_infra",
      message: `internal error: ${message}`,
      callee_path: calleePath,
      cause: "internal_error",
    });
  }
```

`src/extension/production-theta-producer.ts:2689-2691` (the sole production
call site — every argument list this branch's guard could ever see in a
shipped build):
```ts
      routeSubagentSpawnFailure(new Error(reason), theta.sourcePath ?? theta.slashName, {
        emitDiagnostic,
      });
```

`tests/subagent-child-launch.test.ts:555-558` (the only site anywhere that
supplies `emitInvokeInfra`):
```ts
    routeSubagentSpawnFailure(spawnError, "/theta/child.theta", {
      emitDiagnostic: emit,
      emitInvokeInfra: (e): void => {
        envelope = e;
      },
    });
```

Search used: `grep -rn "routeSubagentSpawnFailure\b" --include=*.ts .`
(excluding `node_modules`, `dist/`, and a `.pi/tmp/fixes/` scratch copy of the
same producer file) — 2 call sites total, listed above.

## Why this is a problem

`emitInvokeInfra` is a parameter every production call site omits, so the `if
(deps.emitInvokeInfra !== undefined)` branch inside `routeSubagentSpawnFailure`
never executes in a shipped build — it is reachable only through the test that
supplies the callback and records what it was called with. The header comment
on `SpawnFailureRoutingDeps` states the field is meant to be present "at an
`invoke`-parent surface", but the module's single production caller — which
runs for both a top-level subagent launch and an `invoke`-mode subagent launch
(`spawnSubagentConversation`, called from both the `subagent fn` boundary and
the `invoke()` cross-mode dispatch) — never distinguishes the two and always
omits it, so the documented intent and the actual call site have drifted apart.

## Suggested direction (non-binding, optional)

Either wire an `emitInvokeInfra` sink at the `invoke`-parent call path so the
documented dual-routing behaviour actually happens in production, or drop the
parameter and its branch if the `invoke` parent already receives the
`internal_error` envelope through another mechanism (e.g. a boundary catch on
the thrown `SubagentSpawnFailedError`).

## False-positive check

- `grep -rn "routeSubagentSpawnFailure\b" --include=*.ts .` (excluding
  `node_modules`, `dist/`, `.pi/tmp/fixes/` scratch): exactly 2 call sites,
  one production, one test — reproduced above.
- `grep -n "emitInvokeInfra" src/extension/production-theta-producer.ts`: no
  hits — the identifier never appears in the file that calls
  `routeSubagentSpawnFailure`, confirming the sole production caller cannot
  supply it under any branch of that file's logic.
- Checked whether a second production caller exists elsewhere in `src/` or
  `extensions/`: none — `subagent-place.ts`'s own `placeSubagentChild` does not
  call `routeSubagentSpawnFailure` itself (the producer calls it after
  `placeSubagentChild`/`launchSubagentChild` fails), and no other module
  imports the function.
- This is not a dead-code claim (the function and its `emitDiagnostic` path
  are live in production); it is a vestigial-parameter claim: the one
  production call site passes the same value (omitted / `undefined`) for
  `emitInvokeInfra`, so the guarded branch's only live exerciser is the test.

## Triage
verdict: confirmed — every claim reproduces: all four excerpts match at the cited lines (subagent-place.ts:134-139 / 153-177, production-theta-producer.ts:2689-2691, subagent-child-launch.test.ts:555-558); my own repo-wide grep for `routeSubagentSpawnFailure|emitInvokeInfra|SpawnFailureRoutingDeps` across src/, extensions/, tools/, tests/ (incl. string-keyed access — the only `"emitInvokeInfra" in sink` hit is forwarding-listener-trap.ts's unrelated sink interface) finds exactly one production caller, which passes only `{ emitDiagnostic }`, and one test caller supplying the callback; `git log -S'emitInvokeInfra?'` shows the optional field dates to the RFC 0005 commit fda23a4b (v0.8.0) and has never been wired since; the vestige is real rather than a missing wire, because the documented `invoke`-parent behaviour is already delivered by another mechanism — the producer throws `SubagentSpawnFailedError` (2692) which unwinds to `runInvokeChild`'s boundary catch (invoke-cancellation.ts:151-164) minting `Err(InvokeInfraError{cause:"internal_error"})`, exactly as the comment at production-theta-producer.ts:5027-5035 states — so wiring the sink would route the defect twice; PIC-65 §Spawn failure (subagent.md:265) requires only `internal-error` + `subagent-spawn-failed`, both of which the `emitDiagnostic` path keeps; not the test-only-callers carve-out (the function is production-live; the filing is a vestigial optional parameter passed the same absent value at every production site, the step-3 anchor) and no existing PTQ names this root cause (PTQ-1202 is the D9 launcher breakdown that moved this code) (triage: claude-fable-5-1)
