---
id: PTQ-0624
title: b0439 hand-rolls the rootDouble/render/Probe/producer/probeSource bundle tests/helpers/runtime-belt-probe-harness.ts already centralises
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0439-kind-belt-message-honesty.test.ts:142-159
  - tests/b0439-kind-belt-message-honesty.test.ts:161-163
  - tests/b0439-kind-belt-message-honesty.test.ts:171-173
  - tests/b0439-kind-belt-message-honesty.test.ts:175-185
  - tests/b0439-kind-belt-message-honesty.test.ts:187-207
  - tests/helpers/runtime-belt-probe-harness.ts:64-82
  - tests/helpers/runtime-belt-probe-harness.ts:84-98
  - tests/helpers/runtime-belt-probe-harness.ts:171-193
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0439 hand-rolls the rootDouble/render/Probe/producer/probeSource bundle tests/helpers/runtime-belt-probe-harness.ts already centralises

## Observation
`tests/helpers/runtime-belt-probe-harness.ts` exists (its own header states)
because "Several test files independently redeclared" the same
`rootDouble`/`producer`/`probeSource`/`assertValue`/`InstantSettleSession`/
`driveInterp`/`driveInvoke` bundle for driving `executeBody` through a
query-free prompt-mode theta over an instant-settle `RuntimeRoot` double. It
exports `assertValue` directly and the rest through
`makeBeltProbes(parseTheta, bugTag)`, parameterised by exactly the two things
that vary per caller: the caller's own `parseTheta` and its bug-tag string.
`tests/b0439-kind-belt-message-honesty.test.ts` — one of this wave's nine
reviewed files — declares its own module-scope `rootDouble`, `render`,
`Probe`, `producer`, and `probeSource`, reproducing the helper's
EXECUTOR-probe half line-for-line apart from the hardcoded `"b0439"`/
`"/proj/b0439.theta"` bug tag the helper's `bugTag` parameter already accepts,
and does not import the helper.

## Evidence

`tests/b0439-kind-belt-message-honesty.test.ts:142-159` (`rootDouble`):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    // The prompt-mode drive's only wait primitive is `Clock.setTimeout`; fire the
    // callback synchronously so an instant-settle turn completes deterministically
    // with no real timers (the b0394/b0402 harness contract).
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
```
```ts
      setTimeout: (fn: () => void): unknown => {
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
  } as unknown as RuntimeRoot;
}
```

`tests/b0439-kind-belt-message-honesty.test.ts:161-163, 171-173` (`render`, `Probe`):
```ts
function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };
```

`tests/b0439-kind-belt-message-honesty.test.ts:175-185` (`producer`):
```ts
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

`tests/b0439-kind-belt-message-honesty.test.ts:187-207` (`probeSource`, the bug tag hardcoded where the helper takes a parameter):
```ts
async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta(src);
  const theta: ThetaCompositionInput = {
    slashName: "b0439",
    sourcePath: "/proj/b0439.theta",
    frontmatter: doc.frontmatter as ParsedFrontmatter,
    body: doc.body,
  };
  const bindInput: ConversationBindInput = {
    theta,
    args: "",
    ctx: {} as unknown as ExtensionCommandContext,
  };
```
```ts
  const binding = producer().bindPromptConversation(bindInput);
  try {
    return { kind: "value", execution: await executeBody(theta.body, binding.executeDeps) };
  } catch (thrown) {
    return { kind: "threw", thrown };
  }
}
```


`tests/helpers/runtime-belt-probe-harness.ts:64-82` (canonical `rootDouble` —
byte-identical body, minus b0439's clock comment):
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

`tests/helpers/runtime-belt-probe-harness.ts:84-98` (canonical `producer`,
`render` — both byte-identical to b0439's):
```ts
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

function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
```

`tests/helpers/runtime-belt-probe-harness.ts:171-193` (`probeSource` inside
`makeBeltProbes(parseTheta, bugTag)`, parameterised by exactly the two things
b0439 hardcodes):
```ts
  const sourcePath = `/proj/${bugTag}.theta`;

  async function probeSource(src: string): Promise<Probe> {
    const doc = parseTheta(src);
    const theta: ThetaCompositionInput = {
      slashName: bugTag,
      sourcePath,
      frontmatter: doc.frontmatter as ParsedFrontmatter,
      body: doc.body,
    };
    const bindInput: ConversationBindInput = {
      theta,
      args: "",
      ctx: {} as unknown as ExtensionCommandContext,
    };
```
```ts
    const binding = producer().bindPromptConversation(bindInput);
    try {
      return { kind: "value", execution: await executeBody(theta.body, binding.executeDeps) };
    } catch (thrown) {
      return { kind: "threw", thrown };
    }
  }
```

b0439's own header comment concedes the copy outright: "Shared parse harness
(the b0402/b0394 shape, verbatim)" (line 103) and "EXECUTOR harness (b0402
shape, verbatim)" (line 165).

## Why this is a problem
`tests/helpers/runtime-belt-probe-harness.ts`'s own header states its purpose
is to end exactly this redeclaration, naming the two prior files (b0368,
b0369) that motivated it. `tests/b0439-kind-belt-message-honesty.test.ts`
reproduces the identical `rootDouble`/`render`/`Probe`/`producer`/
`probeSource` bundle (the EXECUTOR-probe half of the helper) with only the
bug-tag string (`"b0439"`/`"/proj/b0439.theta"`) differing from the
`bugTag` parameter `makeBeltProbes` already accepts, and does not import the
helper — the same shape already filed once in this wave against b0402
(`qw20260917154546-d7-04-b0402-belt-probe-harness-duplicated.md`), a distinct
file from b0439 and not in that finding's site list.

## Suggested direction (non-binding, optional)
`tests/helpers/runtime-belt-probe-harness.ts` already exports the
`rootDouble`/`producer`/`render`/`Probe`/`probeSource` bundle through
`makeBeltProbes(parseTheta, "b0439")`, parameterised by exactly the two
things (b0439's own `parseTheta` and its bug tag) that differ from the
helper's existing callers; b0439 does not use the pure-host
`driveInterp`/`driveInvoke` half, so only `probeSource` (and `assertValue`,
if useful) would be drawn from it.

## False-positive check
- Gate-pin check: `tests/b0439-kind-belt-message-honesty.test.ts` does not
  match `*gate*.test.ts` or the named kin; the cited functions are harness
  plumbing, not a pinned count or inventory assertion.
- Recording-double check: none of the cited functions are a "never called"
  negative-witness recorder; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0439-kind-belt-message-lies-on-non-laundered-paths.md`
  carries no "left red"/documented-correct-reason-red status; the file's own
  header states behaviour is out of scope and correct on every FLIP/CONTROL
  path (only message prose changes), consistent with an ordinary green
  regression suite, not a pinned red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0439-kind-belt-message-honesty" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of the file or
  any `it()`/`describe()` — only that the local harness pieces could be drawn
  from the existing helper.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every piece cited is exercised by the tests in its own
  file.
- Duplicate check: distinct from
  `qw20260917154546-d7-04-b0402-belt-probe-harness-duplicated.md` and
  `qw20260917154546-d7-01-b0394-b0395-belt-probe-harness-duplicated.md`,
  which name b0402/b0394/b0395 as their sites; b0439 is a different file in
  this shard's own review scope and appears in neither finding's site list.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-diffed: b0439's rootDouble (142-159) and producer (175-185) are byte-identical to tests/helpers/runtime-belt-probe-harness.ts:64-82/84-94 (rootDouble differs only in comment text), probeSource (187-207) is identical to the helper's 171-192 once `"b0439"`/`"/proj/b0439.theta"` are normalised to the `bugTag`/`sourcePath` parameters makeBeltProbes already takes, Probe/render match the helper's exported Probe and private render, and the file imports nothing from the helper (grep: only b0368/b0369 import it); own header concedes "b0402 shape, verbatim" (103, 165); docs/bugs/0439 is fixed (0.418.0) and names the file only as a witness, 9/9 green, 0 coverage-matrix hits, no merge/rename/delete proposed, not a gate or recording-double; not a duplicate — PTQ-0397 (b0368/b0369, the fix that minted the helper) and PTQ-0209 (no-clock NOOP_CHECKPOINT trio) cite other files, quality/issues+resolved have 0 hits for b0439, and the same-wave belt-probe siblings (b0332/b0338, b0365-67, b0392-93, b0394-95, b0402, b0370/72) cite disjoint files — the not-migrated residual class PTQ-0228/PTQ-0240 established as separately filable; one overstatement on record: the helper does not export `render`, so b0439's `render` (used by requireBeltThrow) stays local or the helper grows an export — immaterial to the finding (triage: claude-fable-5-1)
