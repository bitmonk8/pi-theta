# Bug 0259 — An `enum` variant list that reaches end of input with at least one variant captured draws ZERO diagnostics: `parseEnumVariants`'s loop bound `!this.atEnd() && depth > 0` exits silently, so `enum E { A,` at EOF loads clean, registers, and lowers `E` to `{"type":"string","enum":["A"]}` — the sibling position bug 0245's fix fenced in its §Non-goals and its fix record named as "worth its own filing"

- **Status:** open
- **Sev/Diff estimate:** S2/D1 — silence only: measured at HEAD, every truncated
  variant list lowers exactly as the closed twin of the same prefix, so no
  lowered artefact diverges from the source's own captured text and no
  permissive fragment is manufactured (the 0245 element-2 corruption face has no
  enum analogue); a truncated source nonetheless registers as a complete theta.
  D1 because the emission point is one loop exit in one function and the
  disposition is settled by 0245's landed row — the natural extension of its
  *Trigger*, a same-commit DIAG-2 edit.
- **Kind:** defect — a structurally malformed source inside GOV-15's
  loads-cleanly set. `enum X { ... }`'s closing `}` is spelled by
  `docs/spec_topics/schemas.md:68` (the shape line) and by its example
  blocks (`:71–75`, `:81–90`); `:93` states the separator rule ("Variants are
  comma-separated; trailing comma optional"). Every
  other `enum` body defect has a registry row
  (`theta/parse/empty-enum-body` — `code-registry-parse.md:109`;
  `theta/parse/non-string-enum-value` — `:114`;
  `theta/parse/duplicate-enum-variant-name` — `:113`;
  `theta/parse/duplicate-enum-value` — `:112`). A body that never closes has
  none. `parseEnumVariants` (`src/parser/theta-document.ts:3285`) bounds its
  variant loop with `while (!this.atEnd() && depth > 0)` (`:3316`); when the
  first conjunct fails it pushes no diagnostic and returns the captured names,
  values and variant decls (`:3376`), so the declaration is indistinguishable
  from a closed one on every channel measured: diagnostics, the recorded
  statement, the lowered fragment, registration.
- **Related:**
  - [0245](./0245-unclosed-schema-body-at-eof-loads-clean.md) — **fixed
    (0.226.0)**, the same structural defect at the `schema` object body.
    Its fix made `parseSchemaObjectBody`'s `atEnd()` exit emit the newly minted
    `theta/parse/schema-body-unclosed` (`src/parser/theta-document.ts:3062–3072`)
    and explicitly declined the enum position: §Fix adjudication 2 scoped the
    row to "the schema object body's field-loop EOF exit ALONE — the doc's
    letter", §Non-goals fenced `enum E { A,` at EOF, §Fix residual 1 records
    "the `enum` sibling stays silent … Worth its own filing; a row reading 'a
    declaration body not closed by a matching `}`' would reach it", and witness
    cell `b0245-f1` (`tests/schema-body-unclosed-at-eof.test.ts:721`) asserts
    that silence as a fence. This report is that filing.
  - [0133](./0133-field-list-discard-recovery-unsettled.md) — **fixed
    (0.203.0)**, the report whose review first recorded the truncated-body class
    (its §Fix residual 2, the input 0245 took up). Its subject is
    `parseSchemaObjectBody`'s three recovery arms and
    `recoverMalformedSchemaField`; neither reaches `parseEnumVariants`, which
    has no recovery arm of its own.
  - [0151](./0151-unclosed-fn-parameter-list-accepted.md) — **fixed
    (0.163.0)**, the same shape at an `fn` parameter list and the source of the
    opening-token ranging both landed rows use. Measured at HEAD,
    `fn f(a: string,` at EOF draws `theta/parse/single-line-if` plus
    `theta/parse/fn-param-list-unclosed`; `schema S { a: string,` draws
    `theta/parse/schema-body-unclosed`; `enum E { A,` draws nothing.
- **Affected** (every citation verified at HEAD `53cd0d86`, 0.240.0):
  - `src/parser/theta-document.ts:3316` — **the defect site**, the variant
    loop's bound `while (!this.atEnd() && depth > 0)`. Reaching EOF with
    `depth > 0` leaves the loop with no emission.
  - `src/parser/theta-document.ts:3285–3377` — `parseEnumVariants` as a whole:
    the advance-to-`{` prelude (`:3290–3299`), the `{` consumption
    (`:3300` — the opening token is advanced past and not retained, so an
    emission ranged on it must capture it), the accumulators (`:3301–3310`),
    `let depth = 1` (`:3315`), the depth arms for `{` (`:3318–3322`) and `}`
    (`:3323–3327`), the name-capture arm (`:3328–3346`), the explicit-value arm
    (`:3347–3365`), the comma arm (`:3366–3372`), the skip-anything-else tail
    (`:3373–3374`), and the single
    `return { names, values, variantDecls }` (`:3376`) that both a closed and a
    truncated body reach.
  - `src/parser/theta-document.ts:3261–3274` — `parseEnum`, which records the
    `enum` statement from that return (`:3266–3273`) with no knowledge of how
    the body ended.
  - `src/parser/schema-declarations.ts:198–207` — `checkEnumDeclaration`'s
    zero-variant arm, `theta/parse/empty-enum-body`. It is the empty-prefix
    fence: an enum body that captures no variant before EOF is already refused
    (measured), exactly as `theta/parse/empty-schema-body` fences 0245's row.
  - `src/parser/body-type-lowering.ts:107–113` — `lowerEnumToSchema`, whose
    `return { type: "string", enum: values }` (`:112`) reads the captured
    variant list alone.
  - `src/extension/production-composition.ts:1785` — `const registered =
    !diagnostics.some((d) => d.severity === "error")`. Zero diagnostics means
    the theta registers.
  - `docs/spec_topics/schemas.md:66–93` — §Enum declarations: the example blocks
    that spell the closing `}` (`:68`, `:79`, `:86`) and the rule paragraph
    (`:93`) that enumerates every other `enum` body refusal and names none for
    an unclosed body. Unlike the `schema` object form there is no BNF
    production: `docs/spec_topics/grammar.md` carries `SchemaDecl` /
    `SchemaShape` (`:171–172`) and, since 0245, the sentence that an object body
    reaching end of input with no `}` is `theta/parse/schema-body-unclosed`
    (`:179`), but no `EnumDecl` rule — grep for `"enum"` in that file returns no
    production.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:100` —
    `theta/parse/schema-body-unclosed`, whose *Trigger* fences this input in its
    own words: "Scoped to the `schema` object body alone: the `enum` variant list
    (`parseEnumVariants`) and every other unbalanced bracket are not judged by
    this row". `:109` — `theta/parse/empty-enum-body`, whose *Trigger* is
    `enum X { }` with no variants. `:24` —
    `theta/parse/fn-param-list-unclosed`, likewise self-fenced to `fn`
    parameter lists.
  - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15 and its
    three observables), `:9` (the loads-cleanly predicate), `:25` (the
    diagnostic-registry carve-out, which dispositions a DIAG-2 *Trigger* change
    "as an addition for inputs newly brought into the code's emission set").
  - `tests/schema-body-unclosed-at-eof.test.ts:721–744` — bug 0245's witness
    cell `b0245-f1`, which pins today's silence, the captured variant `["A"]`,
    the lowered `{ E: { type: "string", enum: ["A"] } }` and `registered ===
    true` for `enum E { A,`. **Test coverage of this defect: none** — that cell
    asserts the fence, not the refusal, and it is the only test in the tree
    driving an enum body that reaches EOF (`rg 'enum E \{ A,' tests/`).
- **Observed at:** `0.240.0` (HEAD `53cd0d86`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving `parseDoc`
  (`tests/helpers/e2e-s1.ts` — the shipped lexer and `parseThetaDocument` behind
  an inert `parseDeps` double), reading `doc.diagnostics`, the parsed
  `doc.body.statements`, and the lowered fragments from `buildBodyTypeSchemas`.
  Written, run, deleted; `src/`, `tests/` and every other document are
  unmodified by this filing.

## Summary

`parseEnumVariants` (`src/parser/theta-document.ts:3285`) leaves its variant
loop when `atEnd()` becomes true (`:3316`) and returns the variants captured so
far with no diagnostic. An `enum` body whose source ends before its `}`
therefore loads exactly as if it had closed:

```
enum E { A,        →  []   variants=["A"]   lowered {"type":"string","enum":["A"]}
enum E { A }       →  []   variants=["A"]   lowered {"type":"string","enum":["A"]}
```

The theta registers (`production-composition.ts:1785` gates registration on the
absence of an `E`), and `E` is a usable enum: `Enum.Variant` resolves against
the truncated variant list.

The one declaration form over, the identical truncation is refused. Bug 0245
made `schema S { a: string,` at EOF draw `theta/parse/schema-body-unclosed`
(measured at HEAD, ranged on the body's opening `{`) and bug 0151 made
`fn f(a: string,` draw `theta/parse/fn-param-list-unclosed`. Both rows fence
themselves out of this position by name — `code-registry-parse.md:100` says "the
`enum` variant list (`parseEnumVariants`) and every other unbalanced bracket are
not judged by this row" — so no registry row covers the input.

The class boundary matches 0245's. An empty captured prefix is already refused:
`enum E {`, `enum E {\n`, `enum E { ,` and `enum E ` each draw
`theta/parse/empty-enum-body` (`src/parser/schema-declarations.ts:201`). A
variant with an independent fault keeps its own refusal — a non-string explicit
value, a duplicate name, a duplicate value, a reserved-keyword variant name and
an unterminated string value all fire at EOF. Only a truncation at a point where
the loop is expecting the next variant, the next `=` value, or the `}` is
silent.

No variant is dropped relative to the closed twin of the same prefix. Every
truncated body measured lowers to exactly what the same prefix closed with `}`
lowers to, so this defect is silence, not a lowered artefact that diverges from
the recorded source text. What the truncation loses is the text the author had
not yet written, and the loss is in the narrowing direction: the lowered `enum`
array is a subset of the finished declaration's, so a response carrying a
variant the author was mid-way through writing is rejected rather than
accepted.

## Reproduction

Offline, at `53cd0d86`. Every fixture is a whole `.theta` source
(`---\nmode: prompt\n---\n<decl>`) driven through `parseDoc`. `diags` is
`doc.diagnostics` in emission order; `variants` and `values` read the parsed
`enum` statement off `doc.body`; `lowered` is `buildBodyTypeSchemas` over the
parsed enum; `reg` is `!diagnostics.some(d => d.severity === "error")`. `E`
abbreviates `error theta/parse/`. The declaration is on source line 4.

### The subject

```
@@ enum E { A,
   diags    :: []
   variants :: ["A"]
   lowered  :: {"E":{"type":"string","enum":["A"]}}
   reg      :: true
@@ enum E { A }                                                     [control]
   diags    :: []
   variants :: ["A"]
   lowered  :: {"E":{"type":"string","enum":["A"]}}
   reg      :: true
```

The two rows are identical on every channel measured.

### The class — what else is silent

```
@@ enum E { A                   diags :: []   variants :: ["A"]
@@ enum E { A, B                diags :: []   variants :: ["A","B"]
@@ enum E { A, B,               diags :: []   variants :: ["A","B"]
@@ enum E { A,\n                diags :: []   variants :: ["A"]
@@ enum E { A, B = "b"          diags :: []   variants :: ["A","B"]   values :: {"B":"b"}
@@ enum E { A, B =              diags :: []   variants :: ["A","B"]   values :: {}
@@ enum E { A, 42               diags :: []   variants :: ["A"]
@@ enum E { A, {                diags :: []   variants :: ["A"]
@@ enum E { A, { }              diags :: []   variants :: ["A"]
@@ enum E { A, "}"              diags :: []   variants :: ["A"]
@@ enum E { A, B = "b" // c     diags :: []   variants :: ["A","B"]   values :: {"B":"b"}
@@ let x = 1\nenum E { A,       diags :: []   variants :: ["A"]   stmts :: ["let","enum"]
```

A trailing comma is not the trigger — the omitted `}` is. The silence holds with
or without the comma, at any variant count, with an explicit value present or
half-written, and with a preceding statement in the file.

### The closed twins of the three brace-accounting rows

```
@@ enum E { A, { } }            diags :: []   variants :: ["A"]
@@ enum E { A, "}" }            diags :: []   variants :: ["A"]
@@ enum E { A, B = }            diags :: []   variants :: ["A","B"]   values :: {}
```

Each truncated row above lowers exactly as its closed twin. `enum E { A, { }`
consumed a `}` the author wrote, but that `}` closed the interior `{` and left
`depth === 1`, so the body itself is still unclosed; `enum E { A, "}"` carries
a `}` inside a string token, which the loop's `punct`-only depth arms
(`:3318–3327`) never count. Neither input needs a withhold: the depth counter
already distinguishes a closer the author wrote for the body from one written
for something else.

### What is refused

```
@@ enum E {                     diags :: [E empty-enum-body]   variants :: []
@@ enum E {\n                   diags :: [E empty-enum-body]   variants :: []
@@ enum E { ,                   diags :: [E empty-enum-body]   variants :: []
@@ enum E { {                   diags :: [E empty-enum-body]   variants :: []
@@ enum E                       diags :: [E empty-enum-body]   variants :: []
@@ enum E { A, B = 42           diags :: [E non-string-enum-value]
@@ enum E { A, B = "b           diags :: [E unterminated-string]
@@ enum E { A, A                diags :: [E duplicate-enum-variant-name]
@@ enum E { A, B = "a", C = "a" diags :: [E duplicate-enum-value]
@@ enum E { A, let              diags :: [E reserved-keyword-as-identifier]
```

Every refusal here is earned by the variant's own fault, and none of them names
the missing `}`. The empty-prefix rows are the fence 0245's row already draws at
the `schema` position: an empty captured prefix keeps `empty-enum-body` alone.

### The two sibling declaration forms, both refused

```
@@ schema S { a: string,        diags :: [E schema-body-unclosed @4:10]   reg :: false
@@ fn f(a: string,              diags :: [E single-line-if @4:1,
                                          E fn-param-list-unclosed @4:5]  reg :: false
```

Bug 0245's and bug 0151's landed rows. The same truncation in the third
declaration form draws nothing and registers.

## Expected behaviour

An `enum` body that captures at least one variant and then reaches end of input
with no `}` derives from no `enum` declaration the corpus spells
(`docs/spec_topics/schemas.md:66–93`), so it is not a theta 1.0 source and the
load is refused with a diagnostic naming the unclosed body, ranged on the body's
opening `{`. The theta does not register, matching the two sibling forms:
`code-registry-parse.md:100` for the `schema` object body and `:24` for an `fn`
parameter list, each of which states the EOF exit, the containment and the
non-registration.

An empty captured prefix keeps `theta/parse/empty-enum-body` alone, and a
variant carrying its own fault keeps its own refusal beside the new emission —
the missing `}` is a fault independent of a variant's value or name, the same
co-firing `code-registry-parse.md:100` already states for the `schema` position.

## Actual behaviour / root cause

**One loop bound, no emission.** `parseEnumVariants`
(`src/parser/theta-document.ts:3285`) advances past the opening `{` (`:3300`),
sets `depth = 1` (`:3315`) and runs

```ts
    while (!this.atEnd() && depth > 0) {
```

(`:3316`). The `}` arm (`:3323–3327`) decrements `depth` and is the well-formed
exit. When the source runs out instead, the first conjunct fails, the loop ends
with `depth === 1`, and control falls to `return { names, values, variantDecls }`
(`:3376`) with nothing pushed to `this.diagnostics`. The return type carries no
"how did the loop end" bit, so `parseEnum` (`:3261`) records the ordinary `enum`
statement (`:3266–3273`) for both endings alike.

**Nothing downstream can tell.** `checkEnumDeclaration`
(`src/parser/schema-declarations.ts:190`) judges the variant list it is handed:
its zero-variant arm (`:198–207`) fires `theta/parse/empty-enum-body`, and its
name-, value- and kind-duplication checks run on the captured prefix. A
non-empty prefix from a truncated body passes every one of them.

**Registration is gated on diagnostics alone.**
`src/extension/production-composition.ts:1785` computes `registered` as the
absence of an error-severity diagnostic. With none emitted, the truncated
document is a registered theta.

**Lowering reads the captured list.** `lowerEnumToSchema`
(`src/parser/body-type-lowering.ts:107–113`) lowers the enum to
`{ type: "string", enum: values }` (`:112`) over the variants
recorded. For a truncated body that is the prefix, which is also what the
closed twin of the same prefix lowers to — measured. Unlike bug 0245's element
2 there is no permissive artefact here: the enum lowering has no `{}` analogue,
and every truncated fragment measured is a subset of the finished
declaration's, so the divergence is a narrowing, not an over-acceptance.

**Why the class is exactly this.** The loop only reaches `atEnd()` between
variants, after a `=` with no value, or after a value. A truncation before any
variant yields an empty list and `empty-enum-body`; a truncation inside a
string value draws `theta/parse/unterminated-string` from the lexer; a
non-string, duplicate or keyword-spelled variant draws its own row. The one
uncovered position is where the `}` belongs.

**The fence is textual, not incidental.** `theta/parse/schema-body-unclosed`'s
*Trigger* (`code-registry-parse.md:100`) names `parseEnumVariants` as out of
scope, so no landed row applies to this input by its own words.

## Why it matters

- **A truncated file is accepted as a complete program.** The one signal that
  the source ended mid-declaration is the missing `}` the parser drops. Every
  other channel — diagnostics, the recorded statement, the lowered fragment,
  registration — reports success.
- **The registered enum is short.** A model response carrying a variant the
  author was in the middle of writing fails validation against a schema the
  author never finished, with no diagnostic anywhere pointing at the truncated
  source.
- **The same shape is refused in the two sibling declaration forms.** After bug
  0245 and bug 0151, `schema S { a: string,` and `fn f(a: string,` at EOF are
  both refused and neither registers; `enum E { A,` is not. The inconsistency
  is visible to any author who meets two of the three.
- **Bug 0245 left this as a named successor.** Its §Fix residual 1 and witness
  cell `b0245-f1` record the silence deliberately, pending this filing.

## Non-goals

- **`enum E {` and the other empty-prefix spellings.** Refused today as
  `theta/parse/empty-enum-body` (measured). Whether that row's *Message* should
  also name the missing `}` is the DIAG-4 wording question bug 0245's
  §Non-goals already fenced for `empty-schema-body`, and it is not opened here.
- **The `schema` object body, the `fn` parameter list and bug 0133's recovery
  arms.** Landed subjects of 0245, 0151 and 0133. Nothing here re-opens
  `theta/parse/schema-body-unclosed`'s withhold, its ranging, or
  `recoverMalformedSchemaField`.
- **Every other `enum` body rule.** The non-string value, duplicate name,
  duplicate value, reserved-keyword and inline-`enum[...]` dispositions are
  untouched; this report adds an emission for the absent `}` and changes no
  other observable.
- **The unbalanced enum body that consumes the file remainder.** A body whose
  `{` count exceeds its `}` count with tokens still following (`enum E { A,`
  with further statements) already absorbs those tokens as variant material —
  measured: `enum E { A,\nenum F { B }` captures a variant named `enum` and
  draws `theta/parse/reserved-keyword-as-identifier`. Those inputs carry an `E`
  today; this report's do not.

## Provenance

Fenced by bug 0245 (0.226.0) in §Non-goals, pinned as today's behaviour by its
witness cell `b0245-f1`
(`tests/schema-body-unclosed-at-eof.test.ts:721`), and named in its §Fix
residual 1 as "worth its own filing". Re-measured at HEAD `53cd0d86` (0.240.0)
before filing: the subject is byte-identical to 0245's recorded observation, and
the class table, the brace-accounting rows and the closed-twin lowering
comparison are new measurements taken for this report.

## Fix

Emit at `parseEnumVariants`'s EOF exit, under the constraints below.

1. **Emission site.** `src/parser/theta-document.ts:3316` — the variant loop's
   bound. On leaving the loop with `depth > 0` and a NON-EMPTY captured variant
   list, push the diagnostic; the empty-prefix case keeps
   `theta/parse/empty-enum-body` alone, so the guard is the same non-empty
   captured-prefix test `parseSchemaObjectBody`'s emission uses
   (`:3063`, `fields.length > 0`).
2. **Range.** The body's own opening `{`, mirroring
   `theta/parse/schema-body-unclosed` (`openTok.range`, `:3068`) and
   `theta/parse/fn-param-list-unclosed`. `parseEnumVariants` advances past that
   token without retaining it (`:3300`), so the fix captures it there.
3. **No withhold.** `parseSchemaObjectBody` needs one because a field-TYPE
   capture can swallow the body's `}`; the enum loop has no capture that
   consumes a `}` — the `}` arm (`:3323–3327`) is the only place a `}` punct
   token is consumed and it decrements `depth`, and a `}` inside a string token
   is never counted. Measured: `enum E { A, { }` (interior closer) and
   `enum E { A, "}"` (string-borne `}`) both end with `depth === 1` and both
   are bodies the author left unclosed, so both are correctly refused.
4. **Co-firing, not suppression.** The absent `}` is independent of a variant's
   own fault, so the emission joins `theta/parse/non-string-enum-value`,
   `theta/parse/duplicate-enum-variant-name`,
   `theta/parse/duplicate-enum-value`,
   `theta/parse/reserved-keyword-as-identifier` and
   `theta/parse/unterminated-string` rather than replacing or being replaced by
   any of them — the disposition `theta/parse/schema-body-unclosed`'s *Trigger*
   (`code-registry-parse.md:100`) already states for its own position.
5. **Nothing else moves.** The captured names, values and variant decls are
   still returned, so `parseEnum`, `checkEnumDeclaration` and
   `buildBodyTypeSchemas` are byte-untouched and the lowering does not change.
   The code is `E`, so the composition root's registration gate
   (`src/extension/production-composition.ts:1785`) denies registration, which
   is what keeps a truncated enum out of a provider prompt.

**Registry disposition (same commit, DIAG-2).** Widen
`theta/parse/schema-body-unclosed` (`code-registry-parse.md:100`) to the `enum`
variant list. That row's *Trigger* currently excludes this position in so many
words ("Scoped to the `schema` object body alone: the `enum` variant list
(`parseEnumVariants`) and every other unbalanced bracket are not judged by this
row"), so the edit is a *Trigger* widening, not an application of the row as
written; `source-language-stability.md:25` dispositions a DIAG-2 *Trigger*
change "as an addition for inputs newly brought into the code's emission set",
which is what these inputs are — they carry no `E` today
(`source-language-stability.md:9`). The row's *Message* (`schema object body is
not closed by '}'`) is FALSE of an enum body, and DIAG-4 defers a *Message*
reword to theta 2.0, so the widening carries a declaration-body-general
*Message* only if that reword is admissible; if it is not, mint a sibling row
for the enum variant list instead and keep both *Triggers* mutually exclusive.
This is the choice bug 0245's §Fix adjudication 1 faced for
`theta/parse/fn-param-list-unclosed` and resolved by minting, on the ground that
a reword would flip a landed 35-cell witness; the same test applies here.

The mirrors that enumerate this family move in lock-step, as 0245's fix moved
them: `docs/reference/diagnostics.md:146`,
`docs/reference/schema-subset.md:61` and `:102`,
`docs/spec_topics/schemas.md:93` (§Enum declarations, which today lists every
`enum` body refusal but this one), and `docs/spec_topics/grammar.md:179` (the
`schema`-side sentence; the enum body has no BNF production there, so the rule
lands in prose or a production is added).

**Witness.** Bug 0245's cell `b0245-f1`
(`tests/schema-body-unclosed-at-eof.test.ts:721–744`) asserts today's silence
for `enum E { A,` and MUST be flipped by the fix — it is the one existing test
this change moves, and the flip is the fix's own subject rather than a
weakening. The new witness covers the subject and its closed control on all
three channels, the class rows above, the two brace-accounting rows and their
closed twins, the empty-prefix fence, and one co-firing row.
