---
id: PTQ-1366
title: animalVariants and seamLines seam-fixture builders byte-identical between non-literal-by-field-refusal.test.ts and discriminator-field-classifier-brace-group.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/non-literal-by-field-refusal.test.ts:624-646
  - tests/discriminator-field-classifier-brace-group.test.ts:468-489
sites: 2
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# animalVariants and seamLines seam-fixture builders byte-identical between non-literal-by-field-refusal.test.ts and discriminator-field-classifier-brace-group.test.ts

## Observation
Both `tests/non-literal-by-field-refusal.test.ts` and
`tests/discriminator-field-classifier-brace-group.test.ts` declare a private
`animalVariants(catKind: FieldClassification): readonly UnionVariantSchema[]`
function with a byte-identical body (a `Cat`/`Dog` two-variant array feeding
`checkDiscriminatedUnion` directly, bypassing `parseDoc`), and a
`seamLines(catKind, by)` function whose body differs only in the string
literal passed to `site(...)` (`site()` vs `site("bug0128.theta")`). Neither
file imports the other's declaration, and no `tests/helpers/` module exports
either builder.

## Evidence
`tests/discriminator-field-classifier-brace-group.test.ts:468-478`:
```ts
function animalVariants(catKind: FieldClassification): readonly UnionVariantSchema[] {
  return [
    { name: "Cat", fields: [{ name: "kind", ...catKind }, { name: "name" }] },
    {
      name: "Dog",
      fields: [
        { name: "kind", literal: { kind: "string", text: "dog" } },
        { name: "name" },
      ],
    },
  ];
}
```

`tests/non-literal-by-field-refusal.test.ts:624-634` — byte-identical
(`diff <(sed -n '468,478p' tests/discriminator-field-classifier-brace-group.test.ts)
<(sed -n '624,634p' tests/non-literal-by-field-refusal.test.ts)` produces no
output):
```ts
function animalVariants(catKind: FieldClassification): readonly UnionVariantSchema[] {
  return [
    { name: "Cat", fields: [{ name: "kind", ...catKind }, { name: "name" }] },
    {
      name: "Dog",
      fields: [
        { name: "kind", literal: { kind: "string", text: "dog" } },
        { name: "name" },
      ],
    },
  ];
}
```

`tests/discriminator-field-classifier-brace-group.test.ts:482-489`:
```ts
function seamLines(catKind: FieldClassification, by: string | undefined): string[] {
  const decl = {
    name: "Animal",
    ...(by !== undefined ? { by } : {}),
    variants: animalVariants(catKind),
  };
  return checkDiscriminatedUnion(decl, site()).map(
    (d) => `${d.severity} ${d.code}: ${d.message}`,
  );
}
```

`tests/non-literal-by-field-refusal.test.ts:637-646` — identical apart from
the `site(...)` argument:
```ts
function seamLines(catKind: FieldClassification, by: string | undefined): string[] {
  const decl = {
    name: "Animal",
    ...(by !== undefined ? { by } : {}),
    variants: animalVariants(catKind),
  };
  return checkDiscriminatedUnion(decl, site("bug0128.theta")).map(
    (d) => `${d.severity} ${d.code}: ${d.message}`,
  );
}
```

Search: `grep -n "^function animalVariants\|^function seamLines" tests/*.test.ts`
finds exactly the four declarations cited above (two per file), and no other
`.test.ts` file declares either name.

## Why this is a problem
Both files are part of the same discriminator-field-classification bug family
(bug 0096 and bug 0128, the latter's own header stating bug 0096's file is
"the sibling witness" for the identical seam-entry pattern) and each
independently declares the same `Cat`/`Dog` hand-built `UnionVariantSchema[]`
fixture and the same `checkDiscriminatedUnion`-driving wrapper rather than
sharing one definition, so a change to the seam's variant shape (e.g. adding a
third field every row needs, or changing which literal `Dog.kind` carries)
requires editing both declarations in lockstep with nothing to force that.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` export of `animalVariants` (parameterised over
`catKind`) and `seamLines` (parameterised additionally over the `site(...)`
call) is where both call sites' identical bodies already point.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or its named kin; the
  cited lines are fixture-builder functions, not a pinned count or inventory.
- Recording-double check: `animalVariants`/`seamLines` build a plain data
  literal and call a pure checker function; neither records a call nor backs
  a "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "animalVariants\|seamLines"
  docs/bugs/*.md` → 0 hits; no documented correct-reason red names either
  function or states a reason it must stay file-local.
- coverage-matrix/bug-doc citation search: `grep -n
  "non-literal-by-field-refusal\|discriminator-field-classifier-brace-group"
  docs/reference/coverage-matrix.md` → 0 hits (both files are named as
  witnesses inside docs/bugs/0128 and docs/bugs/0096/0095/0097/0102/0118, but
  this finding proposes no merge, rename or deletion of either file or any
  `it()`/`describe()` cell — only that the identical `animalVariants`/
  `seamLines` bodies could share one definition).
- Prior-finding overlap check: `grep -rl "animalVariants" quality/` before
  filing found no hits; the already-filed sibling finding in this wave
  (`qw20260922211400-d7-02-thetasrc-fixture-triplicated.md`) covers a
  disjoint function (`thetaSrc`, the frontmatter-wrapping string builder) in
  the same two files plus a third, not `animalVariants`/`seamLines`.
- Coverage-drift check: the claim is about a repeated fixture-builder
  DEFINITION, not a missing test path; the seam is exercised by every cell in
  both files' own describe blocks.

## Triage
verdict: confirmed — excerpts reproduce at the cited lines and `diff <(sed -n 468,478p …brace-group) <(sed -n 624,634p …non-literal…)` is empty (animalVariants byte-identical; seamLines differs only in the `site()` vs `site("bug0128.theta")` argument), `grep -rn "animalVariants\|seamLines" tests/ src/ extensions/ tools/` finds only these two files' private declarations (the same-named `seamLines(source, position)` in brace-rooted-union-arm-capture/inline-empty-object-type is a different signature and body) and no tests/helpers export, coverage-matrix has 0 hits, the sibling wave filing (thetaSrc) covers a disjoint builder and no PTQ row names either function — a copy-paste fixture in tests/ within D7; one correction to the filing's own check: docs/bugs/0128 does name `animalVariants` (lines 299, 1283) but only as line-cited evidence-at-commit, not as a reason it must stay file-local, so no carve-out applies (triage: claude-fable-5-1)
