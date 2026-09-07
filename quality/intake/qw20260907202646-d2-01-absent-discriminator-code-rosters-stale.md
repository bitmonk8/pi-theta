---
id: pending
title: schema-declarations.ts's V5b header roster and checkDiscriminatedUnion's own doc roster both omit theta/parse/absent-discriminator-field, which the function returns
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/schema-declarations.ts:333-355
  - src/parser/schema-declarations.ts:393-398
  - src/parser/schema-declarations.ts:655-657
  - src/parser/schema-declarations.ts:703-716
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# schema-declarations.ts's V5b header roster and checkDiscriminatedUnion's own doc roster both omit theta/parse/absent-discriminator-field, which the function returns

## Observation
The module's V5b section header enumerates, as a closed bulleted list, the
diagnostic codes "V5b owns" for the discriminated-union, `by`-clause and
type-alias-cycle rules. `checkDiscriminatedUnion`'s own doc comment repeats a
closed roster in parentheses ("returning every diagnostic raised in source
order (…)"). Neither list contains `theta/parse/absent-discriminator-field`.
That code is minted by `absentFieldDiagnostic` in this same file and is
returned from `checkExplicitDiscriminator`, which is the arm
`checkDiscriminatedUnion` takes whenever `decl.by !== undefined`. The code is a
registered parse row (`docs/spec_topics/diagnostics/code-registry-parse.md:124`).

## Evidence
src/parser/schema-declarations.ts:333-350 — the V5b header roster, eight bullets,
no `absent-discriminator-field`:

```ts
// --- V5b / V5b-T — discriminated unions, recursion, cycle detection --------
//
// V5b owns the parse-time checks for the discriminated-union, `by`-clause, and
// type-alias-cycle rules of schemas.md §Discriminated unions and §Recursion:
//
//   - `theta/parse/non-string-discriminator`     — the discriminator field's
//     per-variant literal type is not `string`.
//   - `theta/parse/ambiguous-discriminator`      — more than one field qualifies.
//   - `theta/parse/missing-discriminator`        — no field qualifies.
//   - `theta/parse/duplicate-discriminator-value`— two variants share a value.
//   - `theta/parse/nested-discriminator`         — the discriminator field's
//     value is a nested object, not a top-level literal.
//   - `theta/parse/non-literal-discriminator`    — an explicit `by` field
//     resolves in every variant but its type is not a single string literal.
```

src/parser/schema-declarations.ts:393-398 — `checkDiscriminatedUnion`'s own
roster, six codes, no `absent-discriminator-field`:

```ts
/**
 * Check a discriminated-union declaration, returning every diagnostic raised in
 * source order (`theta/parse/non-string-discriminator`, `theta/parse/ambiguous-discriminator`,
 * `theta/parse/missing-discriminator`, `theta/parse/duplicate-discriminator-value`,
 * `theta/parse/nested-discriminator`, `theta/parse/non-literal-discriminator`).
 */
export function checkDiscriminatedUnion(
```

src/parser/schema-declarations.ts:655-657 — the return that reaches
`checkDiscriminatedUnion`'s caller through the `decl.by !== undefined` arm:

```ts
  if (!evaluation.presentInAll) {
    return [absentFieldDiagnostic(decl.name, field, site)];
  }
```

src/parser/schema-declarations.ts:703-716 — the mint:

```ts
/** The shared `theta/parse/absent-discriminator-field` diagnostic. */
function absentFieldDiagnostic(
  schemaName: string,
  field: string,
  site: SchemaDeclSite,
): Diagnostic {
  return {
    severity: "error",
    code: "theta/parse/absent-discriminator-field",
    file: site.file,
    range: site.range,
    message: `discriminator '${field}' on ${schemaName} must be declared in every variant`,
  };
}
```

## Why this is a problem
Both comments present themselves as exhaustive inventories of what this module
and this function emit ("V5b owns the parse-time checks … :", "returning every
diagnostic raised in source order (…)"). A reader auditing which codes a
`schema X by f = A | B` declaration can draw, or grepping the module header for
a registered code's implementation, is told the seven-code set is complete when
the current code returns an eighth. The omission is mechanical, not
interpretive: the code string appears verbatim at :711, its only production
emitter is this file, and the return at :656 sits inside the function whose doc
roster omits it.

## Suggested direction (non-binding, optional)
Both rosters are prose inventories with one missing row; either the two lists
gain the code, in the ordering position the registry already fixes (after
`nested-discriminator`, before `non-literal-discriminator`), or they stop
claiming to be closed.

## False-positive check
- `grep -rn "absent-discriminator-field" src/ docs/ tests/` — three source hits,
  all in `src/parser/schema-declarations.ts` (:703 doc, :711 the code literal,
  and the `absentFieldDiagnostic` call at :656); registry rows at
  `docs/spec_topics/diagnostics/code-registry-parse.md:124` and
  `docs/reference/diagnostics.md:172`. No other module mints it, so this file's
  rosters are the ones that owe it.
- Reachability of :656 from `checkDiscriminatedUnion`: :405-406 routes to
  `checkExplicitDiscriminator` whenever `decl.by !== undefined`, and :655 is
  inside `checkExplicitDiscriminator` — no intervening early return between
  :632 (`anyNested`) and :655 that is unconditional.
- Consumer check: `grep -rn "checkDiscriminatedUnion" src/ extensions/ tools/`
  — one production caller (`src/parser/theta-document.ts:8807`), which spreads
  the returned array into its diagnostic output, so the omitted code does reach
  users of that function.
- Not a deadness claim, so no test-only-caller question arises; the code is
  live and the rosters describing it are what is stale.

## Triage
