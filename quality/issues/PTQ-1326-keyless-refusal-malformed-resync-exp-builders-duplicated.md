---
id: PTQ-1326
title: Both in-scope files redeclare identical DUP/QUOTED/RENAMED/NOTIDENT Exp-builder functions with no shared tests/helpers/ export
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-keyless-entry-refusal.test.ts:221-232
  - tests/inline-object-malformed-entry-resync.test.ts:197-208
sites: 2
fix_scope: cross-module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# Both in-scope files redeclare identical DUP/QUOTED/RENAMED/NOTIDENT Exp-builder functions with no shared tests/helpers/ export

## Observation
`tests/inline-object-keyless-entry-refusal.test.ts` and
`tests/inline-object-malformed-entry-resync.test.ts` each declare `DUP`,
`QUOTED`, `RENAMED` and `NOTIDENT` functions that each build an `Exp` object
of the shape `{ severity: "error", code: <RULE_CONSTANT>, fills: [["<field>",
<arg>]] }` for the four inline raw-key registry rows. Every one of the four
function bodies is byte-identical between the two files (only their
declaration order differs). Neither file imports these from a shared module;
each file also declares its own identical 5-line `interface Exp`.

## Evidence

`tests/inline-object-keyless-entry-refusal.test.ts:221-232` (re-read
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

`tests/inline-object-malformed-entry-resync.test.ts:197-208` — byte-identical
bar declaration order:
```ts
function NOTIDENT(field: string): Exp {
  return { severity: "error", code: NOT_IDENT, fills: [["<field>", field]] };
}
function DUP(field: string): Exp {
  return { severity: "error", code: DUPLICATE_INLINE, fills: [["<field>", field]] };
}
function QUOTED(field: string): Exp {
  return { severity: "error", code: QUOTED_INLINE, fills: [["<field>", field]] };
}
function RENAMED(field: string): Exp {
  return { severity: "error", code: RENAMED_INLINE, fills: [["<field>", field]] };
}
```

Both files bind `DUPLICATE_INLINE`, `QUOTED_INLINE`, `RENAMED_INLINE` and
`NOT_IDENT` to the same four registered codes
(`theta/parse/duplicate-inline-field-name`,
`theta/parse/quoted-inline-field-name`,
`theta/parse/renamed-inline-field-name`,
`theta/parse/inline-field-name-not-identifier`), each as its own module-level
constant.

Pattern-wide search (repeated from a prior finding against a different file
pair, PTQ-1058, whose own evidence explicitly named both files in this
review's scope as "outside this review's briefed scope and are named only to
size the pattern, not cited as filed sites"): `grep -rl "^function NOTIDENT(field: string): Exp" tests/*.test.ts`
returns 8 files, `grep -rl "^function DUP(field: string): Exp" tests/*.test.ts`
returns 9 files, `grep -rl "^function QUOTED(field: string): Exp" tests/*.test.ts`
returns 9 files — each list including both files in THIS review's scope. No
other file's location is claimed here; only the two files inside this
review's briefed scope are cited as filed sites.

## Why this is a problem
Each function is a one-line object literal wrapping a fixed severity, a fixed
registered code and a single `<field>` placeholder fill — there is no
domain-specific branching or per-file variation in the body. The two files
under review build the identical four-function set independently, so a
change to the fill shape (for example, a row ever needing a second
placeholder) would have to be hand-applied to both files' copies of the same
four one-line functions and the identical `interface Exp` each declares
beside them.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module could export the four `DUP`/`QUOTED`/`RENAMED`/
`NOTIDENT` builders (each closing over nothing but its own registered code
constant) and the shared `Exp` shape, alongside the registry-message helpers
both files already import from `tests/helpers/`.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named
  gate-kin patterns (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate).
- Recording-double check: these builders return a plain `Exp` value from
  fixed inputs; they record no calls and back no "never called" witness, so
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "function DUP\|function QUOTED\|function RENAMED\|function NOTIDENT" docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md docs/bugs/0231-well-formed-field-behind-malformed-entry-unchecked.md`
  → 0 hits — neither bug document either file witnesses states a rationale
  for independent copies of these builders.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-keyless-entry-refusal\|inline-object-malformed-entry-resync"
  docs/reference/coverage-matrix.md` → 0 hits. Both files are cited by name
  in their respective bug documents (0244, 0231) as fix witnesses, always
  for specific cell/group ids, never for the internal shape of
  `DUP`/`QUOTED`/`RENAMED`/`NOTIDENT`; this finding proposes no merge,
  rename, or deletion of either file or any `it()`/`describe()` block — only
  that the duplicated builder quartet could be shared.
- Coverage check: the claim is about a repeated function DEFINITION, not a
  missing test path; every copy is exercised by the diagnostic-list cells
  that reference `DUP(...)`/`QUOTED(...)`/`RENAMED(...)`/`NOTIDENT(...)` in
  its own file today (both files' group (C)/(F)/(G) cells call all four).
- Prior-filing overlap check: `grep -rl "function DUP(\|DUPLICATE_INLINE" quality/intake/*.md quality/issues/*.md quality/resolved/*.md`
  finds PTQ-1058, whose `locations:` cites a disjoint pair
  (`tests/inline-object-stray-close-token-split.test.ts`,
  `tests/inline-object-type-source-capture.test.ts`) and whose own evidence
  section explicitly lists both files in this review's scope only "to size
  the pattern," not as filed sites — confirming this exact pair was left
  unfiled by that prior finding. The many other prior filings against these
  two files (PTQ-0867/0989/1028/0596/0878/0951/0984 and this wave's own
  registry/diagLines findings, now resolved) each cover a disjoint function
  (the four-page registry read, `diagLines`, the `expectGroup` harness, the
  `envelope()`/`loweredParams` builders, `registryMessageOf`/`msg()`), none
  of which is `DUP`/`QUOTED`/`RENAMED`/`NOTIDENT`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce exactly (keyless-entry-refusal:221-232 DUP/QUOTED/RENAMED/NOTIDENT; malformed-entry-resync:197-208 NOTIDENT/DUP/QUOTED/RENAMED), the four one-line bodies are byte-identical, both files bind the same four `theta/parse/*` constants (:187-190 / :180-183) and the same 5-line `interface Exp` (:200 / :190), and every copy is live (keyless: DUP 2/QUOTED 2/RENAMED 2/NOTIDENT 4 calls; resync: 3/4/2/19); bug-doc 0244/0231 and coverage-matrix greps → 0 as stated, no gate/recording-double/red-test carve-out applies; ONE claim is stale and refuted: the title's "no shared tests/helpers/ export" — the PTQ-1058 fix (commits 27eb9e20..9a51e5ab) already landed `export interface Exp` and `export function DUP/QUOTED/RENAMED/NOTIDENT` in tests/helpers/registry-oracle.ts:84-117, a module BOTH files already import `REGISTRY` from, and the pattern greps now return 5 files (not 8/9); that stale detail does not touch the root cause — the two in-scope files still redeclare the identical quartet instead of importing it, so this is D7 boilerplate duplication of the well-precedented not-migrated class and the fix is a mechanical import; not a duplicate: PTQ-1058 is resolved with disjoint locations and explicitly left this pair unfiled, and no other quality/ row cites both files for these builders (triage: claude-fable-5-1)
