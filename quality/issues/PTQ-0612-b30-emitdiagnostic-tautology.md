---
id: PTQ-0612
title: "T-TAP B30 asserts a never-wired local function 'is defined' instead of that a diagnostic sink was never called"
lens: D7
status: open
verdict: confirmed
locations:
  - tests/execution-status-child-tap.test.ts:157-182
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# T-TAP B30 asserts a never-wired local function 'is defined' instead of that a diagnostic sink was never called

## Observation
The B30 test's title claims "the emitDiagnostic spy is never called". The
body declares a local `emitDiagnostic` arrow function that throws if
invoked, but `attachChildActivityTap` is called with only `(child, publish)`
— its actual signature is `(child, publish, opts?: ChildTapOptions)` and
`ChildTapOptions` carries only an optional `clock` field
(`src/extension/execution-status/child-tap.ts:39-41`). There is no parameter
through which `emitDiagnostic` could ever reach the code under test. The
test's final assertion is `expect(emitDiagnostic).toBeDefined()`.

## Evidence
tests/execution-status-child-tap.test.ts:157-182
```ts
  it("B30: every ignored-line class produces zero publishes and the emitDiagnostic spy is never called", () => {
    const child = FAKE_CHILD();
    const { events, publish } = recordingPublish();
    const emitDiagnostic = () => {
      throw new Error("emitDiagnostic must never be called by the tap (DIAG-2)");
    };
    attachChildActivityTap(child, publish);

    // Oversized (> TAP_LINE_MAX_BYTES).
    child.emitRawLine("x".repeat(TAP_LINE_MAX_BYTES + 1));
    // Garbage (unparseable).
    child.emitRawLine("this is not json {");
    // Non-object JSON root.
    child.emitRawLine(JSON.stringify(42));
    child.emitRawLine(JSON.stringify(null));
    // Unknown type.
    child.emitRawLine(JSON.stringify({ type: "agent_start" }));
    child.emitRawLine(JSON.stringify({ type: "tool_execution_update", partialResult: "x" }));
    // message_update — recognised by --mode json, NOT consumed by the tap.
    child.emitRawLine(
      JSON.stringify({ type: "message_update", message: {}, assistantMessageEvent: {} }),
    );

    expect(events).toHaveLength(0);
    expect(emitDiagnostic).toBeDefined(); // never invoked — the tap has no reference to it at all
  });
```

`attachChildActivityTap`'s actual signature, `src/extension/execution-status/child-tap.ts:80-84`:
```ts
export function attachChildActivityTap(
  child: Pick<SubagentChildProcess, "onStdoutLine" | "onHeartbeat">,
  publish: (event: ChildTapEvent) => void,
  opts?: ChildTapOptions,
): () => void {
```
`ChildTapOptions`, `src/extension/execution-status/child-tap.ts:39-41`:
```ts
export interface ChildTapOptions {
  readonly clock?: Clock;
}
```

## Why this is a problem
`expect(emitDiagnostic).toBeDefined()` checks that the local `const`
assigned two lines earlier (`const emitDiagnostic = () => { throw ... }`) is
not `undefined` — a fact fixed at the moment of declaration and independent
of anything `attachChildActivityTap` or `child.emitRawLine` does. Since
`emitDiagnostic` is never passed to `attachChildActivityTap` (whose only
optional parameter is `opts: { clock? }`, carrying no diagnostic hook), no
production code path can ever reach it, so the "never invoked" claim the test
title makes cannot be falsified by anything the implementation does — the
assertion passes identically whether the tap would have called such a
callback zero times or a thousand times, because it has no way to call it at
all. The comment on the same line ("never invoked — the tap has no reference
to it at all") states the mechanism that makes the assertion vacuous. This is
distinct from a recording-double negative witness (e.g. a spy actually wired
into the seam under test): a genuine "never called" witness requires the
double to be reachable by the code path being exercised, which is not the
case here.

## Suggested direction (non-binding, optional)
The real "no diagnostic surface" claim for this seam is already covered
structurally by the fact that `attachChildActivityTap`'s type signature has
no diagnostic parameter to wire a spy into; if a diagnostic-silence
assertion is wanted here it would need to observe an actual diagnostics sink
that the tap's caller (`production-theta-producer.ts`) has access to, not an
inert local unconnected to the seam this file unit-tests.

## False-positive check
- Gate-pin carve-out: filename is `execution-status-child-tap.test.ts`, does not match `*gate*.test.ts` or any listed gate kin — not applicable.
- Recording-double carve-out: checked and ruled out explicitly above — `emitDiagnostic` is never wired into `attachChildActivityTap`'s call, so it cannot function as a negative witness over the seam under test; this is not the legitimate "fake records calls, test asserts never called" shape the carve-out protects.
- docs/bugs/ signature search: `grep -rn "B30" docs/bugs/` and `grep -rn "DIAG-2" docs/bugs/` found no report naming this test's failure signature as a documented correct-reason red; the suite runs green at HEAD (`npx vitest run tests/execution-status-child-tap.test.ts` — 7 passed).
- coverage-matrix/bug-doc citation search: `grep -rn "execution-status-child-tap.test.ts" docs/reference/coverage-matrix.md docs/bugs/*.md` returned no hits — this test is not pinned by name in either location.
- Coverage drift check: this finding does not claim the tap's diagnostic-silence behaviour is untested elsewhere or should be tested more; it is scoped to this one assertion's mechanical inability to fail.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: excerpt matches tests/execution-status-child-tap.test.ts:157-182 verbatim; attachChildActivityTap is called `(child, publish)` at line 163 with no third arg, ChildTapOptions (child-tap.ts:39-41) is `{ clock?: Clock }` only and `opts` is read solely as `opts?.clock` (line 185), and child-tap.ts has no emitDiagnostic/diagnostic hook at all, so the local `emitDiagnostic` (its only references are the declaration at 160-161 and `toBeDefined()` at 181) is unreachable by any production path — `expect(emitDiagnostic).toBeDefined()` is invariant under implementation behaviour and the title's "spy is never called" claim is unfalsifiable (D7: assertion that cannot fail); recording-double carve-out does not apply (double not wired), not a gate test, no docs/bugs B30 signature, not cited by coverage-matrix or bug docs, suite green (7 passed); no existing PTQ tracks this site (PTQ-0369 is a D9 on the src module) (triage: claude-fable-5-1)
