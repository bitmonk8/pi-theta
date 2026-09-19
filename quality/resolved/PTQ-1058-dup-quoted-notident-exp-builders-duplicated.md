---
id: PTQ-1058
title: Both in-scope files redeclare identical DUP/QUOTED/NOTIDENT Exp-builder functions with no shared tests/helpers/ export
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/inline-object-stray-close-token-split.test.ts:234-244
  - tests/inline-object-type-source-capture.test.ts:244-252
sites: 2
fix_scope: cross-module
d4_class: clone
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Both in-scope files redeclare identical DUP/QUOTED/NOTIDENT Exp-builder functions with no shared tests/helpers/ export

## Observation
Both `tests/inline-object-stray-close-token-split.test.ts` and
`tests/inline-object-type-source-capture.test.ts` declare `DUP`, `QUOTED` and
`NOTIDENT` functions that each build an `Exp` object of the shape
`{ severity: "error", code: <RULE_CONSTANT>, fills: [["<field>", <arg>]] }`
for the four inline raw-key registry rows. Each function's body is
byte-identical between the two files (only the parameter's own local name —
`field` in one file, `key` in the other — differs). Neither file imports
these from a shared module. The stray-close-token-split file additionally
declares a fourth, `RENAMED`, sibling of the same shape that the
type-source-capture file has no fixture needing.

## Evidence
`tests/inline-object-stray-close-token-split.test.ts:234-244` (re-read
immediately before filing):
```ts
function DUP(field: string): Exp {
  return { severity: "error", code: DUPLICATE_INLINE, fills: [["<field>", field]] };
}
function QUOTED(field: string): Exp {
  return { severity: "error", code: QUOTED_INLINE, fills: [["<field>", field]] };
}
function RENAMED(field: string): Exp {
  return { severity: "error", code: RENAMED_INLINE, fills: [["<field>", field]] };
}
function NOTIDENT(field: string): Exp {
  return { severity: "error", code: NOT_IDENT, fills: [["<field>", field]] };
}
```

`tests/inline-object-type-source-capture.test.ts:244-252` — byte-identical
bar the `field`/`key` parameter-name spelling and declaration order:
```ts
function NOTIDENT(field: string): Exp {
  return { severity: "error", code: NOT_IDENT, fills: [["<field>", field]] };
}
function DUP(key: string): Exp {
  return { severity: "error", code: DUPLICATE_INLINE, fills: [["<field>", key]] };
}
function QUOTED(key: string): Exp {
  return { severity: "error", code: QUOTED_INLINE, fills: [["<field>", key]] };
}
```

`DUPLICATE_INLINE`, `QUOTED_INLINE`, `RENAMED_INLINE` and `NOT_IDENT` are each
file's own module-level constant bound to the same four registered codes
(`theta/parse/duplicate-inline-field-name`,
`theta/parse/quoted-inline-field-name`,
`theta/parse/renamed-inline-field-name`,
`theta/parse/inline-field-name-not-identifier`) in both files.

Pattern-wide search: `grep -rl "^function NOTIDENT(field: string): Exp\|^function NOTIDENT(key: string): Exp" tests/*.test.ts`
returns 8 files, `grep -rl "^function DUP(field: string): Exp\|^function DUP(key: string): Exp" tests/*.test.ts`
returns 9 files, and `grep -rl "^function QUOTED(field: string): Exp\|^function QUOTED(key: string): Exp" tests/*.test.ts`
returns 9 files — each list including both files in this review's scope. The
other files these searches return
(`tests/brace-and-angle-annotation-junk-refusal.test.ts`,
`tests/escaped-quote-inline-field-name-refusal.test.ts`,
`tests/generic-argument-bracket-group-truncation.test.ts`,
`tests/generic-argument-inline-field-key-rules.test.ts`,
`tests/inline-object-empty-entry-slot-refusal.test.ts`,
`tests/inline-object-empty-field-type-truncation.test.ts`,
`tests/inline-object-keyless-entry-refusal.test.ts`,
`tests/inline-object-malformed-entry-resync.test.ts`,
`tests/inline-object-wire-name-rename-refusal.test.ts`) are outside this
review's briefed scope and are named only to size the pattern, not cited as
filed sites.

## Why this is a problem
Each function is a one-line object literal wrapping a fixed severity, a
fixed registered code and a single `<field>` placeholder fill — there is no
domain-specific branching or per-file variation in the body, only in which
subset of the four rule builders a given file happens to need. The two
in-scope files build the identical three-function subset (`DUP`, `QUOTED`,
`NOTIDENT`) independently, so a change to the fill shape (for example, if a
row ever needed a second placeholder) would have to be applied by hand to
each file's copy of the same three one-line functions.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module could export the four `DUP`/`QUOTED`/`RENAMED`/
`NOTIDENT` builders (each already closing over nothing but its own registered
code constant) alongside the registry-message helpers both files already
import from `tests/helpers/`.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin
  patterns (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: these builders return a plain `Exp` value from
  fixed inputs; they record no calls and back no "never called" witness, so
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "function DUP\|function QUOTED\|function NOTIDENT" docs/bugs/0238-*.md docs/bugs/0228-*.md`
  returns no hits — neither bug document this pair witnesses states a
  rationale for two independent copies of these builders.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-stray-close-token-split\|inline-object-type-source-capture"
  docs/reference/coverage-matrix.md` returns no hits. Both files are cited by
  name in their respective bug documents (0238, 0228) as fix witnesses,
  always for specific cell/group ids, never for the internal shape of
  `DUP`/`QUOTED`/`NOTIDENT`; this finding proposes no merge, rename, or
  deletion of either file or any `it()`/`describe()` block — only that the
  duplicated builder trio could be shared.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; every copy is exercised by the diagnostic-list cells
  that reference `DUP(...)`/`QUOTED(...)`/`NOTIDENT(...)` in its own file
  today.
- Prior-filing overlap check: `grep -rl "function DUP(\|DUPLICATE_INLINE" quality/intake/*.md quality/issues/*.md quality/resolved/*.md`
  (before this filing) returned no hits naming this builder trio in any
  prior finding against either in-scope file; the many prior filings against
  these two files (PTQ-0475/0555/0596/0796/0811/0827/0843/0864/0877/0878/0984/0996
  and this wave's d7-04/d7-05) each cover a disjoint function (the four-page
  registry read, a frontmatter builder, the `expectGroup` harness, a
  captured-query-schema reader, `msg()`, a position matrix, `readDiagnosticsPage`,
  `diagLines`, `loweredParams`, and the `Exp`/`render`/`renderAll` trio), none
  of which is `DUP`/`QUOTED`/`NOTIDENT`/`RENAMED`.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce exactly at stray-close-token-split:234-244 (DUP/QUOTED/RENAMED/NOTIDENT) and type-source-capture:244-252 (NOTIDENT/DUP/QUOTED); a mktemp sort+diff of the three shared `return {...}` bodies with the `field`/`key` parameter normalised is empty (byte-identical), both files bind the same four `theta/parse/*` code constants (:212-215 / :179-183) and declare the same 5-line `interface Exp` (:228 / :196); every copy is live (stray: DUP 3 calls, QUOTED 1, NOTIDENT 1, RENAMED 1; type-source: DUP 1, QUOTED 1, NOTIDENT 9); `grep -rn "DUP\b\|NOTIDENT\|QUOTED\b\|interface Exp" tests/helpers/` → 0, so no shared export exists; the stated pattern greps reproduce at 8/9/9 files (11 tests/*.test.ts declare at least one of the four builders, all outside a `*gate*` pattern); docs/bugs 0238/0228 and coverage-matrix greps → 0 as stated; no gate/recording-double/red-test carve-out applies (plain data builders); dedupe: only quality/ hit is this candidate — sibling intake d7-05 covers the disjoint `Exp`/`render`/`renderAll` block of the same pair and PTQ-0475/0811/0827/0996 etc. cover other helpers in these files — D7 boilerplate duplication inside tests/ whose fix is a mechanical import of the four one-line builders (which depends on d7-05's shared `Exp` type landing) (triage: claude-fable-5-1)
