---
id: PTQ-0922
title: subagent-theta-roots-forwarding.test.ts hand-rolls a pi/ctx double instead of importing tests/helpers/watch-arming-harness.ts's makeHarness
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-theta-roots-forwarding.test.ts:147-161
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# subagent-theta-roots-forwarding.test.ts hand-rolls a pi/ctx double instead of importing tests/helpers/watch-arming-harness.ts's makeHarness

## Observation
Cell (D) of `subagent-theta-roots-forwarding.test.ts` calls
`discoverAndComposeFixtures(pi, ctx)` against a `pi`/`ctx` pair built inline,
field-by-field, rather than through `tests/helpers/watch-arming-harness.ts`'s
already-exported `makeHarness(cwd, flags)`, which builds the identical
`ExtensionAPI`/`ExtensionContext` shape (including a configurable
`getFlag`) and is already imported by other test files for exactly this
`session_start`/discovery composition shape.

## Evidence

tests/subagent-theta-roots-forwarding.test.ts:147-161:
```ts
    const pi = {
      getFlag: (name: string): string | undefined => (name === "theta" ? joined : undefined),
      getCommands: (): unknown[] => [],
      sendMessage: (): void => {},
      registerCommand: (): void => {},
      registerMessageRenderer: (): void => {},
      registerFlag: (): void => {},
      on: (): void => {},
    } as unknown as ExtensionAPI;
    const ctx = {
      cwd: workspace,
      hasUI: false,
      modelRegistry: { getAvailable: (): readonly unknown[] => [] },
      ui: { notify: (): void => {} },
    } as unknown as ExtensionContext;
```

tests/helpers/watch-arming-harness.ts:66-121 (`makeHarness`, exported) already
builds the same `pi`/`ctx` pair, with `getFlag` sourced from a caller-supplied
`flags` record (so `makeHarness(workspace, { theta: joined })` reproduces the
cell's single-key `getFlag` exactly) and the identical `ctx` literal:
```ts
export function makeHarness(
  cwd = "/does/not/matter",
  flags: Readonly<Record<string, string>> = {},
  options: { ... } = {},
): Harness {
  ...
  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, commandOptions: unknown): void => { ... },
    on: (event: string, handler: ...): void => { ... },
    getFlag: (name: string): string | undefined => flags[name],
    getCommands: (): { name: string; source: string }[] => [ ... ],
    sendMessage: options.sendMessage ?? ((): void => {}),
    ...
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
```
(full body at tests/helpers/watch-arming-harness.ts:66-121; the `ctx` literal
at :113-118 is byte-identical to the cell's `ctx` apart from the `cwd`
binding name.)

## Why this is a problem
Every field the cell's inline `pi` sets — `getFlag`, `getCommands`,
`sendMessage`, `registerCommand`, `registerMessageRenderer`, `registerFlag`,
`on` — is already produced by `makeHarness`, and the cell's `ctx` literal
(`cwd`, `hasUI: false`, `modelRegistry.getAvailable`, `ui.notify`) is
byte-identical to `makeHarness`'s own `ctx`. `makeHarness`'s `getFlag` is
already parameterised by a `flags` record precisely so a caller can pin one
flag's value — the cell's single-branch `getFlag` is exactly the
one-entry-`flags` case that parameter exists for. Nothing about
`discoverAndComposeFixtures`'s call shape needs a field `makeHarness` omits;
the reimplementation duplicates a fixture this file could obtain by import.

## Suggested direction (non-binding, optional)
`tests/helpers/watch-arming-harness.ts` already exports `makeHarness` for
exactly this `pi`/`ctx`/`session_start`-firing shape; noting that this cell's
inline pair could be `makeHarness(workspace, { theta: joined })` is an
observation about the existing convention, not a design proposal.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or the named kin;
  nothing cited here is a pinned count or inventory assertion.
- Recording-double check: neither the cell's `pi` nor `ctx` is a MUST-NOT
  witness — `sendMessage`/`registerCommand` are inert no-ops here, not
  call-count assertions.
- docs/bugs/ signature search: `grep -rn "subagent-theta-roots-forwarding" docs/bugs/`
  finds the file cited only in
  docs/bugs/0008-subagent-child-drops-all-but-last-theta-root.md's own witness
  list; this finding does not contest the file's red/green status or
  behaviour, only the duplicated fixture construction.
- coverage-matrix citation search: `grep -rn "subagent-theta-roots-forwarding" docs/reference/coverage-matrix.md`
  returns no hits; this finding proposes no merge, rename, or deletion.
- Coverage-drift check: the claim is about a fixture reimplemented in a file
  that exists and passes today, not about a missing test path.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (cell :147-161; watch-arming-harness.ts `makeHarness` :66-121 with `ctx` :113-118 identical to the cell's modulo the `cwd: workspace` binding, mktemp `diff`), the consumer `discoverAndComposeFixtures` → `runComposePass` (production-composition.ts:536-570, :674) only READS `pi.getCommands()`/`getFlag('theta')` and never calls `registerCommand`, so `makeHarness(workspace, { theta: joined })` is behaviourally equivalent (`getCommands` → `[]`, `getFlag` → `joined`/`undefined`; the extra `sendUserMessage` member is inert); location under tests/, D7 copy-paste-fixture class, not a *gate* file, `pi`/`ctx` are inert no-ops not MUST-NOT recording doubles, bug 0008 is **fixed (0.17.0)** so the cell is a green control (vitest `-t "reader side"` → 1 passed), stated docs/bugs (0008 witness list only, no merge/rename/delete proposed) and coverage-matrix (0 hits) searches reproduce; NOT a duplicate: no open/resolved issue cites this file for this root cause (grep quality/ → 0) — the byte-identical sibling literal in e2e-s6-description-registration.test.ts:59-73 is tracked separately by open PTQ-0892, matching the accepted per-file not-migrated pattern; fixer note: the repo's dedicated `discoverAndComposeFixtures` fake host is `tests/helpers/production-load-harness.ts#runProductionLoad(cwd, { thetaFlag })` (:60-76 — its `getFlag` is literally the cell's `name === "theta" ? … : undefined` shape, it returns `fixtures` with `slashName`, AND it interposes stderr, subsuming the cell's `stderrSpy` at :169-171), the canonical PTQ-0892 routes the sibling to; the candidate's `makeHarness` also covers the need, so the root cause holds under either canonical (triage: claude-fable-5-1)
