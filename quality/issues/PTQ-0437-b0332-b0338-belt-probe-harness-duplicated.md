---
id: PTQ-0437
title: b0332 and b0338 each hand-roll the rootDouble/producer/probeSource/InstantSettleSession/driveInterp bundle tests/helpers/runtime-belt-probe-harness.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0332-spelled-arithmetic-non-numeric-operands.test.ts:156-246
  - tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts:173-264
  - tests/helpers/runtime-belt-probe-harness.ts:64-233
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0332 and b0338 each hand-roll the rootDouble/producer/probeSource/InstantSettleSession/driveInterp bundle tests/helpers/runtime-belt-probe-harness.ts already centralises

## Observation
tests/b0332-spelled-arithmetic-non-numeric-operands.test.ts and tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts each declare, module-scope, the same `rootDouble`/`producer`/`assertValue` pieces (b0332) and the same `rootDouble`/`InstantSettleSession`/`driveInterp` pieces (b0338) that `tests/helpers/runtime-belt-probe-harness.ts` already exports (as `assertValue` and, bundled inside `makeBeltProbes`, `rootDouble`/`producer`/`probeSource`/`InstantSettleSession`/`driveInterp`/`driveInvoke`). That helper's own header states it was extracted because tests/b0368-plus-ordering-laundered-belt.test.ts and tests/b0369-control-flow-kind-belts.test.ts "each independently declared the same seven pieces... byte-identical apart from a predecessor-bug-number comment and the slashName/sourcePath bug tag." b0332 and b0338 are earlier bug numbers reproducing that same set of pieces, and neither imports the helper.

## Evidence

tests/b0332-spelled-arithmetic-non-numeric-operands.test.ts:156-172 (`rootDouble`/`producer`):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function producer() {
  return createProductionProducerDeps({
    pi: {
      sendMessage: () => {},
      getActiveTools: () => [],
      setActiveTools: () => {},
    } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
```

tests/b0332-spelled-arithmetic-non-numeric-operands.test.ts:197-213 (`probeSource`, structurally identical to the helper's nested `probeSource` in `makeBeltProbes` apart from the hardcoded `"b0332"`/`"/proj/b0332.theta"` where the helper takes `bugTag`/`sourcePath` as parameters):
```ts
async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta("b0332.theta", FM + src);
  const theta: ThetaCompositionInput = {
    slashName: "b0332",
    sourcePath: "/proj/b0332.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
  const binding = producer().bindPromptConversation(bindInput);
  try {
    return { kind: "value", execution: await executeBody(theta.body, binding.executeDeps) };
  } catch (thrown) {
    return { kind: "threw", thrown };
  }
}
```

tests/b0332-spelled-arithmetic-non-numeric-operands.test.ts:233-246 (`assertValue`, one word different from the helper's — "the numeric control value" vs "the control value"):
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
    `${what}: the numeric control value (byte-identical guard)`,
  ).toEqual(expected);
}
```

tests/helpers/runtime-belt-probe-harness.ts:64-72 / 84-93 / 105-118 (canonical `rootDouble`/`producer`/`assertValue`, confirmed by direct comparison to differ only in the same words noted above):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { ... },
  } as unknown as RuntimeRoot;
}
...
export function assertValue(probe: Probe, expected: ThetaValue, what: string): void {
  ...
  expect(
    probe.execution.result.value,
    `${what}: the control value (byte-identical guard)`,
  ).toEqual(expected);
}
```

tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts:201-232 (`InstantSettleSession`) vs tests/helpers/runtime-belt-probe-harness.ts:121-149 — verified via `diff` to be byte-for-byte identical apart from indentation (module-scope class vs. one nested inside `makeBeltProbes`... actually the helper's copy is also module-scope, not nested):
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

tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts:238-263 (`driveInterp`) is the same body as the helper's nested `driveInterp` inside `makeBeltProbes` (confirmed via `diff`): identical `pi` double shape, identical `deps`/`ctx` construction, identical try/catch return shape — differing only in `parseClean` vs the helper's parameter name `parseTheta`, and the hardcoded `"b0338"`/`"/proj/b0338.theta"` where the helper takes `bugTag`/`sourcePath`.

Pattern-wide search: `grep -rln "class InstantSettleSession" tests --include="*.test.ts"` → 13 files still declare this class locally (b0338, b0345, b0365, b0366, b0367, b0372, b0392, b0393, b0394, b0395, b0402, b0433, b0479); only b0368 and b0369 import the canonical `makeBeltProbes` from `tests/helpers/runtime-belt-probe-harness.ts`. This finding is scoped to the two files inside this wave's reviewed set (b0332, b0338); the other 11 sibling files are outside this brief's scope and are named here only as the size of the pattern, not as a claim against them.

## Why this is a problem
`tests/helpers/runtime-belt-probe-harness.ts`'s own header states its purpose is to end exactly this redeclaration — the same `rootDouble`, `producer`/`assertValue` (the EXECUTOR-probe half) and `InstantSettleSession`/`driveInterp` (the PURE-HOST-drive half) it now exports were extracted because two sibling bug-report files reproduced them byte-for-byte. b0332 and b0338, both earlier bug numbers than the two files the helper cites as its motivation, reproduce the identical shape (confirmed by direct line-for-line comparison above) with only the hardcoded bug-tag strings differing from what the helper already accepts as a parameter — the same difference the helper was built to absorb.

## Suggested direction (non-binding, optional)
tests/helpers/runtime-belt-probe-harness.ts already exports `assertValue` and, through `makeBeltProbes(parseTheta, bugTag)`, the `rootDouble`/`producer`/`probeSource`/`InstantSettleSession`/`driveInterp`/`driveInvoke` bundle parameterised by exactly the two things (the fixture's own `parseTheta` and its bug tag) that differ between b0332/b0338 and the helper's existing two importers.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named kin; the cited functions are harness plumbing, not a pinned count or inventory assertion.
- Recording-double: `InstantSettleSession`/`rootDouble` are stateless or self-recording sequencing doubles used to drive a probe, not a "never called" negative witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0332-spelled-arithmetic-non-numeric-operands-no-parse-gate.md Status "fixed (0.299.0)"; docs/bugs/0338-pure-host-arithmetic-non-numeric-operands-no-runtime-belt.md Status "fixed (0.311.0)". `npx vitest run tests/b0332-spelled-arithmetic-non-numeric-operands.test.ts tests/b0338-pure-host-arithmetic-non-numeric-belt.test.ts` → 25 passed (25) at HEAD, so neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0332-spelled-arithmetic-non-numeric-operands\|b0338-pure-host-arithmetic-non-numeric-belt" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename or deletion of any file or `it()`/`describe()` — only that the local harness pieces could be imported from the existing helper — so no citation is affected.
- Coverage check: the claim is about a repeated harness DEFINITION, not a missing test path; every piece cited is exercised by the tests in its own file (25/25 passing, confirmed above).

## Triage
verdict: confirmed — independently re-diffed: b0332's producer (163-173) and probeSource (197-216, bugTag/sourcePath normalised) and b0338's InstantSettleSession (201-232) are byte-identical to the helper, b0338's rootDouble/driveInterp/driveInvoke differ only in comment wording and parseCallee signature line-wrapping, b0332's assertValue differs by the one word "numeric"; docs/bugs 0332 fixed (0.299.0) / 0338 fixed (0.311.0), 25/25 green, 0 coverage-matrix hits, helper imported only by b0368/b0369, 13 local InstantSettleSession copies all reproduce; not a duplicate of PTQ-0397 (b0368/b0369 only — the fix that minted this helper) or PTQ-0209 (the no-clock NOOP_CHECKPOINT trio across other files), and the same-wave intake siblings (b0365-67, b0392-93, b0394-95, b0402, b0439, b0370/72) cite disjoint files, so this is the not-migrated residual class PTQ-0228/PTQ-0240 already established as separately filable; one overstatement on record: b0332's rootDouble (156-161) is the PTQ-0209 shape (NOOP_CHECKPOINT, no clock), not "differing only in the same words" from the helper's clock-bearing double — immaterial since probeSource's executor path never reaches Clock and the helper's double is a strict superset (triage: claude-fable-5-1)
