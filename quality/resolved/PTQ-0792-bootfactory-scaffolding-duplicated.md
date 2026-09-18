---
id: PTQ-0792
title: The bootFactory/FactoryBoot/console.error-capture harness in active-invocation-wiring.test.ts is redeclared near-identically in forwarding-detach-wiring.test.ts, each self-labeled as mirroring the other
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/active-invocation-wiring.test.ts:179-223
  - tests/forwarding-detach-wiring.test.ts:75-117
sites: 2
fix_scope: module
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The bootFactory/FactoryBoot/console.error-capture harness in active-invocation-wiring.test.ts is redeclared near-identically in forwarding-detach-wiring.test.ts, each self-labeled as mirroring the other

## Observation
`tests/active-invocation-wiring.test.ts` declares a `FactoryBoot` interface, an `async function bootFactory(...)` that boots the real `createThetaExtension` factory over a `composeInstance` stub returning a fixed `ExtensionInstanceWiring`, and a `describe(...)` block opening with a `let errors`/`errorSpy` `console.error`-capture `beforeEach`/`afterEach` pair. `tests/forwarding-detach-wiring.test.ts` declares the same four pieces with the same statement sequence, differing only in which single field of `ExtensionInstanceWiring` is threaded as the function's sole varying parameter (`activeInvocations` vs `forwardingSignals`) and in `FactoryBoot`'s field set. Each file's own header comment on this block names the other file as what it mirrors: `active-invocation-wiring.test.ts:179` reads "(mirrors session-shutdown-wiring)" — a related but different file — while the actual byte-for-byte structural sibling is `forwarding-detach-wiring.test.ts:75`, which reads "(mirrors active-invocation-wiring)" and points back at this file directly.

## Evidence
`tests/active-invocation-wiring.test.ts:179-223` (re-read immediately before filing):
```ts
// --- factory-level scaffolding (mirrors session-shutdown-wiring) -------------

interface FactoryBoot {
  readonly harness: FactoryHarness;
  readonly registry: ThetaRegistry;
  readonly activeInvocations: ActiveInvocationRegistry;
  readonly clock: Clock;
}

/** Boot through the REAL factory with a `composeInstance` returning the given
 *  shared `ActiveInvocationRegistry` + `ThetaRegistry` + clock. */
async function bootFactory(
  activeInvocations: ActiveInvocationRegistry,
  clock: Clock,
): Promise<FactoryBoot> {
  const harness = makeFactoryHarness("/does/not/matter", {}, { sendUserMessage: false });
  const registry = new ThetaRegistry([["foo", makeTheta("foo")]]);
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: async (): Promise<ExtensionInstanceWiring> => ({
      thetas: [makeTheta("foo")],
      registry,
      activeInvocations,
      forwardingSignals: [],
      clock,
      installHotReload: () => ({ detach: (): void => {} }),
    }),
  };
  createThetaExtension(deps)(harness.pi);
  await harness.fireSessionStart();
  return { harness, registry, activeInvocations, clock };
}

describe("Increment B1 — factory session_shutdown operates on the shared registry", () => {
  let errors: unknown[] = [];
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errors = [];
    errorSpy = vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      errors.push(line);
    });
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });
```

`tests/forwarding-detach-wiring.test.ts:75-117` (re-read immediately before filing):
```ts
// --- factory-level scaffolding (mirrors active-invocation-wiring) ------------

interface FactoryBoot {
  readonly harness: FactoryHarness;
  readonly forwardingSignals: ForwardingSignalSource[];
}

/** Boot through the REAL factory with a `composeInstance` exposing the given
 *  shared `forwardingSignals` sink (the array sub-step 5 reads). */
async function bootFactory(
  forwardingSignals: ForwardingSignalSource[],
  clock: Clock,
): Promise<FactoryBoot> {
  const harness = makeFactoryHarness("/does/not/matter", {}, { sendUserMessage: false });
  const registry = new ThetaRegistry([["foo", makeTheta("foo")]]);
  const deps: ThetaExtensionDeps = {
    fixtures: [],
    composeInstance: async (): Promise<ExtensionInstanceWiring> => ({
      thetas: [makeTheta("foo")],
      registry,
      activeInvocations: new ActiveInvocationRegistry(),
      forwardingSignals,
      clock,
      installHotReload: () => ({ detach: (): void => {} }),
    }),
  };
  createThetaExtension(deps)(harness.pi);
  await harness.fireSessionStart();
  return { harness, forwardingSignals };
}

describe("Increment B2 — factory session_shutdown sub-step 5 detaches the shared forwarding listeners", () => {
  let errors: unknown[] = [];
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errors = [];
    errorSpy = vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      errors.push(line);
    });
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });
```

`diff` of the two excerpts above (ignoring the two comment lines, the `FactoryBoot` field list, and the single line that varies between `activeInvocations`/`forwardingSignals`) is empty: the `makeFactoryHarness(...)` call, the `ThetaRegistry([["foo", makeTheta("foo")]])` construction, the `deps: ThetaExtensionDeps = { fixtures: [], composeInstance: async (): Promise<ExtensionInstanceWiring> => ({ thetas: [makeTheta("foo")], ... clock, installHotReload: () => ({ detach: (): void => {} }) }) }` object literal, the `createThetaExtension(deps)(harness.pi); await harness.fireSessionStart();` drive pair, and the full `errors`/`errorSpy` `beforeEach`/`afterEach` block are byte-identical statement-for-statement between the two files.

## Why this is a problem
Both files carry a comment recording that the author recognised, at write time, that this block already existed in the sibling file — `forwarding-detach-wiring.test.ts:75` names `active-invocation-wiring.test.ts` directly — yet the block was retyped rather than imported. A change to how the real factory is booted for a `session_shutdown` test (the `composeInstance` stub shape, the `console.error` capture convention, or the `ThetaRegistry`/`makeTheta("foo")` fixture) has to be hand-applied in both places to stay in sync. `tests/helpers/watch-arming-harness.ts` already supplies the `makeHarness`/`makeTheta` pieces both files import; the natural next layer — a shared `bootFactory`-shaped wrapper over `createThetaExtension` plus the `console.error`-capture pair — is, by these files' own comments, the piece neither file's import list currently reaches for.

## Suggested direction (non-binding, optional)
A `tests/helpers/` export of this `bootFactory`/`FactoryBoot`/console.error-capture triple, parameterised by whichever single `ExtensionInstanceWiring` field a given test varies, is the shape both files' own "mirrors" comments already point at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); not applicable.
- Recording-double check: `errors`/`errorSpy` records `console.error` lines to build a positive later assertion (e.g. counting `reload-teardown-timeout` lines), not a MUST-NOT-called negative witness; the carve-out does not apply, and this finding is about the capture harness being redeclared, not about the validity of any assertion built on it.
- docs/bugs/ signature search: `grep -rln "active-invocation-wiring.test.ts\|forwarding-detach-wiring.test.ts" docs/bugs/` → docs/bugs/0073-cancelled-by-session-shutdown-never-emitted.md, docs/bugs/0074-registry-insertion-after-binder-await.md, docs/bugs/0468-subagent-teardown-budget-shared-2000ms.md. Each cites a file NAME as a witness; none documents this specific `bootFactory` block as a correct-reason red, and this finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` — only that the shared scaffolding could be imported instead of retyped.
- coverage-matrix citation search: `grep -n "active-invocation-wiring.test.ts\|forwarding-detach-wiring.test.ts" docs/reference/coverage-matrix.md` → 0 hits.
- Coverage-drift check: this finding is about a harness declaration repeated across two files that already exist and already pass; it makes no claim that any behaviour or path is untested.
- Duplicate/overlap check: `grep -rl "bootFactory\|ThetaExtensionDeps" quality/issues quality/resolved quality/intake` → only `quality/resolved/PTQ-0403-active-invocation-dispatch-scaffolding-duplicated.md` and `quality/resolved/PTQ-0576-session-shutdown-harness-duplicated.md` match, on unrelated grounds: PTQ-0403 (fixed) covers the DISPATCH-side `Checkpoint`/`rootWith`/`noopPi`/`promptTheta`/`driveCtx`/`tick` scaffolding, now migrated into `tests/helpers/fixture-dispatch-harness.ts` (confirmed both files import it today). PTQ-0576 (fixed) covers the `Harness`/`makeHarness`/`makeTheta` fixture triple, now migrated into `tests/helpers/watch-arming-harness.ts` (confirmed both files import `makeHarness as makeFactoryHarness` and `makeTheta` from it today). Neither prior finding's evidence cites the `bootFactory`/`FactoryBoot`/`errors`/`errorSpy` block quoted above — that block sits one layer above the already-fixed `makeFactoryHarness` call and is a residual not covered by either resolved fix.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at active-invocation-wiring.test.ts:179-223 and forwarding-detach-wiring.test.ts:75-117; mechanical diff of the two blocks differs only in the header comment, FactoryBoot field list, docstring, the single varied param, the two swapped `activeInvocations`/`forwardingSignals` wiring lines, the return literal and the describe title — the makeFactoryHarness call, ThetaRegistry([["foo", makeTheta("foo")]]), the deps/composeInstance literal, the createThetaExtension(deps)(harness.pi)+fireSessionStart drive pair and the full errors/errorSpy beforeEach/afterEach block are byte-identical; both bootFactory copies are live (3 + 2 callers) and `errors` feeds positive assertions (:277 timeoutLines, :162 failLines), so no recording-double carve-out; both sites under tests/, D7 boilerplate-duplication class, no gate file, no merge/rename/delete proposed (docs/bugs 0073/0074/0468 cite file names only; coverage-matrix → 0); no tests/helpers module exposes a fixed-wiring composeInstance-stub boot (the three helpers mentioning composeInstance all call real composeExtensionInstance); not a duplicate — PTQ-0576 (fixed) covered only the Harness/makeHarness/makeTheta triple beneath this layer and its own triage note records that no helper offers "this composeInstance-stub shape", PTQ-0403 is the dispatch-side block, PTQ-0442/0446/0630 are the fake-pi harness family; the filing's claim that `grep bootFactory|ThetaExtensionDeps quality/` hits only PTQ-0403/0576 is wrong (~10 more files match on ThetaExtensionDeps) but immaterial since none tracks this layer; the 2-site accounting is a slice of a wider pattern (session-shutdown-wiring.test.ts boot()/bootWithDiagnosticSink(), e2e-s6 boot() inline the same composeInstance-stub drive) whose other pair is filed as untriaged same-wave sibling d7-07 — this earlier-numbered filing is the canonical for the root cause; the fixer should mint one shared boot helper serving all four files (triage: claude-fable-5-1)
