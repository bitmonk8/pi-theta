---
id: PTQ-0803
title: expectDropGateShape and expectRefusedAsNonLiteral redeclare the same four-part drop-gate assertion sequence independently in each in-scope file
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/params-default-type-compat.test.ts:220-241
  - tests/params-default-unary-minus-non-numeric-refusal.test.ts:301-326
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# expectDropGateShape and expectRefusedAsNonLiteral redeclare the same four-part drop-gate assertion sequence independently in each in-scope file

## Observation
Both in-scope files declare a local helper that asserts the same four-part
"reachability to a theta that does not register" sequence over one
`ThetaDocument`: (1) a guarded read of `doc.diagnostics[0]` that throws
`` `${label}: diagnostics[0] absent after a one-element count assertion` ``
when absent, (2) `diagnostic.severity` must be `"error"` with an assertion
message opening "the drop gate reads error severity, so a warning would
leave the theta registered with a default …", (3) `doc.frontmatter` must be
`null` with a message opening "an error-severity params diagnostic withholds
the frontmatter, which is what un-registers the theta …", and (4) the
lowered `params:` fragment must be `undefined` with a message opening "no
lowered `params:` … may survive the refusal — a surviving one is what …".
`tests/params-default-type-compat.test.ts` names this
`expectDropGateShape`; `tests/params-default-unary-minus-non-numeric-
refusal.test.ts` names the same four-part sequence `expectRefusedAsNonLiteral`
(interleaved with two assertions — a code/message check — that are specific
to that file's own subject).

## Evidence

`tests/params-default-type-compat.test.ts:220-228`:
```ts
function expectDropGateShape(label: string, doc: ThetaDocument): void {
  const diagnostic = doc.diagnostics[0];
  if (diagnostic === undefined) {
    throw new Error(`${label}: diagnostics[0] absent after a one-element count assertion`);
  }
  expect(
    diagnostic.severity,
    `${label}: the drop gate reads error severity, so a warning would leave the theta registered with a default the declared type forbids`,
  ).toBe("error");
```

`tests/params-default-type-compat.test.ts:233-241`:
```ts
  expect(
    doc.frontmatter,
    `${label}: an error-severity params diagnostic withholds the frontmatter, which is what un-registers the theta — the same disposition the sibling \`default-not-literal\` refusal already produces`,
  ).toBeNull();
  expect(
    doc.frontmatter?.params?.loweredSchema,
    `${label}: no lowered \`params:\` document may survive the refusal — a surviving one is what the discarded runtime verdict would then be the only judge of`,
  ).toBeUndefined();
}
```

`tests/params-default-unary-minus-non-numeric-refusal.test.ts:306-317`:
```ts
  const diagnostic = doc.diagnostics[0];
  if (diagnostic === undefined) {
    throw new Error(`${label}: diagnostics[0] absent after a one-element count assertion`);
  }
  expect(
    diagnostic.message,
    `${label}: DIAG-4 — the rendered message is the registry row's template with \`<expr>\` rendered as the offending sub-expression, which for a nested spelling is the INNER \`neg\` span the container recursion returns, not the container`,
  ).toBe(notLiteralMessage(expr));
  expect(
    diagnostic.severity,
    `${label}: the drop gate reads error severity, so a warning would leave the theta registered with a default the position's grammar does not derive`,
  ).toBe("error");
```

`tests/params-default-unary-minus-non-numeric-refusal.test.ts:318-326`:
```ts
  expect(
    doc.frontmatter,
    `${label}: an error-severity params diagnostic withholds the frontmatter, which is what un-registers the theta — the observable that keeps the coerced number out of body scope`,
  ).toBeNull();
  expect(
    loweredP(doc),
    `${label}: no lowered \`params:\` fragment may survive the refusal — a surviving one is what the post-default-merge AJV hook then judges the coerced value against`,
  ).toBeUndefined();
}
```

The `diagnostics[0]` guard's thrown message is byte-identical between the two
excerpts. The severity assertion's message opens with the identical clause
"the drop gate reads error severity, so a warning would leave the theta
registered with a default …", diverging only in the trailing clause naming
what the default violates. The frontmatter assertion's message opens with
the identical clause "an error-severity params diagnostic withholds the
frontmatter, which is what un-registers the theta …", diverging only in the
trailing clause. The lowered-fragment assertion's message opens with the
identical clause "no lowered `params:` … may survive the refusal — a
surviving one is what …", diverging only in the trailing clause and in
reading `doc.frontmatter?.params?.loweredSchema` directly versus through the
file-local `loweredP(doc)` accessor.

Exact search across `tests/*.test.ts` for the guard's thrown-message text,
`diagnostics[0] absent after a one-element count assertion`, returns 7 files
total (`params-block-mapping-rhs-refusal.test.ts:394`,
`params-default-trailing-residue-refusal.test.ts:438`,
`params-default-unary-minus-non-numeric-refusal.test.ts:308`,
`params-default-type-compat.test.ts:223`,
`params-scalar-nontype-text-refusal.test.ts:346`,
`tools-field-shape-refusal.test.ts:336`,
`tools-field-zero-entry-scalar-refusal.test.ts:269`); the narrower search for
the lowered-fragment message's shared clause, `may survive the refusal`,
returns 4 files, two of them the in-scope pair and two others outside this
review's scope (`params-default-trailing-residue-refusal.test.ts:454`,
`params-scalar-nontype-text-refusal.test.ts:376`). This finding is filed only
against the two in-scope files; the wider repetition is noted as context, not
as additional filed sites.

## Why this is a problem
Both in-scope files independently retype the same four-assertion drop-gate
verification (the guarded first-diagnostic read, the severity check, the
frontmatter-withheld check, and the lowered-fragment-withheld check) with the
same three message openers, rather than sharing one assertion. A change to
what the shipped drop gate reads (e.g. `hasLoadParseError` in
`src/extension/production-composition.ts`) or to how the withheld-lowering
observable is phrased would need the identical edit made twice inside this
file pair alone.

## Suggested direction (non-binding, optional)
The shared three-assertion tail (severity, frontmatter, lowered-fragment) with
a caller-supplied trailing clause per assertion could sit in a
`tests/helpers/` module alongside `tests/helpers/e2e-s1.ts`'s existing
`ThetaDocument`-shaped readers, leaving each file's own subject-specific
checks (the namespace check in one file, the message/code check in the other)
at the call site.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); `ls
  tests/*gate*.test.ts` has no `params-default-*` entry.
- Recording-double check: both functions assert directly on a completed
  parse's `ThetaDocument`; neither records calls nor backs a "never called"
  witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "expectDropGateShape\|
  expectRefusedAsNonLiteral" docs/bugs/*.md` → 0 hits; no open bug names or
  gives a rationale for either function being retyped rather than shared.
- coverage-matrix/bug-doc citation search: `grep -n
  "params-default-type-compat\|params-default-unary-minus-non-numeric-
  refusal" docs/reference/coverage-matrix.md` → 0 hits. Bug docs 0066 and
  0166 cite both files by cell label (e.g. "cell c7 of
  `tests/params-default-type-compat.test.ts`", "cell e3 of
  `tests/params-default-unary-minus-non-numeric-refusal.test.ts`") — never by
  either function's name — and this finding proposes no merge, rename or
  deletion of any cited file or cell, only that the shared assertion tail
  could move to a common helper.
- Coverage check: the claim is about a repeated helper-function DEFINITION,
  not a missing test path; every cell that calls either function keeps
  running regardless of which module defines the assertion sequence.
- Prior-filing overlap check: `grep -rl "expectDropGateShape\|
  expectRefusedAsNonLiteral" quality/intake/*.md quality/issues/*.md
  quality/resolved/*.md` → 0 hits before this filing. PTQ-0660 (open) covers
  the disjoint `src`/`paramsDoc`/`diagLines`/`diagCodes` quartet in these same
  files; PTQ-0661 (open) covers the disjoint runtime-tier `runBinder` drive
  harness; PTQ-0268 (fixed) covers a differently-named, differently-shaped
  `expectBlocksRegistration` helper (a bare count>0 check with no frontmatter
  or lowered-fragment assertions) in two other files. None of these covers
  this four-part drop-gate assertion sequence.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/params-default-type-compat.test.ts:220-241 and tests/params-default-unary-minus-non-numeric-refusal.test.ts:301-326; sed-extracted and diffed under $TEMP the two bodies share the byte-identical `diagnostics[0] absent after a one-element count assertion` guard plus the severity/frontmatter-null/lowered-undefined assert triple with identical message openers (diverging only in trailing clauses and in `loweredSchema` vs the file-local `loweredP(doc)` = `loweredSchema.properties.p`), with each file's subject-specific checks (namespace vs diagCodes/message) interleaved — copy-derived, not incidental; both helpers are live (2 and 2 call sites), both under tests/, D7 boilerplate-duplication class; stated searches reproduce (guard text → 7 files, `may survive the refusal` → 4, coverage-matrix → 0, quality/ → 0, no *gate* file, no recording double); the filing's docs/bugs "0 hits" claim is wrong (1 hit: docs/bugs/0166:1301 names `expectRefusedAsNonLiteral` in narrative prose only, not as a witness-list entry, and no merge/rename/delete is proposed — immaterial); not a duplicate: PTQ-0660/0661 cover disjoint helpers in these files, resolved PTQ-0268 covered a differently-shaped `expectBlocksRegistration` count>0 predicate in other files and its fix minted no tests/helpers export (load-row-harness `registered(row: LoadRow)` takes a LoadRow and checks severity only), so no shared ThetaDocument drop-gate-shape helper exists; fix is a mechanical extraction of the shared tail with caller-supplied clauses and a lowered-fragment reader — fold the same-tail copies at params-default-trailing-residue-refusal.test.ts:438-458 and params-scalar-nontype-text-refusal.test.ts:346-380 into the location list at fix time (triage: claude-fable-5-1)
