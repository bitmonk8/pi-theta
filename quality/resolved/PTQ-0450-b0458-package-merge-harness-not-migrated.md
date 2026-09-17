---
id: PTQ-0450
title: b0458 still hand-rolls the makeHarness/CapturedNote/Harness trio that tests/helpers/package-merge-e2e-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0458-package-theta-pi-owned-collision.test.ts:60-150
  - tests/helpers/package-merge-e2e-harness.ts:15-18
  - tests/helpers/package-merge-e2e-harness.ts:42-123
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0458 still hand-rolls the makeHarness/CapturedNote/Harness trio that tests/helpers/package-merge-e2e-harness.ts already exports

## Observation
tests/b0458-package-theta-pi-owned-collision.test.ts declares, module scope,
its own `CapturedNote` interface, `Harness` interface, and `makeHarness`
function — a recording `ExtensionAPI`/`ExtensionContext` pair that drives the
real `createThetaExtension(deps)(pi)` over `composeExtensionInstance` (with a
`FakeClock` and `FakeFileWatcher`) and captures every `theta-system-note`
diagnostic. tests/helpers/package-merge-e2e-harness.ts already exports the
identical `CapturedNote`/`Harness`/`makeHarness` trio, generalised so a
caller's own registered names surface via `source: "extension"`. That
helper's own header comment (lines 15-18) names b0458's copy directly as "a
fourth, structurally similar copy" and states its own scope excludes
migrating it. b0458 does not import this module; it redeclares the whole
harness locally, adding only a second `ownedCommands` constructor parameter
folded into `getCommands()`.

## Evidence
tests/helpers/package-merge-e2e-harness.ts:15-18 — the canonical helper's own
header naming b0458 as the unmigrated fourth copy:
```ts
// (tests/b0458-package-theta-pi-owned-collision.test.ts carries a fourth,
// structurally similar copy that also takes a second `ownedCommands`
// parameter and folds it into `getCommands()`; that shape is out of scope
// here and is left as-is.)
```

tests/helpers/package-merge-e2e-harness.ts:61-75 (of the exported
`makeHarness`, 61-123):
```ts
export function makeHarness(cwd: string): Harness {
  const commands = new Map<string, { description?: string }>();
  const registrations: string[] = [];
  const notes: CapturedNote[] = [];
  const subscriptions = new Map<string, ((event: unknown, ctx: ExtensionContext) => unknown)[]>();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: { description?: string }): void => {
      commands.set(name, options);
      registrations.push(name);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
```

tests/b0458-package-theta-pi-owned-collision.test.ts:75-91 — the local
redeclaration, structurally identical control flow (line-wrapped
differently; parameter list gains `ownedCommands`):
```ts
function makeHarness(
  cwd: string,
  ownedCommands: readonly { name: string; source: string }[],
): Harness {
  const commands = new Map<string, { description?: string }>();
  const registrations: string[] = [];
  const notes: CapturedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: { description?: string }): void => {
      commands.set(name, options);
```

Full-span diff (`diff -u` of package-merge-e2e-harness.ts:61-123 against
b0458:75-150, re-run immediately before filing): the only substantive
difference across the ~63-line span is (a) whitespace/line-wrap
reformatting of the same statements (`subscriptions` type annotation, the
`on` handler signature), (b) the added `ownedCommands` parameter, and (c)
`getCommands()` spreading `ownedCommands` ahead of the own-registration list
where the canonical version has no such spread. Every other statement —
`registerFlag`, `registerMessageRenderer`, `registerCommand` +
`registrations.push`, the `subscriptions` `on` wiring, `getFlag`,
the `sendMessage` structured-diagnostic extraction loop, `sendUserMessage`,
the `ctx` object literal, the `ThetaExtensionDeps`/`composeInstance` wiring
(`FakeFileWatcher` + `FakeClock`), `createThetaExtension(deps)(pi)`, and the
returned `{ commands, registrations, notes, fireSessionStart }` object — is
byte-for-byte identical. The `CapturedNote` interface
(`{ code, message, severity }`, each `readonly string`) and the `Harness`
interface (`{ commands, registrations, notes, fireSessionStart }`) are
byte-identical between tests/helpers/package-merge-e2e-harness.ts:42-54 and
tests/b0458-package-theta-pi-owned-collision.test.ts:52-65 (the `Harness`
member list matches exactly, differing only in the interface being
`export`ed in one file and not the other).

## Why this is a problem
This is the "Boilerplate duplication" class. The exact ~60-line harness
this file needs already exists, exported, one directory over, and its own
authoring comment names this file's copy specifically as a known,
unmigrated duplicate rather than an independent convergence — the
duplication is a traced, acknowledged gap, not a coincidence. The natural
shared home for this shape is tests/helpers/package-merge-e2e-harness.ts,
which already generalises the `commands`/`registrations`/`notes`/
`fireSessionStart` return shape for three sibling package-merge test files
and already documents the parameter this file additionally needs
(`ownedCommands`, to seed `getCommands()`).

## Suggested direction (non-binding, optional)
tests/helpers/package-merge-e2e-harness.ts already exports the
`CapturedNote`/`Harness`/`makeHarness` trio this file redeclares; a variant
(or an added optional parameter on the existing `makeHarness`) accepting the
extra `ownedCommands` seed sits naturally beside the helper's already-general
shape, mirroring how `byCode`/`byFragment` there already serve b0462's
filtering needs.

## False-positive check
- Gate-pin check: tests/b0458-package-theta-pi-owned-collision.test.ts does
  not match `*gate*.test.ts` or the named gate kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); the census/pin carve-out does not apply,
  and this finding touches no pinned count or inventory assertion — only
  where the harness is defined.
- Recording-double check: `notes`/`registrations` in both copies ARE
  recording doubles backing legitimate witnesses in b0458's own tests (e.g.
  asserting `harness.commands.has("solo")` is true and `.has("promptdup")`
  is false); this finding does not contest either double's role as a
  witness, only that the double's CONSTRUCTION code is duplicated rather
  than shared.
- docs/bugs/ signature search: docs/bugs/0458-package-theta-bypasses-pi-owned-collision-guard.md
  — Status fixed. `npx vitest run tests/b0458-package-theta-pi-owned-collision.test.ts`
  passes both tests at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0458-package-theta-pi-owned-collision"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl
  "b0458-package-theta-pi-owned-collision.test.ts" docs/bugs/*.md` (excluding
  its own doc) → 0 hits. This finding proposes no merge, rename, or deletion
  of any `it()`/`describe()` — only where the harness trio is defined.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; the harness is exercised by both of b0458's own tests
  (2/2 passing, confirmed above).
- Prior-finding overlap check: PTQ-0258 (resolved) created
  tests/helpers/package-merge-e2e-harness.ts to centralise this exact shape
  for b0462 (both files) and b0463, and its own header comment explicitly
  names b0458's copy as a fourth instance left unmigrated — this finding is
  that named, still-open gap, not a re-filing of PTQ-0258.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently reproduced: `diff -u -w` of tests/helpers/package-merge-e2e-harness.ts:61-123 against b0458:75-150 shows only the added `ownedCommands` parameter, its spread in `getCommands()`, and line-wrap reformatting (all other statements identical), and the `CapturedNote`/`Harness` interfaces at 42-54 vs 52-65 are byte-identical minus `export`; b0458 imports nothing from the helper (importers: b0462 x2, b0463 only); the helper's own header (lines 15-18) names b0458 as the unmigrated fourth copy "out of scope here", and resolved PTQ-0258 cited b0458 explicitly as "pattern context — not itself a location this finding asks to change", so this is the named residual (same shape as confirmed residual filings PTQ-0228/PTQ-0301), not a duplicate; docs/bugs/0458 is Status fixed, 2/2 cells pass at HEAD, coverage-matrix.md has 0 citations and only the bug's own doc names the file; the mutable `owned` array the second cell pushes into is read at `getCommands()` call time, so an optional seed parameter on the shared helper loses no load-bearing behaviour (triage: claude-fable-5-1)
