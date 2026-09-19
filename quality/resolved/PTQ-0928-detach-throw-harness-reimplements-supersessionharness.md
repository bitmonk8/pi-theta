---
id: PTQ-0928
title: supersession-detach-throw-containment.test.ts redeclares Harness/makeHarness instead of importing tests/helpers/watch-arming-harness.ts's SupersessionHarness/makeSupersessionHarness
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/supersession-detach-throw-containment.test.ts:262-324
  - tests/supersession-inflight-rebuild-quiesce.test.ts:529-540
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# supersession-detach-throw-containment.test.ts redeclares Harness/makeHarness instead of importing tests/helpers/watch-arming-harness.ts's SupersessionHarness/makeSupersessionHarness

## Observation
`supersession-detach-throw-containment.test.ts` declares a module-local
`Harness` interface and `makeHarness` function that build a `pi`/`ctx`
double recording registered command names and `theta-system-note` content,
then fire `session_start` — the exact shape
`tests/helpers/watch-arming-harness.ts` already exports as
`SupersessionHarness`/`makeSupersessionHarness` (itself composed over the
same module's base `makeHarness`), and which
`tests/rebind-self-collision-reownership.test.ts` already imports by that
name for the same bug-witness-suite family.

## Evidence

tests/supersession-detach-throw-containment.test.ts:262-324:
```ts
interface RecordedNote {
  readonly customType: string;
  readonly content: string;
}

interface Harness {
  readonly pi: ExtensionAPI;
  readonly commands: Map<string, unknown>;
  /** The SEQUENCE of `pi.registerCommand` names, in call order. */
  readonly registeredNames: string[];
  readonly notes: RecordedNote[];
  fireSessionStart(): Promise<void>;
}

function makeHarness(cwd: string): Harness {
  const commands = new Map<string, unknown>();
  const registeredNames: string[] = [];
  const notes: RecordedNote[] = [];
  const subscriptions = new Map<
    string,
    ((event: unknown, ctx: ExtensionContext) => unknown)[]
  >();

  const pi = {
    registerFlag: (): void => {},
    registerMessageRenderer: (): void => {},
    registerCommand: (name: string, options: unknown): void => {
      registeredNames.push(name);
      commands.set(name, options);
    },
    on: (event: string, handler: (e: unknown, c: ExtensionContext) => unknown): void => {
      const list = subscriptions.get(event) ?? [];
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
    sendMessage: (message: { customType: string; content: string }): void => {
      notes.push({ customType: message.customType, content: message.content });
    },
    sendUserMessage: (): void => {},
  } as unknown as ExtensionAPI;

  const ctx = {
    cwd,
    hasUI: false,
    modelRegistry: { getAvailable: (): readonly unknown[] => [] },
    ui: { notify: (): void => {} },
  } as unknown as ExtensionContext;
  ...
```

tests/helpers/watch-arming-harness.ts:329-368 (`SupersessionHarness`,
`makeSupersessionHarness`, already exported and already imported by
`tests/rebind-self-collision-reownership.test.ts:109`) is composed over the
same module's base `makeHarness` and produces the identical
`pi`/`registeredNames`/`notes{customType,content}`/`fireSessionStart` surface
the local copy hand-builds:
```ts
export interface SupersessionHarness extends Omit<Harness, "fireSessionShutdown"> {
  readonly registeredNames: string[];
  readonly notes: SupersessionNote[];
  readonly userMessages: unknown[][];
  readonly extraCommands: { readonly name: string; readonly source: string }[];
  fireSessionShutdown(): Promise<void>;
}

export function makeSupersessionHarness(cwd: string, recordUserMessages = false): SupersessionHarness {
  const registeredNames: string[] = [];
  const notes: SupersessionNote[] = [];
  ...
  const harness = makeHarness(cwd, {}, {
    extraCommands,
    onRegisterCommand: (name): void => {
      registeredNames.push(name);
    },
    sendMessage: (message, options): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        triggerTurn: options.triggerTurn,
      });
    },
    sendUserMessage: (...args: unknown[]): void => {
      if (recordUserMessages) userMessages.push(args);
    },
  });
```

tests/supersession-inflight-rebuild-quiesce.test.ts:529-540 independently
redeclares the same `Harness`/`makeHarness` pair a second time (with its own
`registrations`/`noteSender` additions layered on the same `pi`/`ctx`
skeleton), confirming the shape recurs rather than being a one-off:
```ts
interface Harness {
  readonly pi: ExtensionAPI;
  readonly noteSender: SystemNoteSender;
  readonly commands: Map<string, unknown>;
  readonly registrations: Registration[];
  readonly notes: RecordedNote[];
  fireSessionStart(): Promise<void>;
}

function makeHarness(cwd: string, activePass: { label: string }): Harness {
```

## Why this is a problem
`registerFlag`, `registerMessageRenderer`, `registerCommand` (registration
recorded), `on` (subscription bookkeeping), `getFlag` (constant `undefined`
— the zero-flags case `makeHarness`'s `flags` parameter already defaults to),
`getCommands`, `sendUserMessage`, and the `ctx` literal
(`cwd`/`hasUI: false`/`modelRegistry.getAvailable`/`ui.notify`) are all
reproduced field-for-field from the canonical `makeHarness`; the only
difference is that the canonical `sendMessage`/`onRegisterCommand` are
parameterised through `options` while the local copy inlines the same two
recording bodies directly. `SupersessionHarness`/`makeSupersessionHarness`
already assembles exactly this `registeredNames`+`notes{customType,content}`
combination from those parameters and is proven in production use by
`tests/rebind-self-collision-reownership.test.ts:109`, so the local
`Harness`/`makeHarness` pair duplicates a fixture with a canonical home
rather than needing a shape the canonical helper cannot produce.

## Suggested direction (non-binding, optional)
`tests/helpers/watch-arming-harness.ts`'s `SupersessionHarness`/
`makeSupersessionHarness` is the existing home for this `pi`/`ctx`/
`registeredNames`/`notes`/`fireSessionStart` combination, proven by its use
in `tests/rebind-self-collision-reownership.test.ts`; noting that neither
bug-0029 witness file reaches for it is an observation about the existing
convention, not a design proposal.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin;
  nothing cited here is a pinned count or inventory assertion.
- Recording-double check: `registeredNames`/`notes` back MUST-NOT/must-witness
  observations elsewhere in each file (e.g. "no superseded-generation
  `pi.registerCommand` calls"), but this finding targets the duplicated
  fixture-construction CODE, not any single witness built on it.
- docs/bugs/ signature search: both files are documented correct-reason
  witness suites for docs/bugs/0029-throwing-supersession-detach-swallowed-watcher-rearmed.md
  and docs/bugs/0034-supersession-does-not-await-whenidle.md; this finding
  does not contest either file's red/green status or behaviour, only the
  harness fixture both hand-build independently of either bug's resolution.
- coverage-matrix/bug-doc citation search:
  `grep -rn "supersession-detach-throw-containment\|supersession-inflight-rebuild-quiesce" docs/reference/coverage-matrix.md docs/bugs/`
  returns no coverage-matrix hits; each file is its own bug doc's witness
  suite by filename convention, not by an explicit witness-list citation.
  This finding proposes no merge, rename, or deletion of either file.
- Not a re-file of PTQ-0715 (open, same file pair): that finding's cited
  symbols are `RecordingFakeClock`/`watcherAt`/`wiringAt`/`registryKeys`/
  `structuralNotes`/`sleep` — none of which include `Harness`/`makeHarness`,
  the distinct root cause cited here. `watcherAt`/`wiringAt` have since been
  migrated to imports from `tests/helpers/watch-arming-harness.ts` in the
  in-scope file (confirmed by `grep -n "function watcherAt" tests/supersession-detach-throw-containment.test.ts`
  returning no hits), leaving `Harness`/`makeHarness` as the unmigrated
  residue this finding targets.
- Not a re-file of PTQ-0491 (fixed): that finding's file pair is
  `rebind-self-collision-reownership.test.ts` /
  `double-session-start-supersession.test.ts`, a different pair; its own
  triage note flags "the same CountingFakeFileWatcher/watcherAt/
  dispatchRegistered names also recur in
  tests/supersession-detach-throw-containment.test.ts and
  tests/supersession-inflight-rebuild-quiesce.test.ts" as residue for a
  follow-up, which this finding is.
- Coverage-drift check: the claim is about a fixture duplicated across two
  files that both exist and both pass today, not about a missing test path.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce (detach-throw :263-327, quiesce :529-611; canonical :66-126 / :329-368); mktemp `diff` of the local `makeHarness` :277-327 against the canonical :66-126 shows every non-parameterised member (`registerFlag`/`registerMessageRenderer`/`on`/`getCommands` base/`ctx` literal/`fire`/`session_start` payload) byte-identical and the 48 differing lines confined to the canonical's `flags`/`onRegisterCommand`/`sendMessage`/`sendUserMessage` parameterisation points, which `makeSupersessionHarness` fills with the same two bodies the local copy inlines; the in-scope file uses only `harness.{pi,commands,registeredNames,notes,fireSessionStart}` (6/5/1/1/2 sites), all present on `SupersessionHarness` with `SupersessionNote` a structural superset of the local `RecordedNote`, and no `getFlag`/`ctx`/`extraCommands` need the canonical cannot supply; history confirms the residue reading — local copy born 82cedf5e 2026-07-31, canonical `makeSupersessionHarness` landed 4abf8177 2026-09-18 (PTQ-0491's fix), which migrated this file's `watcherAt`/`wiringAt` import (:157) but left `Harness`/`makeHarness` behind; `rebind-self-collision-reownership.test.ts:109` really imports it under the alias `Harness`; all 3 suites green (16/16); both sites under tests/, neither a gate file, no merge/rename/delete against the docs/bugs 0029:165 / 0034:215 offline-lock citations, coverage-matrix grep → 0; not a duplicate — PTQ-0715 (open) explicitly excludes `Harness`/`makeHarness`, PTQ-0491 (fixed) is the rebind/double-session-start pair, sibling intake d7-10 is quiesce's registry-oracle reread. Fold-in nuance for the fixer: quiesce's second site attributes `source` per registration and exposes `noteSender`, so it composes over the base `makeHarness(cwd, {}, {onRegisterCommand, sendMessage})` rather than `makeSupersessionHarness` directly (triage: claude-fable-5-1)
