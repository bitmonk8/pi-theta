---
id: PTQ-0774
title: The theta-system-note channel reader `systemNoteContents` is redeclared byte-identically in both generic-argument live-cell files instead of importing tests/live/harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/generic-argument-bracket-group-truncation-live-cell.test.ts:128-160
  - tests/live/generic-argument-inline-field-key-live-cell.test.ts:114-146
  - tests/live/harness.ts:809-841
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The theta-system-note channel reader `systemNoteContents` is redeclared byte-identically in both generic-argument live-cell files instead of importing tests/live/harness.ts

## Observation
`tests/live/generic-argument-bracket-group-truncation-live-cell.test.ts` and
`tests/live/generic-argument-inline-field-key-live-cell.test.ts` each declare
a module-scope `function systemNoteContents(entries): readonly string[]` that
walks a slice of in-memory `SessionManager` entries, extracting
`theta-system-note` channel content (string or text-part array) plus the
`theta-progress-entry` fallback arm, including its seven-line PIC-72 comment.
The two declarations are byte-identical. Both files already import
`bootShippedExtension`, `driveSlashCaptureTurn`, `plantThetaWorkspace`, and
`requireLiveProvider` from `./harness` in the same import block, and read
`handle.sessionManager.getEntries()` directly through this locally-declared
function. `tests/live/harness.ts` already contains an unexported function of
the identical name and body (`collectSystemNotes`), used internally by its
own `driveSlashCaptureTurn`/`classifyLastTurn`, but exports neither it nor any
equivalent reader.

## Evidence
`tests/live/generic-argument-bracket-group-truncation-live-cell.test.ts:128-160`:
```ts
/**
 * The theta-system-note channel contents from the settled in-memory
 * `SessionManager`, read directly off `getEntries()` (AGENTS.md
 * §"Assert on real observables").
 */
function systemNoteContents(entries: readonly unknown[]): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown; data?: unknown };
    if (e.customType === "theta-system-note") {
      if (typeof e.content === "string") notes.push(e.content);
      else if (Array.isArray(e.content)) {
        for (const part of e.content) {
          const t = (part as { text?: string }).text;
          if (typeof t === "string") notes.push(t);
        }
      }
    } else if (e.customType === "theta-progress-entry") {
      // PIC-72 (runtime-event-channel.md): the three migrated operator-note
      // classes (parse/load/type diagnostic BATCH, structural-change,
      // binder-model recovery) deliver through the `theta-progress-entry`
      // custom-entry channel instead of `theta-system-note` whenever both
      // entry members are present (entry-channel.ts). The entry's `data`
      // carries the SAME `SystemNote` shape the message channel used to
      // carry (PIC-71: byte-identical rendered content), so extracting its
      // `content` keeps every existing substring assertion working
      // unchanged — a channel-union repair, not a weakening.
      const data = e.data as { content?: unknown } | undefined;
      if (typeof data?.content === "string") notes.push(data.content);
    }
  }
  return notes;
}
```

`tests/live/generic-argument-inline-field-key-live-cell.test.ts:114-146` —
reverified byte-identical via
`diff <(sed -n '128,160p' generic-argument-bracket-group-truncation-live-cell.test.ts) <(sed -n '114,146p' generic-argument-inline-field-key-live-cell.test.ts)`
→ no output.

`tests/live/harness.ts:809-841` — the module both files already import from,
carrying the unexported twin:
```ts
/**
 * Extract the `theta-system-note` channel contents from a slice of in-memory
 * SessionManager entries (their `content`, string or text-part array). Mirrors
 * the hardening probe harness's reader of the same channel.
 */
function collectSystemNotes(entries: readonly unknown[]): readonly string[] {
  const notes: string[] = [];
  for (const entry of entries) {
    const e = entry as { customType?: string; content?: unknown; data?: unknown };
    if (e.customType === "theta-system-note") {
      if (typeof e.content === "string") notes.push(e.content);
      else if (Array.isArray(e.content)) {
        for (const part of e.content) {
          const t = (part as { text?: string }).text;
          if (typeof t === "string") notes.push(t);
        }
      }
    } else if (e.customType === "theta-progress-entry") {
```
(the remainder of `collectSystemNotes` reproduces the PIC-72 comment and
`data.content` fallback arm verbatim, confirmed by direct read).

## Why this is a problem
Both in-scope files already draw their subject-under-test functions
(`bootShippedExtension`, `driveSlashCaptureTurn`, `plantThetaWorkspace`,
`requireLiveProvider`) from `tests/live/harness.ts` in the same import
statement, and that same module already contains this exact reader body under
the name `collectSystemNotes` — it is simply not exported. Rather than the
module surfacing the one reader both files need, each file re-derives the
identical 24-line channel-walk (including its PIC-72 explanatory comment)
under a locally invented name (`systemNoteContents`).

## Suggested direction (non-binding, optional)
`tests/live/harness.ts` already hosts the byte-identical reader
(`collectSystemNotes`) both files re-derive; exporting it (or a
same-shaped sibling) would let both files import the one definition they
already partially draw from.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `systemNoteContents`/`collectSystemNotes` extract
  already-recorded session-manager entries into strings; neither records a
  call or backs a "never called" assertion, so the negative-witness carve-out
  does not apply.
- docs/bugs/ signature search: `grep -rl "systemNoteContents\|collectSystemNotes"
  docs/bugs/0236*.md docs/bugs/0233*.md` → 0 files. Neither
  `docs/bugs/0236-bracket-group-generic-argument-truncates-list.md` nor
  `docs/bugs/0233-generic-argument-inline-field-key-rules-withheld.md` (the
  bug documents these two files witness) states a rationale for redeclaring
  this reader locally rather than importing the sibling module's own copy.
- coverage-matrix/bug-doc citation search: `grep -n
  "generic-argument-bracket-group-truncation-live-cell\|generic-argument-inline-field-key-live-cell"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only that the
  reader's definition could be shared — so the citation carve-out does not
  bind.
- Coverage check: the claim is entirely about a repeated helper-function
  DEFINITION, not a missing test path; both copies are exercised by the tests
  in their own files.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: sed-extract + diff of bracket-group:128-160 vs inline-field-key:114-146 → zero output, and a name-only substitution makes both diff to zero against tests/live/harness.ts:814-841 `collectSystemNotes`, which carries no `export` and greps to no importer across src/extensions/tools/tests (only its own callers at :553/:676/:732); both local copies are live (:286 / :274 call `systemNoteContents(handle.sessionManager.getEntries())`), both files import from ./harness, neither states a "mirrors" rationale, docs/bugs 0233/0236 and coverage-matrix greps reproduce at 0 — D7 boilerplate/copy-paste helper duplication wholly under tests/, no gate/recording-double/red-test carve-out engaged; not tracked by any minted PTQ (PTQ-0229 is the message()/note() fixture builders), but the pattern is repo-wide (`grep -rn "function systemNoteContents" tests/` → 32 files) and ~12 same-wave intake siblings (d7-01 ×4, d7-02, d7-71 ×2, d7-73, d7-90, d7-97-01, d7-99-02) file disjoint-file-set slices of the same export-collectSystemNotes root cause, so acceptance should fold them into one row (triage: claude-fable-5-1)
