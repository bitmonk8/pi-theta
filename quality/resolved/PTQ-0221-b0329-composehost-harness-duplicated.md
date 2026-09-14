---
id: PTQ-0221
title: b0329 redeclares the ExtensionAPI/ExtensionContext composition-root recording double that tests/helpers/compose-workspace-harness.ts already exports as HostDouble/makeHost
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0329-hash-mismatch-refuses-invocation.test.ts:85-126
  - tests/helpers/compose-workspace-harness.ts:21-77
  - tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:242-303
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0329 redeclares the ExtensionAPI/ExtensionContext composition-root recording double that tests/helpers/compose-workspace-harness.ts already exports as HostDouble/makeHost

## Observation
tests/b0329-hash-mismatch-refuses-invocation.test.ts declares its own
module-scope `ComposeHost` interface and `makeComposeHost(cwd)` function: a
fake `ExtensionAPI`/`ExtensionContext` pair for driving
`composeExtensionInstance`. Its `pi` double stubs the same twelve members as
the `HostDouble`/`makeHost` pair `tests/helpers/compose-workspace-harness.ts`
already exports for exactly this purpose — a module whose own header names it
the fix for a prior, identically-shaped duplication (PTQ-0213) — eleven of
the twelve in the identical relative order, with only one relocated. b0329's
own comment states the double "mirrors the callee-tools sibling's makeHost"
(`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`),
and that sibling's own `HostDouble`/`makeHost` is itself one of the nine
still-unmigrated, byte-identical copies of the canonical helper's export — so
b0329 copied a copy under new names rather than importing the shared
original.

## Evidence

`tests/b0329-hash-mismatch-refuses-invocation.test.ts:85-98`:
```ts
// ── Compose host double (mirrors the callee-tools sibling's makeHost) ─────────

interface ComposeHost {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  /** Every `pi.sendMessage` note the pass delivered (the channel arm). */
  readonly notes: string[];
  /** Every `ctx.ui.notify` toast (the off-channel fallback arm). */
  readonly notified: string[];
}

function makeComposeHost(cwd: string): ComposeHost {
  const notes: string[] = [];
  const notified: string[] = [];
```

`tests/b0329-hash-mismatch-refuses-invocation.test.ts:99-113` — the `pi`
double, twelve members:
```ts
  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (): void => {},
    registerCommand: (): void => {},
    sendMessage: (message: { content: string }): void => {
      notes.push(message.content);
    },
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
```

`tests/b0329-hash-mismatch-refuses-invocation.test.ts:114-126` — the closing
cast, `ctx`, and return:
```ts
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string): void => {
        notified.push(message);
      },
    },
  } as unknown as ExtensionContext;
  return { pi, ctx, notes, notified };
}
```

`tests/helpers/compose-workspace-harness.ts:21-34` — the canonical
`HostDouble`, one field wider (a structured `RecordedNote`/`[message, type]`
pair where b0329 keeps a plain `string`):
```ts
export type PiHandler = (event: unknown, ctx: ExtensionContext) => unknown;

export interface RecordedNote {
  readonly customType: string;
  readonly content: string;
  readonly details: unknown;
}

export interface HostDouble {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly notes: RecordedNote[];
  readonly notified: Array<readonly [string, string]>;
}
```

`tests/helpers/compose-workspace-harness.ts:36-48` — the canonical
`makeHost`, function open and the first four `pi` members, identical to
b0329's `registerFlag`/`getFlag`/`getCommands`/`on`, in the same order:
```ts
/** A recording `ExtensionAPI` / `ExtensionContext` pair for `composeExtensionInstance`. */
export function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();

  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
    getCommands: (): readonly { name: string; source: string }[] => [],
    on: (event: string, handler: PiHandler): void => {
      handlers.set(event, handler);
    },
```

`tests/helpers/compose-workspace-harness.ts:49-63` — the remaining eight `pi`
members: `registerCommand`/`sendUserMessage`/`registerTool`/
`setActiveTools`/`getActiveTools`/`getAllTools`/`registerMessageRenderer`
recur in the identical order as b0329's copy; only `sendMessage`'s position
differs (last here, sixth in b0329):
```ts
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
    sendMessage: (message: { customType: string; content: string; details: unknown }): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        details: message.details,
      });
    },
  } as unknown as ExtensionAPI;
```

`tests/helpers/compose-workspace-harness.ts:65-77` — the `ctx` double and
return, matching b0329's field-for-field (`cwd`, `hasUI: false`,
`modelRegistry.getAvailable`, `ui.notify`):
```ts
  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: {
      notify: (message: string, type: "error"): void => {
        notified.push([message, type]);
      },
    },
  } as unknown as ExtensionContext;

  return { pi, ctx, notes, notified };
}
```

`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts:252-266`
— the file b0329's own comment names as its model, carrying the full,
unsimplified `HostDouble`/`makeHost` byte-identical to the canonical helper
(confirming b0329 copied a copy, not the shared original):
```ts
interface HostDouble {
  readonly pi: ExtensionAPI;
  readonly ctx: ExtensionContext;
  readonly notes: RecordedNote[];
  readonly notified: Array<readonly [string, string]>;
}

function makeHost(cwd: string): HostDouble {
  const notes: RecordedNote[] = [];
  const notified: Array<readonly [string, string]> = [];
  const handlers = new Map<string, PiHandler>();

  const pi = {
    registerFlag: (): void => {},
    getFlag: (): undefined => undefined,
```

Pattern-wide search: `grep -rl "^function makeHost(cwd: string): HostDouble {"
tests --include="*.test.ts"` returns exactly the nine files PTQ-0213 already
counted as unmigrated
(`tests/b0268-load-note-path-spelling-single-convention.test.ts`,
`tests/b0280-prompt-mode-declaration-below-immediate-callee.test.ts`,
`tests/b0320-tools-entry-extension-rule-unenforced.test.ts`,
`tests/callee-post-parse-errors-un-register-tools-caller.test.ts`,
`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`,
`tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts`,
`tests/lex-drop-single-delivery.test.ts`,
`tests/shared-subtree-judged-once-per-pass-not-once-per-path.test.ts`,
`tests/thetalib-reparse-walk-single-delivery.test.ts`); a second search,
`grep -rn "interface ComposeHost\|function makeComposeHost" tests
--include="*.test.ts"`, returns exactly the two b0329 hits quoted above and
no others — b0329 is the sole file using this renamed, narrowed variant, not
yet counted by the earlier fix's grep because it does not use the literal
name `HostDouble`/`makeHost`.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class. `tests/helpers/compose-workspace-harness.ts`
is the canonical module for exactly this double — its own header states
"Several test files independently redeclared the same `PiHandler` type,
`RecordedNote` / `HostDouble` interfaces, `makeHost` function... This module
centralises the parts that are byte-for-byte identical across those files" —
created in direct response to the now-fixed PTQ-0213, which found the
identical `HostDouble`/`makeHost` pair duplicated across ten files and
migrated exactly one of the ten
(`tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts`) to import
it. b0329 reimplements the same double under new local names
(`ComposeHost`/`makeComposeHost`) instead of importing `HostDouble`/
`makeHost`: all twelve `pi` members are the same identifiers as the
canonical export (eleven in the identical relative order, with only
`sendMessage` relocated from sixth position to last), and all four `ctx`
members match too, differing only in the recording-array element type
(`string` in b0329 versus a structured `RecordedNote`/`[string, string]`
tuple in the canonical helper) — a difference b0329's own assertions never
need, since every `notes`/`notified` check in the file inspects string
content only. b0329's own comment states it modelled the double on
`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`,
and that file's copy is itself one of the nine PTQ-0213 already counted as
unmigrated — so the duplication reached b0329 by copying a copy of the exact
shape the shared module exists to replace, rather than by drawing on the
original.

## Suggested direction (non-binding, optional)
tests/helpers/compose-workspace-harness.ts already exports `HostDouble` and
`makeHost` for a `composeExtensionInstance` caller with this exact member
set; it is the existing, demonstrated home (one sibling file already imports
from it) for the pair b0329 currently declares locally under new names.

## False-positive check
- Gate-pin check: `tests/b0329-hash-mismatch-refuses-invocation.test.ts` does
  not match `*gate*.test.ts` or the named gate kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); neither cited function is a pinned count
  or corpus inventory assertion.
- Recording-double check: `ComposeHost`'s `notes`/`notified` arrays back
  genuine MUST-NOT-witness assertions elsewhere in this same file (e.g. cell
  C's `expect(outcome.notes.filter((note) => note.includes("content hash
  mismatch"))).toEqual([])`), which is a legitimate negative-witness use this
  finding does not dispute. The claim here is narrower and distinct: the
  double's own DEFINITION is redeclared under new names rather than
  imported — not that any assertion built on it is vacuous.
- docs/bugs/ signature search: docs/bugs/0329-hash-mismatch-refusal-does-not-refuse-invocation.md
  — Status "fixed (0.322.0)"; `npx vitest run
  tests/b0329-hash-mismatch-refuses-invocation.test.ts` passes 5/5 at HEAD,
  so this is not a documented correct-reason red, and the bug document's
  text offers no rationale for keeping this harness un-shared.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0329-hash-mismatch-refuses-invocation" docs/reference/coverage-matrix.md`
  → 0 hits; `grep -rl "b0329-hash-mismatch-refuses-invocation" docs/` → only
  its own bug document (a self-citation, not a witness-list citation by
  another document). This finding proposes no merge, rename, or deletion of
  the file or any `it()`/`describe()` — only that `ComposeHost`/
  `makeComposeHost` could be imported rather than redeclared under new
  names — so no citation is affected.
- Overlap check against already-filed/resolved/pending topics: PTQ-0213
  (resolved, "fixed") cites only `tests/b0275-escaping-tools-entry-below-immediate-callee.test.ts`
  and `tests/grandchild-callee-drop-un-registers-depth-two-caller.test.ts` as
  locations, migrating the former; it does not cite b0329 (which post-dates
  it) or `tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`'s
  still-unmigrated copy. This wave's other pending D7 candidates
  (`qw20260912091742-d7-01-b0282-loadrow-harness-duplicated.md`,
  `qw20260912091742-d7-02-b0275-load-pass-diagnostic-harness-duplicated.md`,
  the corpus-discovery and b0273 candidates) each cite a disjoint helper
  module and disjoint file set; none names
  `tests/helpers/compose-workspace-harness.ts`'s `HostDouble`/`makeHost` pair
  or b0329. The two recent triage rejections in this same lens
  (`parsedeps-reimplemented-not-imported`, `dispatch-harness-scaffolding-duplicated`)
  concern different functions (`parseDeps`/`parseOnly`, and `rootDouble`/
  `noopPi`/`driveCtx` from a different helper, `call-with-clause-harness.ts`)
  recurring at much larger prevalence (79 and 107/186 files respectively);
  the pattern this finding cites recurs in the bounded ten-file set already
  established by the confirmed PTQ-0213, plus this one additional,
  differently-named instance the earlier fix's literal-name search could not
  have caught.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every member of `ComposeHost`/`makeComposeHost` is
  exercised by the tests in `tests/b0329-hash-mismatch-refuses-invocation.test.ts`
  itself (5/5 passing, confirmed above).

## Triage
verdict: confirmed — b0329's ComposeHost/makeComposeHost redeclares 11 of 12 identically-ordered ExtensionAPI/ExtensionContext double members that tests/helpers/compose-workspace-harness.ts already exports as HostDouble/makeHost (built for PTQ-0213, imported by only one sibling); every excerpt, line range, and search (9-file makeHost grep, notes/notified usage, docs/bugs status, coverage-matrix 0-hit) reproduces exactly, and the narrower recording-array typing is not a functional blocker since b0329's own assertions read string content only (triage: claude-opus-5)
