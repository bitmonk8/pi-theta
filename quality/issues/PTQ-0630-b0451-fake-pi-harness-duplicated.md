---
id: PTQ-0630
title: b0451 redeclares the fake-pi makeHarness/makeTheta harness that drain-gated-dispatch-integration.test.ts already declares
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0451-factory-lifecycle-notes-fallback-chain.test.ts:113-201
  - tests/drain-gated-dispatch-integration.test.ts:67-141
  - tests/watcher-hot-reload-integration.test.ts:72-104
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0451 redeclares the fake-pi makeHarness/makeTheta harness that drain-gated-dispatch-integration.test.ts already declares

## Observation
`tests/drain-gated-dispatch-integration.test.ts` declares a fake-`pi`
harness — `makeHarness()` (a `registerCommand`/`on`/`sendMessage` stub plus a
subscription table and `fireSessionStart`) and `makeTheta(slashName, run)` (a
minimal `ParsedTheta`) — that its own header states was itself "copied
verbatim from tests/watcher-hot-reload-integration.test.ts". `tests/b0451-factory-lifecycle-notes-fallback-chain.test.ts`
declares its own `makeHarness()` and `makeTheta()` with the identical
`registerFlag`/`registerMessageRenderer`/`registerCommand`/`on`/`getFlag`/
`getCommands`/`sendUserMessage` member set, the identical subscription-table
and `fire`/`fireSessionStart` shape, and a byte-identical `makeTheta` body.
b0451's own header and per-function doc comments state this in the same
terms: "The harness … is copied from tests/drain-gated-dispatch-integration.test.ts"
and `makeTheta` is "copied from tests/drain-gated-dispatch-integration.test.ts".
This is a third, in-scope instance of the same fake-pi harness lineage, each
copy diverging only in the extra fields (`noteAttempts`, `notified`,
`diagnostics`) or behaviour (`sendMessage` throwing) the new bug's witnesses
need.

## Evidence
tests/drain-gated-dispatch-integration.test.ts:67-141 (`makeHarness` +
`makeTheta`, the version b0451 copies from):
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
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
```

tests/b0451-factory-lifecycle-notes-fallback-chain.test.ts:113-134 (b0451's
own `makeHarness`, the same member set with only the note-recording body
changed):
```ts
function makeHarness(): Harness {
  const commands = new Map<string, unknown>();
  const notes: RecordedNote[] = [];
  const noteAttempts: RecordedNote[] = [];
  const notified: RecordedNotify[] = [];
  const diagnostics: Diagnostic[] = [];
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
      list.push(handler);
      subscriptions.set(event, list);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): { name: string; source: string }[] =>
      [...commands.keys()].map((name) => ({ name, source: "extension" })),
```

tests/b0451-factory-lifecycle-notes-fallback-chain.test.ts:191-201
(`makeTheta`, byte-identical to the drain-gated version):
```ts
function makeTheta(
  slashName: string,
  run: (args: string, ctx: ExtensionCommandContext) => Promise<void>,
): ParsedTheta {
  return {
    slashName,
    frontmatter: { mode: "prompt" } as unknown as ParsedTheta["frontmatter"],
    body: { statements: [] } as unknown as ParsedTheta["body"],
    run,
  };
}
```
tests/drain-gated-dispatch-integration.test.ts:132-141 carries the identical
`makeTheta` body. tests/watcher-hot-reload-integration.test.ts:72-104 is the
lineage's origin (cited by drain-gated-dispatch-integration.test.ts's own
header as the file it copied verbatim from), giving three generations of the
same fake-`pi` harness.

## Why this is a problem
Each file in the lineage documents, in its own comments, that it copied the
prior file's harness rather than importing a shared one:
watcher-hot-reload-integration.test.ts is the origin,
drain-gated-dispatch-integration.test.ts states it copied that file's harness
verbatim, and b0451 states it copied drain-gated-dispatch-integration.test.ts's
harness. The three copies share the same `registerCommand`/`on`/subscription-
table/`fireSessionStart` shape and the byte-identical `makeTheta`, so a change
to the fake-`pi` contract (a new `ExtensionAPI` member the real factory reads)
must be hand-applied in three places, each edited independently in the past.

## Suggested direction (non-binding, optional)
tests/helpers/ is the natural home for a shared "fake pi capturing
registerCommand/on plus a session_start firer" harness with the recorder
fields each caller extends; the three files' own header comments already
name each other as the copy lineage, which is the observation that a shared
base is missing, not a design for one.

## False-positive check
Gate-pin: none of the three files match `*gate*.test.ts` or kin. Recording-double:
the fake `pi.sendMessage`/`notified`/`diagnostics` recorders are used for
positive delivery witnesses in b0451 (asserting a note DID arrive), not
MUST-NOT witnesses, so the recording-double carve-out does not shield the
harness-duplication claim itself (the individual `noteAttempts` recorder is a
legitimate reached-precondition witness and is not what this finding
targets — the finding targets the duplicated `makeHarness`/`makeTheta`
scaffolding, not the recorder's validity). docs/bugs/ search: grepped "copied
verbatim" and "copied from" across docs/bugs/ — no hit tying this duplication
to a documented correct-reason red. coverage-matrix/bug-doc citation search:
grepped "b0451-factory-lifecycle-notes-fallback-chain.test.ts" across
docs/reference/coverage-matrix.md and docs/bugs/*.md — the bug's own doc
(docs/bugs/0451-factory-lifecycle-notes-bypass-fallback-chain.md) names this
test as its witness file; this finding proposes no merge/rename/delete of
b0451, only sharing the harness scaffolding it (and its two ancestors) each
redeclare.

## Triage
verdict: confirmed — independently re-verified: b0451:113-201 and drain-gated:67-141 reproduce, makeTheta diffs empty (byte-identical) and the six-member pi stub head (registerFlag…getCommands) diffs empty, drain-gated's header (27-32, 62-66) really states "copied verbatim from tests/watcher-hot-reload-integration.test.ts … (its helpers are not exported)" and b0451's header + both doc comments really state "copied from tests/drain-gated-dispatch-integration.test.ts"; watcher-hot-reload:72-104 is the diverged origin (cwd param, getCommandsThrows toggle, fireSessionShutdown — range under-cites, function runs to ~137, tolerated); no file imports another (each imports only ./helpers/fake-clock); candidate's "shared base is missing" is imprecise — tests/helpers/watch-arming-harness.ts#makeHarness (PTQ-0363) carries the same skeleton but returns only {pi, fireSessionStart} with a no-op sendMessage over real composition, so it cannot serve b0451's commands/noteAttempts/notified/diagnostics capture and the gap is real; no gate files, bug 0451 is fixed (0.449.0) and all 3 files pass 13/13 (no left-red), coverage-matrix grep → 0, bug docs cite the files as witnesses but no merge/rename/delete is proposed; not a duplicate — PTQ-0363 is b0310/b0339 only and same-wave siblings d7-01-b0371/d7-01-b0401 (confirmed) cite drain-gated's copy but not b0451 or watcher-hot-reload, so under the per-copy-site convention this filing owns those sites (fixer should share one extraction with them); form note: the two makeHarness excerpts run 22-25 lines (>15), tolerated (triage: claude-fable-5-1)
