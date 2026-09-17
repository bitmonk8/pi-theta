---
id: PTQ-0427
title: b0268-load-note-path-spelling-single-convention.test.ts re-derives compose-workspace-harness.ts's makeHost/runLoadPass/requireDriven instead of importing them
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0268-load-note-path-spelling-single-convention.test.ts:173-216
  - tests/b0268-load-note-path-spelling-single-convention.test.ts:258-284
  - tests/b0268-load-note-path-spelling-single-convention.test.ts:318-326
  - tests/helpers/compose-workspace-harness.ts:47-133
  - tests/helpers/compose-workspace-harness.ts:150-162
  - tests/helpers/compose-workspace-harness.ts:205-212
sites: 4                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0268-load-note-path-spelling-single-convention.test.ts re-derives compose-workspace-harness.ts's makeHost/runLoadPass/requireDriven instead of importing them

## Observation
tests/b0268-load-note-path-spelling-single-convention.test.ts declares its own
`PiHandler` type, `RecordedNote`/`HostDouble` interfaces, `makeHost` function,
`LoadPass` interface, `runLoadPass` function and `requireDriven` function.
tests/helpers/compose-workspace-harness.ts already exports the identically
named and (for `makeHost`) byte-identical versions of all of these — the
module's own header comment states it was created precisely because "Several
test files independently redeclared the same `PiHandler` type, `RecordedNote`
/ `HostDouble` interfaces, `makeHost` function ... and the adjacent ...
`LoadPass` shape `runLoadPass` returns". b0268's own file imports nothing from
`tests/helpers/compose-workspace-harness.ts`.

## Evidence

tests/b0268-load-note-path-spelling-single-convention.test.ts:173-215
(`makeHost`, re-read immediately before filing):
```ts
function makeHost(cwd: string): HostDouble {
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
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => {},
    sendMessage: (message: {
      customType: string;
      content: string;
      details: unknown;
    }): void => {
      notes.push({
        customType: message.customType,
        content: message.content,
        details: message.details,
      });
    },
  } as unknown as ExtensionAPI;
```

tests/helpers/compose-workspace-harness.ts:63-95 (the canonical export,
already covering every field and behaviour above, modulo the type-annotation
line wrap):
```ts
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

tests/b0268-load-note-path-spelling-single-convention.test.ts:270-284
(`runLoadPass`):
```ts
async function runLoadPass(workspace: ComposeWorkspace): Promise<LoadPass> {
  const host = makeHost(workspace.cwd);
  await composeExtensionInstance(
    host.pi,
    host.ctx,
    undefined,
    new RendererGate(),
  );
  return {
    notes: host.notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL),
    offChannel: host.notes.filter((n) => n.customType !== SYSTEM_NOTE_CHANNEL),
    notified: host.notified,
  };
}
```

tests/helpers/compose-workspace-harness.ts:150-162 (same shape, one added
field the canonical version reads off the already-shipped `wiring` return —
`registered`/`thetas` — that b0268's local copy has no use for):
```ts
export async function runLoadPass(workspace: ComposeWorkspace): Promise<LoadPass> {
  const host = makeHost(workspace.cwd);
  const wiring = await composeExtensionInstance(host.pi, host.ctx, undefined, new RendererGate());
  return {
    notes: host.notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL),
    offChannel: host.notes.filter((n) => n.customType !== SYSTEM_NOTE_CHANNEL),
    notified: host.notified,
    registered: wiring.thetas.map((t) => t.slashName),
    thetas: wiring.thetas,
  };
}
```

tests/b0268-load-note-path-spelling-single-convention.test.ts:318-326
(`requireDriven`):
```ts
function requireDriven(pass: LoadPass): void {
  if (pass.notes.length === 0) {
    throw new Error(
      "harness: the composition root put NOTHING on the theta-system-note " +
        "channel — the bug-0268 fixture no longer reaches the diagnostic channel, " +
        "so no spelling below is verified",
    );
  }
}
```

tests/helpers/compose-workspace-harness.ts:205-212 (same guard, parameterised
on `bugId` instead of the string `"0268"` inlined):
```ts
export function requireDriven(pass: LoadPass, bugId: string): void {
  if (pass.notes.length === 0 && pass.registered.length === 0) {
    throw new Error(
      "harness: the composition root neither registered a theta nor put anything on the " +
        `theta-system-note channel — the bug-${bugId} fixture no longer reaches the load pass, ` +
        "so nothing below is verified",
    );
  }
}
```

Search executed: `grep -n "^function makeHost\|^interface HostDouble\|^interface RecordedNote\|^type PiHandler\|^async function runLoadPass\|^function requireDriven\|^function noteDiagnostics\|^function allDiagnostics\|^function describeNotes\|^interface LoadPass" tests/b0268-load-note-path-spelling-single-convention.test.ts` → 10 local declarations matching an identically-named export in `grep -n "^export function makeHost\|^export interface HostDouble\|^export interface RecordedNote\|^export type PiHandler\|^export async function runLoadPass\|^export function requireDriven\|^export function noteDiagnostics\|^export function allDiagnostics\|^export function describeNotes\|^export interface LoadPass" tests/helpers/compose-workspace-harness.ts` → all 10 present in the helper. `grep -n "compose-workspace-harness" tests/b0268-load-note-path-spelling-single-convention.test.ts` → 0 hits (no import from the module at all).

## Why this is a problem
tests/helpers/compose-workspace-harness.ts's own header comment (lines 1-30)
states its reason for existing: several test files independently redeclared
the identical `PiHandler` type, `RecordedNote`/`HostDouble` interfaces,
`makeHost` function, `LoadPass` shape, `runLoadPass` function, and the
`noteDiagnostics`/`allDiagnostics`/`describeNotes`/`requireDriven` family
"byte-for-byte (or near so — an interpolated bug number, an added timing
field) rather than imported." b0268's own two differences from the canonical
copy are exactly that shape — `requireDriven` inlines the literal `"0268"`
where the canonical version takes a `bugId` parameter, and `runLoadPass` omits
the `registered`/`thetas` fields the canonical `LoadPass` carries because this
file has no present use for them — both trivial parameterisation gaps, not a
different behaviour. A change to what the shipped `makeHost` double needs to
expose (an added required `ExtensionAPI`/`ExtensionContext` member, a changed
recording shape) applied to the seven other files already importing from
`tests/helpers/compose-workspace-harness.ts` and not to this file's local copy
would leave this file constructing a stale host double while its siblings
construct the current one, with nothing surfacing the drift.

## Suggested direction (non-binding, optional)
`tests/helpers/compose-workspace-harness.ts` already exports `makeHost`,
`LoadPass`, `runLoadPass`, `requireDriven` (parameterised on `bugId`),
`noteDiagnostics`, `allDiagnostics` and `describeNotes` — the ten local
declarations this file re-derives are, module the two trivial gaps named
above, that same export set; the file's own `plantWorkspace` (which needs the
additional `posixPath`/`nativePath`/`mixedPath` accessors the canonical
`ComposeWorkspace.path` does not carry) is the one piece with a genuine local
reason to stay separate from `finishWorkspace`.

## False-positive check
- Gate-pin check: tests/b0268-load-note-path-spelling-single-convention.test.ts
  does not match `*gate*.test.ts` or the named kin (closing-gate,
  cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); none of the cited lines is a pinned count
  or inventory assertion.
- Recording-double check: `notes`/`notified` back a content-assertion double
  (`expect(files...)`, `expect(pass.notified).toEqual([])` as an ordinary
  empty-array equality, not a call-recording MUST-NOT witness distinct from
  the canonical double's own identical `notified` array) — the recording
  shape itself, not what a later assertion does with it, is what is cited as
  duplicated, and the canonical `compose-workspace-harness.ts` version backs
  the same kind of assertions in its own importers.
- docs/bugs/ signature search: `grep -n "Status" docs/bugs/0268-*.md` →
  "fixed (0.312.0)" (docs/bugs/0268-diagnostic-file-path-separator-inconsistent-per-load-pass.md).
  `npx vitest run tests/b0268-load-note-path-spelling-single-convention.test.ts`
  → 2 passed (2) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0268-load-note-path-spelling-single-convention"
  docs/reference/coverage-matrix.md docs/bugs/0268-*.md` → 0 hits outside the
  bug doc's own file-level citation of the test file as a whole (no `it()`/
  function name cited). This finding proposes no merge, rename or deletion of
  any test, `it()` or `describe()` — only that the file's local
  `makeHost`/`LoadPass`/`runLoadPass`/`requireDriven`/`noteDiagnostics`/
  `allDiagnostics`/`describeNotes` declarations could import the identically-
  named, already-exported versions instead of re-deriving them — so no
  witness-list citation is disturbed.
- Overlap check against already-filed/resolved topics: PTQ-0213
  (makehost-composition-harness-duplicated, fixed) and PTQ-0230
  (b0275-load-pass-diagnostic-harness-duplicated, fixed) both name a
  *different* pair of files (b0275 and a grandchild-callee-drop file); PTQ-0299
  (plantworkspace-reimplements-finishworkspace, fixed) names b0280's
  `plantWorkspace`/`finishWorkspace` gap, a different file; PTQ-0361 and
  PTQ-0385 (both fixed) name b0328/b0329/b0343's `beforeEach`/`afterEach`
  settings-write sequence, a different scaffold piece (`finishWorkspace`
  alone, not `makeHost`/`runLoadPass`/`requireDriven`). None of these five
  resolved findings cites `tests/b0268-load-note-path-spelling-single-convention.test.ts`
  by path; `grep -rl "b0268-load-note-path-spelling-single-convention"
  quality/resolved quality/intake` → 0 hits before this filing. This
  candidate's own sibling file in this wave's scope,
  `tests/b0268-diagnostic-file-separator-normalisation.test.ts`, is a
  separate, disjoint duplication (a `SystemNoteChannelDeps` recording double,
  not `composeExtensionInstance`/`makeHost`) and is not cited here.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: all six excerpts reproduce at the cited lines (makeHost byte-identical modulo one line wrap; runLoadPass/requireDriven/noteDiagnostics/allDiagnostics/describeNotes are the "near so" variants the helper header names — bugId inlined as "0268", LoadPass minus registered/thetas, helpers taking pass vs pass.notes), the 10-local-decl / 10-export / 0-import greps reproduce, test green 2/2 against a fixed bug doc (correction: docs/bugs/0268-load-notes-render-same-file-with-mixed-path-separators.md, fixed (0.265.0) — the candidate's filename/version are wrong — which cites only the file and its posixPath helper, no it()/harness function), coverage-matrix 0 hits; not a duplicate — the candidate's "0 hits in quality/resolved" claim is also wrong (PTQ-0213/0220/0221 list b0268 in their pattern-wide makeHost greps) but only as an unmigrated file, never a cited location or remediated site, and PTQ-0220/0221 are precedent that each unmigrated file is its own confirmed finding; fixer note: canonical requireDriven adds a `registered.length === 0` conjunct and canonical noteDiagnostics expect.fails on a missing diagnostics array — both mechanical adaptations (triage: claude-fable-5-1)
