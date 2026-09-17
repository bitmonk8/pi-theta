---
id: PTQ-0754
title: interpolation-parse-diagnostics.test.ts redeclares the ANTHROPIC_MODEL fixture object instead of importing tests/helpers/scripted-live-session-harness.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/interpolation-parse-diagnostics.test.ts:1017-1023
  - tests/helpers/scripted-live-session-harness.ts:36-47
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# interpolation-parse-diagnostics.test.ts redeclares the ANTHROPIC_MODEL fixture object instead of importing tests/helpers/scripted-live-session-harness.ts

## Observation
`tests/interpolation-parse-diagnostics.test.ts`'s group-(f) "rendered turn"
section declares its own module-scope `ANTHROPIC_MODEL` fixture object to seed
`ctx.model` / `ModelRegistry.getAvailable()` for its live prompt-mode drive.
`tests/helpers/scripted-live-session-harness.ts` already exports an object of
that exact name with field-for-field identical content, built for this same
purpose (its own header names the shape as "the bug-0288 fixture model" used
by prompt-mode drives over a scripted live session). The local declaration is
not an import of the helper.

## Evidence
tests/interpolation-parse-diagnostics.test.ts:1017-1023 — local declaration:
```ts
/** The user session's selected model (`ctx.model`) — provider derivation only. */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

tests/helpers/scripted-live-session-harness.ts:36-47 — the canonical,
already-exported object of the same name and shape:
```ts
/**
 * The user session's selected model (the bug-0288 fixture model). Distinct
 * `.api` / `.provider` strings (the bug-0009 fixture discipline) so a
 * synthesised `TransportError.provider` is checked against the API-shaped
 * value the PIC-50 derivation pins.
 */
export const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};
```

Import check: `grep -n "scripted-live-session-harness"
tests/interpolation-parse-diagnostics.test.ts` returns no hit — the file does
not import the helper module at all. Pattern-wide search:
`grep -rln "class LiveSessionDouble" tests/` returns 13 files, including
`interpolation-parse-diagnostics.test.ts`; `git log --oneline -1 --
tests/helpers/scripted-live-session-harness.ts` shows the helper (PTQ-0328)
migrated only three of that lineage (b0288, b0319, b0414, per its own header),
leaving this file's local `ANTHROPIC_MODEL` unmigrated.

## Why this is a problem
`tests/helpers/scripted-live-session-harness.ts` exists specifically to hold
this exact fixture object after a prior review found it (and its
`SessionEntryDouble`/`parseDeps`/`appendUserEntry` siblings) "redeclared
byte-for-byte" across files that drive `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody` against a scripted live session — the
same pipeline `interpolation-parse-diagnostics.test.ts`'s group-(f)
`disposition()` helper drives. The object's own doc-comment in the canonical
helper cites two other fixture-discipline reasons (`bug-0288`/`bug-0009`) for
its exact field values, which this file's independent copy does not carry or
depend on, yet still had to reproduce field-for-field to get the same
behaviour.

## Suggested direction (non-binding, optional)
`tests/helpers/scripted-live-session-harness.ts` already exports
`ANTHROPIC_MODEL`; importing it in place of the local declaration is the
existing, purpose-built home for this exact fixture object.

## False-positive check
- Gate-pin check: `interpolation-parse-diagnostics.test.ts` does not match
  `*gate*.test.ts` or the named kin; the cited lines are a fixture-model
  constant, not a pinned count or corpus inventory assertion (the file's own
  census counts in its group-(g) section are a separate, legitimately pinned
  mechanism this finding does not touch).
- Recording-double check: `ANTHROPIC_MODEL` is a plain data fixture, not a
  recording double; the file's own `LiveSessionDouble` does record
  `sentQueryTexts` for positive assertions, not a "never called" witness, so
  the negative-witness carve-out is not implicated by this finding, which is
  scoped to the `ANTHROPIC_MODEL` object only.
- docs/bugs/ signature search: `grep -n "ANTHROPIC_MODEL"
  docs/bugs/*.md` returns no hit; the file is not a documented correct-reason
  red — `npx vitest run tests/interpolation-parse-diagnostics.test.ts` is
  this file's own subject (bug 0122's settled-rule witness), unrelated to
  fixture provenance.
- coverage-matrix/bug-doc citation search: `grep -rn
  "interpolation-parse-diagnostics" docs/reference/coverage-matrix.md
  docs/bugs/*.md` shows the file cited by bug 0122's own doc for its
  cell groups (a)-(g); none of those citations target lines 1011-1023, the
  fixture setup this finding proposes importing from the helper, and no
  merge/rename/delete of any cited cell is proposed.
- Coverage check: this finding is about a duplicated fixture-object
  DECLARATION, not a missing test path; every cell in the file's group (f)
  continues to pass under the current inline declaration.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: the local `ANTHROPIC_MODEL` at tests/interpolation-parse-diagnostics.test.ts:1018-1023 is field-for-field identical to the export at tests/helpers/scripted-live-session-harness.ts:42-47, the file imports nothing from that helper (only ./helpers/e2e-s1 and ./helpers/theta-corpus), its two use sites (registryDouble getAvailable at :1075, ctxLive model at :1082) are both `as unknown as` casts so the import is a drop-in, the file passes today (41/41), and the helper's header + git log (feefe7ca, PTQ-0328) confirm the migration covered only b0288/b0319/b0414, leaving this copy a genuine residual (the PTQ-0301 precedent); no D7 carve-out applies (not a gate test, plain data fixture not a recording double, no docs/bugs or coverage-matrix pin on the cited lines, no merge/rename proposed) and no existing/resolved row or same-wave sibling cites this file as a location (PTQ-0272 is a different model()/registryOf() pair) (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
