---
id: PTQ-1037
title: discovery-glob-universe-enumeration-failure.test.ts still carries its own RecordedNote/ShippedHarness/makeShippedHarness copy that PTQ-0632's fix centralised into tests/helpers/production-load-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/discovery-glob-universe-enumeration-failure.test.ts:911-1002
  - tests/helpers/production-load-harness.ts:233-332
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# discovery-glob-universe-enumeration-failure.test.ts still carries its own RecordedNote/ShippedHarness/makeShippedHarness copy that PTQ-0632's fix centralised into tests/helpers/production-load-harness.ts

## Observation
`tests/helpers/production-load-harness.ts` exports `RecordedNote`,
`ShippedHarness`, and `makeShippedHarness(cwd, availableModels?)` — a
recording `pi`/`ctx` double pair wired through `createThetaExtension` /
`composeExtensionInstance` that records registered commands, persistent
notes, and toast notifications, then exposes a `fireSessionStart` closure.
`tests/discovery-glob-universe-enumeration-failure.test.ts` declares its own
private `RecordedNote` interface, `ShippedHarness` interface, and
`makeShippedHarness` function at module scope, with a body that is the same
double-construction sequence (the `pi` double's `registerCommand`/`on`/
`getCommands`/`sendMessage`/`sendUserMessage` members, the `ctx` double's
`cwd`/`hasUI`/`modelRegistry`/`ui.notify` recorder, the `deps`/
`createThetaExtension(deps)(pi)` wiring, and the `fireSessionStart` loop over
`subscriptions.get("session_start")`) as the exported helper, differing only
in that the local copy fixes `availableModels` to `[]` inline (the exported
version's default parameter value) and omits the `pi` field from the
returned object. The file imports six other helpers from `./helpers/`
(`fake-file-system`, `fake-clock`, `fake-file-watcher`, `e2e-s1`,
`registry-oracle`) but never imports `./helpers/production-load-harness`.

## Evidence
`tests/helpers/production-load-harness.ts:233-256` (exported shape, re-read
immediately before filing):
```ts
export interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: { readonly diagnostics?: readonly Diagnostic[] } | undefined;
  readonly triggerTurn: unknown;
}

export interface ShippedHarness {
  readonly pi: ExtensionAPI;
  readonly commands: Map<string, unknown>;
  readonly notes: RecordedNote[];
  readonly notifications: string[];
  fireSessionStart(): Promise<void>;
}

/** Boot the real factory/composition with command, note and toast recorders. */
export function makeShippedHarness(
  cwd: string,
  availableModels: readonly unknown[] = [],
): ShippedHarness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const notifications: string[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();
```

`tests/discovery-glob-universe-enumeration-failure.test.ts:911-935` (the
redeclared shape):
```ts
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean;
  readonly details: { readonly diagnostics?: readonly Diagnostic[] } | undefined;
  readonly triggerTurn: unknown;
}

interface ShippedHarness {
  readonly commands: Map<string, unknown>;
  readonly notes: RecordedNote[];
  readonly notifications: string[];
  fireSessionStart(): Promise<void>;
}

function makeShippedHarness(cwd: string): ShippedHarness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const notifications: string[] = [];
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
```

Both bodies continue identically through the `on`/`getFlag`/`getCommands`/
`sendMessage`/`sendUserMessage` `pi`-double members, the `ctx` double's
`cwd`/`hasUI`/`modelRegistry.getAvailable`/`ui.notify` shape, the
`deps`/`createThetaExtension(deps)(pi)` wiring, and the
`fireSessionStart: async () => { for (const handler of
subscriptions.get("session_start") ?? []) { await handler(...) } }` closure
— the only differences being the helper's `availableModels` parameter
(defaulted to `[]`, matching the local copy's hard-coded `[]`) and the
helper's inclusion of `pi` on the returned object.

Search re-run immediately before filing: `grep -rl "makeShippedHarness\|ShippedHarness\b" tests/*.test.ts tests/helpers/*.ts` →
`tests/discovery-glob-universe-enumeration-failure.test.ts`,
`tests/load-phase-pre-eval-routing.test.ts`, `tests/load-warning-delivery.test.ts`
(both of which import `makeShippedHarness`/`RecordedNote` from
`./helpers/production-load-harness` at their line 5/11), and
`tests/helpers/production-load-harness.ts` itself — the discovery file is
the only one of the four that still declares the shape locally instead of
importing it.

## Why this is a problem
`quality/resolved/PTQ-0632-01-shipped-harness-duplicated-load-phase-pre-eval.md`
(status: fixed, confirmed) named this exact `RecordedNote`/`pi`-double/
`ctx`-double/`fireSessionStart` harness as duplicated between
`tests/load-phase-pre-eval-routing.test.ts` and
`tests/load-warning-delivery.test.ts`, and its fix centralised the shape into
`tests/helpers/production-load-harness.ts` — both of those files now import
`makeShippedHarness`/`RecordedNote` from that module rather than declaring
them. A third copy of the same declaration, in
`tests/discovery-glob-universe-enumeration-failure.test.ts`, was flagged at
the time (`qw20260918050411-d7-03-shippedharness-third-copy-glob-universe.md`,
ruled duplicate of the then-open PTQ-0632 with the explicit note "fold
tests/discovery-glob-universe-enumeration-failure.test.ts:1004-1095 into
PTQ-0632's location list at fix time") but the landed fix did not migrate
this file: it still declares its own `RecordedNote`, `ShippedHarness`, and
`makeShippedHarness` at module scope (now at :911-1002, shifted from the
prior :1004-1095) rather than importing the now-existing canonical helper.

## Suggested direction (non-binding, optional)
Importing `RecordedNote`, `ShippedHarness`, and `makeShippedHarness` from
`tests/helpers/production-load-harness.ts` — the same import
`tests/load-phase-pre-eval-routing.test.ts` and
`tests/load-warning-delivery.test.ts` already use — is the natural next step
for this file, since the helper's `availableModels` parameter already
defaults to the local copy's hard-coded `[]`.

## False-positive check
- Gate-pin check: `tests/discovery-glob-universe-enumeration-failure.test.ts`
  matches neither `*gate*.test.ts` nor the named gate kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); not
  applicable.
- Recording-double check: the `commands`/`notes`/`notifications` this double
  backs are read by a genuine assertion in the file's own "RED E1" test
  (`harness.commands.has("okctl")`, `harness.notifications` length,
  `harness.notes` diagnostic-shape checks) — this finding does not dispute
  any assertion built on the double, only that the double's definition is
  redeclared rather than imported; not a negative "never called" witness.
- docs/bugs/ signature search: `grep -rln "makeShippedHarness\|ShippedHarness" docs/bugs/*.md`
  → 0 hits; no open bug document cites either identifier or argues for
  keeping this copy unshared. `docs/bugs/0113-listtree-glob-universe-swallow-silent.md`
  cites this test file's cell E1 by behaviour, not by the harness
  declaration's line numbers, so migrating the declaration to an import
  does not touch that citation.
- coverage-matrix/bug-doc citation search: `grep -n "discovery-glob-universe-enumeration-failure" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` — only that the already-centralised harness
  declaration could be imported instead of redeclared.
- Coverage-drift check: the claim is about a repeated helper-function
  DEFINITION that a sibling fix already extracted, not a missing test path;
  the local copy is live and currently exercised by the file's own "RED E1"
  test.
- Prior-finding overlap check: `grep -rl "ShippedHarness" quality/issues quality/resolved quality/intake`
  → PTQ-0632 (resolved, fixed — the origin fix), PTQ-0894 (open — a disjoint
  `makeHelperCtx`/`GOOD_THETA`/`BAD_THETA` pair in
  `load-warning-delivery.test.ts`, not this harness), and
  `quality/TRIAGE_LOG.md:121` (the prior-wave duplicate ruling against this
  exact site while PTQ-0632 was still open). Since PTQ-0632 is now fixed and
  its resulting helper module exists but this site was never migrated to
  import it, this is a distinct "not migrated" observation rather than a
  re-litigation of the now-resolved duplication ruling.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts match verbatim at the cited lines (helper :233-332 exported `RecordedNote`/`ShippedHarness`/`makeShippedHarness(cwd, availableModels = [])`; test :911-1002 private redeclaration), and a mktemp whitespace-normalised diff of the two `makeShippedHarness` bodies shows only the `availableModels` parameter, `[]` vs `[...availableModels]`, a comment re-wrap and the omitted `pi` return field; repo-wide `makeShippedHarness\|ShippedHarness\b` → exactly the 4 files claimed, and the discovery file imports from 5 `./helpers/*` modules but not `production-load-harness` (24 other tests do); the local copy is live (cell E1 :1031-1064 reads `harness.commands/notifications/notes`; vitest 19/19 green); git shows the PTQ-0632 fix commit 52753dea touched this file only for the `ancestors`/`mergeDirs` migration and left the harness copy, despite TRIAGE_LOG:121 instructing it be folded in, and resolved PTQ-0632 cites this file 0 times — so the prior duplicate ruling's tracker is closed without covering this site; stated searches reproduce (docs/bugs → 0, coverage-matrix → 0, not a gate file, no it()/describe() merge/rename/delete); D7 copy-paste fixture/double class, all locations under tests/; not a duplicate — the candidate's overlap grep missed open PTQ-0918, but that tracks the mkdtemp/rmSync lifecycle in the two OTHER files, and PTQ-0894's `makeHelperCtx`/`GOOD_THETA`/`BAD_THETA` claim names this file only in its own false-positive check (triage: claude-fable-5-1)
