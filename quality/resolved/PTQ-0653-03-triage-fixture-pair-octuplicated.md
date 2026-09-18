---
id: PTQ-0653
title: The TRIAGE_DEF closed-lowering constant and BODY fixture source are byte-identical across eight and four sibling test files respectively
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/params-block-mapping-rhs-refusal.test.ts:247-252
  - tests/params-block-mapping-rhs-refusal.test.ts:308
  - tests/params-brace-union-rhs-lowering.test.ts:359-364
  - tests/params-brace-union-rhs-lowering.test.ts:390
sites: 8
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# The TRIAGE_DEF closed-lowering constant and BODY fixture source are byte-identical across eight and four sibling test files respectively

## Observation
Both files in this review's scope declare a module-scope `TRIAGE_DEF`
constant — "The closed lowering of `schema Triage { urgent: boolean }`" — as
the identical six-line JSON-Schema object, and a `BODY` constant holding the
identical two-statement theta source (`"schema Triage { urgent: boolean
}\nlet x = 1\n"`) that every fixture in each file embeds via `` `---\n...\n---\n${BODY}` ``.
The same `TRIAGE_DEF` block, doc comment included, recurs byte-for-byte in
six further sibling lowering-family test files; the same `BODY` assignment
recurs byte-for-byte in two further sibling files.

## Evidence
`tests/params-block-mapping-rhs-refusal.test.ts:247-252`:
```ts
const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};
```

`tests/params-brace-union-rhs-lowering.test.ts:359-364` — byte-identical
(re-read immediately before filing):
```ts
const TRIAGE_DEF = {
  type: "object",
  properties: { urgent: { type: "boolean" } },
  required: ["urgent"],
  additionalProperties: false,
};
```

`tests/params-block-mapping-rhs-refusal.test.ts:308`:
```ts
const BODY = "schema Triage { urgent: boolean }\nlet x = 1\n";
```

`tests/params-brace-union-rhs-lowering.test.ts:390` — byte-identical:
```ts
const BODY = "schema Triage { urgent: boolean }\nlet x = 1\n";
```

Exact search, `TRIAGE_DEF`: `grep -rl "^const TRIAGE_DEF = {" tests/*.ts` →
8 files (the two above plus `tests/generic-argument-literal-lowering.test.ts`,
`tests/inline-object-nested-lowering.test.ts`,
`tests/params-inline-object-lowering.test.ts`,
`tests/params-literal-sublanguage-lowering.test.ts`,
`tests/params-scalar-nontype-text-refusal.test.ts`,
`tests/union-generic-arm-lowering.test.ts`); each of the eight matched blocks
was read directly and the five-line body (`type`/`properties`/`required`/
`additionalProperties`) is byte-identical in every one, only the surrounding
line numbers differing.

Exact search, `BODY`: `grep -n "^const BODY = \"schema Triage" tests/*.ts` →
4 files (the two above plus
`tests/binder-param-line-newline-normalisation.test.ts:285` and
`tests/params-inline-object-lowering.test.ts:229`), each line byte-identical.

## Why this is a problem
The same closed JSON-Schema lowering of one fixture schema declaration, and
the same two-line theta body that declares it, are typed out independently in
up to eight sibling files in the params/lowering test family rather than
imported from one place. Both in-scope files already import shared,
purpose-built test doubles and oracles from `tests/helpers/` for comparable
roles (`tests/helpers/e2e-s1`, `tests/helpers/canonical-slug-oracle`), so a
static fixture constant with no file-local variation is not withheld from
`tests/helpers/` by any stated independence rationale.

## Suggested direction (non-binding, optional)
A `tests/helpers/` export for the `schema Triage { urgent: boolean }` fixture
body and its closed lowering is the natural home the eight (`TRIAGE_DEF`) and
four (`BODY`) byte-identical declarations point at.

## False-positive check
- Gate-pin check: none of the cited files match `*gate*.test.ts` or the named
  gate-kin patterns; the cited lines are a fixture constant, not a pinned
  count or inventory.
- Recording-double check: not applicable — `TRIAGE_DEF`/`BODY` are static
  values, not recording doubles, and back no "never called" witness.
- docs/bugs/ signature search: `grep -rl "TRIAGE_DEF" docs/bugs/*.md` → 0
  hits; neither in-scope file's own bug doc (0041, 0097) states a rationale
  for keeping this fixture file-local.
- coverage-matrix/bug-doc citation search: `grep -n "params-block-mapping-rhs-refusal\|params-brace-union-rhs-lowering" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that the repeated fixture constants could be imported from a shared module — so no citation is disturbed.
- Coverage check: the claim is about a repeated constant DEFINITION, not a
  missing test path; both constants are exercised by every fixture built from
  them in each file.
- Overlap check: grepped `quality/intake` and `quality/resolved` for
  `TRIAGE_DEF` and `"schema Triage"` — 0 hits; no existing finding tracks this
  duplication.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all four excerpts match at the cited lines; `grep "^const TRIAGE_DEF = {" tests/*.ts` → exactly the 8 named files and md5 over the extracted blocks shows the 5-line object body byte-identical in all 8 (7 also share the doc comment; generic-argument-literal-lowering.test.ts:155 words it differently — immaterial); `grep '^const BODY = "schema Triage' tests/*.ts` → exactly the 4 named lines, byte-identical; no Triage fixture exists in tests/helpers/; D7 copy-paste-fixture class, all sites under tests/, no gate tests, 0 coverage-matrix and 0 docs/bugs citations; not tracked in issues/resolved (PTQ-0410 covers the slug oracle, not this fixture) — note partial overlap with same-wave intake qw20260917154546-d7-119-03-decls-triagedef-yamlquoted-duplicated.md, which cites TRIAGE_DEF in a 2-file subset bundled with DECLS/yamlQuoted; consolidate at acceptance (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
