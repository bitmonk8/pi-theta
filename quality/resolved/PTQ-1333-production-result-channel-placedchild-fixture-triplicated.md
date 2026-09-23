---
id: PTQ-1333
title: production-result-channel.test.ts reimplements the PlacedChild fixture inline three times instead of the canonical placedWithoutExit() helper
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/production-result-channel.test.ts:70-75
  - tests/production-result-channel.test.ts:285-289
  - tests/production-result-channel.test.ts:307-311
  - tests/helpers/result-channel-harness.ts:112-121
sites: 3
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# production-result-channel.test.ts reimplements the PlacedChild fixture inline three times instead of the canonical placedWithoutExit() helper

## Observation
tests/production-result-channel.test.ts constructs an inline `PlacedChild` object literal with the identical `{ handle, capabilities: { observesExit: false, ... }, onExit: () => {}, kill: () => {} }` shape at three separate call sites in the file. tests/helpers/result-channel-harness.ts already exports `placedWithoutExit()`, a fixture of exactly this shape, whose file header states it was "Extracted from tests/subagent-result-channel.test.ts when the bug-0484 witnesses arrived (two files, one harness — quality lens D7)". tests/subagent-result-channel.test.ts imports and uses `placedWithoutExit()` at eight call sites. production-result-channel.test.ts does not import `result-channel-harness.ts` at all and does not use `placedWithoutExit()`.

## Evidence

tests/production-result-channel.test.ts:70-75:
```ts
    const placed: PlacedChild = {
      handle: "h",
      capabilities: { observesExit: false, inheritsEnv: true, visible: true },
      onExit: (): void => {},
      kill: (): void => {},
    };
```

tests/production-result-channel.test.ts:285-289:
```ts
    const placed: PlacedChild = {
      handle: "pane",
      capabilities: { observesExit: false, inheritsEnv: false, visible: true },
      onExit: (): void => {},
      kill: (): void => {},
    };
```

tests/production-result-channel.test.ts:307-311:
```ts
    const child = wire.adapt({
      handle: "h",
      capabilities: { observesExit: false, inheritsEnv: true, visible: true },
      onExit: (): void => {},
      kill: (): void => {},
    });
```

tests/helpers/result-channel-harness.ts:112-121 (the canonical helper):
```ts
/** A placed child whose backend cannot observe exit, with a kill counter. */
export function placedWithoutExit(): PlacedChild & { killed: number } {
  const placed = {
    handle: "pane-7",
    capabilities: { observesExit: false, inheritsEnv: true, visible: true },
    killed: 0,
    onExit: (): void => {},
    kill: (): void => {
      placed.killed += 1;
    },
  };
  return placed;
}
```

Confirming the sibling migration (search: `grep -n "placedWithoutExit" tests/subagent-result-channel.test.ts`, 8 hits at lines 322, 347, 364, 392, 411, 449, 602 plus the import at line 39).

## Why this is a problem
All three occurrences share the field `capabilities: { observesExit: false, ... }` and the two no-op methods `onExit`/`kill` — exactly the fixture the helper file's own header names as extracted "so two files [would use] one harness." A reader of tests/subagent-result-channel.test.ts would reasonably assume every RFC-0012 §3 result-channel test in the tree draws its placed-child double from that one extraction; production-result-channel.test.ts's three inline copies are the same double re-typed by hand, diverging only in the incidental `handle` string and `inheritsEnv` flag.

## Suggested direction (non-binding, optional)
tests/helpers/result-channel-harness.ts is the observed natural home for this fixture; the three inline literals in production-result-channel.test.ts read as copies of `placedWithoutExit()` rather than an independent double.

## False-positive check
- Gate-pin check: filename does not match `*gate*` or the named gate patterns; not applicable.
- Recording-double check: this is a plain no-op double with fixed `onExit`/`kill` behaviour, not a call-recording negative witness; the "never called" carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "production-result-channel" docs/bugs/` finds one hit, docs/bugs/0484-synthesised-exit-abandons-live-child-without-kill.md:24, which names "the 120 s default-budget cell in tests/production-result-channel.test.ts" (the third site, line 307-311) as a witness by description, not by exact test name; this finding does not propose renaming, merging, or deleting that test, only its inline fixture, so the citation is unaffected.
- coverage-matrix.md citation search: `grep -rn "production-result-channel" docs/reference/coverage-matrix.md` returned no hits.
- This finding does not claim a coverage gap; all three sites already exist and are exercised by their respective tests.

## Triage
verdict: confirmed — all three inline PlacedChild literals match at tests/production-result-channel.test.ts:70-75, 285-289, 307-311 and the canonical exported `placedWithoutExit()` matches at tests/helpers/result-channel-harness.ts:112-121 (header confirms the "two files, one harness" D7 extraction); the sibling migration reproduces (`grep -n placedWithoutExit tests/subagent-result-channel.test.ts` → import :39 + 7 call sites); production-result-channel.test.ts imports nothing from result-channel-harness.ts; the extraction commit 0b0deb06 touched this file (4 lines) yet left the three literals in place; the only capability the adapter reads is `observesExit` (src/runtime/subagent-result-channel.ts:336), so the `handle`/`inheritsEnv` divergence is incidental as claimed; carve-outs verified — not a gate file, a no-op not a recording double, docs/bugs/0484:24 cites the 120 s cell by description only and no rename/merge/delete is proposed, no coverage-matrix hit; not tracked elsewhere (PTQ-0513 is the fakeHost/AVAILABLE_MODEL pair, PTQ-0570 is resolvingHost, PTQ-0965 is ActiveInvocationEntry) (triage: claude-fable-5-1)
