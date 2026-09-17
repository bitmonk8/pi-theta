---
id: PTQ-0622
title: createRecordingUi's ~40-line no-op ExtensionUIContext double is restated verbatim across two RFC-0010 live cells and diverges only slightly from a third
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/rfc0010-l3-progress-parent-live-cell.test.ts:70-117
  - tests/live/rfc0010-l3-progress-wire-child-live-cell.test.ts:82-129
  - tests/live/execution-status-parfor-ui-live-cell.test.ts:73-133
sites: 3
fix_scope: module
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# createRecordingUi's ~40-line no-op ExtensionUIContext double is restated verbatim across two RFC-0010 live cells and diverges only slightly from a third

## Observation
`tests/live/rfc0010-l3-progress-parent-live-cell.test.ts` (in this review's scope) and `tests/live/rfc0010-l3-progress-wire-child-live-cell.test.ts` each declare an identically-named `RecordedCall` interface and an identically-named `createRecordingUi()` function that builds a full `ExtensionUIContext` object literal — roughly 30 no-op members plus two members (`setStatus`, `setWidget`) wired to push onto a recorded-calls array — and the two bodies are byte-identical. `tests/live/execution-status-parfor-ui-live-cell.test.ts` declares the same-named interface and function with the same overall shape, differing only in a third recorded `kind` (`setWorkingMessage`), an added `ts` timestamp field, and the `setWorkingMessage` no-op being wired to record instead of left inert. The parent-cell's own header comment states it is deliberately built to this precedent's shape ("PRECEDENTS MIRRORED: ... `execution-status-parfor-ui-live-cell.test.ts`'s ... recording-UI-double shape").

## Evidence
`tests/live/rfc0010-l3-progress-parent-live-cell.test.ts:70-117`:
```ts
interface RecordedCall {
  readonly kind: "setStatus" | "setWidget";
  readonly text: string | undefined;
  readonly lines: readonly string[] | undefined;
}

function createRecordingUi(): { readonly calls: RecordedCall[]; readonly ui: ExtensionUIContext } {
  const calls: RecordedCall[] = [];
  const ui = {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
    onTerminalInput: () => () => {},
    setStatus: (_key: string, text: string | undefined) => {
      calls.push({ kind: "setStatus", text, lines: undefined });
    },
```

`tests/live/rfc0010-l3-progress-wire-child-live-cell.test.ts:82-129` — the identical interface and function, same member order, same no-op bodies:
```ts
interface RecordedCall {
  readonly kind: "setStatus" | "setWidget";
  readonly text: string | undefined;
  readonly lines: readonly string[] | undefined;
}

function createRecordingUi(): { readonly calls: RecordedCall[]; readonly ui: ExtensionUIContext } {
  const calls: RecordedCall[] = [];
  const ui = {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
    onTerminalInput: () => () => {},
    setStatus: (_key: string, text: string | undefined) => {
      calls.push({ kind: "setStatus", text, lines: undefined });
    },
```
Both files continue identically through `setWidget`, `setFooter`, `setHeader`, `setTitle`, `custom`, `pasteToEditor`, `setEditorText`, `getEditorText`, `editor`, `addAutocompleteProvider`, `setEditorComponent`, `getEditorComponent`, `theme`, `getAllThemes`, `getTheme`, `setTheme`, `getToolsExpanded`, `setToolsExpanded` to the closing `return { calls, ui };`.

`tests/live/execution-status-parfor-ui-live-cell.test.ts:73-89` (the wider variant the parent cell's own comment names as its shape precedent):
```ts
interface RecordedCall {
  readonly ts: number;
  readonly kind: "setStatus" | "setWorkingMessage" | "setWidget";
  readonly text: string | undefined;
  readonly lines: readonly string[] | undefined;
}
...
function createRecordingUi(): { readonly calls: RecordedCall[]; readonly ui: ExtensionUIContext } {
  const calls: RecordedCall[] = [];
  const ui = {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
    onTerminalInput: () => () => {},
    setStatus: (_key: string, text: string | undefined) => {
      calls.push({ ts: Date.now(), kind: "setStatus", text, lines: undefined });
    },
```

## Why this is a problem
The same ~40-line no-op `ExtensionUIContext` object literal — a fake implementing roughly 30 interface members with a no-op body each — is authored three times: byte-identical between the two RFC-0010 files, and a near-identical (interface widened by one member, one timestamp field added) third copy in `execution-status-parfor-ui-live-cell.test.ts`. `tests/helpers/` already holds several canonical fake/double modules for exactly this shape of reuse (`fake-clock.ts`, `fake-file-system.ts`, `fake-file-watcher.ts`, `fake-host-loop-host.ts`), but no `fake-extension-ui-context.ts`-shaped helper exists for this double, so each of the three call sites re-authors the full member list from scratch (or, in the two RFC-0010 files, copies it verbatim).

## Suggested direction (non-binding, optional)
A parameterised recording `ExtensionUIContext` factory (which members to wire, matching the three-way `kind` union) under `tests/helpers/` is the natural shared home the three sites' own naming (`createRecordingUi`, `RecordedCall`) and the parent cell's own "precedent mirrored" comment already point toward.

## False-positive check
Gate-pin check: none of the three files match `*gate*.test.ts` or the named gate kinds; not applicable. Recording-double check: `RecordedCall`/`createRecordingUi` is itself a recording double used for positive "a call landed" assertions (not a MUST-NOT-call negative witness) in the two in-scope-adjacent files' cells — the carve-out for negative witnesses through recording doubles does not apply here, since the finding is about the double's own construction being copy-pasted, not about the legitimacy of what it asserts. docs/bugs/ signature search: grepped `docs/bugs/` for `createRecordingUi`/`RecordedCall` — no hits; not a documented correct-reason red. coverage-matrix/bug-doc citation search: grepped `docs/reference/coverage-matrix.md` for all three file names — no citation by name; no merge/rename/delete is proposed against any of the three cells, only the shared double's duplication is observed. Confirmed via `grep -rl "createRecordingUi"` across `quality/intake/*.md` that only this filing covers this function-name pairing (the sole other hit, `qw20260917154546-d7-01-systemnotecontents-collectsystemnotes-octuplicated.md`, cites `execution-status-parfor-ui-live-cell.test.ts` for its unrelated `systemNoteContents`/`collectSystemNotes` topic, not for `createRecordingUi`).

## Triage
verdict: confirmed — independently re-verified: `diff` of parent:70-117 vs wire-child:82-129 is a zero-line diff (byte-identical RecordedCall + 30-member createRecordingUi double), and parfor-ui:73-133 diverges only by the `ts` field, the third `setWorkingMessage` kind and that member recording instead of no-op; all three copies are live (called at parent:225, wire-child:214/261, parfor:183), `grep ExtensionUIContext tests/` finds exactly these three files and no tests/helpers/ double exists, so this is D7's copy-paste fixture/double class with no gate/negative-witness/docs-bugs/coverage-matrix carve-out applying (all re-grepped, no hits); no open/resolved PTQ mentions this double — note the same-wave sibling intake `qw20260917154546-d7-05-recording-ui-double-duplicated-rfc0010-cells.md` (written 16 s after this file, 2 of these 3 sites) is a narrower filing of the same root cause and should dedupe against this one (triage: claude-fable-5-1)
