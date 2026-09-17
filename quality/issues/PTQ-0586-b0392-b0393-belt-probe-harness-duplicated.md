---
id: PTQ-0586
title: b0392 and b0393 each hand-roll the rootDouble/producer/probeSource/assertValue/InstantSettleSession/driveInterp bundle tests/helpers/runtime-belt-probe-harness.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0392-unary-minus-operand-discipline.test.ts:206-297
  - tests/b0392-unary-minus-operand-discipline.test.ts:337-410
  - tests/b0393-stdlib-method-call-primitive-receiver.test.ts:148-234
  - tests/b0393-stdlib-method-call-primitive-receiver.test.ts:363-433
  - tests/helpers/runtime-belt-probe-harness.ts:1-233
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0392 and b0393 each hand-roll the rootDouble/producer/probeSource/assertValue/InstantSettleSession/driveInterp bundle tests/helpers/runtime-belt-probe-harness.ts already centralises

## Observation
tests/b0392-unary-minus-operand-discipline.test.ts and
tests/b0393-stdlib-method-call-primitive-receiver.test.ts each declare,
module scope, the same six pieces — `rootDouble` (a `RuntimeRoot` double
whose `Clock` fires `setTimeout` synchronously), `producer` (wraps it with
`createProductionProducerDeps`), `probeSource` (parse + run a query-free
prompt-mode source through `executeBody`, capturing a throw), `assertValue`
(assert a probe's success value), the `InstantSettleSession` class (a session
double recording every `pi.sendUserMessage` call), and `driveInterp` (the
PURE-HOST interpolation drive) — that `tests/helpers/runtime-belt-probe-harness.ts`
already exports (`rootDouble`/`producer`/`probeSource`/`InstantSettleSession`/
`driveInterp` bundled inside `makeBeltProbes`, plus a standalone exported
`assertValue`). That helper's own header states it was extracted because
tests/b0368-plus-ordering-laundered-belt.test.ts and
tests/b0369-control-flow-kind-belts.test.ts "each independently declared the
same seven pieces... byte-identical apart from a predecessor-bug-number
comment and the slashName/sourcePath bug tag." Both b0392 and b0393 carry
inline comments naming this exact provenance ("EXECUTOR harness (b0332 shape,
verbatim)" / "PURE-HOST harness (b0369 shape, verbatim)") yet neither imports
the helper module.

## Evidence

tests/b0392-unary-minus-operand-discipline.test.ts:206-297 (`rootDouble`,
`producer`, `probeSource`, `assertValue` — the bug tag `"b0392"`/
`"/proj/b0392.theta"` is the only textual difference from the helper's
parameterised equivalents):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // with no real timers (the b0368 harness contract).
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
    slashName: "b0392",
    sourcePath: "/proj/b0392.theta",
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
    `${what}: the numeric control value (byte-identical guard)`,
  ).toEqual(expected);
}
```

tests/b0393-stdlib-method-call-primitive-receiver.test.ts:148-234 — the same
`rootDouble`/`producer`/`probeSource`/`assertValue` set (differing from
b0392's only in the `"b0393"`/`"/proj/b0393.theta"` bug tag and one message
word, "the control value" vs "the numeric control value"):
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
```

tests/helpers/runtime-belt-probe-harness.ts:59-79 / 96-108 (the canonical
`rootDouble`/`producer`, parameterised over `bugTag` inside `makeBeltProbes`
rather than hardcoded):
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
```

`InstantSettleSession`/`driveInterp` — `diff <(sed -n '337,368p'
tests/b0392-unary-minus-operand-discipline.test.ts) <(sed -n '363,394p'
tests/b0393-stdlib-method-call-primitive-receiver.test.ts)` (the
`InstantSettleSession` class body in both files) produces zero differences;
tests/b0393-stdlib-method-call-primitive-receiver.test.ts:363-433 is the same
`InstantSettleSession` class plus `driveInterp` body (identical `pi` double
shape, identical `deps`/`ctx` construction, identical try/catch return shape)
as tests/helpers/runtime-belt-probe-harness.ts:117-149 / :175-215's
`InstantSettleSession` and the `driveInterp` nested inside `makeBeltProbes`,
differing only in the hardcoded bug tag where the helper takes a `bugTag`
parameter.

Pattern-wide search (already run by this wave's own d7-01 shard,
qw20260917154546-d7-01-b0332-b0338-belt-probe-harness-duplicated.md):
`grep -rln "class InstantSettleSession" tests --include="*.test.ts"` → 13
files still declare this class locally, including b0392 and b0393; that
finding explicitly scoped itself to b0332/b0338 and named the other 11 files,
including b0392 and b0393, as "outside this brief's scope... named here only
as the size of the pattern, not as a claim against them." Both are inside
this shard's reviewed set.

## Why this is a problem
`tests/helpers/runtime-belt-probe-harness.ts`'s own header states its
purpose is to end exactly this redeclaration. b0392 and b0393 reproduce the
identical shape (confirmed by direct comparison above) with only the
hardcoded bug-tag strings and one message word differing from what the
helper already accepts as a parameter — the same difference the helper was
built to absorb, and the same difference already confirmed in this wave's
own d7-01 filing for the b0332/b0338 pair.

## Suggested direction (non-binding, optional)
tests/helpers/runtime-belt-probe-harness.ts already exports `assertValue`
and, through `makeBeltProbes(parseTheta, bugTag)`, the
`rootDouble`/`producer`/`probeSource`/`InstantSettleSession`/`driveInterp`/
`driveInvoke` bundle parameterised by exactly the two things (the fixture's
own `parseTheta` and its bug tag) that differ between b0392/b0393 and the
helper's existing importers (b0368, b0369).

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named kin; the
  cited functions are harness plumbing, not a pinned count or inventory
  assertion.
- Recording-double: `InstantSettleSession`/`rootDouble` are stateless or
  self-recording sequencing doubles used to drive a probe, not a "never
  called" negative witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0392-unary-minus-no-operand-discipline.md
  and docs/bugs/0393-stdlib-method-call-primitive-receiver-silent-null.md
  both exist; both files' own headers state every FLIP cell is RED at fork by
  the fix's own design (fix not yet landed) — that disposition is unrelated
  to the harness-duplication claim here, and neither file's header cites a
  documented correct-reason red against its own bug for a SKIPPED cell.
- coverage-matrix/bug-doc citation search: `grep -n "b0392-unary-minus-operand-discipline\|b0393-stdlib-method-call-primitive-receiver"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename or deletion of any file or `it()`/`describe()` — only that
  the local harness pieces could be imported from the existing helper.
- Prior-finding overlap check: qw20260917154546-d7-01-b0332-b0338-belt-probe-harness-duplicated.md
  (this same wave, intake) covers the identical bundle but in the disjoint
  b0332/b0338 pair, and explicitly names b0392/b0393 as out of its own scope;
  this finding is the disjoint, in-scope continuation of that same
  already-recognised gap, not a re-filing of the same locations.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every piece cited is exercised by each file's own tests.

## Triage
verdict: confirmed — independently re-diffed by symbol (bug tag normalised, comments stripped): rootDouble, producer, InstantSettleSession, render and probeSource in both b0392 and b0393 are byte-identical to tests/helpers/runtime-belt-probe-harness.ts, b0393's driveInterp is byte-identical, b0392's driveInterp differs only by omitting the `value` field the helper's InterpProbe already carries (strict superset), and assertValue differs only in one assertion-message string in each file; neither file imports the helper (its only importers remain b0368/b0369), 13 local `class InstantSettleSession` copies reproduce, 0 coverage-matrix hits, both files live and 31/31 green; not a duplicate of PTQ-0397 (b0368/b0369 — the fix that minted this helper), PTQ-0209 (no-clock shape in other files) or the same-wave d7-01 b0332/b0338 sibling and d7-04 parseDeps filing (disjoint files / disjoint piece), so this is the not-migrated residual class PTQ-0228/PTQ-0240 established as separately filable; two immaterial inaccuracies on record: the FP-check's "fix not yet landed / every FLIP is RED" is stale (docs/bugs 0392 and 0393 record the fix reviewed and landed; both suites are fully green), and b0393's assertValue delta is a parenthetical clause, not "one word" (triage: claude-fable-5-1)
