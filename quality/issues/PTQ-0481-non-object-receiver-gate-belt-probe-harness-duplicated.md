---
id: PTQ-0481
title: non-object-receiver-gate.test.ts redeclares the Probe type, rootDouble, producer, render and probeSource shape tests/helpers/runtime-belt-probe-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/non-object-receiver-gate.test.ts:229-246
  - tests/non-object-receiver-gate.test.ts:270-298
  - tests/helpers/runtime-belt-probe-harness.ts:50-53
  - tests/helpers/runtime-belt-probe-harness.ts:64-93
  - tests/helpers/runtime-belt-probe-harness.ts:96-98
  - tests/helpers/runtime-belt-probe-harness.ts:174-186
sites: 4
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# non-object-receiver-gate.test.ts redeclares the Probe type, rootDouble, producer, render and probeSource shape tests/helpers/runtime-belt-probe-harness.ts already exports

## Observation
`tests/non-object-receiver-gate.test.ts` declares its own module-scope `Probe`
discriminated-union type, `rootDouble`/`producer` (a `RuntimeRoot` +
`createProductionProducerDeps` pair), `render` (a value-to-string formatter)
and a `probeSource` function that parses a query-free prompt-mode fixture and
drives it through `createProductionProducerDeps(...).bindPromptConversation`
→ `executeBody`, capturing either a success value or a caught throw.
`tests/helpers/runtime-belt-probe-harness.ts` already exports the identical
`Probe` type and a `makeBeltProbes` factory whose internal `probeSource` is
the same parse → bind → `executeBody` → catch sequence, built on the same
`rootDouble`/`producer`/`render` trio (the helper's own header names this
exact five-piece set as what it centralised out of two prior files).

## Evidence
tests/non-object-receiver-gate.test.ts:229-246:
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
}
```

tests/non-object-receiver-gate.test.ts:270-298 (the `Probe` type, `probeSource`
and `render`, byte-identical to the helper's exports apart from the hardcoded
`"bug0027"` tag where the helper takes a `bugTag` parameter):
```ts
type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };

/** Parse + run a self-contained query-free prompt-mode source, capturing a throw. */
async function probeSource(src: string): Promise<Probe> {
  const doc = parseTheta("bug0027.theta", FM + src);
  const theta: ThetaCompositionInput = {
    slashName: "bug0027",
    sourcePath: "/theta/bug0027.theta",
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

function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
```

tests/helpers/runtime-belt-probe-harness.ts:50-53 — the canonical, already
exported `Probe` type:
```ts
export type Probe =
  | { readonly kind: "value"; readonly execution: BodyExecution }
  | { readonly kind: "threw"; readonly thrown: unknown };
```

tests/helpers/runtime-belt-probe-harness.ts:64-93 — the canonical
`rootDouble`/`producer` pair, structurally the same shape (the helper's
`rootDouble` additionally wires a synchronous `clock` for its own callers'
query drives; the `idSource` shape and `producer`'s `pi`/`root`/`modelRegistry`
wiring are byte-identical):
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

tests/helpers/runtime-belt-probe-harness.ts:96-98 — the canonical `render`,
byte-identical to the local copy above:
```ts
function render(value: ThetaValue | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
```

tests/helpers/runtime-belt-probe-harness.ts:174-186 — `makeBeltProbes`'s inner
`probeSource`, the same parse → composition-input → bind → `executeBody` →
catch sequence as the local copy, parameterised on `bugTag`/`sourcePath`
instead of the hardcoded `"bug0027"` values:
```ts
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

## Why this is a problem
`tests/helpers/runtime-belt-probe-harness.ts` exists specifically to hold this
five-piece shape (`Probe`, `rootDouble`, `producer`, `render`, `probeSource`)
after a prior review found it duplicated between `tests/b0368-*` and
`tests/b0369-*`; its `makeBeltProbes` factory takes exactly the two axes that
vary between callers (the caller's own `parseTheta` — the bug-specific "why
this fixture parses clean" reasoning — and a `bugTag` string) and leaves
everything else, including the `Probe` type, `rootDouble`, `producer`,
`render` and the `probeSource` body itself, fixed. `non-object-receiver-gate.test.ts`
reimplements those same fixed pieces inline instead of calling
`makeBeltProbes`, with only the bug tag ("bug0027") and the query-only
`rootLive`/`livePi`/`ctxLive` trio for its group (g) staying genuinely local
to this file's own subject.

## Suggested direction (non-binding, optional)
`tests/helpers/runtime-belt-probe-harness.ts`'s `makeBeltProbes(parseTheta,
bugTag)` already returns a `probeSource` built from the same `rootDouble`/
`producer`/`render`/`Probe` pieces this file redeclares; calling it with this
file's own `parseTheta` and a `"bug0027"` tag is the existing, purpose-built
home for this shape.

## False-positive check
- Gate-pin check: non-object-receiver-gate.test.ts does not match
  `*gate*.test.ts`'s pinned-count/inventory shape for this finding's cited
  lines — the cited lines are a type declaration and three plumbing
  functions, not a pinned count or corpus inventory.
- Recording-double check: none of the cited pieces are a "never called"
  negative witness; `probeSource`/`producer`/`rootDouble`/`render` are plumbing
  that feeds later positive assertions, not a recording double under this
  finding.
- docs/bugs/ signature search: `grep -rl "non-object-receiver-gate"
  docs/bugs/*.md` shows docs/bugs/0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md
  citing this file; its status is open (RED-by-design witness for the
  as-yet-unfixed gate), which is why the probes here are RED, not why the
  harness plumbing is duplicated — the duplication claim is orthogonal to that
  documented-red status.
- coverage-matrix/bug-doc citation search: `grep -rn "non-object-receiver-gate"
  docs/reference/coverage-matrix.md` → no hits; no merge, rename or deletion
  of any cited cell is proposed, only the shared plumbing functions.
- Coverage check: the claim is about duplicated harness-plumbing DEFINITIONS,
  not a missing test path; every cell in the file continues to pass/fail
  under its current inline definitions exactly as documented in the file's own
  RED/CONTROL annotations.

## Triage
verdict: confirmed — independently re-verified: `Probe`, `render` and `producer()` reproduce byte-identical at the cited lines and `probeSource` differs only in export keyword, the `parseTheta("bug0027.theta", FM + src)` call shape (the same FM-prepending wrapper b0368 already threads through `makeBeltProbes`), the hardcoded "bug0027" tag and a `/theta/` vs `/proj/` sourcePath nothing asserts on; in-scope D7 copy-paste fixture confined to tests/ with no gate-pin (plumbing, not counts), coverage-matrix (0 hits) or bug-doc carve-out binding; not a duplicate — resolved PTQ-0209's fix migrated only its four cited files (this one was not among them, its copy is intact) and PTQ-0397 covered b0368/b0369 only, with same-wave siblings d7-106-02/d7-161-02 citing this block as the SOURCE of other files' copies (different root cause); two non-refuting inaccuracies for the fixer: the helper does NOT export rootDouble/producer/render (only Probe/assertValue/makeBeltProbes — render would need exporting or stays local), and docs/bugs/0027 is fixed (0.39.0) with the file 37/37 green, not "open / RED-by-design" as the FP check states (triage: claude-fable-5-1)
