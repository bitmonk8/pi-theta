---
id: PTQ-0190
title: ToolLoweringSink's runtimeEvent member is implemented by every constructor as a no-op or unread recorder but invoked at no call site in the repository
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/tool-call-execute.ts:114-125
  - src/runtime/tool-call-execute.ts:508-521
  - src/runtime/tool-call-off-surface.ts:106-143
sites: 3
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260910133034
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# ToolLoweringSink's runtimeEvent member is implemented by every constructor as a no-op or unread recorder but invoked at no call site in the repository

## Observation
`ToolLoweringSink` declares three required methods — `runtimeEvent`,
`diagnostic`, `systemNote` — described as "the runtime's normative side
channels the accepted-path lowering could reach." Both files in this seam
call `.diagnostic` and/or `.systemNote` on a received sink, but neither calls
`.runtimeEvent`, and no other file in the repository calls it either. Every
implementer of the interface — the one production factory plus roughly
eighteen test fixtures — still supplies a `runtimeEvent` method to satisfy
the required member, and each supplied method is a no-op or an unread
recorder.

## Evidence
src/runtime/tool-call-execute.ts:114-125 — the interface declaration:

```ts
/**
 * The runtime's normative side channels the accepted-path lowering could reach.
 * Non-text-block discard is NOT a `QueryError` and is not in the always-log
 * set: the lowering MUST NOT call ANY of these on the discard path
 * (host-interfaces-core.md §"Tool execution from theta code"). Passed in so a
 * test can witness that a compliant lowering never touches it.
 */
export interface ToolLoweringSink {
  runtimeEvent(event: RuntimeEvent): void;
  diagnostic(diag: Diagnostic): void;
  systemNote(message: string): void;
}
```

src/runtime/tool-call-execute.ts:508-521 — `runCodeSideToolCall`, the live
execution surface (reached in production through
`effectful-statement-host.ts:415`) that receives `sink` and dispatches every
code-side tool call; its only use of `sink` is `.diagnostic`:

```ts
  const shape = routeToolReturnShape(
    settlement.envelope,
    call.toolName,
    { file: site.file, range: { start: { line: site.line, column: site.column }, end: { line: site.line, column: site.column } } },
    sink,
  );
  if (shape.kind === "conforming") {
    return { kind: "value", result: shape.result, committed: call.committed };
  }
  sink.diagnostic(shape.diagnostic);
  return { kind: "return-shape-defect", diagnostic: shape.diagnostic, committed: [] };
```

src/runtime/tool-call-off-surface.ts:106-143 — `routeThetaCallableSetupThrow`,
the only function in either file that calls `.systemNote`; it calls
`.diagnostic` and `.systemNote` but not `.runtimeEvent`:

```ts
export function routeThetaCallableSetupThrow(
  thrown: unknown,
  callableName: string,
  site: OffSurfaceSite,
  sink: ToolLoweringSink,
): ThetaCallableAdapterResult {
  ...
  sink.diagnostic({
    severity: "error",
    code: INTERNAL_ERROR_CODE,
    file: site.file,
    range: site.range,
    message: `internal error: ${message}`,
    hint: stack,
  });
  sink.systemNote(framing);
  ...
```

Search: `grep -rn "runtimeEvent" --include="*.ts" src tests extensions tools`
→ 29 hits across 20 files (2 in `src/`: the interface declaration above, and
the no-op `runtimeEvent(): void {}` inside `noopSink()` at
`src/extension/production-theta-producer.ts:719`; 18 in `tests/`, each either
a no-op `runtimeEvent(): void {}` or a recorder class whose `runtimeEvent`
method pushes onto a `runtimeEvents` array). Every one of the 29 hits is a
declaration or an implementation; none is an invocation of the form
`x.runtimeEvent(...)`. Two tests assert the recorded array stays empty after
driving the real surface: `tests/tool-calls-off-surface-live-wiring.test.ts:441`
(`expect(sink.runtimeEvents).toEqual([])`, taken after driving
`runCodeSideToolCall`) and `tests/tool-calls-off-surface-routing.test.ts:337`
(the parallel assertion on the unrelated `LateSettlementObserver` interface's
own `emitRuntimeEvent`).

## Why this is a problem
The interface's own doc comment puts `runtimeEvent` on equal footing with
`diagnostic` and `systemNote` as one of the normative side channels a
lowering "could reach." The other two are each called by at least one
function in this pair of files, but `runtimeEvent` is called by neither, and
by nothing else in the repository. Because the member is required (not
optional), every one of the interface's roughly twenty implementers — the
one production factory and the rest test fixtures — must still write a
`runtimeEvent` method, so the type obligates a channel that no code path
exercises.

## Suggested direction (non-binding, optional)
`runCodeSideToolCall`'s own production caller already documents that a
compliant lowering reaches only `sink.diagnostic`
(`production-theta-producer.ts:710-712`); the fix stage could use that as the
starting point for deciding whether `runtimeEvent` still names a channel this
seam needs.

## False-positive check
- Reference search: `grep -rn "runtimeEvent" --include="*.ts" src tests extensions tools` → 29 hits across 20 files, enumerated above; every hit is a declaration, a no-op implementation, or a recorder implementation/assertion — none is a call.
- Dynamic/string-keyed access: no `sink["runtimeEvent"]`, `Object.values(sink)`, `Object.entries(sink)`, or `for…in sink` pattern anywhere in the repository (`grep -rn "Object\.values(sink\|Object\.entries(sink\|for.*in sink"` → no match; `grep -rn '\["runtimeEvent"\]|\[.runtimeEvent.\]'` → no match).
- This is not a "test-only-reachable" function: `ToolLoweringSink` and both functions cited are reached from production. The claim is narrower — one specific member of the interface is invoked by nothing, including tests; the test "recorder" implementations exist to prove absence (an empty-array assertion), not to exercise the method themselves.
- Cross-checked the sibling channels for contrast: `sink.diagnostic(` is called at `tool-call-execute.ts:520` (inside `runCodeSideToolCall`) and at `tool-call-off-surface.ts:135`; `sink.systemNote(` is called at `tool-call-off-surface.ts:143`. Only `runtimeEvent` has zero call sites.
- Read `production-theta-producer.ts:709-716`'s comment on `noopSink()` (the production implementer), which independently states "The one channel a compliant lowering reaches is `sink.diagnostic`," corroborating the search result from the production side.

## Triage
<!-- triage appends here -->
verdict: confirmed — independently reproduced: all three excerpts byte-match at the cited lines, the repo-wide `runtimeEvent` grep yields the same 29 hits/20 files with zero `.runtimeEvent(` invocations or dynamic/string-keyed access anywhere, `sink.diagnostic`/`sink.systemNote` ARE called in both files (proving the interface itself is production-live, isolating the defect to this one member), git pickaxe shows no commit ever added or removed a `sink.runtimeEvent(` call (unlike the contested `channels.emitRuntimeEvent` TDD-witness precedent in qw20260907130901-d2-02), and the real code_tool/model_tool RuntimeEvent emission path is a wholly separate top-level mechanism (`emitTopLevelErrNote`/`buildRuntimeEventNote`), with the origin-site emission this member appears scaffolded for explicitly logged elsewhere as a filed residual/non-goal — a clean, single-root-cause dead required interface member (triage: claude-opus-5)
