---
id: PTQ-0479
title: five live-cell tests re-derive harness.ts's private collectSystemNotes channel-union walk instead of it being exported
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/b0259live-enum-body-unclosed-at-eof-live-cell.test.ts:192-217
  - tests/live/b0262live-unresolved-named-type-reference-position-live-cell.test.ts:203-228
  - tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:270-297
  - tests/live/b0268live-load-note-path-spelling-live-cell.test.ts:208-244
  - tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:307-334
  - tests/live/harness.ts:814-840
sites: 5                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# five live-cell tests re-derive harness.ts's private collectSystemNotes channel-union walk instead of it being exported

## Observation
Five of the six live-cell files in this review's scope each re-derive the
same "walk the settled in-memory `SessionManager` entries and pull out the
rendered `theta-system-note` / `theta-progress-entry` channel-union content"
sequence: two files inline the loop directly inside their `it()` body
(b0259, b0262), two declare a private module-scope function named `bootNotes`
with an identical body (b0267, b0270), and one declares a private
`settledNotes` function that carries the same core branches plus an added
`details`/`diagnostics` read (b0268). `tests/live/harness.ts` already
contains this exact walk as `collectSystemNotes` (lines 814-840), but the
function is not exported (no `export` keyword), and every one of the five
citing comments below says so explicitly ("Mirrors the harness's own private
`collectSystemNotes` reader").

## Evidence

tests/live/harness.ts:814-826 (the private, unexported original):
```ts
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

tests/live/b0259live-enum-body-unclosed-at-eof-live-cell.test.ts:192-206
(inline, identical branch structure over `handle.sessionManager.getEntries()`
instead of a passed-in `entries` slice):
```ts
      const notes: string[] = [];
      for (const entry of handle.sessionManager.getEntries()) {
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

tests/live/b0262live-unresolved-named-type-reference-position-live-cell.test.ts:203-217
is byte-identical to the b0259 excerpt above (confirmed by direct read).

tests/live/b0267live-callee-post-parse-errors-un-register-tools-caller-live-cell.test.ts:270-282
(the named `bootNotes` function, own comment names the mirrored private
original):
```ts
/**
 * The `theta-system-note` channel contents of the settled in-memory
 * `SessionManager` — every note the boot appended, including the shipped sink's
 * per-error load-diagnostic notes. Mirrors the harness's own private
 * `collectSystemNotes` reader (string or text-part-array content).
 */
function bootNotes(handle: LiveExtensionHandle): readonly string[] {
  const notes: string[] = [];
  for (const entry of handle.sessionManager.getEntries()) {
    const e = entry as { customType?: string; content?: unknown; data?: unknown };
    if (e.customType === "theta-system-note") {
      if (typeof e.content === "string") notes.push(e.content);
```

tests/live/b0270live-callee-tools-missing-theta-path-live-cell.test.ts:307-319
is byte-identical to the b0267 `bootNotes` excerpt above, including the same
doc comment (confirmed by `diff` of both files' 228-352/265-389 blocks —
the only two differing lines in that whole ~125-line span are the
interpolated bug number in two error strings, not this function).

tests/live/b0268live-load-note-path-spelling-live-cell.test.ts:208-231
(`settledNotes`, the same core branch structure widened to also carry
`details.diagnostics`):
```ts
function settledNotes(handle: LiveExtensionHandle): readonly SettledNote[] {
  const notes: SettledNote[] = [];
  for (const entry of handle.sessionManager.getEntries()) {
    const e = entry as {
      customType?: string;
      content?: unknown;
      details?: unknown;
      data?: unknown;
    };
    if (e.customType === "theta-system-note") {
      let content = "";
      if (typeof e.content === "string") {
        content = e.content;
      } else if (Array.isArray(e.content)) {
        for (const part of e.content) {
          const t = (part as { text?: string }).text;
          if (typeof t === "string") content += t;
        }
      }
```

Exact search: `grep -n "customType === \"theta-system-note\"" tests/live/*.test.ts` across the six files in this review's scope returns a hit in b0259, b0262, b0267, b0268, b0270 (5 files) and none in b0263 (b0263 reads the channel only through `driveSlashCaptureTurn`'s already-exported `systemNotes` field, so it is not a duplicate site).

## Why this is a problem
The five sites all walk the identical two-branch union (`theta-system-note`
string/array content, `theta-progress-entry`'s `data.content`/`data.details`
fallback) that `tests/live/harness.ts` already implements once as
`collectSystemNotes`, and every citing file's own comment names that function
as the thing it is mirroring rather than importing. The function is not
exported, so each site re-authors the same PIC-72 channel-union knowledge
(including, in three of the five sites, the identical seven-line PIC-72
justification comment) locally. A change to which custom-entry channel or
which `data` shape the shipped sink uses would need to be re-applied at each
of these five sites independently of `collectSystemNotes` itself, since
nothing imports it.

## Suggested direction (non-binding, optional)
`tests/live/harness.ts` already contains this walk as `collectSystemNotes`;
exporting it (and, for b0268's superset need, either widening its return
shape or exporting a sibling that also carries `details`) is a directly
observable option the five citing files' own comments already point at by
name.

## False-positive check
- Gate-pin check: none of the five files matches `*gate*.test.ts` or the
  named gate kin; none of the cited lines is a pinned count or inventory
  assertion — this is a harness-extraction site count, not a corpus pin.
- Recording-double check: `collectSystemNotes`/`bootNotes`/`settledNotes` read
  a settled transcript to build content strings for `toContain`/`toEqual`
  assertions; none of the cited call sites is a MUST-NOT-called witness, so
  the recording-double carve-out does not apply.
- docs/bugs/ signature search: this finding does not allege a red or disabled
  test; all five files are live H8a cells whose own headers state RED/GREEN
  behaviour under `requireLiveProvider`, not a documented correct-reason red.
  Not applicable.
- coverage-matrix/bug-doc citation search: `grep -rn "b0259live\|b0262live\|b0267live\|b0268live\|b0270live" docs/reference/coverage-matrix.md` and the five bug docs' own witness lists were not searched for `it()`-level citations beyond the whole-file citation already implied by each bug doc naming its own live cell; this finding proposes no merge, rename or deletion of any test or `it()` — only that five already-named-as-mirrored local functions could import the existing `collectSystemNotes` instead, so no witness-list citation is disturbed.
- Overlap check: `grep -rl "bootNotes\|collectSystemNotes\|requireNoteChannel\|settledNotes" quality/intake quality/resolved` before filing returned only PTQ-0229 (resolved), which names a different pair of files (tests/b0287-live-harness-assistant-text-reader.test.ts, tests/b0289-settled-empty-text-turn-classification.test.ts — not in this wave's scope) and a different duplicated shape (`message`/`note` entry-fixture factories, not the channel-extraction walk). No other intake candidate in this wave's scope cites any of the five files here for this function family.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: tests/live/harness.ts:814-840 collectSystemNotes has no export (grep confirms), b0259:192-217 ≡ b0262:203-228 and b0267:264-297 ≡ b0270:301-334 are byte-identical (diff clean), b0268:208-244 settledNotes is the disclosed superset variant, all five already import from ./harness and their own comments name the missing export as the only reason for the local copy; no gate/recording-double/red-test/witness-list carve-out applies; no accepted PTQ tracks this root cause and this is the earliest-filed (19:14:11) of the wave's ~14 same-root-cause intake siblings, none of which cites these five files — those should dedupe against this one (triage: claude-fable-5-1)
