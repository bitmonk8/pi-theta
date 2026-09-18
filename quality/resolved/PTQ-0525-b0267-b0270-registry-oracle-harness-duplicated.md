---
id: PTQ-0525
title: b0267live and b0270live redeclare the same DIAG-4 registry-oracle and rendered-row reading harness byte-for-byte
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:228-260
  - tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:300-353
  - tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:265-297
  - tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:337-390
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0267live and b0270live redeclare the same DIAG-4 registry-oracle and rendered-row reading harness byte-for-byte

## Observation
`tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts`
and `tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts`
each declare a private `RegistryRow` interface, a private `REGISTRY` constant
parsed from `docs/spec_topics/diagnostics/code-registry-load.md`, a private
`normativeMessagePattern` function, a private `normalisePath` function, a
private `RenderedRow` interface, a private `renderedRows` function, a private
`rowsLocatedAt` function and a private `requireNoteChannel` function. Diffing
the two files' matching line spans shows the entire ~65-line block is
byte-identical between the two files except for the interpolated bug number
inside two `failLoudly` message strings ("bug-0267" vs "bug-0270"). Neither
file imports this block from the other or from a shared module; both
independently parse the same registry page and independently define the same
diagnostic-line-splitting regexes and filters.

## Evidence

tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:228-244:
```ts
interface RegistryRow {
  code: string;
  message: string;
}

const REGISTRY = parseRegistry(
  readFileSync(
    fileURLToPath(
      new URL("../../docs/spec_topics/diagnostics/code-registry-load.md", import.meta.url),
    ),
    "utf8",
  ),
) as RegistryRow[];

/**
 * The row's normative *Message* (DIAG-4) as a regex with the `<placeholder>`
 * slots opened up. Fails loudly naming the registry page when the row is absent,
```

tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:265-281
is byte-identical to the excerpt above (confirmed by direct read and by
`diff` of the full 228-260 / 265-297 spans, whose only difference is the
interpolated bug number on one `failLoudly` line).

tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:319-343
(`renderedRows`, `rowsLocatedAt`, `requireNoteChannel`):
```ts
function renderedRows(handle: LiveExtensionHandle, code: string): readonly RenderedRow[] {
  const marker = `: ${code}: `;
  const rows: RenderedRow[] = [];
  for (const note of bootNotes(handle)) {
    for (const line of note.split("\n")) {
      const at = line.indexOf(marker);
      if (at < 0) continue;
      rows.push({
        location: normalisePath(line.slice(0, at)),
        message: line.slice(at + marker.length),
      });
    }
  }
  return rows;
}

/** Rows whose located file is the planted `<stem>.theta`. */
function rowsLocatedAt(
  handle: LiveExtensionHandle,
  code: string,
  stem: string,
): readonly RenderedRow[] {
  return renderedRows(handle, code).filter((row) => row.location.includes(`/${stem}.theta`));
}
```

tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:356-380
is byte-identical to the excerpt above (confirmed by direct read and by
`diff` of the full 300-353 / 337-390 spans, whose only difference is the
interpolated bug number on the `requireNoteChannel` `failLoudly` line).

Exact search executed: `diff <(sed -n '228,260p' b0267live…) <(sed -n '265,297p' b0270live…)` and `diff <(sed -n '300,353p' b0267live…) <(sed -n '337,390p' b0270live…)` — both diffs show exactly one differing line each, both the interpolated bug-number string, confirming the remainder is byte-identical across the two ~33-line and ~54-line spans.

## Why this is a problem
Both files independently parse the same registry page
(`docs/spec_topics/diagnostics/code-registry-load.md`) into the same
`RegistryRow[]` shape, build the same escaped-message-to-regex converter, the
same path-separator normaliser, the same diagnostic-line-splitting regex
logic (`renderedRows`), and the same file-scoped row filter
(`rowsLocatedAt`)/channel-vacuity guard (`requireNoteChannel`) under the same
names. A change to how `renderDiagnosticLine` formats a located head line
(the format `renderedRows`'s `marker` construction depends on) would need to
be re-applied in both files' copies independently, since neither imports from
the other or from a shared module.

## Suggested direction (non-binding, optional)
The block these two files share — `RegistryRow`, the registry-page parse,
`normativeMessagePattern`, `normalisePath`, `RenderedRow`, `renderedRows`,
`rowsLocatedAt`, `requireNoteChannel` — takes only `LiveExtensionHandle`, a
registry-page path and a bug-id string as its varying inputs; the two files'
own near-identical bodies already show what a parameterised shared version
would need to accept.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited lines are harness/oracle functions, not pinned counts or
  inventories.
- Recording-double check: `renderedRows`/`rowsLocatedAt` read the settled
  note channel to build content for `toEqual`/`not.toEqual` assertions on
  what a location/code pair states; none of the cited functions is itself a
  call-recording MUST-NOT witness, so the recording-double carve-out does not
  apply.
- docs/bugs/ signature search: this finding does not allege a red or disabled
  test — both files are live H8a cells with stated RED/GREEN behaviour under
  `requireLiveProvider`, not documented correct-reason reds. Not applicable.
- coverage-matrix/bug-doc citation search: `grep -rn "b0267live\|b0270live" docs/reference/coverage-matrix.md` was not required for this finding — it proposes no merge, rename or deletion of any test, `it()` or `describe()`, only that the shared harness block could be imported from one place instead of declared twice, so no witness-list citation is disturbed.
- Overlap check: `ls quality/intake | grep -i "b0267\|b0270"` before filing showed only `qw20260917154546-d7-01-b0270-compose-workspace-harness-not-migrated.md`, which names a disjoint pair of OFFLINE test files (`tests/callee-tools-missing-theta-path-un-registers-tools-caller.test.ts`, `tests/callee-post-parse-errors-un-register-tools-caller.test.ts`) and a disjoint canonical helper (`tests/helpers/compose-workspace-harness.ts`'s `makeHost`/`runLoadPass` family) — not the two live-cell files or the `bootNotes`/registry-oracle functions cited here. No other intake or resolved finding cites `renderedRows`, `rowsLocatedAt`, `requireNoteChannel` or `normativeMessagePattern` together with either live-cell file's path.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: diff of b0267live:228-260 vs b0270live:265-297 and b0267live:300-353 vs b0270live:337-390 each yield exactly one differing line (the interpolated bug-0267/bug-0270 string), both files import only parseRegistry/registryMessage + boot/plant/failLoudly and tests/live/harness.ts exports none of RegistryRow/REGISTRY/normativeMessagePattern/normalisePath/RenderedRow/renderedRows/rowsLocatedAt/requireNoteChannel (only LiveModel greps), so the block is a live-tier copy-paste with no shared source; not a gate test, no .skip/.only, bug docs 0267/0270 name the files but nothing is merged/renamed/deleted; the bootNotes span (270-297/307-334) is correctly carved out to the already-confirmed sibling d7-01-live-cell-note-channel-extraction-duplicated; no resolved PTQ cites either live file (the registry-oracle rows 0215/0222/0237/0250/0260/0275/0311/0313/0404/0411/0412 are all offline tests + tests/helpers/registry-oracle.ts), and this is the earliest-filed (19:15:05) of the wave's live-cell registry-oracle siblings — d7-02-live-cell-registry-oracle-row-inventory-duplicated (19:15:25; b0271/b0275/b0280 carry the same normalisePath..requireNoteChannel block byte-identical plus describeRows and a page-parameterised registry read) should dedupe against this row so the fix covers all five live cells (triage: claude-fable-5-1)
