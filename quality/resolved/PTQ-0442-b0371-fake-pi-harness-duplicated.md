---
id: PTQ-0442
title: b0371's fake-pi harness (makeHarness/makeTheta/invoke/thetaNotes) is byte-identical to drain-gated-dispatch-integration.test.ts's, not imported
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0371-tripwire-trip-sites-wired.test.ts:61-232
  - tests/drain-gated-dispatch-integration.test.ts:35-183
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# b0371's fake-pi harness (makeHarness/makeTheta/invoke/thetaNotes) is byte-identical to drain-gated-dispatch-integration.test.ts's, not imported

## Observation
tests/b0371-tripwire-trip-sites-wired.test.ts declares its own `RecordedNote`/`RegisteredCommand`/`Harness` interfaces plus `makeHarness`, `makeTheta`, `invoke`, and `thetaNotes` functions. Over the shared span (`RecordedNote` through `thetaNotes`), this block is a byte-for-byte reproduction of the identical block in tests/drain-gated-dispatch-integration.test.ts, apart from one doc-comment sentence describing the copy chain. Neither file imports from the other or from a shared `tests/helpers/` module; both declare the full fake-`pi` (`registerCommand`/`sendMessage`/`on`/subscription-table) harness independently. b0371's own header comment states this outright: "the fake-pi harness (makeHarness/boot/invoke/thetaNotes) is copied from tests/drain-gated-dispatch-integration.test.ts (whose helpers are not exported)" — and drain-gated-dispatch-integration.test.ts's own header makes the identical claim one generation further back, about tests/watcher-hot-reload-integration.test.ts.

## Evidence
tests/b0371-tripwire-trip-sites-wired.test.ts:94-108 (re-read immediately before filing; `makeHarness`, first 15 lines):
```ts
function makeHarness(): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
```

tests/drain-gated-dispatch-integration.test.ts:67-81 (re-read immediately before filing; same function, same 15 lines):
```ts
function makeHarness(): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
```

Exact search: `diff <(sed -n '94,152p' tests/b0371-tripwire-trip-sites-wired.test.ts) <(sed -n '67,125p' tests/drain-gated-dispatch-integration.test.ts)` → no output (the full 59-line `makeHarness` bodies are byte-identical). `diff <(sed -n '159,169p' tests/b0371-tripwire-trip-sites-wired.test.ts) <(sed -n '132,142p' tests/drain-gated-dispatch-integration.test.ts)` (`makeTheta`) → no output. `diff <(sed -n '220,227p' tests/b0371-tripwire-trip-sites-wired.test.ts) <(sed -n '171,178p' tests/drain-gated-dispatch-integration.test.ts)` (`invoke`) → no output. `diff <(sed -n '229,232p' tests/b0371-tripwire-trip-sites-wired.test.ts) <(sed -n '180,183p' tests/drain-gated-dispatch-integration.test.ts)` (`thetaNotes`) → no output. `diff <(sed -n '61,93p' tests/b0371-tripwire-trip-sites-wired.test.ts) <(sed -n '35,59p' tests/drain-gated-dispatch-integration.test.ts)` (the `RecordedNote`/`RegisteredCommand`/`Harness` interfaces) → the only difference is an 8-line doc comment on the `makeHarness` function in b0371 that is absent in drain-gated-dispatch-integration.test.ts, describing the copy chain; the interfaces themselves are identical.

`grep -n "^function makeHarness(): Harness {" tests/*.test.ts` → 6 hits total (`tests/b0371-tripwire-trip-sites-wired.test.ts:94`, `tests/b0376-teardown-call-label-set-underenumerates.test.ts:85`, `tests/b0451-factory-lifecycle-notes-fallback-chain.test.ts:113`, `tests/drain-gated-dispatch-integration.test.ts:67`, `tests/e2e-s6-session-shutdown-real-teardown.test.ts:52`, `tests/session-shutdown-wiring.test.ts:53`); the four sites outside b0371/drain-gated-dispatch-integration diverge in the `on`/`sendMessage` signatures and field sets (confirmed by direct diff, not reproduced here as this finding is scoped to the exact byte-identical pair). No `tests/helpers/` module currently exports this `makeHarness`/`Harness`/`makeTheta`/`invoke`/`thetaNotes` bundle; `ls tests/helpers/` lists no file matching `harness`/`factory`/`pi` whose contents overlap this shape.

## Why this is a problem
The same ~150-line fake-`pi` extension-registration harness — the `Harness` interface, `makeHarness` (fake `registerCommand`/`sendMessage`/`on`/subscription table), `makeTheta`, `invoke`, and `thetaNotes` — is retyped from scratch in b0371 rather than imported, even though b0371's own doc comment names the exact file (tests/drain-gated-dispatch-integration.test.ts) it was copied from and states that file's helpers "are not exported." Both files independently document that they are continuing a copy chain (b0371 copied from drain-gated-dispatch-integration, which itself documents copying from watcher-hot-reload-integration) rather than sharing one definition, so a change to the fake-`pi` API surface (a new method `createThetaExtension`'s registration path calls, a changed `RecordedNote` field) applied to one copy has no mechanism to reach the other.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting this `Harness`/`makeHarness`/`makeTheta`/`invoke`/`thetaNotes` bundle (parameterised on the one thing that varies between the two callers here — the `ThetaExtensionDeps` passed to `createThetaExtension`, e.g. b0371's added `terminator` field) is the natural home the two files' own doc comments already point at by name.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin; the cited functions are harness plumbing, not a pinned count or inventory assertion.
- Recording-double check: `notes`/`commands`/`subscriptions` are ordinary capture arrays feeding the harness's own dispatch, not a `MUST-NOT-called` negative witness; this finding is about the surrounding harness-definition duplication, not about weakening any recording assertion built over it.
- docs/bugs/ signature search: docs/bugs/0371-tripwire-trip-sites-unwired.md exists (cited by b0371's own header); `npx vitest run tests/b0371-tripwire-trip-sites-wired.test.ts tests/drain-gated-dispatch-integration.test.ts` → 6 test files not run together in that invocation, but each passes individually (b0371: 3/3, drain-gated-dispatch-integration: passing per the full-suite run below) — not a documented correct-reason red.
- Full-scope run: `npx vitest run` over all six reviewed files → 6 files / 100 tests passed, confirming this finding is not obscuring a red test.
- coverage-matrix/bug-doc citation search: `grep -n "b0371-tripwire-trip-sites-wired\|drain-gated-dispatch-integration" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` — only that the shared harness bundle could be imported from one place — so no citation is affected.
- Coverage-drift check: this finding is about a repeated harness-definition, not a missing test path; every line in both files is exercised by passing tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all five stated diffs reproduce (makeHarness b0371:94-152 vs drain-gated:67-125, makeTheta, invoke, thetaNotes byte-identical; interface span differs only by b0371's 8-line copy-chain doc comment), neither file imports the other (each imports only ./helpers/fake-clock), the three tests/helpers modules exporting a makeHarness (watch-arming: Harness exposes only pi+fireSessionStart with no notes/commands capture; package-merge-e2e and cross-format-collision take cwd and wire real composition) do not cover this composeInstance-stub fake-pi bundle, `grep "^function makeHarness(): Harness {" tests/*.test.ts` → 6 hits as stated, coverage-matrix grep → 0 hits, and no tracked PTQ cites either file (PTQ-0363 is scoped to b0310/b0339) — a D7 copy-paste double whose fix is a mechanical extraction (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
