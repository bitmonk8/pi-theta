---
id: PTQ-0666
title: DECLS, TRIAGE_DEF and yamlQuoted are declared byte-identically in both in-scope files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-literal-sublanguage-lowering.test.ts:284-310
  - tests/params-scalar-nontype-text-refusal.test.ts:255-282
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# DECLS, TRIAGE_DEF and yamlQuoted are declared byte-identically in both in-scope files

## Observation
Both files in this review's scope — sibling test files for the same
`params:`-position bug family (bug 0056's literal sublanguage, bug 0059's
scalar-text refusal) — separately declare a `DECLS` string constant, a
`TRIAGE_DEF` object literal, and a `yamlQuoted` function, all three
byte-identical (or identical apart from a doc-comment word) between the two
files. Both files also derive further fixtures from this trio: each embeds
`DECLS` into its own theta-source template and asserts `TRIAGE_DEF` as the
expected `$defs["Triage"]` entry.

## Evidence
`tests/params-literal-sublanguage-lowering.test.ts:284-294,306-310`:
```ts
/** The one declared type every control that names a schema resolves against. */
const DECLS = "schema Triage { urgent: boolean }\n";

/** The closed lowering of `schema Triage { urgent: boolean }`. */
const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};
...
function yamlQuoted(typeSource: string): string {
  return `'${typeSource.replace(/'/g, "''")}'`;
}
```

`tests/params-scalar-nontype-text-refusal.test.ts:255-264,281-282`:
```ts
/** `Triage` is declared in every fixture; `Tirage` and `Ghost` are declared nowhere. */
const DECLS = "schema Triage { urgent: boolean }\n";

/** The closed lowering of `schema Triage { urgent: boolean }`. */
const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};
...
function yamlQuoted(typeSource: string): string {
  return `'${typeSource.replace(/'/g, "''")}'`;
}
```

Both `DECLS` strings are byte-identical (`"schema Triage { urgent: boolean
}\n"`), both `TRIAGE_DEF` object literals are byte-identical field-for-field,
and both `yamlQuoted` function bodies are byte-identical
(`` `'${typeSource.replace(/'/g, "''")}'` ``); only the doc comments and one
file's additional `BODY`/`src()` wrapper around `DECLS` differ.

## Why this is a problem
Three separate pieces of fixture scaffolding — a schema declaration string, its
pre-computed lowered form, and a YAML-quoting helper — are typed out a second
time in the second file rather than shared, even though the two files already
sit side by side in the same `params:`-position bug family and both need
exactly the same `Triage` fixture and the same YAML-quoting behaviour for the
same reason (wrapping a theta type expression as a `params:` YAML scalar).

## Suggested direction (non-binding, optional)
A shared module under `tests/helpers/` could host one `DECLS`/`TRIAGE_DEF`
pair and one `yamlQuoted` function for the `params:`-position bug-family test
files that need this exact fixture, the same way `tests/helpers/e2e-s1.ts` and
`tests/helpers/canonical-slug-oracle.ts` already host adjacent shared
scaffolding for this file family.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable.
- Recording-double check: not applicable — none of the three pieces is a
  recording double or a MUST-NOT witness.
- docs/bugs/ signature search: `grep -rn "DECLS\b\|TRIAGE_DEF\b"
  docs/bugs/*.md` finds only unrelated `DECLS` prose in bug 0203 (a different
  fixture, `schema Cat { a: string }`, in a different bug doc); no bug doc
  gives a rationale for keeping this trio duplicated between these two files.
- coverage-matrix/bug-doc citation search: `grep -n
  "params-literal-sublanguage-lowering\|params-scalar-nontype-text-refusal"
  docs/reference/coverage-matrix.md` → 0 hits. Both files are cited by name in
  several docs/bugs/*.md files as witness tests (0056, 0059, and others), but
  none of those citations name `DECLS`, `TRIAGE_DEF`, or `yamlQuoted`; this
  finding proposes no change to any `it()`/`describe()` name or assertion,
  only the definition site of shared fixture scaffolding.
- Confirmed byte-identity by re-reading both cited ranges immediately before
  filing.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at :284-310 and :255-282 and DECLS/TRIAGE_DEF/yamlQuoted are byte-identical between the two files; D7 copy-paste-fixture class, both sites under tests/, no gate test, 0 coverage-matrix hits, docs/bugs grep hits only bug 0203's unrelated `schema Cat` DECLS; count correction: `grep -rn "function yamlQuoted" tests` → 5 files (adds generic-argument-literal-lowering :176, union-arm-literal-const-lowering :255, union-generic-arm-lowering :245), md5-identical bodies in all 5 and tracked nowhere in issues/resolved — that helper is what keeps this filing live; the DECLS/TRIAGE_DEF portion is a 2-file subset of same-wave confirmed intake qw20260917154546-d7-113-03-triage-fixture-pair-octuplicated.md (8 TRIAGE_DEF sites) and should fold into it at acceptance (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
