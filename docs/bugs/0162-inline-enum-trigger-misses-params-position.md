# Bug 0162 — `theta/parse/inline-enum` is raised from the two `schema`-declaration call sites only, so one authored mistake draws different codes by position: `schema S { a: enum["x", "y"] }` and `schema S = enum["x", "y"]` raise the registered code whose *Fix hint* names the literal-union form, while the byte-identical text at the `params:` right-hand side loads with zero diagnostics, lowers the permissive `{}`, records `enum["x", "y"]` as the declared type and renders it into the binder's `Parameters:` block — and the literal-union form the hint directs the author to is the very form bug 0056 made enforce at `params:`

- **Status:** open. Residual 1 of the bug 0056 fix (0.85.0, commit `81600080`),
  recorded there as `## Fix (0.85.0)` *Residuals* item 1
  (`0056-…md:1028–1033`) and measured before it in that report's §Non-goals
  (`:718–722`, "a trigger gap in a different row, unfiled"). §Fix is
  constraint-pinned, not settled: it states two routes — widen the row's
  *Trigger* to the `params:` position, or accept the divergence and record it —
  with the consequences of each, and leaves the adjudication to the run.
- **Sev/Diff estimate:** S2/D3 — S2 because the silence half of the subject is
  bug [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)'s
  subject, not this report's, and post-0059 the input is refused loudly at
  load, leaving a wrong diagnostic code for one authored mistake across
  positions. **0059 had not landed at this report's verification time**, so the
  observable measured below is the pre-0059 one and is S1-shaped on its own
  terms: `p: 'enum["x", "y"]'` is accepted with no diagnostic at any severity
  and real AJV over the lowered document admits `"zzz"`, `7`, `null`, `[1]` and
  `{"nope":1}` for the field (§Reproduction R1). D3 because the fix needs a
  DIAG-2 *Trigger* adjudication coordinated with 0059's landed trigger prose:
  the two rows would otherwise both claim this input.
- **Kind:** defect, in the registry half. Three elements, each measured at HEAD.
  1. *The code is wired at two sites, both inside the `schema` declaration
     walk.* `checkInlineEnumForm` (`src/parser/schema-declarations.ts:282`)
     anchors its match at the start of what it is given
     (`/^\s*enum\s*\[/`, `:289`) and is called from exactly two places, both in
     `src/parser/theta-document.ts`: the alias/union per-arm pass (`:5883`) and
     the object form's field-type pass (`:6307`). `grep` finds no third caller.
     The `params:` right-hand side is lowered by `parseParams`
     (`src/parser/params.ts:132`), which drains its per-field type diagnostics
     from `LowerCtx` sinks at `:198` (`theta/parse/reserved-keyword-as-identifier`),
     `:207` (`theta/parse/unresolved-named-type`) and `:226`
     (`theta/load/schema-slug-collision`) and consults no inline-enum
     recogniser. `enum["x", "y"]` therefore falls to `lowerTypeExpr`'s trailing
     catch-all (`params.ts:490`, catch-all at `:603`, "any other form: lower
     permissively") and lowers `{}`.
  2. *The registry row's Trigger states no position, and the row the author is
     redirected to is the one 0056 closed at this position in 0.85.0.* The row
     (`docs/spec_topics/diagnostics/code-registry-parse.md:95`) reads, in full:
     `` | `theta/parse/inline-enum` | E | parse | `enum["a", "b"]` or other inline-enum form. | [Schemas — Enum declarations](../schemas.md) | Use a literal-union (`"a" \| "b"`) or a top-level `enum` declaration. | `inline 'enum[...]' is not supported; use a top-level 'enum' declaration or a literal-union` | ``
     The *Trigger* cell — `` `enum["a", "b"]` or other inline-enum form. `` — is
     a statement about the **text**, not about the position it is written at;
     it names no position and no enclosing construction, unlike the
     `theta/parse/unresolved-named-type` row two above it (`:91`), whose
     *Trigger* enumerates its positions ("The positions are the `params:`
     right-hand side, the `@<T>` query annotation, …"). Read as written the row
     covers the `params:` occurrence, and the implementation does not raise it
     there. The owning spec sentence
     (`docs/spec_topics/schemas.md:93`, §Enum declarations at `:66`) is
     likewise position-free: "`enum` is **top-level only** — there is no inline
     `enum["a", "b"]` form (`theta/parse/inline-enum`). For inline enumerations
     use literal-union: `severity: "low" | "medium" | "high"`." Both the
     sentence and the row's *Fix hint* direct the author to the literal-union
     form. At `params:` that form began enforcing in 0.85.0 (bug 0056), so the
     redirect's destination now works at the position the redirect is never
     issued from.
  3. *The divergence is a code-choice question, not only a missing emission.*
     The `params:` position is not diagnostic-free for type text: the same
     position raises `theta/parse/unresolved-named-type` for `p: Ghost` and
     `theta/parse/reserved-keyword-as-identifier` for the bare keyword
     `p: 'enum'` (§Reproduction C4, C3). What the position lacks is this row.
     Widening the row's *Trigger* to reach it is a DIAG-2 registry edit that
     lands in the same commit as the site it is raised from
     (`docs/spec_topics/diagnostics/diagnostic-shape.md:72`), dispositioned by
     GOV-15's diagnostic-registry carve-out
     (`docs/spec_topics/governance/source-language-stability.md:25`) "as an
     addition for inputs newly brought into the code's emission set". Declining
     to widen it is equally a spec statement and needs the same edit, in the
     opposite direction: the *Trigger* would state the two positions it covers.
- **Related:**
  - **0059** — [`0059-params-scalar-nontype-text-recorded-and-permissive.md`](./0059-params-scalar-nontype-text-recorded-and-permissive.md),
    **open and in flight in the same batch as this filing.** Read its state
    before reading anything below, and re-derive if it has landed. Its §Fix
    (`:599–616`) refuses, at load, `params:` text that no `Type` production
    spells, with `theta/load/params-type-not-expression`, raised from
    `parseParams` off a sink appended at `lowerTypeExpr`'s catch-all. What that
    fix declines to refuse is exactly two classes (`:617–621`): literal-shaped
    text, recognised by 0056's exported `parseLiteralArm` (`params.ts:784`),
    and brace-rooted text. `enum["x", "y"]` is neither — `parseLiteralArm`
    rejects it and it is not brace-rooted — nor is it identifier-shaped, so it
    does not reach the `NamedType` arm either (proved by C3/C4 below drawing
    different codes). **It is therefore inside 0059's refused class.** Once
    0059 lands, this input flips from silence to a load refusal carrying
    `theta/load/params-type-not-expression`, a different code from the
    declaration positions' `theta/parse/inline-enum`, with a generic *Fix hint*
    in place of the targeted one. **What this report owns either way is the
    code/trigger question**, which 0059 does not settle and cannot: 0059's
    refused class is defined by what its two recognisers decline, so every
    member of it draws one generic code, and nothing in it asks whether a
    member with its own registered row should draw that row instead. Neither
    report blocks the other. If 0059 lands first, §Fix route (a) narrows 0059's
    emission set by one input class and both *Trigger* cells are re-derived in
    one commit; route (b) leaves 0059's fix untouched and records why the
    generic code is the right one here.
  - **0056** — [`0056-params-literal-sublanguage-absent-lowers-permissive.md`](./0056-params-literal-sublanguage-absent-lowers-permissive.md),
    **fixed (0.85.0)**, the filing origin. Its §Non-goals (`:718–722`) measured
    this input and held it outside that scope; its `## Fix (0.85.0)`
    *Residuals* item 1 (`:1028–1033`) re-measured it at the fixed tree and
    states the cause — "The literal recogniser declines the text, so this fix
    leaves it exactly as it found it." That fix is also what makes the *Fix
    hint* actionable at `params:` for the first time: §Reproduction C1 below is
    its landed behaviour. Its §Why it matters (`:550–555`) already cites this
    row's *Fix hint* as evidence that "the spec routes authors into it".
  - **0157** — [`0157-alias-vs-concrete-sink-spelling-code-divergence.md`](./0157-alias-vs-concrete-sink-spelling-code-divergence.md),
    **open**, the standing example of a code-divergence report: one written
    mistake drawing a different code set per spelling, filed as a divergence
    rather than as a missing emission, with §Fix constraint-pinned and the
    count consequence handed to another report. Its shape is this report's
    shape one layer up (sink classification rather than diagnostic wiring), and
    its §Fix (c) is the pattern for stating what two reports owe each other.
  - **0129** — [`0129-empty-object-field-type-draws-two-diagnostics.md`](./0129-empty-object-field-type-draws-two-diagnostics.md),
    **open**, the family: which code a single authored mistake draws, and
    whether the registry governs it. 0129 is the multiplicity face (one mistake,
    two codes at one position); this report is the divergence face (one mistake,
    different codes at different positions). 0129's header records that no
    sentence in `diagnostic-shape.md` governs its question; the same is true
    here — DIAG-2 governs *editing* a *Trigger*, and no rule states that one
    mistake must draw one code across positions.
  - **0044** — [`0044-unresolved-named-type-fires-for-keyword-shaped-text.md`](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md),
    **fixed (0.54.0)**, the precedent for the code-choice half. It is the same
    question over the same word: `enum` is a reserved keyword, and that fix
    settled which code keyword-shaped text draws at each of the four positions
    by classifying the atom before the `NamedType` resolution could reach it,
    then wiring `void`'s own registered row at the two positions that lacked
    it. Its remedy — give the position the specific row rather than let the
    generic one absorb the input — is §Fix route (a) here. Its landed behaviour
    is C3 below: the bare keyword `p: 'enum'` draws
    `theta/parse/reserved-keyword-as-identifier` at `params:`, so the position
    already distinguishes this word; only the bracketed form falls through.
- **Affected** — every citation verified against the tree at HEAD `04c6585f`.
  - **The two call sites and the recogniser.**
    `src/parser/schema-declarations.ts:282` (`checkInlineEnumForm`), its
    anchored regex at `:289`; `src/parser/theta-document.ts:5883` (the
    alias/union per-arm pass) and `:6307` (the object form's field-type pass).
    Symbols are named beside lines throughout: `theta-document.ts` is 6904
    lines at this HEAD and the 0056 fix moved symbols inside `params.ts`.
  - **The position that does not consult it.** `src/parser/params.ts:132`
    (`parseParams`, the `params:` per-field loop and every diagnostic that
    position raises), `:198` / `:207` / `:226` (the three drains),
    `:490` (`lowerTypeExpr`) with its trailing catch-all at `:603`,
    `:784` (`parseLiteralArm`, moved here and exported by the 0056 fix),
    `:834` (`lowerLiteralSublanguage`) and `:871` (`lowerParamsFieldType`).
    File is 1054 lines at this HEAD.
  - **The consumers of the permissive fragment.** `src/binder/binder-envelope.ts:137`
    (`relaxParamsSchema`) and `:169` (`BypassParamsField.type`, "The field's
    declared surface type"); `src/binder/binder-system-prompt.ts:168`
    (`renderBinderParamLine`, which renders the recorded text into the
    `Parameters:` line); `src/extension/production-composition.ts:2047`
    (`hasLoadParseError`, the error-severity registration gate that never fires
    for a load with no diagnostics).
  - **The registry and the spec.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:95` (the row, quoted
    in full above) and `:91` (the `theta/parse/unresolved-named-type` row whose
    *Trigger* does enumerate its positions);
    `docs/spec_topics/schemas.md:93` (the no-inline-`enum` sentence) under
    §Enum declarations at `:66`;
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2);
    `docs/spec_topics/governance/source-language-stability.md:25` (the
    diagnostic-registry carve-out) and `:5` (GOV-15), `:9` (the loads-cleanly
    predicate — R1 satisfies it, R2 and R3 do not, which is the equivalence
    consequence §Fix route (a) carries);
    `docs/spec_topics/type-system.md:15` and `docs/spec_topics/grammar.md:105`
    (one type grammar, `params:` named in the position list);
    `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` (the `params:`
    right-hand side is "a type expression parsed by the theta type grammar —
    the same grammar used in every other type-annotation position").
    User-facing mirrors: `docs/reference/diagnostics.md:144` (*Message* only,
    no *Trigger* column) and `docs/reference/schema-subset.md:78`.
  - **The landed witnesses.** `tests/schema-declarations.test.ts:163` pins the
    recogniser in isolation against the registry *Message*.
    `tests/schema-alias-union-decl.test.ts:1750` (cell n6) pins the alias RHS
    firing **against the object-field control over the same type source**
    (`expectArmMatchesFieldControl`, fixtures at `:343–344`), and its own
    comment states the principle this report extends: "An arm is a `Type`
    position … so it is schema-feeding exactly as a field type is, and the two
    positions must answer to the same checks" (`:338–342`). Cell n5 (`:1715`)
    pins the whole-form capture the check depends on. No test at any of the
    four positions asserts anything about `enum[...]` at `params:` — the
    silence below is unpinned in either direction.
  - **Corpus exposure — nil.** 34 committed `.theta` / `.thetalib` files at
    this HEAD; `rg 'enum\s*\[' ` over all of them returns no match. Under
    either route no committed source changes its diagnostic sequence.
- **Observed at:** v0.85.0 (`04c6585f`). Offline, deterministic,
  provider-free: a scratch vitest probe over the shipped load path
  `parseThetaDocument` through `parseDoc` (`tests/helpers/e2e-s1.ts:39`), the
  shipped `renderBinderParamLine` and the production `AjvSchemaValidator`
  (`src/seams/schema-validator.ts`); written, run, deleted. Every value below is
  that run's output verbatim.

  The working tree carried an uncommitted 0059 prototype in
  `src/parser/params.ts` and `src/parser/frontmatter.ts` during this filing, so
  every row was **re-measured over a pristine `git archive 04c6585f` export**
  with no working-tree modification of any kind; the two passes produced
  byte-identical output, and the line numbers cited above are the export's. No
  file was read as evidence in a modified state.

## Summary

`theta/parse/inline-enum` has one recogniser, `checkInlineEnumForm`, and two
callers, both inside the `schema` declaration walk. The `params:` right-hand
side is lowered by a different function that consults no inline-enum check, so
`enum["x", "y"]` written there falls to `lowerTypeExpr`'s catch-all and lowers
`{}` with no diagnostic at any severity, while the byte-identical text in either
`schema` spelling raises the registered code.

The registry row's *Trigger* names no position — it names a text shape — so on
the corpus as written the row covers all three occurrences and the
implementation covers two. The row's *Fix hint* and the owning spec sentence
both send the author to the literal-union form, which the bug 0056 fix (0.85.0)
made enforce at `params:`; the author who most needs that redirect is the one
who never receives it.

This report owns the code/trigger question, and owns it under either state of
bug 0059. Pre-0059 the `params:` occurrence is silent. Post-0059 it is refused
at load with `theta/load/params-type-not-expression` — loud, but a different
code from the declaration positions, with a generic hint where a targeted one
is registered. Neither state answers whether the registered row should reach
the position.

## Reproduction

One `.theta` per row through `parseDoc`. `T` is `enum["x", "y"]` in every row;
the `params:` rows wrap it in a YAML single-quoted scalar because the unquoted
spelling is not valid YAML. `diags` is the whole document's diagnostic
sequence, rendered `<severity> <code>: <message>`.

### (a) The subject — one text, three positions, two codes and one silence

| Row | Source | `diags` | Fragment at the type position |
| --- | --- | --- | --- |
| R1 | `params:` → `p: 'T'` | `[]` | `{}` |
| R2 | `schema S { a: T }` | one `error theta/parse/inline-enum` | `{}` |
| R3 | `schema S = T` | one `error theta/parse/inline-enum` | `{}` |

The message in R2 and R3 is byte-identical and is the registry's:
`inline 'enum[...]' is not supported; use a top-level 'enum' declaration or a
literal-union`. All three lower the same permissive `{}` — the difference is
solely whether the load is refused.

R1's whole recorded `params`:

```json
{"loweredSchema":{"type":"object","properties":{"p":{}},"required":["p"],
 "additionalProperties":false},
 "defaultedFields":[],
 "fields":[{"wireName":"p","type":"enum[\"x\", \"y\"]","hasDefault":false,"nullable":false}]}
```

### (b) What R1's acceptance costs

`renderBinderParamLine` over R1's recorded field:

```
  p (enum["x", "y"]) required
```

The binder is told a type the spec assigns no lowering and the schema does not
carry. The production `AjvSchemaValidator` compiled over R1's
`loweredSchema`, six arguments, all admitted:

```
{"p":"x"}        -> {"ok":true}
{"p":"zzz"}      -> {"ok":true}
{"p":7}          -> {"ok":true}
{"p":null}       -> {"ok":true}
{"p":{"nope":1}} -> {"ok":true}
{"p":[1]}        -> {"ok":true}
```

`hasLoadParseError` tests error severity only, and R1 raises nothing, so the
file registers and every argument above reaches the theta.

### (c) The bounds — where the divergence holds and where it stops

| Row | Source | `diags` | Note |
| --- | --- | --- | --- |
| R4 | `schema M = string \| T` | one `theta/parse/inline-enum` | the per-arm pass anchors per arm, so a second-position arm fires |
| R5 | `params:` → `p: 'string \| T'` | `[]` | the same union at `params:`; fragment `{"anyOf":[{"type":"string"},{}]}` |
| R6 | `params:` → `p: '{a: T}'` | `[]` | hoisted under `__inline_0fd85a579a785048`, `a` is `{}` |
| R7 | `params:` → `p: 'array<T>'` | `[]` | fragment `{}` |
| R8 | `schema S { a: {b: T} }` | `[]` | **the declaration position is silent too at depth** |
| R9 | `@<T>` query annotation | `[]` | the fourth `Type` position, also silent |

R4 and R5 extend the divergence to union-arm depth: the alias position fires on
a second-position arm, the `params:` position does not fire on the same arm.

R8 and R9 bound the defect from the other side and are stated here because a
fix must not be scoped to them by accident. `checkInlineEnumForm` is anchored
(`/^\s*enum\s*\[/`) and is handed a field's whole `typeSource`, so an
`enum[...]` nested inside an inline object at the **declaration** position is
not reached either; and the `@<T>` annotation, which registers no
inline-enum check at all, is silent for the top-level form. The subject of this
report is the top-level `params:` occurrence — R1 against R2/R3 — where the two
positions receive the same top-level text and answer differently. R8 and R9 are
a wider trigger gap in the same row that any route below states a position on.

### (d) Controls — the position is not diagnostic-free, and the hint's target works

| Row | Source | `diags` | Fragment |
| --- | --- | --- | --- |
| C1 | `params:` → `p: '"x" \| "y"'` | `[]` | `{"type":"string","enum":["x","y"]}` |
| C2 | `params:` → `p: E` with `enum E { X, Y }` | `[]` | `{"$ref":"#/$defs/E"}`, `E` → `{"type":"string","enum":["X","Y"]}` |
| C3 | `params:` → `p: 'enum'` | one `error theta/parse/reserved-keyword-as-identifier` | load refused |
| C4 | `params:` → `p: Ghost` | one `error theta/parse/unresolved-named-type` | load refused |
| C5 | `@<Ghost>` | one `error theta/parse/unresolved-named-type` | load refused |

C1 and C2 are the two forms the row's *Fix hint* names, both working at
`params:` — C1 is the bug 0056 fix's landed behaviour. C3 and C4 prove the
`params:` position raises per-field type diagnostics and that `enum` is already
recognised there as a reserved keyword: only the bracketed form escapes. C3 is
also the shape bug 0044 settled, and its code is the one this input would draw
if the bracket were removed.

## Expected behaviour

The corpus states one grammar over one position set and one registry row per
diagnosable text shape, and neither statement carves out `params:`.

- `docs/spec_topics/type-system.md:15` — "The same type grammar applies in every
  type-annotation position: schema fields, frontmatter `params:`, `let x: T`,
  function parameters, and `@<T>`…". `docs/spec_topics/grammar.md:105` names
  "`params:` field types" and "union arms" in the bare-`Type` position list.
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` says the `params:`
  right-hand side is parsed by "the same grammar used in every other
  type-annotation position".
- `docs/spec_topics/schemas.md:93` — "`enum` is **top-level only** — there is no
  inline `enum["a", "b"]` form (`theta/parse/inline-enum`)." The prohibition is
  on the form, not on the form at a position.
- `code-registry-parse.md:95` — *Trigger* `` `enum["a", "b"]` or other
  inline-enum form. `` No position qualifier, where the sibling row at `:91`
  carries one. The row's *Hint* — "Use a literal-union (`"a" | "b"`) or a
  top-level `enum` declaration" — describes a remedy that is available and
  enforcing at `params:` since 0.85.0 (§Reproduction C1, C2).

Read together: one authored mistake gets one answer, and the answer is the
registered row. R1 gets a different answer from R2/R3 for text the corpus
distinguishes nowhere.

The competing reading is that the row's *Trigger* is elliptical — it describes
the shape `checkInlineEnumForm` matches at the two sites it is wired to, and
`params:` was never in scope. That reading is available because no sentence in
`diagnostic-shape.md` requires one mistake to draw one code across positions,
and it is the reading §Fix route (b) makes explicit. What is not available is
the status quo: the *Trigger* as written covers R1 and the implementation does
not, so one of the two moves.

## Actual behaviour / root cause

`theta/parse/inline-enum` is not a property of the type grammar — it is a
property of the `schema` declaration walk. `checkInlineEnumForm`
(`schema-declarations.ts:282`) is called from `theta-document.ts:5883` and
`:6307` and from nowhere else. Both call sites sit inside
`checkSchemaDeclarationGraph`'s per-declaration pass and are reached only by a
`schema` statement in the body.

The `params:` right-hand side never enters that walk. It arrives at
`parseParams` (`params.ts:132`) from the frontmatter read, and its per-field
type diagnostics are drained from `LowerCtx` sinks the lowering fills — the
reserved-keyword sink (`:198`), the unresolved-name sink (`:207`) and the
slug-collision sink (`:226`). There is no inline-enum sink because there is no
inline-enum check on that path. `lowerParamsFieldType` (`:871`) tries the
literal sublanguage (`lowerLiteralSublanguage`, `:834`, which the 0056 fix
added), then the brace test, then hands the text to `lowerTypeExpr` (`:490`).
`enum["x", "y"]` matches no arm there — it is not a union, not a generic
application, not brace-rooted, not a primitive, not identifier-shaped — so it
reaches the trailing catch-all (`:603`, "A literal-type atom … or any other
form: lower permissively") and returns `{}` while recording nothing on any sink.

Zero sink entries means zero diagnostics, which means `hasLoadParseError`
(`production-composition.ts:2047`) sees no error, the file registers, and the
`{}` reaches all three consumers of the lowered document with the author's text
still recorded as the declared type and rendered into the binder line.

The asymmetry is therefore structural, not a missed condition: the check lives
one layer above the lowering, on a walk the `params:` position does not take.
Any route below has to decide whether the check belongs to the declaration walk
or to the type grammar.

## Why it matters

- **The author who needs the hint is the one who cannot receive it.** The row's
  *Fix hint* and `schemas.md:93` both name the literal-union form. An author
  who writes `enum[...]` in a `schema` body is told, in one line, exactly what
  to write instead. The same author writing the same text at `params:` is told
  nothing, ships the file, and the field constrains nothing at the argument
  boundary (§Reproduction (b): six values admitted, including `null` and an
  array, for a field the author closed to two strings).
- **The two spellings of one declaration disagree with no signal.**
  `schema Sev = enum["x", "y"]` plus `p: Sev` refuses the load;
  `p: 'enum["x", "y"]'` accepts it. Nothing in the diagnostics, the recorded
  type, or the binder prompt distinguishes them, and the recorded type is the
  same text in both.
- **The binder is grounded in a non-type.** `renderBinderParamLine` emits
  `  p (enum["x", "y"]) required` into the `Parameters:` block. The model is
  told a type the spec assigns no lowering, and the envelope it is constrained
  by (`relaxParamsSchema`, `binder-envelope.ts:137`) carries the empty schema,
  so grammar-constrained decoding has nothing to constrain for that field.
- **Post-0059 the cost changes shape but does not go away.** A refusal naming
  "right-hand side is not a theta type expression" is correct and loud, and it
  is what an author who wrote prose should see. An author who wrote
  `enum["x", "y"]` wrote a recognised, named, registered mistake with a
  one-line remedy on file, and would receive the generic message instead. That
  is the same substitution bug 0044 removed for keyword-shaped text at these
  positions.
- **The divergence is load-bearing for GOV-15.** R1 loads cleanly at HEAD and
  R2/R3 do not, so R1 is inside GOV-15's input set
  (`source-language-stability.md:9`) and R2/R3 are outside it. Route (a) takes
  R1 out; the carve-out at `:25` covers that as an addition, but only if the
  *Trigger* edit lands with the code (DIAG-2, `diagnostic-shape.md:72`).

## Fix

Settle which code `enum[...]` at the `params:` right-hand side draws, and make
the registry row and the implementation agree. Two routes; this report does not
choose between them.

**Route (a) — widen the row to the position.** Give the `params:` lowering the
inline-enum check and raise `theta/parse/inline-enum` there. The mechanism the
position already uses is a `LowerCtx` sink: add one beside `unresolved`,
`reservedKeywords` and `slugCollisions`, have the arm that would fall to
`lowerTypeExpr`'s catch-all (`params.ts:603`) record a text matching
`checkInlineEnumForm`'s anchored predicate, and drain it in `parseParams`'s
per-field loop beside the three existing drains (`:198`, `:207`, `:226`). The
recogniser is exported already (`schema-declarations.ts:282`) and is reused, not
re-spelled — a second predicate for one registry row recreates at `params:` the
split this route exists to remove. The row's *Trigger*
(`code-registry-parse.md:95`) is rewritten in the same commit (DIAG-2,
`diagnostic-shape.md:72`) to state the positions it covers, and the edit is
dispositioned under GOV-15's diagnostic-registry carve-out
(`source-language-stability.md:25`) as an addition for the inputs newly brought
into the code's emission set — which the new *Trigger* prose must enumerate.
The *Message* bytes do not change, so no DIAG-4 reword is involved.

**Route (b) — accept the divergence and record it.** State in the row's
*Trigger* that `theta/parse/inline-enum` covers the `schema` declaration
positions, and that the `params:` right-hand side answers for this text under
its own row. This is also a DIAG-2 *Trigger* edit and also lands with prose,
not silently; the difference is that it removes no input from any emission set,
so the carve-out applies vacuously. It requires 0059 to have landed, or to land
with it, because the sentence it writes names 0059's code as this input's
answer — and it must justify why a registered, named mistake draws the generic
refusal, against the precedent bug 0044 set at these positions in the opposite
direction.

Constraints on either route:

1. **The bounds in §Reproduction (c) are stated, not left implicit.** R4/R5
   (union-arm depth), R6/R7 (`params:` at depth and inside a generic argument),
   R8 (the declaration position's own silence at depth) and R9 (the `@<T>`
   annotation) are measured above. A route that widens the trigger states which
   of them it reaches; a route that narrows it states which of them it excludes.
   R8 and R9 are a wider gap in the same row than the subject, and a *Trigger*
   rewrite that omits them leaves the row inaccurate in a second way.
2. **No cross-position blast radius.** The three other `Type` positions must
   show byte-identical lowered documents and byte-identical diagnostic
   sequences after the change. Route (a)'s sink is optional on `LowerCtx` for
   the same reason 0059's is: `lowerTypeExpr` is reached from every position
   (`body-type-lowering.ts` for the two `schema` spellings,
   `query-schema-lowering.ts` for `@<T>`), so the refusal is made by the caller
   and a position that threads no sink is unchanged. Raising the diagnostic
   inside `lowerTypeExpr` would double-report R2/R3, which already draw the
   code from the declaration walk.
3. **Exactly one diagnostic per offending field.** R2 and R3 draw exactly one
   line at HEAD. A `params:` field must not draw both a widened
   `theta/parse/inline-enum` and 0059's `theta/load/params-type-not-expression`
   for one text; whichever route lands states which code survives and the other
   site suppresses. This is 0129's question in this row's terms, and route (a)
   creates it only if 0059 has landed.
4. **Route (a) narrows 0059's emission set.** 0059's §Fix constraint 4 requires
   its *Trigger* to enumerate the refused spellings; `enum[...]` leaves that
   enumeration under route (a). Both rows' *Trigger* cells are re-derived in one
   commit, or the second to land re-derives the first's.
5. **The corpus stays green and the census is re-run.** Zero committed
   `.theta` / `.thetalib` files carry `enum[` at this HEAD (34 files searched),
   so no committed source moves under either route. Re-run the census before
   landing.
6. **Both landed witnesses keep their bytes.**
   `tests/schema-declarations.test.ts:163` (the recogniser in isolation) and
   `tests/schema-alias-union-decl.test.ts:1750` cell n6 (the alias RHS against
   its object-field control) assert the two positions that already fire. Route
   (a) adds a `params:` arm to the comparison n6 already makes; it does not
   move n6's expectation.

## Non-goals

- **Closing the `params:` silence for text that spells no type.** That is bug
  [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md)'s
  subject and its §Fix is written. This report takes no position on 0059's
  route, its emission point or its recogniser; it asks only which code this one
  input class draws once some code is drawn.
- **Whether `{}` should ever be a lowering.** The disposition of the remaining
  permissive fragments is bug
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s
  inventory question. Every row in §Reproduction lowers `{}` at the type
  position, before and after either route — what moves is the diagnostic, not
  the fragment.
- **The nested and `@<T>` occurrences as a subject.** R8 and R9 are measured as
  bounds and constraint 1 obliges a route to state a position on them, but this
  report's subject is the top-level `params:` occurrence against the two
  top-level declaration occurrences. Widening `checkInlineEnumForm` to run at
  every depth is a change to how the declaration walk traverses a field type,
  which is a different frame from wiring the existing check at a fourth
  position.
- **Adding a new code.** Both routes edit one existing *Trigger*. A third code
  for this input is not proposed.

## Provenance

Filed as residual 1 of the bug 0056 fix (0.85.0, commit `81600080`). That fix's
report (`.pi/tmp/fixes/0056-report.md` §Residuals item 1) records the three
observables and the reason the fix left them — "The literal recogniser declines
the text, so this fix leaves it exactly as found" — and the same disposition is
in the doc at
[`0056-…md`](./0056-params-literal-sublanguage-absent-lowers-permissive.md)
`## Fix (0.85.0)` *Residuals* item 1 (`:1028–1033`), with the pre-fix
measurement in that report's §Non-goals (`:718–722`).

Independently re-derived at HEAD `04c6585f` for this filing, not copied: one
scratch vitest probe over `parseDoc`, the shipped `renderBinderParamLine` and
the production `AjvSchemaValidator`, covering every row of §Reproduction
(a)–(d), run and then deleted. Every `src/`, `tests/`, spec and bug-doc citation
above was verified against the tree at HEAD; symbols are named beside lines
because the 0056 fix moved `parseLiteralArm` into `src/parser/params.ts`.

Measurement hygiene, recorded because a concurrent orchestrator was writing the
same files: an uncommitted bug-0059 prototype in `src/parser/params.ts` and
`src/parser/frontmatter.ts` appeared in the working tree during this filing
(after the first probe pass, before the second). Every value in this report is
from a pass over a pristine `git archive 04c6585f` export taken to a directory
outside the repository, run there, and removed; no `git stash`, `git checkout`,
`git restore` or `git worktree` was used, and no tracked file was modified. Both
passes produced byte-identical output for all fourteen rows. The line numbers in
§Affected are the export's, so they are HEAD's and not the prototype's (which
shifts `params.ts` by +25 lines below `:160`).

Two citation observations, recorded rather than chased (0134's class). Bug 0056
cites the inline-enum registry row at `code-registry-parse.md:93` (§Why it
matters) and `schemas.md:89`; at this HEAD they are `:95` and `:93`. The
`schemas.md` drift is already disclosed in that fix's own report; the registry
row's is not.

Note (0.86.0). Bug
[0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) landed:
`p: 'enum["x", "y"]'` now draws one `theta/load/params-type-not-expression`
at load (the text is neither literal-shaped nor brace-carrying, so the
fragment-level judgement refuses it) where this report measured silence. The
coordination this report anticipated is now the live state: the params:
position refuses with the GENERIC text code while both declaration spellings
draw `theta/parse/inline-enum` with its targeted fix hint — the code-divergence
question this report owns stands, re-derive §Reproduction against v0.86.0 at
pick time.
