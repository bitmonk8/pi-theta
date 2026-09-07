---
id: pending
title: checkExplicitDiscriminator's last three gates each lead with a conjunct that a preceding gate's early return already made constant-true
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/schema-declarations.ts:681-683
  - src/parser/schema-declarations.ts:687-689
  - src/parser/schema-declarations.ts:692-698
sites: 3
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# checkExplicitDiscriminator's last three gates each lead with a conjunct that a preceding gate's early return already made constant-true

## Observation
`checkExplicitDiscriminator` is a straight-line chain of guarded early returns
over one `FieldEvaluation`. Each of the last three gates opens with a conjunct
whose negation an earlier gate in the same chain already returned on, so the
conjunct evaluates `true` at every execution that reaches it. `evaluation` is a
`const` local produced once at :654 and never reassigned, so no intervening
statement can restore the negated state.

## Evidence
src/parser/schema-declarations.ts:655-657 — the gate that returns on
`!presentInAll`:

```ts
  if (!evaluation.presentInAll) {
    return [absentFieldDiagnostic(decl.name, field, site)];
  }
```

src/parser/schema-declarations.ts:681-683 — re-tests `presentInAll`, which is
`true` on every path that reaches it:

```ts
  if (evaluation.presentInAll && !evaluation.allLiteral) {
    return [nonLiteralDiagnostic(decl.name, field, site)];
  }
```

src/parser/schema-declarations.ts:687-689 — re-tests `allLiteral`, which the
gate directly above returned on when false:

```ts
  if (evaluation.allLiteral && !evaluation.allString && evaluation.firstNonStringKind !== undefined) {
    return [nonStringDiagnostic(decl.name, field, evaluation.firstNonStringKind, site)];
  }
```

src/parser/schema-declarations.ts:692-698 — re-tests `allLiteral` again and
`allString`, both `true` on every path that reaches it:

```ts
  if (
    evaluation.allLiteral &&
    evaluation.allString &&
    evaluation.firstDuplicateValue !== undefined
  ) {
    return [duplicateValueDiagnostic(decl.name, evaluation.firstDuplicateValue, site)];
  }
```

src/parser/schema-declarations.ts:504-517 — the derivations that make the last
one mechanical: `allString` is `false` only when `allLiteral` holds and some
literal is non-`string`, in which case `firstNonStringKind` is defined, so the
:687 gate returns; hence `allString` is `true` at :693:

```ts
  const presentInAll = occurrences.every((o) => o !== undefined);
  const anyNested = occurrences.some((o) => o?.nested === true);
  // A `.some` mirroring `anyNested`: the withhold this flag drives is DERIVED
  // from one present, refused occurrence's own text, so one occurrence wide is
  // its whole reach (bug 0046 §Fix constraint 2 owns this fold's asymmetry).
  const anyEmptyObject = occurrences.some((o) => o?.emptyObject === true);
  const allLiteral =
    presentInAll && occurrences.every((o) => o?.literal !== undefined);

  const literals = allLiteral
    ? occurrences.map((o) => o?.literal).filter((l): l is NonNullable<typeof l> => l !== undefined)
    : [];
  const allString = allLiteral && literals.every((l) => l.kind === "string");
  const firstNonStringKind = literals.find((l) => l.kind !== "string")?.kind;
```

## Why this is a problem
Each of the three conditions reads as a live discriminating test but decides
nothing: the value is fixed by the control flow that reached it. The chain's own
comments already state the ordering the early returns establish (":651-654",
":665-668", ":678-680" each explain what the preceding gate has settled), so the
re-tests restate in code what the comments say the predecessor gate already
guaranteed. A reader auditing which combinations of `presentInAll` /
`allLiteral` / `allString` produce which diagnostic has to re-derive the
straight-line reachability to learn that four of the eight written conjuncts
carry no information.

## Suggested direction (non-binding, optional)
The gates are already ordered so their preconditions hold; the leading conjuncts
are the redundant half of that ordering, not a second condition.

## False-positive check
- No reassignment: `grep -n "evaluation" src/parser/schema-declarations.ts`
  shows `const evaluation = evaluateOccurrences(...)` at :654 and read-only
  member accesses at :634, :655, :669, :681, :687, :688, :693, :694, :695, :697.
  `FieldEvaluation`'s fields are all `readonly` (:469-478), so no aliased writer
  exists.
- No intervening call that could change the value: the statements between :657
  and :698 are the `anyEmptyObject` return (:669-671) and the three gates
  themselves; the diagnostic factories (`absentFieldDiagnostic`,
  `nonLiteralDiagnostic`, `nonStringDiagnostic`, `duplicateValueDiagnostic`) are
  pure record builders (:703-761) that never receive `evaluation`.
- Not a deadness claim about a symbol, so no cross-tree identifier search is
  owed; the three cited conditions are all inside one function in one file.
- Behaviour is unchanged by the observation — this is filed as redundancy in the
  written conditions, not as a bug or a proposed behaviour change.
- One further site of the same family is deliberately NOT bundled here:
  `detectImplicitDiscriminator`'s `.filter((e) => e.presentInAll && e.allLiteral)`
  at :554, whose redundancy comes from `allLiteral`'s own definition rather than
  from an early return in the same chain.

## Triage
