---
id: PTQ-0229
title: tests/b0287 and tests/b0289 each define their own copy of the same SessionManager message/note entry-fixture builders
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0287-live-harness-assistant-text-reader.test.ts:34-42
  - tests/b0289-settled-empty-text-turn-classification.test.ts:111-119
sites: 2
fix_scope: localized          # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# tests/b0287 and tests/b0289 each define their own copy of the same SessionManager message/note entry-fixture builders

## Observation
tests/b0287-live-harness-assistant-text-reader.test.ts and
tests/b0289-settled-empty-text-turn-classification.test.ts each declare a
private, module-scope `message(role, content, ...)` factory returning a
`{ type: "message", message: { role, content, ... } }` object shaped as an
in-memory `SessionManager` entry, and a private `note(content)` factory
returning `{ customType: "theta-system-note", content }`. Both files import
their subject functions from the same module — `collectAssistantTexts` in
b0287, `classifyLastTurn`/`captureSettledTurn` in b0289, both from
`tests/live/harness.ts` — and that module exports neither factory. `note()`'s
body is byte-identical between the two files; `message()`'s two-argument core
(`role`, `content`) is identical between them, with b0289 adding an optional
third `stopReason` parameter that b0287's cells never need.

## Evidence
tests/b0287-live-harness-assistant-text-reader.test.ts:34-42:
```ts
/** One in-memory `SessionManager` message entry, shaped as the readers walk it. */
function message(role: string, content: unknown): unknown {
  return { type: "message", message: { role, content } };
}

/** A `theta-system-note` custom entry — a channel the assistant reader must not admit. */
function note(content: string): unknown {
  return { customType: "theta-system-note", content };
}
```

tests/b0289-settled-empty-text-turn-classification.test.ts:111-119:
```ts
/** One in-memory `SessionManager` message entry, shaped as the harness readers walk it. */
function message(role: string, content: unknown, stopReason?: string): unknown {
  return { type: "message", message: { role, content, stopReason } };
}

/** A `theta-system-note` custom entry — clause C's accept reason. */
function note(content: string): unknown {
  return { customType: "theta-system-note", content };
}
```

Exact searches (both reviewed files included in each count): `grep -rn
"^function message(role: string, content: unknown" tests --include="*.test.ts"`
→ 3 hits, all in the same live-harness bug cluster: the two files above plus
`tests/b0290-re-ask-count-observable.test.ts:76` (outside this review's scope,
carrying the identical 3-argument signature and body b0289 has); `grep -rl
"^function note(content: string): unknown {" tests --include="*.test.ts"` → 2
hits, exactly the two files above (b0290 does not declare its own `note`).
`tests/live/harness.ts` — the module both reviewed files import their subject
functions from — exports no function named `message` or `note` and no
entry-builder of this shape; it does contain unexported readers
(`collectUserTexts`, `collectSystemNotes`, and the exported
`collectAssistantTexts`) that walk the identical `{type:"message",
message:{role, content}}` / `{customType:"theta-system-note", content}` shapes
these two local factories construct.

## Why this is a problem
Two small, documented fixture-construction functions are retyped whole into a
second file rather than defined once: `note()` is byte-identical apart from its
doc comment, and `message()`'s shared two-argument core is identical, differing
only by an additive optional parameter. Neither reviewed file's import list
draws either factory from anywhere, because no module currently exports them —
`tests/live/harness.ts`, the one module both files already import their
subject-under-test functions from, hosts closely related unexported readers
over the exact same entry shape but no matching builder. The same two-argument
core recurs a third time, unchanged, in a sibling file outside this review's
scope (tests/b0290-re-ask-count-observable.test.ts:75-78), so the duplication
is not confined to one pair of files.

## Suggested direction (non-binding, optional)
`tests/live/harness.ts` already exports the reader functions
(`collectAssistantTexts`, and internally `collectUserTexts`/
`collectSystemNotes`) that walk exactly the entry shape `message()`/`note()`
construct, and both reviewed files already import from it for their subject
functions; that module is where such fixture constructors would sit beside the
readers they feed.

## False-positive check
- Gate-pin: neither `tests/b0287-live-harness-assistant-text-reader.test.ts`
  nor `tests/b0289-settled-empty-text-turn-classification.test.ts` matches
  `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); confirmed by filename, and neither
  function is a pinned count or inventory assertion.
- Recording-double: `message()`/`note()` each return a literal object
  constructed fresh from their arguments; neither records a call or backs a
  "never called" assertion, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "function message(role\|function
  note(content" docs/bugs/` → 0 files. `docs/bugs/0287-…md` (Status: fixed,
  0.284.0) and `docs/bugs/0289-…md` (Status: fixed, 0.286.0) each name their
  own reviewed test file as that bug's witness, but neither documents a
  rationale — a "mirrors sibling" note or otherwise — for redeclaring these two
  helper functions locally rather than sharing one definition.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0287-live-harness-assistant-text-reader\|b0289-settled-empty-text-turn-classification"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no change
  to any `it()`/`describe()` name, count, or assertion — only that the two
  helper-function bodies could be defined once and imported — so the citation
  carve-out does not bind.
- Coverage check: the claim is entirely about a repeated fixture-builder
  DEFINITION, not a missing test path; both copies are exercised by every test
  in their own file (`npx vitest run
  tests/b0287-live-harness-assistant-text-reader.test.ts
  tests/b0289-settled-empty-text-turn-classification.test.ts` → 15 passed
  (15), reproduced at HEAD).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all cited excerpts/lines/search counts (3 message hits, 2 note hits, 0 docs/bugs and coverage-matrix hits, 15/15 tests passing) reproduce exactly, both files already import from tests/live/harness.ts which hosts unexported readers over the identical entry shape but exports neither builder, and unlike the rejected sibling-duplication precedents no comparable shared builder was overlooked and no file documents a "mirrors" rationale for the redeclaration (triage: claude-opus-5)
