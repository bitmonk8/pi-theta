---
id: PTQ-1492
title: malformedFieldLine() hand-copies the registry Message string instead of calling the file's own msg()/registryMessageOf oracle every sibling renderer in the same file uses
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inline-empty-object-type.test.ts:171-174
  - tests/inline-empty-object-type.test.ts:138-140
  - docs/spec_topics/diagnostics/code-registry-parse.md:103
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# malformedFieldLine() hand-copies the registry Message string instead of calling the file's own msg()/registryMessageOf oracle every sibling renderer in the same file uses

## Observation
`tests/inline-empty-object-type.test.ts` declares five line-rendering helpers
for the codes it exercises (`inlineLine`, `declLine`, `malformedFieldLine`,
`quotedInlineLine`, plus the shared `line`/`msg` pair). Four of the five build
their expected string by calling `msg(code, fills)`, which routes through
`registryMessageOf(REGISTRY, PARSE_REGISTRY_PATH, code, fills)` — the file's
own oracle, read from the registry rather than typed by hand. The fifth,
`malformedFieldLine()`, instead types the `theta/parse/malformed-schema-field`
row's *Message* text out by hand as a string literal and passes it straight to
`line()`, bypassing `msg()` and the registry read entirely for this one code.

## Evidence
`tests/inline-empty-object-type.test.ts:138-140` (the canonical in-file oracle
every other renderer uses, re-read immediately before filing):
```ts
function msg(code: string, fills: ReadonlyArray<readonly [string, string]>): string {
  return registryMessageOf(REGISTRY, PARSE_REGISTRY_PATH, code, fills);
}
```

`tests/inline-empty-object-type.test.ts:171-174` (re-read immediately before
filing) — the one renderer that does not call `msg()`:
```ts
function malformedFieldLine(): string {
  const code = "theta/parse/malformed-schema-field";
  return line(code, "malformed schema field; each field is 'name: Type' or 'name as \"WireName\": Type'");
}
```

Contrast with its neighbours, which all go through `msg()` (152, 157, 184):
```ts
function inlineLine(): string {
  return line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", "{}"]]));
}
function declLine(name: string): string {
  return line(EMPTY_BODY, msg(EMPTY_BODY, [["<X>", name]]));
}
function quotedInlineLine(field: string): string {
  return line(QUOTED_INLINE, msg(QUOTED_INLINE, [["<field>", field]]));
}
```

The registry row this string is hand-copied from, `docs/spec_topics/diagnostics/code-registry-parse.md:103`
(*Message* column, tail of the row): `` `malformed schema field; each field is 'name: Type' or 'name as "WireName": Type'` ``
— the exact bytes `malformedFieldLine()` types by hand.

Search: `grep -n "^function .*Line" tests/inline-empty-object-type.test.ts` returns
five renderers (`inlineLine`, `declLine`, `malformedFieldLine`,
`quotedInlineLine`, and `line` itself); `grep -n "msg(" tests/inline-empty-object-type.test.ts`
shows every renderer calling `msg(...)` except `malformedFieldLine`, which
contains no `msg(` call at all.

## Why this is a problem
The file's own header states the file-wide convention in so many words: "every
expected string in this file is read out of the registry through
`registryMessage`; no message prose is copied." `malformedFieldLine()` is the
one place in the file where message prose IS copied — a hand-typed literal
standing in for what every sibling renderer in the same file derives from the
registry via `msg()`. Because the literal is typed once and never re-derived,
a future reword of the `theta/parse/malformed-schema-field` row's *Message*
column would leave this one assertion silently comparing against stale,
hand-copied prose while every sibling renderer in the same file would
automatically track the reworded text through `msg()` — the exact registry-
drift protection the file's stated convention exists to give every other
assertion in it.

## Suggested direction (non-binding, optional)
The natural shape, matching the file's own stated convention and its four
other renderers, is `malformedFieldLine()` calling `msg(code, [])` the same
way `inlineLine`/`declLine`/`quotedInlineLine` do.

## False-positive check
Gate-pin check: not a `*gate*.test.ts` file; the pinned-count carve-out does
not apply. Recording-double check: not a fake/double witnessing a MUST-NOT
call; not applicable. docs/bugs/ search: `grep -rn "malformedFieldLine"
docs/bugs/` returns 0 — no documented correct-reason red cites this function
by name. coverage-matrix/bug-doc citation search: `grep -rn
"malformedFieldLine" docs/reference/coverage-matrix.md docs/bugs/` returns 0;
no merge/rename/delete is proposed here regardless. This finding is about an
assertion's own oracle-sourcing shape in test code that already exists, not
about a missing test or an untested path, so it does not drift into coverage.
Prior-filing check: `grep -rl "malformedFieldLine" quality/resolved
quality/issues quality/intake` before filing returned no hit naming this
function; PTQ-0801/0802/1328 (already filed against this same file pair) cover
`diagLines()` and `msg()` reimplementation respectively, not this renderer.

## Triage
verdict: confirmed — independently re-verified: `malformedFieldLine()` at tests/inline-empty-object-type.test.ts:171-174 passes a hand-typed literal to `line()` with no `msg(` call, byte-identical to the *Message* column of code-registry-parse.md:103 (`malformed schema field; each field is 'name: Type' or 'name as "WireName": Type'`); `grep -n "^function .*Line\|msg("` reproduces — `inlineLine`/`declLine`/`quotedInlineLine` (152/157/184) and the inline renders at 862/875/1020 all route through `msg()` → `registryMessageOf` (load-row-harness.ts:61-72, whose `fills` defaults to `[]`, so `msg(code, [])` is directly available); the file's own header (:56-58) states "every expected string here is read out of the registry through `registryMessage`; no message prose is copied", and the same-named `malformedFieldLine` in the two sibling files (inline-object-quoted-field-name-refusal.test.ts:191-193, schema-field-discard-prefix-retention.test.ts:146-148) already use `msg(MALFORMED_FIELD, [])` — so this is the lone hand-copied registry-prose fixture, D7 copy-paste-fixture/boilerplate class with a mechanical anchor (stated convention + registry-drift protection every sibling has), live at 3 call sites (600/742/778); not a gate file, no recording double, no it()/describe() change, `grep -rn malformedFieldLine docs/` → 0 (no bug-doc or coverage-matrix cite); the docs/ entry under locations is the copied oracle row cited as evidence, not a smell site — the fix touches tests/ only; dedupe clean — resolved PTQ-1328 migrated this file's `msg()` onto registryMessageOf and left this renderer untouched, PTQ-0751/0205 cover fixture-harness and diagLine duplication, PTQ-1343 is the house precedent confirming hard-coded registry-prose builders under D7 (triage: claude-fable-5-1)
