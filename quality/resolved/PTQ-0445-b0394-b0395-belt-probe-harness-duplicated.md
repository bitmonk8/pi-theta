---
id: PTQ-0445
title: b0394 and b0395 each hand-roll the rootDouble/producer/probeSource/assertValue/InstantSettleSession/driveInterp bundle tests/helpers/runtime-belt-probe-harness.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0394-stdlib-wrong-kind-args-belt.test.ts:132-241
  - tests/b0394-stdlib-wrong-kind-args-belt.test.ts:388-441
  - tests/b0395-bang-operand-parse-gate-honest-belt.test.ts:139-251
  - tests/b0395-bang-operand-parse-gate-honest-belt.test.ts:312-360
  - tests/helpers/runtime-belt-probe-harness.ts:57-149
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0394 and b0395 each hand-roll the rootDouble/producer/probeSource/assertValue/InstantSettleSession/driveInterp bundle tests/helpers/runtime-belt-probe-harness.ts already centralises

## Observation
tests/b0394-stdlib-wrong-kind-args-belt.test.ts and tests/b0395-bang-operand-parse-gate-honest-belt.test.ts each declare, module-scope, the same seven pieces `tests/helpers/runtime-belt-probe-harness.ts` already exports: a `rootDouble()` returning a `RuntimeRoot` whose `Clock.setTimeout` fires synchronously, a `producer()` wrapping it with `createProductionProducerDeps`, a `probeSource` (parse + run through `executeBody`, capturing a throw), `assertValue` (assert a probe's success value), the `InstantSettleSession` class, and `driveInterp` (the pure-host interpolation drive). Both files' own comments literally label the block "the b0369 shape, verbatim," naming the exact pre-extraction shape the helper's header says it was built to end. Neither file imports `makeBeltProbes`, `assertValue`, or any other export from the helper.

## Evidence

tests/b0394-stdlib-wrong-kind-args-belt.test.ts:166-183 (`rootDouble`):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // with no real timers (the b0369 harness contract).
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}
```

tests/b0395-bang-operand-parse-gate-honest-belt.test.ts:178-195 (`rootDouble`, byte-identical to b0394's above, confirmed by direct comparison):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // with no real timers (the b0369 harness contract).
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}
```

tests/b0394-stdlib-wrong-kind-args-belt.test.ts:239-251 (`assertValue`) is line-for-line identical to tests/b0395-bang-operand-parse-gate-honest-belt.test.ts:249-261 and to the helper's exported `assertValue`:
```ts
function assertValue(probe: Probe, expected: ThetaValue, what: string): void {
  if (probe.kind === "threw") {
    expect(
      `threw ${String(probe.thrown)}`,
      `${what}: the witness table says success value ${render(expected)}, but the runtime threw`,
    ).toBe(`success value ${render(expected)}`);
    return;
  }
  expect(probe.execution.outcome, `${what}: the body must succeed`).toBe("success");
  expect(
    probe.execution.result.value,
    `${what}: the control value (byte-identical guard)`,
  ).toEqual(expected);
}
```

tests/b0394-stdlib-wrong-kind-args-belt.test.ts:388-419 (`InstantSettleSession`) is byte-for-byte identical to tests/b0395-bang-operand-parse-gate-honest-belt.test.ts:312-343 and to the helper's own `InstantSettleSession` (`tests/helpers/runtime-belt-probe-harness.ts:121-149`):
```ts
class InstantSettleSession {
  readonly entries: Array<Record<string, unknown>> = [];
  readonly sent: string[] = [];

  sendUserMessage(text: string): void {
    this.sent.push(text);
    this.entries.push({
      type: "message",
      id: `u${this.entries.length + 1}`,
      parentId: undefined,
      message: { role: "user", content: [{ type: "text", text }] },
    });
    this.entries.push({
      type: "message",
      id: `a${this.entries.length + 1}`,
      parentId: `u${this.entries.length}`,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "settled-reply" }],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "m1",
        stopReason: "stop",
      },
    });
  }

  isIdle(): boolean {
    return true;
  }
}
```

tests/helpers/runtime-belt-probe-harness.ts:57-72, 84-93, 105-149 (canonical `rootDouble`/`producer`/`assertValue`/`InstantSettleSession`, header at 1-27 stating the module centralises exactly this bundle because two sibling files "each independently declared the same seven pieces... byte-identical apart from a predecessor-bug-number comment and the `slashName`/`sourcePath` bug tag"):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}
```

`probeSource` (b0394:212-227, b0395:223-238) also matches the helper's nested `probeSource` inside `makeBeltProbes` apart from the hardcoded `"b0394"`/`"b0395"` bug tag and `sourcePath` where the helper takes `bugTag` as a parameter — the same difference the helper's `makeBeltProbes(parseTheta, bugTag)` signature was built to absorb.

Pattern-wide search: `grep -rln "class InstantSettleSession" tests --include="*.test.ts"` → 13 files still declare this class locally (b0338, b0345, b0365, b0366, b0367, b0372, b0392, b0393, b0394, b0395, b0402, b0433, b0479); only b0368 and b0369 import the canonical `makeBeltProbes`. This finding is scoped to the two files inside this wave's reviewed set (b0394, b0395); the other 11 sibling files are named here only as the size of the pattern, not as a claim against them (b0338 is already filed separately in this wave's `d7-01-b0332-b0338-belt-probe-harness-duplicated.md`).

## Why this is a problem
`tests/helpers/runtime-belt-probe-harness.ts`'s own header states its purpose is to end exactly this redeclaration — the same `rootDouble`, `producer`/`assertValue` (the EXECUTOR-probe half) and `InstantSettleSession`/`driveInterp` (the PURE-HOST-drive half) it now exports were extracted because two sibling bug-report files (b0368, b0369) reproduced them byte-for-byte. b0394 and b0395, both later bug numbers than the two files the helper cites as its motivation, reproduce the identical shape (confirmed above by direct line-for-line comparison) with only the hardcoded bug-tag strings differing from what the helper already accepts as a parameter, and both files' own section comments concede the copy outright ("the b0369 shape, verbatim").

## Suggested direction (non-binding, optional)
tests/helpers/runtime-belt-probe-harness.ts already exports `assertValue` and, through `makeBeltProbes(parseTheta, bugTag)`, the `rootDouble`/`producer`/`probeSource`/`InstantSettleSession`/`driveInterp`/`driveInvoke` bundle parameterised by exactly the two things (the fixture's own `parseTheta` and its bug tag) that differ between b0394/b0395 and the helper's existing two importers.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named kin; the cited functions are harness plumbing, not a pinned count or inventory assertion.
- Recording-double: `InstantSettleSession`/`rootDouble` are stateless or self-recording sequencing doubles used to drive a probe, not a "never called" negative witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0394-stdlib-wrong-kind-args-coerce-and-replace-hangs.md and docs/bugs/0395-bang-operand-no-parse-gate-lying-belt-message.md exist as the citing bug reports for these tests' subject matter (both files describe a settled fix contract the tests pin, not a documented correct-reason red); this finding does not concern the RED/CONTROL witness rows themselves, only the harness declarations around them.
- coverage-matrix/bug-doc citation search: `grep -n "b0394-stdlib-wrong-kind-args-belt\|b0395-bang-operand-parse-gate-honest-belt" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()` — only that the local harness pieces could be imported from the existing helper — so no citation is affected.
- Coverage check: the claim is about a repeated harness DEFINITION, not a missing test path; every piece cited is exercised by the RED/CONTROL rows in its own file.

## Triage
verdict: confirmed — independently re-verified by diff: rootDouble (b0394:166-183 ≡ b0395:178-195, byte-identical; ≡ helper:64-80 modulo one comment line), InstantSettleSession (b0394:388-419 ≡ b0395:312-343 ≡ helper:121-149) and assertValue (b0394:239-251 ≡ b0395:249-261 ≡ helper:105-117 minus `export`) are identical, and producer/probeSource/driveInterp match makeBeltProbes' bodies apart from the hardcoded "b0394"/"b0395" tag the helper already takes as `bugTag`; neither file imports tests/helpers/runtime-belt-probe-harness.ts (only b0368/b0369 do), the 13-file InstantSettleSession census and 0-hit coverage-matrix grep reproduce, both files run 25/25 green, no D7 carve-out applies (not gate/negative-witness/red-witness, no merge/delete proposed), and neither PTQ-0209 (different NOOP_CHECKPOINT trio in four other files) nor fixed PTQ-0397 (b0368/b0369, which minted this helper) names this pair (triage: claude-fable-5-1)
