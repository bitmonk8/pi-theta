---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: EnumDecl.variants and EnumDecl.variantDecls docs claim the fields are "Absent for a non-{ … } enum shape", but parseEnum writes both unconditionally
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/parser/theta-document.ts:839-845
  - src/parser/theta-document.ts:854-862
  - src/parser/theta-document.ts:4138-4151
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# EnumDecl.variants and EnumDecl.variantDecls docs claim the fields are "Absent for a non-{ … } enum shape", but parseEnum writes both unconditionally

## Observation
Two optional fields on the `EnumDecl` AST node, `variants?` and
`variantDecls?`, each carry a doc sentence stating the field is "Absent for a
non-`{ … }` enum shape the body parser could not read." The parser never
produces that state: `parseEnum` writes both fields on every node it builds,
and for a non-brace enum shape `parseEnumVariants` returns empty arrays (not
absence), so the fields are `[]`, never missing. The absence the docs describe
is reachable only from a hand-built literal outside the parser. The sibling
field `variantValues?` is genuinely conditional (`hasValues` spread), showing
what a real absence path looks like in the same return statement.

## Evidence
src/parser/theta-document.ts:839-845 (the `variants` claim):

```ts
  /**
   * The declared variant names in source order, captured so the runtime can
   * register the enum and resolve `Enum.Variant` access to a first-class enum
   * value (runtime-value-model.md, enum row). Absent for a non-`{ … }` enum
   * shape the body parser could not read.
   */
  readonly variants?: readonly string[];
```

src/parser/theta-document.ts:854-862 (the `variantDecls` claim, same final
sentence):

```ts
   * retains non-string explicit values so they can be rejected. Absent for a
   * non-`{ … }` enum shape the body parser could not read.
   */
  readonly variantDecls?: readonly EnumVariantDecl[];
```

src/parser/theta-document.ts:4138-4151 (`parseEnum` — both fields written
unconditionally; only `variantValues` is conditional):

```ts
  private parseEnum(): Stmt {
    const kw = this.advance();
    const name = this.advance().text;
    const { names, values, variantDecls } = this.parseEnumVariants();
    const hasValues = Object.keys(values).length > 0;
    return {
      kind: "enum",
      name,
      variants: names,
      ...(hasValues ? { variantValues: values } : {}),
      variantDecls,
      range: spanRange(kw.range, this.prevRange()),
    };
  }
```

`parseEnumVariants`'s non-brace exits (theta-document.ts:4184-4191) return
`{ names: [], values: {}, variantDecls: [] }` — empty arrays, so the spread
above still writes both fields.

## Why this is a problem
Stale narration with a stated historical meaning the current code contradicts:
the docs assert a parser behaviour ("the body parser could not read" → field
absent) that the parser does not have — a non-brace `enum X` yields
`variants: []` / `variantDecls: []`, present-and-empty. Downstream guards
(`s.variants !== undefined` in `hoistEnumVariants`, `variants ?? []` in
body-type-lowering.ts:132, `s.variantDecls !== undefined` in `walkStatement`)
read as if defending a parser state that cannot occur, and a maintainer
distinguishing empty-vs-absent semantics (which matter for
`checkEnumDeclaration`'s empty-body arm) is told the wrong producer contract.

## Suggested direction (non-binding, optional)
Either make the docs match the code (present-and-empty for a non-brace shape;
absent only on off-parser literals) or make the code match the docs
(conditionally spread the two fields the way `variantValues` already is) —
one direction, decided once for both fields.

## False-positive check
- Producer check: `parseEnum` is the only site constructing a `kind: "enum"`
  node in src/ (`grep -rn 'kind: "enum"' src --include=*.ts` → theta-document
  construction plus kind-switch arms and an unrelated
  `{ kind: "enum" }` classifier shape in frontmatter/system-param code); no
  other producer could make the field absent.
- Literal-constructor check: `grep -rn 'kind: "enum"' tests --include=*.ts` →
  no test builds an `EnumDecl` AST literal omitting the fields (hits are
  system-param classifier shapes); tests/enum-body-unclosed-at-eof.test.ts:367
  re-spreads parsed nodes with `d.variantValues === undefined` guards —
  exercising `variantValues`'s real conditionality, not these two fields'.
- History check: `git show 2bc69157:src/parser/theta-document.ts` (the squash
  root) already has the unconditional `variants: names,` / `variantDecls,`
  writes (its lines 1759-1761) beside the same "Absent for a non-`{ … }`"
  sentence (its line 447) — the claim has never matched the code in visible
  history, so no later commit deliberately re-based the docs on a removed
  behaviour.
- Distinctness check: this is not the already-filed unused-type-imports or
  doc-duplicate findings on this file; no filed candidate cites these lines.

## Triage
