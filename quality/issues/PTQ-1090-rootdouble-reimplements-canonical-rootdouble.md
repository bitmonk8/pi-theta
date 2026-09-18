---
id: PTQ-1090
title: params-default-unresolvable-enum-variant.test.ts's local rootDouble() reimplements the canonical rootDouble(overrides) export from a module it already imports from
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-default-unresolvable-enum-variant.test.ts:707-721
  - tests/helpers/scripted-live-session-harness.ts:116-122
  - tests/helpers/runtime-belt-probe-harness.ts:69-83
  - tests/helpers/fixture-dispatch-harness.ts:142-152
sites: 1
fix_scope: localized
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# params-default-unresolvable-enum-variant.test.ts's local rootDouble() reimplements the canonical rootDouble(overrides) export from a module it already imports from

## Observation
`tests/params-default-unresolvable-enum-variant.test.ts` imports `EM_DASH`
and `ajvArgsNote` from `./helpers/scripted-live-session-harness` at its own
top (:1) and declares a local `rootDouble(): RuntimeRoot` (:707-721) that
builds a `checkpoint`/`idSource`/`clock`/`schemaValidator`/`fileSystem`
`RuntimeRoot` double, with `idSource.newInvocationId` returning `"inv-1"`,
`newToolCallId` returning `"tc-1"`, `clock.wallNow` returning `0`, and a
`fileSystem.readBytes` override resolving from a caller-supplied source map.
The same module already exports `rootDouble(overrides)` (:116-122), which
composes the identical base double (`checkpoint.before` resolving, the same
`"inv-1"`/`"tc-1"` id pair, the same `wallNow: () => 0`, a real AJV
`schemaValidator`) from `tests/helpers/runtime-belt-probe-harness.ts`'s
`rootDouble()` and `tests/helpers/fixture-dispatch-harness.ts`'s `rootWith(...)`,
and already accepts a `fileSystem: Pick<RuntimeRoot["fileSystem"],
"readBytes">` override — exactly the override point the in-scope file's local
copy hand-adds.

## Evidence

`tests/params-default-unresolvable-enum-variant.test.ts:707-721` (re-read
immediately before filing):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: realAjvValidator(),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> => {
        const src = FIXTURE_SOURCES.get(path);
        return src !== undefined
          ? Promise.resolve(new TextEncoder().encode(src))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`));
      },
    },
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/scripted-live-session-harness.ts:116-122` — the canonical
export accepting the exact `fileSystem` override the local copy needs:
```ts
export function rootDouble(overrides: {
  readonly clock?: Partial<RuntimeRoot["clock"]>;
  readonly tokenEstimator?: RuntimeRoot["tokenEstimator"];
  readonly fileSystem?: Pick<RuntimeRoot["fileSystem"], "readBytes">;
} = {}): RuntimeRoot {
  return { ...fixedClockRoot(), schemaValidator: ajv(), ...overrides } as unknown as RuntimeRoot;
}
```
(`fixedClockRoot` is this same file's own import alias, `import { rootDouble
as fixedClockRoot } from "./runtime-belt-probe-harness";`.)

`tests/helpers/runtime-belt-probe-harness.ts:69-83` — the base double the
canonical export composes, carrying the same `checkpoint`/id/clock triple:
```ts
export function rootDouble(): RuntimeRoot {
  return rootWith(SEAM_NOOP_CHECKPOINT, "inv-1", {
    now: (): number => 0,
    wallNow: (): number => 0,
    setTimeout: (fn: () => void): unknown => {
      fn();
      return 0;
    },
    clearTimeout: (): void => {},
  });
}
```

`tests/helpers/fixture-dispatch-harness.ts:142-152` — `rootWith`, supplying
the same `"inv-1"`/`"tc-1"` id pair the local copy hard-codes:
```ts
export function rootWith(
  checkpoint: Checkpoint,
  invocationId = "inv-1",
  clock?: Clock,
): RuntimeRoot {
  return {
    checkpoint,
    idSource: { newInvocationId: () => invocationId, newToolCallId: () => "tc-1" },
    ...(clock === undefined ? {} : { clock }),
  } as unknown as RuntimeRoot;
}
```
`SEAM_NOOP_CHECKPOINT`'s `before()` is the same `Promise.resolve()` no-op the
local copy inlines directly. Calling
`rootDouble({ fileSystem: { readBytes: (path) => … } })` from the already-
imported `scripted-live-session-harness` module reproduces every field the
local copy builds: the same checkpoint no-op, the same `"inv-1"`/`"tc-1"`
id pair, the same `wallNow: () => 0`, a real AJV `schemaValidator` (the
`realAjvValidator()` leg of this composition is tracked separately by open
`PTQ-0971`), and the same caller-supplied `fileSystem.readBytes` override
point.

## Why this is a problem
The `RuntimeRoot` double is pure harness plumbing — the fixed clock, the
deterministic id pair, the no-op checkpoint, the AJV-backed schema validator,
and a fixture-resolving file system — not domain logic specific to bugs
0185/0197. The in-scope file already imports two other names from the exact
module that exports this composed double under the same name and with the
same override shape, yet retypes the whole double locally instead. A future
change to the fixed-clock shape, the id pair, or the checkpoint no-op would
need a hand-matched edit here that the shared export does not enforce.

## Suggested direction (non-binding, optional)
Importing `rootDouble` from `./helpers/scripted-live-session-harness` and
calling it with `{ fileSystem: { readBytes: (path) => … } }` in place of the
local declaration would let this file drop its own copy while keeping the
`schemaValidator` question (`realAjvValidator()` vs the export's `ajv()`)
tracked by `PTQ-0971` separately.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or any named gate
  kin; the cited code is a `RuntimeRoot` double, not a pinned count.
- Recording-double check: `rootDouble()` backs a positive drive (the binder
  pass reads through it), not a "never called" MUST-NOT witness; the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "rootDouble" docs/bugs/*.md` → 0
  hits; neither docs/bugs/0185 nor docs/bugs/0197 names the function.
- coverage-matrix/bug-doc citation search: `grep -n "params-default-unresolvable-enum-variant" docs/reference/coverage-matrix.md` → 0 hits. Both bug docs cite this file as a whole-file witness only; this finding proposes no merge, rename, or deletion of any `it()`/`describe()`, only that the local double could call the existing export.
- Coverage check: the claim is about a repeated function DEFINITION with an
  already-exported canonical counterpart, not a missing test path; the local
  double is called from every `driveSlash(...)` invocation in the file.
- Prior-filing overlap check: `grep -rl "rootDouble" quality/issues/*.md
  quality/intake/*.md quality/resolved/*.md | xargs grep -l
  "params-default-unresolvable-enum-variant"` returns only
  `PTQ-0971-realajvvalidator-fixture-duplicated.md`, whose own `locations`
  cite this file's `realAjvValidator()` function (:702-710) — a distinct,
  narrower root cause (the AJV builder alone) that this finding's evidence
  explicitly cross-references rather than restates. `PTQ-1022-binder-forced-
  tool-dispatch-root-double-reimplemented.md` covers the analogous
  `rootDouble()`/`producerWithCapture()` pattern in a different file
  (`tests/binder-forced-tool-dispatch.test.ts`) and does not name this file.
  No open or resolved finding names this file's `rootDouble()` function
  against the canonical `scripted-live-session-harness.ts` export.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified D7 copy-paste double: all four excerpts reproduce verbatim at the cited lines (local `rootDouble()` :707-721 with its sole caller at :911 `createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry })`; canonical export scripted-live-session-harness.ts:116-122 spreading `fixedClockRoot()` = runtime-belt-probe-harness.ts:69-83 → fixture-dispatch-harness.ts:142-152 `rootWith(SEAM_NOOP_CHECKPOINT, "inv-1", clock)` with `newToolCallId → "tc-1"`, and invoke-seam-scaffold.ts:48 `SEAM_NOOP_CHECKPOINT.before()` = `Promise.resolve()`); the file imports `EM_DASH`/`ajvArgsNote` from the exact module at :1; the export's `fileSystem?: Pick<RuntimeRoot["fileSystem"], "readBytes">` override is precisely the local copy's only distinguishing field; the local `realAjvValidator()` (`emit: () => {}`, `slugOf` = JSON.stringify slug/canonicalBytes) is behaviourally identical to the export's `ajv()` over proto-named-harness.ts:8-11 `jsonSlug`; the canonical clock is a strict superset (`now`/`setTimeout`/`clearTimeout` added to `wallNow: () => 0`), so no behaviour narrows; the canonical is live (imported by name in 4 tests, e.g. binder-param-type-projection, non-object-receiver-gate); no carve-out binds (not a gate file, positive drive not a negative-witness recorder, coverage-matrix grep → 0, docs/bugs 0185/0197 cite the file whole and never name the double, no it()/describe() merge/rename/delete proposed); dedupe: PTQ-0971 tracks only `realAjvValidator()` :702-710, PTQ-0895/0985 track this file's NOOP_CHECKPOINT/NOOP_SINK, PTQ-1022/0982/1014/0883 are the same class at disjoint files and were accepted as per-file rows, and no same-wave sibling cites this file's `rootDouble()` (d7-01/05/10 cite :780-806 scriptEnvelope). Accounting correction: the candidate's `grep -rln "rootDouble" docs/bugs/*.md → 0` does not reproduce — 1 hit, docs/bugs/0172:1255, which concerns tests/result-value-privacy.test.ts's double and is non-refuting (triage: claude-fable-5-1)
