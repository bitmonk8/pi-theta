---
id: PTQ-1477
title: b0433-active-set-advisory-note-no-details.test.ts reimplements a subset of the FakeActiveSetPi it already imports as a local RestoreThrowingGate
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0433-active-set-advisory-note-no-details.test.ts:32-32
  - tests/b0433-active-set-advisory-note-no-details.test.ts:87-87
  - tests/b0433-active-set-advisory-note-no-details.test.ts:160-181
  - tests/helpers/fake-active-set-pi.ts:14-57
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# b0433-active-set-advisory-note-no-details.test.ts reimplements a subset of the FakeActiveSetPi it already imports as a local RestoreThrowingGate

## Observation
`tests/b0433-active-set-advisory-note-no-details.test.ts` imports the shared
`FakeActiveSetPi` double from `./helpers/fake-active-set-pi` (line 32) and
uses it in its first describe block (line 87:
`new FakeActiveSetPi(["user_tool_a", "user_tool_b"], "throw-restore-always")`).
Its second describe block, driving the same double-restore-throw scenario
through the production query window, instead declares a local class
`RestoreThrowingGate` (lines 160-181) that reimplements the exact
`"throw-restore-always"` mode of the already-imported `FakeActiveSetPi`
(`tests/helpers/fake-active-set-pi.ts:14-57`) as a fixed-behaviour subset: the
same `getActiveTools`/`setActiveTools` shape, the same install-then-throw
sequencing, differing only in that the throw mode is hardcoded rather than
selected by a `GateMode` parameter.

## Evidence
`tests/b0433-active-set-advisory-note-no-details.test.ts:160-181`:
```ts
/** Gate double for the window: first `setActiveTools` installs, both restore
 *  attempts throw (the double-throw path that fires the PIC-8(c) advisory). */
class RestoreThrowingGate {
  readonly setCalls: string[][] = [];
  getCalls = 0;
  #installed = false;

  constructor(readonly snapshot: readonly string[]) {}

  getActiveTools(): string[] {
    this.getCalls += 1;
    return [...this.snapshot];
  }

  setActiveTools(names: string[]): void {
    this.setCalls.push([...names]);
    if (!this.#installed) {
      this.#installed = true;
      return;
    }
    throw new Error("active-set restore failure");
  }
}
```

`tests/helpers/fake-active-set-pi.ts:14-57` (the canonical double, already
imported into this same file at line 32 and instantiated at line 87 with
`"throw-restore-always"`):
```ts
export class FakeActiveSetPi implements ActiveSetPi {
  readonly setCalls: string[][] = [];
  getCalls = 0;
  #installed = false;
  #restoreAttempts = 0;

  constructor(
    readonly snapshot: readonly string[],
    readonly mode: GateMode = "healthy",
    private readonly errorPrefix = "setActiveTools",
  ) {}

  getActiveTools(): string[] {
    this.getCalls += 1;
    if (this.mode === "throw-get") throw new Error("getActiveTools SDK-shape drift");
    return [...this.snapshot];
  }

  setActiveTools(names: string[]): void {
    this.setCalls.push([...names]);
    if (!this.#installed) {
      this.#installed = true;
      if (this.mode === "throw-install") {
        throw new Error(`${this.errorPrefix} install drift`);
      }
      return;
    }
    this.#restoreAttempts += 1;
    if (this.mode === "throw-restore-always") {
      throw new Error(`${this.errorPrefix} restore failure`);
    }
    if (this.mode === "throw-restore-once" && this.#restoreAttempts === 1) {
      throw new Error(`${this.errorPrefix} transient restore failure`);
    }
  }
  // ...
}
```
`new FakeActiveSetPi(QUERY_SNAPSHOT, "throw-restore-always")` reproduces the
exact `RestoreThrowingGate` behaviour: first `setActiveTools` installs
without throwing, every later call throws. The sibling
`tests/b0372-active-set-restore-protocol.test.ts` drives the identical
production query window with exactly this construction
(`new RecordingActiveSet(QUERY_SNAPSHOT, mode, "active-set")` where
`RecordingActiveSet` is `FakeActiveSetPi` imported under an alias), proving
the shared double already satisfies the window-1 driver's interface
requirements.

## Why this is a problem
The file's own import line (line 32) and its first test (line 87) demonstrate
`FakeActiveSetPi` is already in scope and already capable of the
`"throw-restore-always"` mode `RestoreThrowingGate` reimplements; the second
describe block declares a second, narrower class implementing the identical
`getActiveTools`/`setActiveTools` contract instead of reusing the constructor
argument the first block already exercises.

## Suggested direction (non-binding, optional)
`tests/helpers/fake-active-set-pi.ts`'s `FakeActiveSetPi` (already imported in
this file) is the natural double for the window-2 driver call as well.

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file; no pinned-count assertion is at
  issue here.
- Recording-double check: `RestoreThrowingGate` is a stateful sequencing
  double (throws on the second-and-later `setActiveTools` call), not a
  call-recording double asserting a MUST-NOT-have-been-called negative
  witness; the recording-double carve-out (which protects *negative
  witnesses*, not arbitrary local doubles) does not cover a same-file
  reimplementation of an already-imported class.
- docs/bugs/ signature search: `docs/bugs/0433-active-set-advisory-note-fabricates-event-code.md:194` cites this test file as "NEW witness" — the file is a genuine witness, not a documented correct-reason red; this finding does not touch that citation and proposes no merge/rename/delete of the file.
- coverage-matrix/bug-doc citation search: no `docs/reference/coverage-matrix.md` hit for this file name; the bug-doc hit above is a witness listing, unaffected by hoisting the local double.
- Coverage drift check: this finding does not claim any behaviour is
  untested; both doubles exercise the identical install-then-throw-forever
  sequence already covered by `FakeActiveSetPi`'s `"throw-restore-always"` mode.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `RestoreThrowingGate` at tests/b0433-active-set-advisory-note-no-details.test.ts:162-181 reproduces verbatim and is the fixed `"throw-restore-always"` subset of the `FakeActiveSetPi` already imported at :32 and instantiated at :87 (same `setCalls`/`getCalls`/`#installed` state, same install-then-throw-forever `setActiveTools`; tests/helpers/fake-active-set-pi.ts:14-57 reproduces); `driveQueryWindow` takes any `ActiveSetGateDouble` (active-set-window-harness.ts:58-61, structural getActiveTools/setActiveTools) and b0372:272 already passes `FakeActiveSetPi` under the `RecordingActiveSet` alias into the identical driver, so the shared double satisfies the window-2 call; Cell 2 asserts on diagnostic code and note content, never on the gate's throw text, so the dedupe is mechanical; `grep RestoreThrowingGate` across src/ extensions/ tools/ tests/ → only this file's :162 and :208; stated searches reproduce (coverage-matrix cites → 0, docs/bugs/0433:194 is a witness listing, no merge/rename/delete proposed); not a `*gate*` file, double drives positive assertions not a negative witness; not a duplicate — PTQ-0828 (resolved) replaced b0433's Cell-1 `FakeActiveSetPi` copy with the import and PTQ-1311 (resolved) extracted the InstantSettleSession/piDouble/ctxDouble/driveQuery window harness parameterised over the gate, and git history (4086e798 introduced the class, daa6ac1e's PTQ-1311 fix only rewired its call site to `driveQueryWindow`) shows neither fix touched `RestoreThrowingGate`, which is the residual site neither tracked (PTQ-0629/PTQ-1072 residual precedent) (triage: claude-fable-5-1)
