---
id: PTQ-0957
title: makeWiring(thetas, registry) ExtensionInstanceWiring builder is byte-identical in b0451 and b0401
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0451-factory-lifecycle-notes-fallback-chain.test.ts:143-155
  - tests/b0401-informational-notes-omit-details.test.ts:295-307
sites: 2
fix_scope: localized
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# makeWiring(thetas, registry) ExtensionInstanceWiring builder is byte-identical in b0451 and b0401

## Observation
Both `tests/b0451-factory-lifecycle-notes-fallback-chain.test.ts` and
`tests/b0401-informational-notes-omit-details.test.ts` declare a local,
unexported `function makeWiring(thetas, registry): ExtensionInstanceWiring`
that builds the same six-field object (`thetas`, `registry`,
`activeInvocations: new ActiveInvocationRegistry()`, `forwardingSignals: []`,
`clock: new FakeClock()`, `installHotReload: () => ({ detach: (): void => {} })`).
Both files already import the shared `makeHarness`/`makeTheta` pair from
`tests/helpers/watch-arming-harness.ts` (the fix that landed for
PTQ-0630), but each retypes this second, smaller wiring builder rather than
importing one.

## Evidence
`tests/b0451-factory-lifecycle-notes-fallback-chain.test.ts:143-155` (re-read
immediately before filing):
```ts
function makeWiring(
  thetas: readonly ParsedTheta[],
  registry: ThetaRegistry,
): ExtensionInstanceWiring {
  return {
    thetas,
    registry,
    activeInvocations: new ActiveInvocationRegistry(),
    forwardingSignals: [],
    clock: new FakeClock(),
    installHotReload: () => ({ detach: (): void => {} }),
  };
}
```

`tests/b0401-informational-notes-omit-details.test.ts:295-307` (re-read
immediately before filing):
```ts
function makeWiring(
  thetas: readonly ParsedTheta[],
  registry: ThetaRegistry,
): ExtensionInstanceWiring {
  return {
    thetas,
    registry,
    activeInvocations: new ActiveInvocationRegistry(),
    forwardingSignals: [],
    clock: new FakeClock(),
    installHotReload: () => ({ detach: (): void => {} }),
  };
}
```
The two excerpts diff to zero: same parameter names, same parameter types,
same return type, same six object-literal keys in the same order, same
expressions on every key.

Search performed: `grep -rn "function makeWiring" tests/*.ts` → 3 hits total
(`tests/active-invocation-wiring.test.ts:204`,
`tests/b0401-informational-notes-omit-details.test.ts:295`,
`tests/b0451-factory-lifecycle-notes-fallback-chain.test.ts:143`); a fourth
name-alike, `tests/extension-bootstrap-sink-liveness.test.ts:286`, is a
different-shaped function (`overrides: {...}` parameter, different field
set) and is not counted here.
`tests/active-invocation-wiring.test.ts:179-223` was checked and is the
already-filed `bootFactory`/`FactoryBoot` composeInstance-stub shape (PTQ-0792),
a different, larger scaffold — not this six-field literal-returning
`makeWiring`.

## Why this is a problem
Both copies build the identical fixed `ExtensionInstanceWiring` value from the
same two caller-supplied pieces (`thetas`, `registry`). A change to any of the
four fixed fields (`activeInvocations`, `forwardingSignals`, `clock`,
`installHotReload`) needs to be hand-applied in both files to stay in sync,
the same duplication shape already confirmed for this pair's `makeHarness`/
`makeTheta` scaffolding under PTQ-0630 (fixed) — this second, smaller function
sits alongside that already-shared import and was not folded into the same
migration.

## Suggested direction (non-binding, optional)
`tests/helpers/watch-arming-harness.ts`, which both files already import
`makeHarness`/`makeTheta` from, is the natural place a shared
`makeWiring(thetas, registry)` export would sit alongside them.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `makeWiring` returns a fixed data object, not a fake that records calls for a MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "b0401-informational-notes-omit-details\|b0451-factory-lifecycle-notes-fallback-chain" docs/bugs/*.md` → both bugs' own docs (0401, 0451, and 0455) cite the test file NAMES as witnesses/gates, none documents this `makeWiring` block as a correct-reason red or pins its shape.
- coverage-matrix citation search: `grep -n "b0401-informational-notes-omit-details.test.ts\|b0451-factory-lifecycle-notes-fallback-chain.test.ts" docs/reference/coverage-matrix.md` → 0 hits.
- Duplicate/prior-finding search: `grep -rl "makeWiring" quality/issues quality/intake quality/resolved` → 0 hits before this filing; PTQ-0630 (resolved) covers only the `makeHarness`/`makeTheta` fake-pi harness between these same two files and explicitly does not mention `makeWiring`; PTQ-0792 (open) covers the larger, differently-shaped `bootFactory`/`FactoryBoot` scaffold in a different file pair. This finding makes no coverage claim — both files' behaviour is exercised; only the builder function is retyped.

## Triage
verdict: confirmed — independently re-verified: mktemp `diff` of tests/b0451-factory-lifecycle-notes-fallback-chain.test.ts:143-155 vs tests/b0401-informational-notes-omit-details.test.ts:295-307 is empty (byte-identical), both copies are live (2 call sites each: b0451:235,298; b0401:404,449), no tests/helpers module exports a `makeWiring`, and the identical six-field literal already sits inline in tests/helpers/watch-arming-harness.ts:294-301 (`bootRegistryHarness`'s composeInstance) so the shared home named in the direction already builds this exact value — the fix is a mechanical export+import; D7 boilerplate/copy-paste fixture inside tests/, neither file is a gate, `makeWiring` returns fixed data (no recording-double carve-out), docs/bugs 0401/0451/0455 cite only the file names as gates and coverage-matrix → 0 hits reproduce; not tracked by PTQ-0630 (makeHarness/makeTheta only), PTQ-0792 (active-invocation-wiring ↔ forwarding-detach-wiring bootFactory) or PTQ-0715 (supersession pair). One stated-search inaccuracy noted, not refuting: `grep -rn "function makeWiring" tests/*.ts` returns 3 hits but the roster is b0401:295, b0451:143 and extension-bootstrap-sink-liveness.test.ts:287 (the differently-shaped `overrides` variant) — tests/active-invocation-wiring.test.ts:204 is NOT a `function makeWiring` hit, it is the inline composeInstance literal inside `bootFactory` (PTQ-0792) (triage: claude-fable-5-1)
