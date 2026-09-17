---
id: PTQ-0489
title: "R5" test names a never-read claim about resolvedCwd but its body only asserts bindPromptConversation does not throw
lens: D7
status: open
verdict: confirmed
locations:
  - tests/call-with-clause-threading.test.ts:232-261
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# "R5" test names a never-read claim about resolvedCwd but its body only asserts bindPromptConversation does not throw

## Observation
The test titled "R5: `bindPromptConversation` never reads `resolvedCwd` — the field is subagent-launch-only (structural guard)" builds a `bindInput` carrying a sentinel `resolvedCwd: "/should/never/be/read"` and asserts only `expect(() => deps.bindPromptConversation(bindInput)).not.toThrow()`. Nothing in the test observes whether `resolvedCwd` was read, touched, or passed anywhere; the sentinel value is an ordinary well-formed path string, so reading it would not throw either. The only poison-pill in the test (`subagentSpawn: (): never => { throw ... }`) fires only if a child is spawned, which a `mode: prompt` bind never does regardless of `resolvedCwd` — it witnesses "never spawns," not "never reads resolvedCwd."

## Evidence
tests/call-with-clause-threading.test.ts:232-261:
```ts
  it("R5: `bindPromptConversation` never reads `resolvedCwd` — the field is subagent-launch-only (structural guard)", () => {
    const deps = createProductionProducerDeps({
      pi: noopPi(),
      root: rootDouble(),
      modelRegistry: {} as unknown as ModelRegistry,
      subagentSpawn: (): never => {
        throw new Error("harness: bindPromptConversation must not spawn a child");
      },
      subagentExecutableHost: fakeExecutableHost(),
      subagentParentEnv: {},
      subagentParentPid: 4242,
    });
    const theta: ThetaCompositionInput = {
      slashName: "promptcaller",
      sourcePath: "/thetadir/promptcaller.theta",
      frontmatter: { mode: "prompt" } as unknown as ParsedFrontmatter,
      body: { statements: [], tail: null },
      callableSet: { entries: new Map() },
    } as ThetaCompositionInput;
    const bindInput = {
      theta,
      args: "",
      ctx: driveCtx(CALLER_CWD),
      resolvedCwd: "/should/never/be/read",
    } as unknown as ConversationBindInput;
    // A prompt-mode bind never spawns a child at all — `resolvedCwd` is inert
    // on this path both before and after RFC 0009 (green guard).
    expect(() => deps.bindPromptConversation(bindInput)).not.toThrow();
  });
```

## Why this is a problem
A reader following the test's name ("never reads `resolvedCwd`") would expect the body to demonstrate that `bindPromptConversation` does not consult the field — e.g. via a getter that throws or records access on read. Instead the only assertion in the body, `not.toThrow()`, passes identically whether `bindPromptConversation` ignores `resolvedCwd` entirely or reads it and does something harmless with it (stores it unused, logs it, passes it through to a dead parameter) — none of those would throw. The `subagentSpawn` poison pill is a genuine negative witness, but it witnesses a different, weaker fact ("a prompt-mode bind never spawns," true independent of `resolvedCwd`'s value) than the one the title asserts. The name therefore promises a stronger, field-specific claim than anything in the body can falsify.

## Suggested direction (non-binding, optional)
None proposed; the fix stage owns how the test should demonstrate the field is unread (e.g. a `resolvedCwd` accessor that records or throws on touch) or how the title should be narrowed to what `not.toThrow()` actually shows.

## False-positive check
- Gate-pin: the file is not `*gate*.test.ts` or listed kin; not applicable.
- Recording-double: `subagentSpawn`'s throw-on-call is a legitimate negative witness for "never spawns a child," which this finding does not dispute — the finding is that this witness does not cover the title's distinct "never reads resolvedCwd" claim, so the recording-double carve-out does not shield the mismatch between name and body.
- docs/bugs/ signature search: `grep -rln "R5" docs/bugs/ | xargs grep -l resolvedCwd 2>/dev/null` — no hits; no open bug document pins this test's red/behaviour, and `npx vitest run tests/call-with-clause-threading.test.ts` (its own header states threading tests exercise real production code offline) is not claimed red — this is a naming/assertion-strength claim, not a behaviour claim.
- coverage-matrix/bug-doc citation search: `grep -n "call-with-clause-threading" docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge/rename/delete of the file, only of the one test's name-to-body correspondence, so no citation is affected.
- Coverage check: this finding does not claim any path is untested; it is about a claim already-existing test code cannot support.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: excerpt matches at tests/call-with-clause-threading.test.ts:232-261; grep of `resolvedCwd` across src/ shows the sole read is `cwd: bindInput.resolvedCwd ?? ctx.cwd` at production-theta-producer.ts:2752 inside `spawnSubagentConversation` (2413+) and zero reads inside `bindPromptConversation` (2155-2412), so the title's claim is true but the body cannot falsify it — the sentinel is an ordinary string whose read cannot throw, and `not.toThrow()` plus the throwing `subagentSpawn` double are invariant under whether the field is consulted (they witness only "a prompt bind never spawns", which the seam sheet .localpi/tmp/rfc-0009-seam-sheet.md:861 itself calls a structural proxy via R4/row 7); misleading-name class, tests/ only, not a gate test, file uncited by docs/reference/coverage-matrix.md or docs/bugs/, suite green 9/9, and PTQ-0263 in the same file is a different test (row-8 note) so no duplicate (triage: claude-fable-5-1)
