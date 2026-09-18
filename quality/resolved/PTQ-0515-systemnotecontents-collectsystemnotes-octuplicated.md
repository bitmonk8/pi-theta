---
id: PTQ-0515
title: Eight in-scope live cells redeclare the theta-system-note entry-walk that tests/live/harness.ts already implements as collectSystemNotes
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/empty-object-discriminator-field-withhold-live-cell.test.ts:106-133
  - tests/live/empty-template-warning-registration-live-cell.test.ts:109-136
  - tests/live/escaped-quote-inline-rename-live-cell.test.ts:103-130
  - tests/live/fn-call-arity-live-cell.test.ts:117-144
  - tests/live/fn-param-sink-array-literal-live-cell.test.ts:120-147
  - tests/live/fn-param-annotation-optional-live-cell.test.ts:167-189
  - tests/live/fn-param-list-unclosed-live-cell.test.ts:156-178
  - tests/live/fn-param-not-identifier-live-cell.test.ts:196-218
  - tests/live/harness.ts:814-840
sites: 8
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Eight in-scope live cells redeclare the theta-system-note entry-walk that tests/live/harness.ts already implements as collectSystemNotes

## Observation
Every one of the ten files in this review's scope drives `bootShippedExtension`
and needs to read the `theta-system-note` / `theta-progress-entry` channel off
`handle.sessionManager.getEntries()`. Eight of the ten redeclare the identical
entry-walking loop that decides, per entry, whether it is a `theta-system-note`
(push its string or text-part content) or a `theta-progress-entry` whose `data`
carries a `content` string (push that too). Five declare it as a named
top-level function `systemNoteContents`, byte-identical across all five
(`md5sum` of the function body: `380e0a2d20e473fb1ab80d1ae69bac17` in every
case). Three inline the identical loop body directly inside their `it()`
(`bootNotes`/`notes` local variable, same per-entry branching, same
`theta-progress-entry` PIC-72 comment verbatim). `tests/live/harness.ts`
already implements this exact walk as the unexported `collectSystemNotes`
function, which all eight files already import other symbols from
(`bootShippedExtension`, `driveSlashCaptureTurn`, `plantThetaWorkspace`,
`requireLiveProvider`) at their top.

## Evidence
tests/live/empty-object-discriminator-field-withhold-live-cell.test.ts:106-118 (one of five identical named-function copies):
```ts
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
```

tests/live/fn-param-list-unclosed-live-cell.test.ts:156-166 (one of three inline copies, no function wrapper, local `notes`):
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

tests/live/harness.ts:814-840 (the pre-existing, unexported equivalent already in the module all eight files import from):
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

Exact search and count, this review's scope only: `grep -n "function systemNoteContents"`
over the ten in-scope files → 5 hits (empty-object-discriminator-field-withhold,
empty-template-warning-registration, escaped-quote-inline-rename, fn-call-arity,
fn-param-sink-array-literal); `grep -n "const bootNotes: string\[\] = \[\];\|const notes: string\[\] = \[\];"`
over the remaining five → 3 hits carrying the identical loop
(fn-param-annotation-optional, fn-param-list-unclosed, fn-param-not-identifier).
`awk '/^function systemNoteContents/,/^}/' <file> | md5sum` over all five named
copies → the same hash (`380e0a2d20e473fb1ab80d1ae69bac17`) in every case. The
two files that do NOT redeclare it
(err-note-render-record-error-field-live-cell.test.ts,
execution-status-parfor-ui-live-cell.test.ts) read the channel through
`driveSlashCaptureTurn`'s own `systemNotes` field, which is itself sourced from
`collectSystemNotes` inside harness.ts (harness.ts:732) — they do not need the
whole-session read the other eight do.

## Why this is a problem
The identical ~28-line entry-classification walk — including its PIC-72
doc-comment paragraph, verbatim — is retyped whole into eight separate test
files rather than imported once. `tests/live/harness.ts` already implements
the same walk as `collectSystemNotes` and is already the import source every
one of these eight files draws its harness functions from; it is presently
unexported, but the eight local copies are otherwise indistinguishable from it
byte-for-byte (five of them exactly, hash-verified) or logic-for-logic (the
remaining three, inlined). A change to the channel-union rule (the PIC-72
comment's own subject) requires editing this walk in nine places (harness.ts
plus the eight test files) to stay consistent, rather than one.

## Suggested direction (non-binding, optional)
`tests/live/harness.ts` already hosts `collectSystemNotes` and already exports
sibling readers (`collectAssistantTexts`) and fixture builders
(`messageEntry`, `systemNoteEntry`) built for exactly this entry shape; it is
the module all eight files already import from for everything else this walk
depends on (`getEntries()`'s consumers, `bootShippedExtension`).

## False-positive check
- Gate-pin: none of the eight files matches `*gate*.test.ts` or the named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate) — confirmed
  by filename; none of the eight declares a pinned count or inventory
  assertion in this function.
- Recording-double: `systemNoteContents`/the inline loop reads immutable
  settled entries and returns a derived list; it does not record a call for a
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "function systemNoteContents"
  docs/bugs/` → 0 files; none of the eight files' own bug docs (0129, 0085,
  0229, 0131, 0156, 0150, 0151, 0225) documents a rationale for redeclaring
  this reader locally instead of importing `collectSystemNotes`.
- coverage-matrix/bug-doc citation search: `grep -n
  "empty-object-discriminator-field-withhold-live-cell\|empty-template-warning-registration-live-cell\|escaped-quote-inline-rename-live-cell\|fn-call-arity-live-cell\|fn-param-sink-array-literal-live-cell\|fn-param-annotation-optional-live-cell\|fn-param-list-unclosed-live-cell\|fn-param-not-identifier-live-cell"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name, count, or assertion — only that the
  repeated reader function could be imported once — so the citation carve-out
  does not bind.
- Coverage check: the claim is entirely about a repeated reader-function
  DEFINITION, not a missing test path; every copy is exercised by its own
  file's test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all five named `systemNoteContents` copies hash to 380e0a2d20e473fb1ab80d1ae69bac17, and harness.ts:814-840 `collectSystemNotes` hashes identically after a name-only substitution; the three inline copies (fn-param-annotation-optional:167-189, fn-param-list-unclosed:156-178, fn-param-not-identifier:196-218) reproduce the same branching and verbatim PIC-72 comment against `handle.sessionManager.getEntries()`; all eight files import from ./harness (8/8), the two excluded files have no such loop, and `collectSystemNotes` is unexported (only `collectAssistantTexts`/`systemNoteEntry` are exported) — D7 boilerplate-duplication in tests/ with no gate/recording-double/coverage-matrix carve-out; no tracked PTQ covers this walk (PTQ-0229 is the `message()`/`note()` fixture builders, a different root cause), though the pattern is repo-wide (~35 copies in tests/live, grep `function systemNoteContents`) and ~13 same-wave intake siblings file other shard-scoped slices of it, so acceptance should fold them into one row (triage: claude-fable-5-1)
