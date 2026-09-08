---
id: PTQ-0019
title: FieldEvaluation.literalTexts is populated on every evaluation but read by neither discriminator path
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/schema-declarations.ts:468-479
  - src/parser/schema-declarations.ts:514-543
sites: 2
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# FieldEvaluation.literalTexts is populated on every evaluation but read by neither discriminator path

## Observation
`evaluateOccurrences` (schema-declarations.ts) evaluates one candidate
discriminator field across a union's variants and returns a module-private
`FieldEvaluation` record. The record carries a `literalTexts` member holding
every variant's literal text. The local `literalTexts` array is used inside the
function to derive `firstDuplicateValue`, but the record member itself is never
read: the two consumers of `FieldEvaluation` records
(`detectImplicitDiscriminator`, `checkExplicitDiscriminator`) read `name`,
`presentInAll`, `anyNested`, `anyEmptyObject`, `allLiteral`, `allString`,
`firstNonStringKind`, `uniqueValues`, and `firstDuplicateValue` — never
`literalTexts`.

## Evidence
src/parser/schema-declarations.ts:468-479 — the record shape (module-private,
not exported):

```ts
interface FieldEvaluation {
  readonly name: string;
  readonly presentInAll: boolean;
  readonly anyNested: boolean;
  readonly anyEmptyObject: boolean;
  readonly allLiteral: boolean;
  readonly allString: boolean;
  readonly firstNonStringKind?: EnumValueKind | undefined;
  readonly literalTexts: readonly string[];
  readonly uniqueValues: boolean;
  readonly firstDuplicateValue?: string | undefined;
}
```

src/parser/schema-declarations.ts:519-543 — the local array feeds the
duplicate scan, then rides out on the record:

```ts
  const literalTexts = literals.map((l) => l.text);
  ...
  for (const text of literalTexts) {
    if (seenTexts.has(text)) {
      firstDuplicateValue = text;
      break;
    }
    seenTexts.add(text);
  }
  ...
  return {
    name,
    presentInAll,
    ...
    literalTexts,
    uniqueValues,
    firstDuplicateValue,
  };
```

Search evidence: grep `literalTexts` over all *.ts in the repository (src/,
tests/, extensions/, tools/) yields exactly four hits, all in
src/parser/schema-declarations.ts — the interface member (:476), the local
`const` (:519), the local loop (:524), and the return-record entry (:541). No
`<value>.literalTexts` member access exists anywhere.

## Why this is a problem
Dead field, proven: a member of a produced record that no reader ever accesses.
The information it would convey (the ordered literal texts) is already folded
into the two members the consumers do read (`uniqueValues`,
`firstDuplicateValue`) inside the same function. Because `FieldEvaluation` is
module-private, the full consumer set is closed and enumerable — both consumers
are in this file, and neither touches the member — so the field is carried
purely as weight on the record.

## Suggested direction (non-binding, optional)
Drop the member from the record (keeping the local array that derives
`firstDuplicateValue`), or document why the texts are deliberately exposed if a
future consumer is planned. The fix stage owns the choice.

## False-positive check
Reference searches: grep `literalTexts` over all *.ts across src/, tests/,
extensions/, tools/ — four hits, all inside the defining function/interface;
no member access anywhere. Export check: `FieldEvaluation` is declared
`interface` without `export`, so no external or string-keyed consumer can
exist; the module's exported functions return `Diagnostic[]`, not evaluations.
Witness-test check: no test constructs or reads a `FieldEvaluation` (the
interface is unexported), so the field is not test-witnessed. Git intent:
introduced in 9c3f3b5c ("V5b — discriminated unions, recursion, and type-alias
cycle detection") already write-only; `git log --all -S "\.literalTexts"`
returns no commit — a reader never existed at any point in history.

## Triage
verdict: confirmed — my own repo-wide grep finds `literalTexts` at only :476/:518/:524/:541 with no member access anywhere, and `FieldEvaluation` is unexported (used only as the return type at :485/:503), so the closed consumer set provably never reads it — write-only since it landed in 9c3f3b5c. (triage: claude-opus-5)
