---
id: PTQ-0611
title: b0402 hand-rolls the rootDouble/producer/probeSource/InstantSettleSession/driveInterp bundle tests/helpers/runtime-belt-probe-harness.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0402-slice-integer-arg-fractional-nan-belt.test.ts:138-225
  - tests/b0402-slice-integer-arg-fractional-nan-belt.test.ts:307-390
  - tests/helpers/runtime-belt-probe-harness.ts:64-233
sites: 1
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0402 hand-rolls the rootDouble/producer/probeSource/InstantSettleSession/driveInterp bundle tests/helpers/runtime-belt-probe-harness.ts already centralises

## Observation
`tests/helpers/runtime-belt-probe-harness.ts` exports `assertValue` and, through `makeBeltProbes(parseTheta, bugTag)`, the `rootDouble`/`producer`/`probeSource`/`InstantSettleSession`/`driveInterp`/`driveInvoke` bundle — built (its own header states) because two sibling runtime-belt test files "each independently declared the same seven pieces... byte-identical apart from a predecessor-bug-number comment and the `slashName`/`sourcePath` bug tag embedded in the composition input." `tests/b0402-slice-integer-arg-fractional-nan-belt.test.ts` — one of this wave's nine reviewed files — declares its own module-scope `rootDouble`, `producer`, `render`, `Probe`, `probeSource`, `assertValue`, `InstantSettleSession`, `InterpProbe`, and `driveInterp` reproducing that same bundle, with only the hardcoded `"b0402"`/`"/proj/b0402.theta"` bug tag differing from what the helper already accepts as a parameter, and does not import the helper.

## Evidence

`tests/b0402-slice-integer-arg-fractional-nan-belt.test.ts:138-225` (`rootDouble`, `render`, `Probe`, `producer`, `probeSource`, `assertValue`):
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

function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

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
}

async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta(src);
  const theta: ThetaCompositionInput = {
    slashName: "b0402",
    sourcePath: "/proj/b0402.theta",
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

`tests/b0402-slice-integer-arg-fractional-nan-belt.test.ts:307-390` (`InstantSettleSession`, `InterpProbe`, `driveInterp`):
```ts
class InstantSettleSession {
  readonly entries: Array<Record<string, unknown>> = [];
  readonly sent: string[] = [];

  sendUserMessage(text: string): void {
    this.sent.push(text);
    this.entries.push({ ... });
    this.entries.push({ ...role: "assistant"... });
  }

  isIdle(): boolean {
    return true;
  }
}

type InterpProbe =
  | { readonly kind: "rendered"; readonly sent: readonly string[]; readonly outcome: string; readonly value: ThetaValue | undefined }
  | { readonly kind: "threw"; readonly sent: readonly string[]; readonly thrown: unknown };

async function driveInterp(src: string): Promise<InterpProbe> {
  const doc = parseTheta(src);
  const session = new InstantSettleSession();
  const pi = {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (): void => {},
  } as unknown as ExtensionAPI;
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
  const ctx = { ... } as unknown as ExtensionCommandContext;
  const theta: ThetaCompositionInput = {
    slashName: "b0402",
    sourcePath: "/proj/b0402.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const binding = deps.bindPromptConversation({ theta, args: "", ctx });
  try {
    const execution = await executeBody(theta.body, binding.executeDeps);
    return { kind: "rendered", sent: session.sent, outcome: execution.outcome, value: execution.result.value };
  } catch (thrown) {
    return { kind: "threw", sent: session.sent, thrown };
  }
}
```

`tests/helpers/runtime-belt-probe-harness.ts:64-233` (canonical `rootDouble`, `producer`, `render`, `assertValue`, `InstantSettleSession`, and — inside `makeBeltProbes(parseTheta, bugTag)` — `probeSource`/`driveInterp` parameterised by `bugTag` where b0402 hardcodes `"b0402"`, confirmed via direct line-for-line comparison to be otherwise identical to the excerpts above):
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
...
export function assertValue(probe: Probe, expected: ThetaValue, what: string): void { ... }

class InstantSettleSession { ... }

export function makeBeltProbes(
  parseTheta: (src: string) => ThetaDocument,
  bugTag: string,
): { readonly probeSource...; readonly driveInterp...; readonly driveInvoke... } {
  const sourcePath = `/proj/${bugTag}.theta`;
  async function probeSource(src: string): Promise<Probe> {
    const doc = parseTheta(src);
    const theta: ThetaCompositionInput = { slashName: bugTag, sourcePath, ... };
    ...
  }
  async function driveInterp(src: string): Promise<InterpProbe> { ... }
  ...
}
```

This same clone-map family (b0332, b0338 against this same helper) is already filed as `quality/intake/qw20260917154546-d7-01-b0332-b0338-belt-probe-harness-duplicated.md`, whose own pattern-wide search states: "`grep -rln \"class InstantSettleSession\" tests --include=\"*.test.ts\"` → 13 files still declare this class locally (b0338, b0345, b0365, b0366, b0367, b0372, b0392, b0393, b0394, b0395, **b0402**, b0433, b0479)" and explicitly scoped its own claim to b0332/b0338, naming the other 11 (including b0402) only as pattern-size evidence, not as a claim against them. This finding makes that claim against b0402 specifically, since b0402 is in this wave's own review scope.

## Why this is a problem
`tests/helpers/runtime-belt-probe-harness.ts`'s own header states its purpose is to end exactly this redeclaration. b0402 reproduces the identical `rootDouble`/`producer`/`render`/`Probe`/`probeSource`/`assertValue` (the EXECUTOR-probe half) and `InstantSettleSession`/`InterpProbe`/`driveInterp` (the PURE-HOST-drive half) with only the bug-tag string differing from the parameter the helper already accepts, and does not import it.

## Suggested direction (non-binding, optional)
`tests/helpers/runtime-belt-probe-harness.ts` already exports `assertValue` and, through `makeBeltProbes(parseTheta, "b0402")`, the `rootDouble`/`producer`/`probeSource`/`InstantSettleSession`/`driveInterp`/`driveInvoke` bundle parameterised by exactly the two things (b0402's own `parseTheta` and its bug tag) that differ from the helper's existing callers.

## False-positive check
- Gate-pin check: `tests/b0402-slice-integer-arg-fractional-nan-belt.test.ts` does not match `*gate*.test.ts` or the named kin; the cited functions are harness plumbing, not a pinned count or inventory assertion.
- Recording-double check: `InstantSettleSession` records every `sendUserMessage` call so a probe can observe the render/send outcome — a positive-witness recorder used to drive and observe a probe, not a "never called" negative witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0402-slice-integer-arg-fractional-nan-silent-js-truncation.md` — no "left red"/documented-correct-reason-red status; `npx vitest run tests/b0402-slice-integer-arg-fractional-nan-belt.test.ts` passes at HEAD (all FLIP/CONTROL rows execute as scripted).
- coverage-matrix/bug-doc citation search: `grep -n "b0402-slice-integer-arg-fractional-nan-belt" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of the file or any `it()`/`describe()` — only that the local harness pieces could be imported from the existing helper.
- Coverage check: the claim is about a repeated harness DEFINITION, not a missing test path; every piece cited is exercised by the tests in its own file (confirmed passing above).
- Duplicate check: distinct from `qw20260917154546-d7-01-b0332-b0338-belt-probe-harness-duplicated.md`, which explicitly scoped itself to b0332/b0338 and named b0402 only as pattern-size evidence, not as a claim against it — this finding makes the claim against b0402 directly, since it is inside this wave's own review scope.

## Triage
verdict: confirmed — independently re-diffed per function: b0402's rootDouble (138-154), render (156-158), Probe (167-169), producer (171-181), probeSource (184-202), assertValue (210-224), InstantSettleSession (307-336), InterpProbe (338-340) and driveInterp (342-390) are byte-identical to tests/helpers/runtime-belt-probe-harness.ts's equivalents once `"b0402"`/`"/proj/b0402.theta"` is normalised to the helper's bugTag/sourcePath parameter (residual diff lines are comment wording and the `export` keyword only); b0402 imports neither the helper nor makeBeltProbes (grep 0 hits), the helper's importers are still only b0368/b0369, all 13 local InstantSettleSession copies reproduce, docs/bugs/0402 is fixed (0.400.0) with 9/9 green, coverage-matrix has 0 hits and the bug doc's witness-list citation is untouched by an import-only direction; not a duplicate of PTQ-0397 (b0368/b0369 — the fix that minted the helper) or PTQ-0209 (no-clock NOOP_CHECKPOINT trio in other files), and the same-wave d7-01/d7-02/d7-03/d7-07 siblings cite disjoint files, so this is the PTQ-0228/PTQ-0240 not-migrated residual class filed per-file; b0402 (2026-09-04) predates the helper (2026-09-17), which explains but does not excuse the redeclaration (triage: claude-fable-5-1)
