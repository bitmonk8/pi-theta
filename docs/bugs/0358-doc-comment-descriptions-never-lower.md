# Bug 0358 — `///` descriptions never lower: the placement-accepted anchors (object/alias/by-form `schema`, `enum`) emit `$defs` fragments with no `description:` key on every surface (params schema, binder envelope, typed-query respond schema), with zero diagnostics — the join/strip/lower seam (`joinDocComment`, `extractDescription`, `lowerDescription`) ships as dead exports no production code calls

- **Status:** open.
- **Sev/Diff estimate:** S3/D3 — silent author-intent drop with zero
  diagnostics: the theta loads clean, registers, and every consumer the
  spec names for the text (the model reading a structured-output schema,
  the binder envelope's `args` fragment) sees a description-less schema.
  No wrong bytes are fabricated — the harm is pure absence of documented,
  quality-bearing metadata ("they materially improve output quality",
  descriptions.md:3). D3 because the fix is a wiring pass with adjudications
  attached: attach doc runs to `SchemaDecl`/`EnumDecl` AST nodes, thread
  through `collectBodyTypes` → `lowerObjectFields`/`lowerEnumToSchema` and
  the union/alias emission, and reconcile two spec-side questions this
  report pins (the schema-subset keyword vocabulary and the canonical-hash
  consequences).
- **Kind:** defect — implementation diverges from stated rules.
  `docs/spec_topics/descriptions.md:3`: doc comments "lower to JSON Schema
  `description:` fields and are passed to the model when the schema is used
  for structured output"; `:38` (**No transformation**): "Theta emits
  description text byte-for-byte into the lowered schema";
  `docs/spec_topics/grammar.md:195`: "A `///` description on an alias
  schema (`schema X = T | U`) lowers as the description of the named type
  wherever it surfaces in JSON Schema output." None of this happens for any
  anchor.
- **Related:**
  - [Bug 0357](./0357-doc-comment-field-variant-anchors-refused.md) —
    the field/variant anchors never get this far (refused at placement).
    This report measures the anchors that ARE accepted. Fixing 0357 without
    this report's wiring would extend the silent drop to fields/variants;
    fixing this without 0357 leaves the flagship example refused. Distinct
    mechanisms and fix surfaces; file together, fix in either order.
  - [Bug 0360](./0360-desc-gate-witnesses-dead-seams.md) — the DESC
    gate's green over these dead exports is why 347 releases shipped
    without noticing.
  - [0299](../../../docs/bugs/0299-null-scalar-description-system-fabricate-literal-null.md)
    (fixed 0.331.0) — nearest settled neighbour on the *frontmatter*
    `description:` field; different carrier (YAML scalar → binder prompt /
    autocomplete), not the `///` pipeline.
- **Affected** (verified at af476df2, v0.347.0):
  - `src/parser/descriptions.ts:46–77` (`joinDocComment`), `:84–105`
    (`extractDescription`), `:114–128` (`lowerDescription`) — the
    behaviour-bearing seam functions. Repo-wide, their only importers are
    `tests/descriptions.test.ts`; the sole production import from this
    module is `checkDocCommentPlacement`
    (`src/parser/theta-document.ts:63`).
  - `src/parser/theta-document.ts:830–834` — the `DocComment` AST node:
    `{ kind: "doc-comment", lines }`, merged into the statement list as a
    free-floating sibling (`mergeByLine`, `:1665–1677`); never attached to
    the following `SchemaDecl` (`:694`) / `EnumDecl` (`:778`) / `FnDecl`
    (`:601`), none of which carries a description field.
  - `src/parser/body-type-lowering.ts:107–113` (`lowerEnumToSchema`),
    `:121–155` (`lowerObjectFields`), `:173+` (`lowerInlineObject`) — the
    fragment constructors; no `description` parameter, no `description`
    emission. The string `description` does not occur in
    `body-type-lowering.ts`, `schema-lowering.ts`, `schema-declarations.ts`,
    or `params.ts`.
  - `src/parser/params.ts:163–240` (`parseParams`) — builds the params
    schema and `$defs` off `bodyTypeMap` (`decl.lowered`), inheriting the
    absence into the binder envelope
    (`production-theta-producer.ts:936–939`, `buildBinderEnvelopeSchema`
    over `params.loweredSchema`) and the post-default-merge AJV document.
- **Observed at:** 0.347.0 (af476df2). Offline, deterministic: scratch
  vitest over `parseThetaDocument` via `tests/helpers/e2e-s1.ts` `parseDoc`
  (written, run, deleted); lowered bytes read off
  `frontmatter.params.loweredSchema`.

## Summary

The `///` pipeline was built as a seam module (`src/parser/descriptions.ts`,
"V5c") with four functions: placement check, run extraction, multi-line
join + dedent, and description lowering. Only the placement check is wired
into the parser. The extraction/join/lower half is dead code: doc-comment
runs are recovered as floating `DocComment` statements and then ignored.
No lowering path — named `$defs` entries, alias/union forms, enum
fragments, the params schema, the binder envelope's `args` arm, the typed
query respond-tool schema — ever writes a `description:` key.

A theta carrying schema-level and enum-level `///` (the placement-accepted
anchors) loads with zero diagnostics and lowers to byte-identical schemas
as the same theta with the comments deleted.

## Reproduction

Offline, at af476df2, through `parseDoc`:

```
---
mode: prompt
params:
  choice: Choice
  req: Req
---
/// pick one of the two options
schema Choice = "a" | "b"

/// line one
///   indented second line
///
/// line after blank
schema Req {
  language: string,
}
let x = 1
```

Observed: `diagnostics: []`, and
`frontmatter.params.loweredSchema` (the document AJV consumes and the
binder envelope embeds) is exactly:

```json
{"type":"object",
 "properties":{"choice":{"$ref":"#/$defs/Choice"},"req":{"$ref":"#/$defs/Req"}},
 "required":["choice","req"],"additionalProperties":false,
 "$defs":{
   "Choice":{"type":"string","enum":["a","b"]},
   "Req":{"type":"object","properties":{"language":{"type":"string"}},
          "required":["language"],"additionalProperties":false}}}
```

The serialised document contains neither the key `description` nor any
byte of the four comment lines. The same absence holds for an object-form
schema description and an enum description used via `params:`
(`ReviewRequest` / `Severity` probe), and — by shared fragment source
(`decl.lowered` from `collectBodyTypes`) — for every downstream consumer
of those `$defs`: the binder envelope schema, the per-query respond-tool
document, and the AJV validators.

Direction check (the expected behaviour is implementable, the gap is
wiring): calling the shipped-but-dead `lowerDescription("text", "schema",
fragment)` returns `{ ...fragment, description: "text" }` — its unit test
in `tests/descriptions.test.ts` passes at HEAD.

## Expected behaviour

- `docs/spec_topics/descriptions.md:3` — "They lower to JSON Schema
  `description:` fields and are passed to the model when the schema is used
  for structured output."
- `:36` (**Multi-line**) — consecutive lines join with newlines, common
  leading whitespace stripped (query-template dedent algorithm), empty
  `///` lines become blank lines — i.e. the fixture's `Req` description is
  the string `"line one\n  indented second line\n\nline after blank"`.
- `:38` (**No transformation**) — that string lands byte-for-byte in the
  lowered schema.
- `docs/spec_topics/grammar.md:195` — the alias form (`schema Choice = …`)
  "lowers as the description of the named type wherever it surfaces in JSON
  Schema output"; mirrored at `docs/reference/grammar.md:143–144` and
  `:402–404`.
- Expected lowered bytes for the fixture:
  `$defs.Choice = {"type":"string","enum":["a","b"],"description":"pick one of the two options"}`
  and `$defs.Req` carrying the joined multi-line string.

## Actual behaviour / root cause

`scanDocComments` (`theta-document.ts:1607–1663`) recovers each run's
`lines` and checks placement; `mergeByLine` (`:1665–1677`) then sorts the
`DocComment` nodes into the statement list and nothing reads them again:

- `collectBodyTypes` lowers each `SchemaDecl` / `EnumDecl` through
  `lowerObjectFields` / `lowerEnumToSchema` / the union emission
  (`body-type-lowering.ts`), which have no description input;
- the decl AST nodes themselves carry no description slot to read — the
  run is a *sibling statement*, not an attachment;
- `extractDescription` / `joinDocComment` / `lowerDescription`
  (`descriptions.ts:46–128`) — the functions that implement descriptions.md
  §Multi-line and §No transformation — are exported and unit-tested but
  have zero production call sites (`grep -rn "joinDocComment\|extractDescription\|lowerDescription" src/`
  → definitions only).

For `fn`, descriptions.md `:35` prescribes AST-only preservation — the
floating `DocComment` node arguably satisfies that arm; every
schema-bearing anchor's obligation is unmet.

## Why it matters

- The feature's entire value is the lowered bytes: the description is
  model-facing schema metadata for structured output, and the page sells it
  as materially improving output quality. At HEAD, authoring them is a
  silent no-op — worse, on field/variant anchors it is a load error
  ([bug 0357](./0357-doc-comment-field-variant-anchors-refused.md)), so the feature is pincered: refused where visible, inert
  where accepted.
- Zero diagnostics at any severity: the author has no signal that four
  lines of carefully-written model guidance went nowhere.
- The absence is invisible to every shipped gate: no committed fixture
  carries `///`, and the DESC-area tests witness only the dead seam
  functions ([bug 0360](./0360-desc-gate-witnesses-dead-seams.md)).

## Non-goals

- **The field/variant placement refusal** —
  [bug 0357](./0357-doc-comment-field-variant-anchors-refused.md).
- **The binder Parameters-block ` — <description>` segment** —
  [bug 0359](./0359-binder-param-description-segment-unauthorable.md);
  that segment's *source* is unauthorable independently of this
  report's lowering gap.
- **The dedent algorithm's fidelity** — `joinDocComment`'s common-prefix
  walk matches QRY-7's space/tab-only alphabet and whitespace-only-line
  normalisation on the probes run here; since it is dead code, any residual
  divergence has no observable and is not measured further.
- **The fn "preserved on the AST" arm** — loosely satisfied (floating node
  at the right line); tooling-facing attachment is a fix-side choice, not a
  filed defect.

## Fix

Not yet decided; constraints any fix must satisfy:

1. Attach the trailing `///` run to its anchor (schema/enum decl, field,
   variant) at parse time — `extractDescription`'s regular-`//`-terminates
   rule included — and emit through `lowerDescription`'s byte-for-byte
   contract at every fragment constructor (`lowerObjectFields` field
   properties, `lowerEnumToSchema`, the alias/union emission, and — once
   the [bug 0357](./0357-doc-comment-field-variant-anchors-refused.md) fix
   lands — field/variant positions).
2. **Reconcile schema-subset.md.** The normative emitted-keyword vocabulary
   (`docs/spec_topics/schema-subset.md:5–14`) does not list `description`;
   descriptions.md mandates emitting it. One of the two pages must move in
   the same commit (presumably the subset gains `description` as emitted
   annotation-metadata, excluded from the rejected-keyword list it already
   omits it from).
3. **Adjudicate the canonical-hash consequence.** The schema slug
   (schema-subset.md §Canonical schema hash) is computed over the lowered
   fragment; descriptions entering fragments change respond-tool names
   (`__theta_respond_<slug>`), binder tool names (`__theta_bind_<slug>`),
   and validator cache keys for previously-description-less thetas — an
   accepted consequence to state, or an explicit exclusion of `description`
   from the canonical form to pin. Inline `__inline_<slug>` fragments are
   unaffected today (no `///` anchor exists inside a type expression), but
   field-level descriptions inside hoisted inline objects would reopen the
   question — state the disposition.
4. Zero new diagnostics on the accepted anchors; the committed corpus
   (zero `///` uses) stays byte-identical.
5. Witness on lowered bytes, not seam functions: parse → read
   `loweredSchema` / the respond-tool document, asserting the exact joined
   string (multi-line + blank-line + dedent case from the fixture above),
   for object, alias, by-form union, and enum anchors.

## Provenance

Fresh find (README sweep: no report names `///` lowering, `description:`
fields in lowered schemas, or the DESC area; the description-adjacent
family 0060/0103/0209/0299 is the binder-prompt/frontmatter surface).
Probed at af476df2 with scratch vitests over `parseDoc` (fixture above plus
the object/enum variant; deleted). Implementation read: descriptions.ts
(whole file), theta-document.ts:63/:830–858/:946–952/:1599–1677,
body-type-lowering.ts:107–199, params.ts:163–240,
production-theta-producer.ts:936–939; `grep -rn description` over
`src/parser/` (hits only in frontmatter.ts, descriptions.ts, functions.ts
doc prose). Spec read: descriptions.md (whole page), grammar.md:181–195,
schema-subset.md (whole page), reference/grammar.md:141–146/:394–404.
