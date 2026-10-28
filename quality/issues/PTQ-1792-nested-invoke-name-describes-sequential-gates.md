---
id: PTQ-1792
title: The nested prompt-invoke test name describes two manually sequenced gate calls as an invoke.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/conversation-drive.test.ts:249-299
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The nested prompt-invoke test name describes two manually sequenced gate calls as an invoke.

## Observation
The PIC-2 cell is named as a nested prompt-to-prompt invoke whose child window opens after its parent's window restores. Its body instead awaits one `withActiveSetGate` call, then awaits a second independent call, with empty callbacks for both. The words `parent` and `child` are supplied as `thetaName` strings, and the asserted value is the maximum depth reconstructed from the shared double's `setActiveTools` arguments. Thus the body measures sequential helper calls, while the name describes invocation-driven parent/child ordering.

## Evidence
Name, `tests/conversation-drive.test.ts:249-252`:
```ts
describe("V9c-T — PIC-2 prompt-mode sequential execution (cross-body non-overlap)", () => {
  it("PIC-2: a nested prompt→prompt invoke opens its active-set window only after the parent body's window is restored — at most one window open at a time", async () => {
    const ambient = ["ambient-a"];
    const { gate, setCalls } = makeRecordingGate(ambient);
```

First call and the explicit sequencing of the second, `tests/conversation-drive.test.ts:259-271`:
```ts
    await withActiveSetGate(
      {
        pi: gate,
        thetaName: "parent",
        installVector: computeActiveSetInstall({ thetaCallableSetNames: ["parent-tool"] }),
        ...noopGateDeps(),
      },
      async () => {
        /* parent's query turn — the body itself issues no active-set call */
      },
    );
    // ...parent body resumes and invokes the child (a distinct prompt-mode body)...
    await withActiveSetGate(
```

Second call's arguments and callback, `tests/conversation-drive.test.ts:272-281`:
```ts
      {
        pi: gate,
        thetaName: "child",
        installVector: computeActiveSetInstall({ thetaCallableSetNames: ["child-tool"] }),
        ...noopGateDeps(),
      },
      async () => {
        /* child's query turn */
      },
    );
```

Actual observation, `tests/conversation-drive.test.ts:287-299`:
```ts
    const isAmbient = (names: string[]): boolean =>
      names.length === ambient.length && names.every((n, i) => n === ambient[i]);
    let depth = 0;
    let maxDepth = 0;
    for (const call of setCalls) {
      if (isAmbient(call)) {
        depth -= 1;
      } else {
        depth += 1;
        maxDepth = Math.max(maxDepth, depth);
      }
    }
    expect(maxDepth).toBe(1);
```

## Why this is a problem
This is D7's misleading-test-name class. A reader following the name would understand a nested invoke to be the operation that determines when the child opens its window; the displayed body itself determines that ordering with two successive `await` statements and never performs an invoke. The real assertion can fail on gate behavior, so it is not reported as an assertion that cannot fail. The mismatch is between the existing helper-level measurement and its invocation-level label, not a request for additional tests or a claim about production ordering.

## Suggested direction (non-binding, optional)
Describe the existing sequential gate-call measurement in the test's label, without treating this finding as a request to change its exercised surface.

## False-positive check
- Gate-pin: despite calling a runtime gate helper, this file is not a census/pin gate. No pinned inventory or corpus count is challenged.
- Recording-double: the call log is a legitimate observable and its assertions are not challenged. The claim is only about what operation the name says produced that log.
- docs/bugs/ signature search: searched `docs/bugs/` and `docs/reference/coverage-matrix.md` for the test filename and the nested-invoke name. Bug 0372 mentions the filename when recording its header update; its fix records the deliberate retarget from the bare gating helper to `withActiveSetGate`. That retarget is respected here: both current callbacks remain empty and the test still directly sequences the helpers. No documented red or failure signature is challenged.
- Coverage-matrix/bug-doc citation: the exact-name search `rg -n -F 'PIC-2: a nested prompt→prompt invoke opens its active-set window only after the parent body' docs/bugs docs/reference/coverage-matrix.md quality/` returned zero matches before filing. The filename search found the bug-0372 header-review citation, not a citation pinning this test by name; no coverage-matrix match was found. The optional direction would relabel this cell, not merge or delete a cited witness.
- Existing-topic/history: searched `quality/` for the exact name and `makeRecordingGate`; neither had a finding. `git log -S 'a nested prompt→prompt invoke opens' -- tests/conversation-drive.test.ts` traces the wording to the original V9c-T test addition; the current file explicitly documents its later bug-0372 retarget. This is not attributed to a new runtime defect.
- Scope: the reported smell is the existing name/body mismatch. No coverage, suite-composition, E2E-versus-unit or production-code claim is made.

## Triage
verdict: confirmed — tests/conversation-drive.test.ts:249-299 names a nested prompt→prompt invoke but executes only two explicitly sequenced withActiveSetGate calls with empty callbacks and asserts their recorded maximum window depth; the helper performs no invoke and thetaName only labels diagnostics. This is an in-scope misleading name, not a challenge to recording-double assertions or test coverage; history confirms the original wording, and no matching witness-title pin, duplicate, or resolved prescribed-shape ruling was found. (triage: claude-opus-5-5)
