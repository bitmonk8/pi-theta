---
id: PTQ-1467
title: session-control-callable-set.test.ts reimplements subagent-tool-admission.test.ts's pi-tool-name filter as piToolNamesOf
lens: D7
status: open
verdict: confirmed
locations:
  - tests/session-control-callable-set.test.ts:355-368
  - tests/subagent-tool-admission.test.ts:155-163
  - tests/helpers/production-load-harness.ts:51-68
sites: 2
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# session-control-callable-set.test.ts reimplements subagent-tool-admission.test.ts's pi-tool-name filter as piToolNamesOf

## Observation
`tests/session-control-callable-set.test.ts` declares a local helper `piToolNamesOf(fixture)` that (a) reaches into `fixture.callableSet.entries`, (b) filters entries whose `kind === "pi-tool"`, and (c) maps each surviving entry to `(entry.toolDefinition as { toolName?: string })?.toolName ?? ""`. `tests/subagent-tool-admission.test.ts` already declares a helper `piToolNames(snapshot)` performing the identical filter-and-map over a `CallableSetSnapshot`. The comment directly above `piToolNamesOf` states it "mirrors `tests/subagent-tool-admission.test.ts`'s local `piToolNames` helper" — the duplication is self-documented in the code, not inferred.

## Evidence
tests/session-control-callable-set.test.ts:349-368
```ts
/** The Pi-tool underlying names in a resolved snapshot (the `--tools`
 * allowlist inputs) — mirrors `tests/subagent-tool-admission.test.ts`'s local
 * `piToolNames` helper, the same technique this seam's private
 * `callableSetPiToolNames` cannot be imported to exercise directly. */
function piToolNamesOf(fixture: ThetaFixture): string[] {
  const snapshot = (fixture as unknown as { callableSet?: { entries: ReadonlyMap<string, { kind: string; toolDefinition?: unknown }> } }).callableSet;
  const names: string[] = [];
  for (const entry of snapshot?.entries.values() ?? []) {
    if (entry.kind === "pi-tool") {
      // Production stores PiToolDispatch with `toolName`, not `name`.
      names.push((entry.toolDefinition as { toolName?: string })?.toolName ?? "");
    }
  }
  return names;
}
```

tests/subagent-tool-admission.test.ts:154-163
```ts
/** The Pi-tool underlying names in a resolved snapshot (the `--tools` allowlist inputs). */
function piToolNames(snapshot: CallableSetSnapshot): string[] {
  const names: string[] = [];
  for (const entry of snapshot.entries.values()) {
    if (entry.kind === "pi-tool") {
      names.push((entry.toolDefinition as { toolName: string }).toolName);
    }
  }
  return names;
}
```

Both functions perform the exact same three steps (walk `entries.values()`, filter `kind === "pi-tool"`, read `toolDefinition.toolName`) over the same production-shaped `CallableSetSnapshot`. `session-control-callable-set.test.ts` additionally re-derives the fixture→snapshot lookup that `callableSetOf` (tests/helpers/production-load-harness.ts:51-68) already performs with a fail-loud precondition (`expect(fixture, ...).toBeDefined()`), instead of calling `callableSetOf(outcome, slashName)` and then applying a shared name-filter helper.

## Why this is a problem
Two test files independently hand-roll the same "extract pi-tool underlying names from a callable-set snapshot" step, one of them (`session-control-callable-set.test.ts`) also re-deriving the fixture-lookup logic that `callableSetOf` in `tests/helpers/production-load-harness.ts` already centralises with an explicit failure message naming the missing fixture. A change to the entry shape (e.g. `toolDefinition` renamed, or `kind` values changed) has to be found and updated in two independent, differently-typed copies instead of one.

## Suggested direction (non-binding, optional)
The natural shared home for a "pi-tool underlying names from a snapshot" filter is alongside `callableSetOf` in `tests/helpers/production-load-harness.ts`, since that module already owns the fixture→snapshot extraction step both call sites need.

## False-positive check
- Coverage-matrix / docs citation search: `tests/session-control-callable-set.test.ts` is cited by name in `docs/rfcs/0011-session-control-tools.md:793,909,916` and `docs/plan_topics/V24a-T-session-control-tests.md:15`; none of those citations name `piToolNamesOf` itself, and this finding does not propose merging, renaming, or deleting the test file — only its local helper's duplication of an existing pattern.
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `piToolNamesOf`/`piToolNames` are pure filters over already-captured data, not recording doubles asserting a MUST-NOT-call; not applicable.
- docs/bugs/ signature search: `grep -rn "piToolNames" docs/bugs` found no red-test-signature citation of this helper; this is not a documented correct-reason red.
- Confirmed both cited functions are byte-for-byte re-read immediately before filing (excerpts above).

## Triage
<!-- triage appends here -->
verdict: confirmed — both excerpts reproduce byte-for-byte at the cited lines (session-control-callable-set.test.ts:349-363 `piToolNamesOf`, subagent-tool-admission.test.ts:154-163 `piToolNames`, production-load-harness.ts:51-68 `callableSetOf`); both helpers are live (3 and 5 call sites respectively via grep), perform the identical walk/filter/`toolDefinition.toolName` map over a CallableSetSnapshot, and the in-code comment self-documents the mirroring; `piToolNamesOf` additionally re-derives the fixture→snapshot lookup that `callableSetOf` already exports from the harness the file already imports (line 31: runProductionLoad/plantThetaWorkspace/disposeWorkspace but not callableSetOf); D7 boilerplate-duplication class, both locations under tests/, no gate/recording-double/bugs-signature carve-out applies (`grep piToolNames docs/bugs` hits only bug 0218's production-side variable); not a duplicate — PTQ-0712 (resolved) explicitly excluded `piToolNamesOf` as "not the same function and is not counted here", and PTQ-1350/1355 cover runLoad and theta() respectively (triage: claude-fable-5-1)
