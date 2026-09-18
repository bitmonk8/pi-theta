---
id: PTQ-0853
title: "H7a — golden diagnostics" tests claim the composed run's emissions but never call driveComposedRun
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/integration-acceptance.test.ts:135-164
  - tests/integration-acceptance.test.ts:221-258
  - tests/integration-acceptance.test.ts:9-13
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# "H7a — golden diagnostics" tests claim the composed run's emissions but never call driveComposedRun

## Observation
The file's top-of-file contract (:9-13) states bullet 2 of what `npm test`
asserts: "the run emits exactly the `theta-system-note` codes in the committed
golden diagnostics list". The `describe("H7a — golden diagnostics …")` block
(:221-258) and its two `it()` names ("emits exactly the theta-system-note codes
in the committed golden diagnostics list", "each golden diagnostic code
resolves to its diagnostics-registry Message string") read both tests as
exercising the same composed run bullet 1 exercises. Both tests call
`collectEmittedDiagnostics()` (:143-164), a function whose own doc comment
claims its diagnostics are "collected from the live production emission
surfaces of the Deps slices". `collectEmittedDiagnostics` never calls
`driveComposedRun()` (:88-133) — the function bullet 1's tests use to drive the
fixture through the harness. It instead hand-builds a two-message
`TranscriptMessage[]` array containing a `custom` message with a hard-coded
transcript-unsafe `customType`, unrelated to anything `driveComposedRun`'s
scripted binder/tool-loop responses produce, and passes it directly to
`renderCompactTranscript`.

## Evidence
tests/integration-acceptance.test.ts:9-13
```ts
//   2. the run emits exactly the `theta-system-note` codes in the committed
//      golden diagnostics list, each asserted against the diagnostics-registry
//      *Message* strings;
```

tests/integration-acceptance.test.ts:135-164 (`collectEmittedDiagnostics`, the
function both "golden diagnostics" tests call — no reference to
`driveComposedRun` anywhere in its body):
```ts
function collectEmittedDiagnostics(): Diagnostic[] {
  const unsafeCustomType = "review-card\ntype";
  // The renderer's input is the closed `TranscriptMessage` set (bug 0478); a
  // `user` + `custom` pair is in-set, so no cast is needed.
  const messages: TranscriptMessage[] = [
    { role: "user", content: "Inspect the workspace.", timestamp: 0 },
    {
      role: "custom",
      customType: unsafeCustomType,
      content: "prior review card",
      display: true,
      timestamp: 0,
    },
  ];

  const diagnostics: Diagnostic[] = [];
  const result = renderCompactTranscript(messages);
  if (result.kind === "custom-type-unsafe") {
    diagnostics.push(customTypeUnsafeDiagnostic(result.value));
  }
  return diagnostics;
}
```

tests/integration-acceptance.test.ts:221-229 (the it() whose name claims "the
run emits" per the top-of-file bullet, calling only `collectEmittedDiagnostics`):
```ts
describe("H7a — golden diagnostics (Convention: phase categories — end-to-end harness)", () => {
  it("emits exactly the theta-system-note codes in the committed golden diagnostics list", () => {
    const emitted = collectEmittedDiagnostics();
    const emittedCodes = [...new Set(emitted.map((d) => d.code))].sort();

    // Exactly the committed golden diagnostics list — no code the composition
    // does not emit, no code it emits that is not enumerated.
    expect(emittedCodes).toEqual([...GOLDEN_DIAGNOSTICS].sort());
  });
```

`tests/fixtures/h7a/golden-transcript.json` (the array `driveComposedRun`'s
`transcript` is asserted against in bullet 1) confirms the composed run's
scripted binder/tool-loop scenario has no `custom`-message, transcript-unsafe
step anywhere: it is a transport-retry-then-ok binder facet plus a two-round
`read_file`/`search` tool loop, none of which is the input
`collectEmittedDiagnostics` constructs.

## Why this is a problem
A reader following the `describe`/`it` names, together with the file's own
top-of-file bullet 2 ("the run emits exactly the … codes"), would conclude that
running the composed fixture through the `H4a` harness (`driveComposedRun`) is
what produces the diagnostic checked against `GOLDEN_DIAGNOSTICS`. The body
verifies something else: a hand-built `TranscriptMessage` pair, fed directly to
`renderCompactTranscript`, that `driveComposedRun`'s own scripted scenario never
constructs. The two tests under "H7a — golden diagnostics" therefore never
observe what "the run" (the object bullet 1 builds and asserts on) emits; they
observe what a synthetic, disconnected call to the renderer emits. The
misread a reader takes from the name is that a change breaking
`driveComposedRun`'s diagnostic emission would be caught by this describe
block — it would not, because the block never invokes it.

## Suggested direction (non-binding, optional)
None; naming a fix path here would mean judging what the composed run bullet
should actually exercise, which is a design/coverage matter, not this lens's
to author.

## False-positive check
- Gate-pin: `tests/integration-acceptance.test.ts` does not match
  `*gate*.test.ts` or any named kin.
- Recording-double: `collectEmittedDiagnostics` records no calls and backs no
  "never called" witness; it is a value-returning helper, not a negative
  witness.
- docs/bugs/ signature search: `grep -rn "custom-type-unsafe\|integration-acceptance.test.ts:1[0-9][0-9]" docs/bugs/` finds `docs/bugs/0398-custom-type-unsafe-diagnostic-never-materialised.md`, which cites `tests/integration-acceptance.test.ts:170–180` as one of two test callers of `customTypeUnsafeDiagnostic` and is **status: fixed (0.391.0)**. That bug's complaint was that the structured diagnostic builder had zero *production* callers (the diagnostic never reached the real wire); its fix wired `customTypeUnsafeDiagnostic` into `production-theta-producer.ts` and added a dedicated witness, `tests/b0398-custom-type-unsafe-note-details-diagnostics.test.ts`, that drives the real `runBinder`. Bug 0398 does not discuss, and its fix did not change, this file's `collectEmittedDiagnostics` calling the renderer directly instead of `driveComposedRun` — that disconnect is a distinct, still-present root cause about this test file's own naming, not a re-statement of 0398's now-fixed production-wiring defect.
- coverage-matrix/bug-doc citation search: `grep -n "integration-acceptance" docs/reference/coverage-matrix.md` → 0 hits. Bug 0398 cites `tests/integration-acceptance.test.ts:170–180` by line range as a witness of `customTypeUnsafeDiagnostic`'s existence pre-fix — this finding proposes no merge, rename, or deletion of any test, `describe`, or `it`, only observes that the existing names/comments overstate what the body exercises, so the pinning citation is unaffected.
- Coverage check: this is not a claim that a test is missing for driving
  `driveComposedRun` to a diagnostic-emitting state; it is a claim about what
  the existing, passing tests actually verify versus what their names/comments
  say they verify.

## Triage
verdict: confirmed — independently re-verified: excerpts reproduce verbatim at tests/integration-acceptance.test.ts:9-13, :143-164, :221-229; `driveComposedRun` greps only to its declaration (:88) and the bullet-1 tests (:173, :212), never inside `collectEmittedDiagnostics`, which hand-builds a user+custom `TranscriptMessage[]` and calls `renderCompactTranscript` directly with no harness/binder/composed run; tests/fixtures/h7a/golden-transcript.json (binder transport→ok, two-round read_file/search loop) has no `custom` step and golden-diagnostics.json is exactly the one custom-type-unsafe code, so the only golden code is produced by a synthetic renderer call the composed run never makes; the helper's own doc comment ("collected from the live production emission surfaces… the binder facet includes a session-context custom message") is false against driveComposedRun's scripted binder facet, so the header bullet 2 "the run emits", the it() name "emits exactly…", and that comment all overstate the body — D7 misleading-name class, all locations under tests/, not a coverage or E2E-vs-unit opinion; stated searches reproduce (coverage-matrix → 0 hits; docs/bugs/0398 is fixed 0.391.0 and cites :170–180/:175 only as a pre-fix caller census; git log -L shows the helper touched only by the H7a commit and bug 0478's cast removal, not by 0398's fix); file runs 8/8 green so no correct-reason-red carve-out, not a gate file, no recording double, no rename/merge/delete proposed; the file-wide "end-to-end harness" describe suffix is boilerplate on all five blocks but the it() name/header/comment carry the false claim alone; distinct root cause from resolved PTQ-0002/PTQ-0016 (D2 ceiling-arbitration) and PTQ-0476 (registry-oracle read at :72-87), nothing else in intake/issues/resolved tracks this block (triage: claude-fable-5-1)