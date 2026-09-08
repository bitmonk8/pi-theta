---
id: PTQ-0011
title: SubagentDriveDeps.clock is declared and passed at every drive call site but driveSubagentChild never reads it
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/subagent-json-driver.ts:121-122
  - src/runtime/subagent-json-driver.ts:134-135
  - src/extension/production-theta-producer.ts:2648-2654
sites: 3
fix_scope: module
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# SubagentDriveDeps.clock is declared and passed at every drive call site but driveSubagentChild never reads it

## Observation
`SubagentDriveDeps` (the deps record `driveSubagentChild` consumes) declares an
optional `clock?: Clock` documented as "Injected PIC-12 timer seam (no ambient
`setTimeout`); defaults at the composition root." The drive function
destructures only `child`, `thetaAbort`, `calleePath`, and `emitDiagnostic`;
no code in the module reads `deps.clock`, and the drive loop contains no timer
of any kind (it settles on stdout lines and child exit). The production call
site and nine test files nevertheless construct and pass a clock into the deps
object. No "default at the composition root" exists because nothing consumes
the field.

## Evidence
src/runtime/subagent-json-driver.ts:121-122 — the declaration:

```ts
  /** Injected PIC-12 timer seam (no ambient `setTimeout`); defaults at the composition root. */
  readonly clock?: Clock;
```

src/runtime/subagent-json-driver.ts:134-135 — the only consumption of `deps`,
which omits `clock`:

```ts
export function driveSubagentChild(deps: SubagentDriveDeps): Promise<SubagentInvocationResult> {
  const { child, thetaAbort, calleePath, emitDiagnostic } = deps;
```

`grep -n "clock" src/runtime/subagent-json-driver.ts` yields exactly two hits:
the type import (line 30) and the field declaration (line 122). No other use.

src/extension/production-theta-producer.ts:2648-2654 — the production call site
pays for the field:

```ts
      const result: SubagentInvocationResult = await driveSubagentChild({
        child,
        thetaAbort,
        calleePath: theta.sourcePath ?? theta.slashName,
        emitDiagnostic,
        clock: root.clock,
      });
```

Test call sites passing `clock` into `driveSubagentChild` deps (search:
`clock` adjacent to each `driveSubagentChild({` call; 9 files):
tests/subagent-json-wire.test.ts:46, tests/subagent-child-real-spawn.test.ts:155,
tests/subagent-envelope-result-carriage.test.ts:1917,
tests/subagent-invoke-nonfinite-return-refusal.test.ts:391,
tests/subagent-invoke-inbound-enum-tag.test.ts:250,
tests/subagent-return-depth-refusal.test.ts:1277,
tests/subagent-root-binder-model-exempt.test.ts:444,
tests/subagent-theta-roots-forwarding.test.ts:360,
tests/subagent-wire-parse-failed-emitter.test.ts:165. The unit suite
tests/subagent-json-driver.test.ts passes no `clock` at all (0 hits for
`clock` in that file), and the drive works identically.

## Why this is a problem
Vestigial field: a declared dependency that no code path reads. Every caller
that supplies it (1 production site, 9 test files constructing `WallClock`
instances) is threading a collaborator into a function that ignores it, and the
doc comment asserts a seam ("defaults at the composition root") that does not
exist — there is no defaulting code because there is no read. The timer the
subagent path actually uses lives in `runSubagentChildTeardown`
(src/runtime/subagent-isolation.ts:230, `deps.clock.setTimeout`), a different
deps record; the drive-side copy carries no behavior.

## Suggested direction (non-binding, optional)
Drop the `clock` field from `SubagentDriveDeps` and the arguments at its call
sites, or wire it to an actual timer use if one is intended; the teardown deps
record already owns the injected-clock obligation for this path.

## False-positive check
- Identifier search in the module: `grep -n "clock" src/runtime/subagent-json-driver.ts` → 2 hits (import, declaration); the destructure at :135 omits it and no `deps.clock` / `deps["clock"]` access exists.
- Repo-wide consumer search: `grep -rn "driveSubagentChild|SubagentDriveDeps"` across src/, tests/, extensions/, tools/ — every call site inspected; the field is only ever written, never read back (the deps object is not retained or re-exported by the drive).
- String-keyed/dynamic access: searched `"clock"` in the module — no bracket access.
- Not test-only-reachable code: the inverse — production and tests both PASS the value; the production module itself never reads it, so the witness-caller rule does not apply (no reader exists anywhere).
- Git intent: the isolation module's teardown (`runSubagentChildTeardown`) consumes an injected clock for its bounded await; the drive-side field mirrors that shape but the drive has no timed operation.

## Triage
verdict: confirmed — re-verified: `clock` has exactly 2 hits in the driver (import :30, decl :122), `deps` is destructured at :135 without it and referenced nowhere else in the drive, `SubagentDriveDeps` is only ever constructed as inline literals (no holder can read it), `git log -S "deps.clock"` on the file shows no read ever existed since its RFC-0006 introduction, and the three drive tests that pass no clock behave identically — the prod site at :2655-2661 (7-line drift from the citation) and 15 test files (not 9) feed an inert field. (triage: claude-opus-5)
