---
id: PTQ-1348
title: schema-brand-symbol-migration.test.ts's local rootDouble() and rootLive() both reimplement the canonical rootWith(checkpoint, invocationId, clock) export
lens: D7
status: open
verdict: confirmed
locations:
  - tests/schema-brand-symbol-migration.test.ts:220-225
  - tests/schema-brand-symbol-migration.test.ts:332-343
  - tests/helpers/fixture-dispatch-harness.ts:182-191
sites: 2
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# schema-brand-symbol-migration.test.ts's local rootDouble() and rootLive() both reimplement the canonical rootWith(checkpoint, invocationId, clock) export

## Observation
`tests/schema-brand-symbol-migration.test.ts` declares two module-scope
functions that each hand-build a `RuntimeRoot` object literal with a
`checkpoint` field and an `idSource` field whose `newInvocationId` returns
`"inv-1"` and whose `newToolCallId` returns `"tc-1"`. `tests/helpers/fixture-
dispatch-harness.ts` already exports `rootWith(checkpoint, invocationId =
"inv-1", clock?)`, which with no third argument returns exactly the first
shape, and with a `clock` argument returns exactly the second. The in-scope
file does not import `rootWith`.

## Evidence
`tests/schema-brand-symbol-migration.test.ts:220-225`:
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}
```

`tests/schema-brand-symbol-migration.test.ts:332-343`:
```ts
function rootLive(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/fixture-dispatch-harness.ts:182-191`:
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
The `checkpoint`/`idSource` fields `rootDouble()` and `rootLive()` build are
byte-identical to what `rootWith(NOOP_CHECKPOINT)` and `rootWith(NOOP_CHECKPOINT,
"inv-1", clock)` already produce (`rootLive`'s extra `schemaValidator` field
sits alongside, not inside, the reimplemented part).

## Why this is a problem
Two of the file's own root-builder functions restate the exact object literal
the imported-helpers directory already exports under one name, rather than
importing it once and supplying the two distinguishing arguments (a
checkpoint constant, and a clock). The file already imports other canonical
helpers from `./helpers/invoke-seam-scaffold` and
`./helpers/scripted-live-session-harness`, so the omission is not a lack of
awareness of the helpers directory generally — the specific `rootWith` export
is what is duplicated twice in one file. A change to the shared `idSource` id
values or to `rootWith`'s field shape must be applied to both local copies
independently.

## Suggested direction (non-binding, optional)
Importing `rootWith` from `tests/helpers/fixture-dispatch-harness.ts` and
calling `rootWith(NOOP_CHECKPOINT)` / `rootWith(NOOP_CHECKPOINT, "inv-1",
{ ...clock fields..., })` in place of the two local declarations is the shape
the existing export already offers.

## False-positive check
- Gate-pin check: `tests/schema-brand-symbol-migration.test.ts` is not a
  `*gate*.test.ts` file or named kin; the cited lines are fixture-double
  builders, not a pinned count or inventory assertion.
- Recording-double check: neither `rootDouble()` nor `rootLive()` records
  calls or backs a "never called" witness; both are static/behavioural
  doubles, not negative witnesses.
- docs/bugs/ signature search: `grep -rl "schema-brand-symbol-migration"
  docs/bugs/*.md` → 0 hits; no documented correct-reason-red cites this test
  file by name.
- coverage-matrix/bug-doc citation search: `grep -n
  "schema-brand-symbol-migration" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of the file or
  any `describe()`/`it()` — only that the two local root-builder functions
  could be replaced by the existing `rootWith` export.
- Prior-finding overlap check: `grep -rli "schema-brand-symbol-migration"
  quality/intake/*.md` shows PTQ-0572 (LiveSessionDouble not migrated to a
  canonical live-session helper) and PTQ-0603 (a NOOP_CHECKPOINT
  reimplementation claim, which the current import
  `SEAM_NOOP_CHECKPOINT as NOOP_CHECKPOINT` from `./helpers/invoke-seam-
  scaffold` suggests may already be resolved) — both name a different root
  cause (a different double / a different constant) than this file's two
  `rootWith`-shaped object-literal reimplementations, which neither existing
  filing's excerpts cite.
- Coverage-drift check: the claim is about a repeated function DEFINITION
  this file's own `it()` bodies already call via `producer()` /
  `createProductionProducerDeps({ root: rootDouble() })`; no claim that any
  evaluator path is untested.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: `rootDouble()` at tests/schema-brand-symbol-migration.test.ts:220-225 and `rootLive()` at :332-343 reproduce byte-exact, and their `checkpoint`/`idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" }` literals are field-for-field what `rootWith(checkpoint, invocationId = "inv-1", clock?)` at tests/helpers/fixture-dispatch-harness.ts:182-191 returns (rootLive's `clock` maps to the third arg; only `schemaValidator: ajv()` sits outside it); `grep -rln rootWith tests/` → 13 live importers incl. helpers/prompt-value-harness, runtime-belt-probe-harness, tool-call-dispatch-harness, while this file imports nothing from fixture-dispatch-harness; D7 copy-paste-fixture in tests/ with no carve-out (not a gate file, neither builder records calls, `grep -rl schema-brand-symbol-migration docs/bugs docs/reference/coverage-matrix.md` hits only bug docs 0020/0026/0067/0114/0120 that cite the file as a witness — no merge/rename/delete is proposed); not a duplicate: resolved PTQ-0572 (LiveSessionDouble/ajv/parseDeps bundle) and PTQ-0603 (NOOP_CHECKPOINT constant, which names rootDouble/rootLive only as consumers of that constant) have different root causes, and the same-wave siblings d7-02-rootdouble-reimplements-rootwith / d7-01-prompt-provider-field-rootdouble-reimplemented target pure-async-unification and prompt-provider-field-derivation; same class as accepted PTQ-0862/PTQ-1010 — mechanical import-and-call swap (triage: claude-fable-5-1)
