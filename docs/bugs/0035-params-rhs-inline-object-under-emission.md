# Bug 0035 — An inline object type on the `params:` right-hand side is discarded before it is lowered: `p: {a: Tirage, b: integer}` loads clean, lowers `properties.p = {}`, records the field's declared type as the empty string, and raises none of the `theta/parse/unresolved-named-type` its two sibling positions raise for the identical text

- **Status:** fixed (0.44.0). Both frames closed — the frontmatter read
  recovers the author's bytes for a non-scalar RHS, and the `params:`
  position lowers a brace-rooted field through its own inline-object arm
  (hoist under `__inline_<slug>`, emission from the threaded resolution
  set). See §Fix (0.44.0) below.
- **Kind:** defect, two elements on one mechanism. (1) *Implementation
  disagrees with the specification.* schema-subset.md §Lowering Algorithm step
  2 (`:73`) hoists "anonymous inline object schemas (`{ field: T }` appearing
  in **any type position**)" into `$defs` under `__inline_<slug>`, and step 3
  (`:76`) pins the emission for a "named or inline schema reference" to
  `{ "$ref": "#/$defs/<Name>" }`; grammar.md §Inline object types (`:109`)
  admits `ObjectType` "in any `Type` position" and type-system.md (`:15`)
  applies one type grammar to `params:` alongside every other annotation
  position. The `params:` position emits `{}` instead — for every inline
  object, whether or not any name inside it resolves. No spec text defines a
  `{}` emission for any type form. (2) *The widened diagnostic under-emits at
  one of its four declared positions.*
  `theta/parse/unresolved-named-type`'s row
  (`docs/spec_topics/diagnostics/code-registry-parse.md:88`) names the
  `params:` right-hand side first, and frontmatter-fields-a.md (`:58`) states
  it directly — "A `params:` named type that resolves to no such declaration
  is the parse-time diagnostic `theta/parse/unresolved-named-type`" — yet a
  name written inside an inline object on that right-hand side is silent,
  where the identical text at the `@<T>` annotation and in a `schema` body
  fires.
- **Related:** [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)
  §Residuals (i) — 0028 implemented the row's other three positions
  (`@<T>` annotation, `schema` body field, and, via
  [0025](./0025-ctor-unresolved-schema-name-passthrough.md), the constructor
  name), which is what makes the `params:` position the weakest of the four.
  This defect is **pre-existing**: `src/parser/frontmatter.ts` is untouched by
  either fix, and the `{}` emission predates both. 0028 §Residuals (iv)
  records the adjacent-but-distinct shape `p: array<{a: string}>`, where the
  braces sit inside a generic's angle brackets, the YAML parse fails outright
  (`BLOCK_AS_IMPLICIT_KEY`) and FM-5 collapses the frontmatter to
  `theta/load/missing-mode`. That one is fail-closed; this one is silent.
- **Affected** (citations verified at the 0.38.0 fix commit):
  - `src/parser/frontmatter.ts:645` — `extractParsedParams`'s per-item read:
    `const rawValue = isScalar(item.value) ? String(item.value.value) : "";`.
    An unquoted `p: {a: Tirage, b: integer}` is a YAML **flow mapping**, not a
    scalar, so `rawValue` is the empty string, `splitParamValue` (`:646`,
    defined `:572`) yields `typeSource: ""`, and the declared type never
    reaches the lowering at all.
  - `src/parser/params.ts:130–142` — `parseParams`'s per-field loop: it lowers
    `field.typeSource` through `lowerTypeExpr` and pushes
    `theta/parse/unresolved-named-type` (`:131–139`) for each name
    `lowerCtx.unresolved` collected. With `typeSource === ""` there is nothing
    to resolve and nothing to report.
  - `src/parser/params.ts:339–341` — `lowerTypeExpr`'s trailing catch-all
    `return {}`. This is where a **quoted** RHS lands: the brace text does
    reach the function, but it has no inline-object arm (`lowerInlineObject`
    lives in `src/parser/body-type-lowering.ts:85` and only the body-type
    path calls it), so the form falls past the generic arm (`:291–305`), the
    union split (`:308–323`), the primitive check (`:326–328`) and the
    `IDENTIFIER` arm (`:329–338`) to the catch-all. Two routes, one silent
    `{}`.
  - `src/parser/theta-document.ts:4290–4296` — the
    `unresolvedNamedTypeDiagnostic` doc comment states the under-emission and
    attributes it to `lowerTypeExpr`'s missing inline-object arm. That is one
    frame too late for the form an author actually writes: the unquoted RHS
    never reaches `lowerTypeExpr`.
  - `src/binder/binder-envelope.ts:166–185` (`BypassParamsField.type`, "The
    field's declared surface type") and
    `src/extension/production-theta-producer.ts:597`
    (`binderPromptParamField`) → `src/binder/binder-system-prompt.ts:157`
    (`renderBinderParamLine`) — the blanked `typeSource` is recorded as the
    field's declared type, so the binder system prompt's per-field Parameters
    line renders `  p () required` with an empty parenthesised type.
- **Observed at:** `0.38.0`. Offline, deterministic, no live model: scratch
  vitest driving `parseThetaDocument` (the real load path) plus the pure
  `classifyBinderBypass` and `renderBinderParamLine`; written, run, deleted.

## Fix (0.44.0)

The constraint-pinned §Fix below ("Not yet decided" on route, settled on
obligations) is discharged with both frames closed and no other position's
lowered bytes moved. Line anchors are at the fix commit.

**Frame 1 — the frontmatter read recovers the author's bytes.**
`extractParsedParams` (`src/parser/frontmatter.ts`) threads the raw
frontmatter YAML text; a non-scalar `params:` RHS (an unquoted flow mapping)
recovers the author's own bytes by slicing the value node's range out of
that text — no YAML round-trip. The recovered text flows into `typeSource`,
the diagnostics pass, and `BypassParamsField.type` (the binder Parameters
line renders the declared type instead of `()`).

**Frame 2 — a `params:`-scoped inline-object arm.** New exported
`lowerParamsFieldType` (`src/parser/params.ts`), called from `parseParams`'s
per-field loop; `lowerTypeExpr` is byte-untouched, so the annotation and
schema-body positions' lowered bytes cannot move. A brace-rooted field
parses its field list with the shared `topLevelColon` (moved to `params.ts`,
re-imported by `body-type-lowering.ts`) and an `"angle-and-brace"` interior
comma split (review round 1: an angle-only split — `lowerInlineObject`'s —
mints phantom fields and a wrong `required` for a nested multi-field object,
turning accept-anything into reject-the-declared-shape silently); each
field's type recurses (nested brace-rooted types hoist their own defs),
unresolved names land in the threaded `lowerCtx.unresolved` exactly as the
sibling positions' walker sinks them — never a lowered-shape `{}` test, per
the `collectBodyTypes` nuance. A non-empty fragment hoists under
`__inline_<slug>` (schema-subset.md §Lowering step 2, the canonical schema
hash) and lowers to `{"$ref": "#/$defs/__inline_<slug>"}` (step 3); the
zero-field body `{}` keeps its permissive `{}` disposition (the
`empty-schema-body` question stays open, out of scope). The slug-match
byte-equality the §Schema-slug collision posture mandates is wired (review
round 1): canonical-form bytes are retained per minted def, a byte-equal
match dedups silently, differing bytes keep the first fragment and raise the
registered `theta/load/schema-slug-collision` at the triggering field — the
file is not registered.

**No spec or registry edit.** The `unresolved-named-type` row already names
the position; the collision code was already registered; H9a's
permitted-code list untouched. GOV-15's carve-out covers the newly-refused
typo inputs.

**Reproduction re-derived at the fix baseline** (`8ae94691`, 0.43.0): all
eight fixtures byte-identical to the recorded 0.38.0 table — zero drift.
Post-fix: A and F raise exactly one `unresolved named type 'Tirage'`
byte-identical to D/G/H and the theta is refused; B/C hoist and emit the
`$ref` with `$defs` carrying the inline fragment (and `Triage` beside it);
the recorded type is the author's bytes; D/E/G/H byte-unchanged; `p: {}`
and the brace-under-generic shapes keep their dispositions.

**Offline lock.** `tests/params-inline-object-lowering.test.ts` (37 tests):
an independent `node:crypto` oracle over hand-written canonical forms (the
spec recipe, not `schemaSlug`) pins the minted slugs; groups (a) diagnostic
+ four-position byte-parity, (b) lowering incl. dedup, nested multi-field
and quoted/unquoted convergence, (c/d) recovered bytes, (e) scope bounds
(generic path untouched, `p: {}`, the 0028-residual YAML frame), (f) the
real-AJV argument boundary (the accept-anything hole closed), (g) the
collision check at the unit seam plus the registry template. Verified in
three directions: neutralising frame 1 reds exactly the unquoted-route rows
while the quoted route stays green; neutralising frame 2 reds both routes
while the recovered-text rows stay green; neutralising the byte-equality
branch reds exactly the collision-sink pin. Byte-exact restores per blob
hash. Full gate 235 files / 2893 tests; typecheck and lint clean. Live: H8a
7/7 and H9a acceptance 11/11 green (incl. `acc-params-binder.theta`'s real
off-session binder pass).

**Residuals.** (i) The sibling positions' `lowerInlineObject` keeps its
angle-only interior split: on nested-comma texts
(`{a: T, b: {x: integer, y: string}}`) the `@<T>` and schema-body positions
still mint silently-wrong fragments (phantom fields, wrong `required`) —
pre-existing, unchanged here, unfiled. Filed as bug
[0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md),
which corrected this residual in two places (three sibling positions, not two —
bug 0033 added the alias RHS; and only the annotation root minted a wrong
fragment, the other two lowering `{}`), and discharged by its fix (0.49.0): the
interior split nests brace depth and the shared recursive lowerer gained the
hoisting inline-object arm, so every registered position now hoists through one
implementation. (ii) The `__inline_` name prefix is
not spec-reserved: an author-declared schema literally named
`__inline_<16hex>` that matches a minted slug aliases silently in either
field order (outside the collision row's anonymous-inline trigger) — a
namespace clash pending a spec decision on reserving the prefix. Filed as bug
[0040](./0040-inline-slug-def-namespace-not-reserved.md), which corrected the
input class (the `schema`-declaration spelling this residual names is refused
by the casing rule; the reachable spelling is an imported binding), and
discharged by its fix (0.50.0): schema-subset.md §Synthesised names reserves
the full set, an `import` / `export` specifier's local binding matching one of
the four exact forms is `theta/parse/import-reserved-synthesised-name`, and
`lowerTypeExpr`'s `IDENTIFIER` arm no longer claims a reserved `$defs` key.
(iii) A block-mapping RHS (`p:` followed by an indented YAML mapping) now
recovers its block-YAML bytes as the recorded type and still lowers
permissively silent — the adjacent silent spelling, unchanged in
disposition. Filed as bug
[0041](./0041-params-block-mapping-rhs-silent-permissive.md), which widened the
input class beyond the block mapping to the block sequence, the flow sequence
and the equivalent scalar spellings, and discharged by its fix (0.51.0): the
frontmatter read admits a `params:` value node that is a scalar or a flow
mapping and refuses every other shape with the registered
`theta/load/params-type-not-expression`, so the block collections no longer
reach the lowering and the two-key block mapping can no longer break the
binder's `Parameters:` block. The scalar spellings that carry the same bytes
stay silent — that route reads no text — and are recorded as that fix's
residual (i), in turn filed as bug
[0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) and
discharged by its fix (0.86.0): the recovered text is now judged fragment by
fragment at the `params:` position, so the scalar spellings refuse with the
same registered code the node-shape gate uses.

## Summary

The `params:` right-hand side is the one registered `NamedType` position that
still accepts an inline object type silently, and it does not merely skip the
diagnostic — it discards the declared type before any lowering runs. The
consequences are the same for a typo and for well-formed text, which localises
the defect away from resolution:

- `properties.p` lowers to `{}`, so the param accepts any JSON value the
  binder or a slash invocation produces. AJV validates nothing for that field.
- `BypassParamsField.type` is `""`, so the binder system prompt tells the
  model the field's type is `()`.
- No diagnostic fires, at any severity.

A plain named RHS is unaffected in both directions (`p: Tirage` fires the
error; `p: Triage` lowers `{"$ref":"#/$defs/Triage"}` and renders
`p (Triage) required`), and the identical inline-object text at the two
positions bug 0028 implemented fires the error. So an author who moves a type
expression between annotation positions — the thing type-system.md `:15`
promises is uniform — silently loses validation on the way into `params:`.

## Reproduction

Offline, at the 0.38.0 fix commit. Scratch vitest: `parseDoc` (the real
`parseThetaDocument` with production-shaped deps, `tests/helpers/e2e-s1.ts`),
`classifyBinderBypass` and `renderBinderParamLine`. `schema Triage { urgent:
boolean }` is declared in every fixture; `Tirage` is declared nowhere.
Frontmatter is `mode: prompt` plus the single `params:` entry shown.

```
@@ A  params p: {a: Tirage, b: integer}   (Tirage declared NOWHERE)
   diags   :: []
   props.p :: {"p":{}}
   field   :: {"wireName":"p","type":"","hasDefault":false,"nullable":false}
   binder  :: "  p () required"  bypass={"kind":"binder"}
@@ B  params p: {a: Triage, b: integer}   (well formed)
   diags   :: []
   props.p :: {"p":{}}
   field   :: {"wireName":"p","type":"","hasDefault":false,"nullable":false}
   binder  :: "  p () required"  bypass={"kind":"binder"}
@@ C  params p: {a: integer}              (well formed, primitives only)
   diags   :: []
   props.p :: {"p":{}}
   field   :: {"wireName":"p","type":"","hasDefault":false,"nullable":false}
   binder  :: "  p () required"  bypass={"kind":"binder"}
@@ D  params p: Tirage                    (plain named typo — CONTROL)
   diags   :: ["error theta/parse/unresolved-named-type: unresolved named type 'Tirage'"]
@@ E  params p: Triage                    (plain named, resolves — CONTROL)
   diags   :: []
   props.p :: {"p":{"$ref":"#/$defs/Triage"}}
   field   :: {"wireName":"p","type":"Triage","hasDefault":false,"nullable":false}
   binder  :: "  p (Triage) required"  bypass={"kind":"binder"}
@@ F  params p: "{a: Tirage, b: integer}" (QUOTED — reaches lowerTypeExpr)
   diags   :: []
   props.p :: {"p":{}}
   field   :: {"wireName":"p","type":"{a: Tirage, b: integer}","hasDefault":false,"nullable":false}
   binder  :: "  p ({a: Tirage, b: integer}) required"  bypass={"kind":"binder"}
@@ G  @<{a: Tirage, b: integer}>          (same text, annotation position)
   diags   :: ["error theta/parse/unresolved-named-type: unresolved named type 'Tirage'"]
@@ H  schema S { p: {a: Tirage, b: integer} } (same text, body position)
   diags   :: ["error theta/parse/unresolved-named-type: unresolved named type 'Tirage'"]
```

Reading the table:

- **A is the defect**; **C bounds it.** C has no name to resolve at all and
  still lowers `{}` with a blank recorded type, so the mechanism is the
  discarded `typeSource`, not a resolution miss. B shows a well-formed
  cross-reference losing its `$ref` the same way.
- **D and E are the plain-named controls**, both correct. E is what A should
  look like: a lowered fragment and a rendered type.
- **F isolates the second route.** Quoting the RHS makes it a YAML scalar, so
  the text survives to `lowerTypeExpr` (the binder line proves it) — and the
  lowering is still `{}`, still silent. Fixing only the frontmatter read would
  leave this arm.
- **G and H are the sibling positions** bug 0028 implemented, on byte-identical
  type text.

## Expected behaviour

- schema-subset.md §Lowering Algorithm step 2 (`:73`) and step 3 (`:76`):
  `p: {a: Triage, b: integer}` hoists the anonymous object into `$defs` under
  `__inline_<slug>` and emits `{"$ref": "#/$defs/__inline_<slug>"}` at the
  `params:` position, exactly as it does at the `@<T>` and schema-body
  positions.
- `code-registry-parse.md:88` and frontmatter-fields-a.md `:58`:
  `p: {a: Tirage, b: integer}` raises exactly one
  `theta/parse/unresolved-named-type` naming `Tirage`, at error severity, and
  the theta does not load — matching fixtures G and H byte for byte.
- `BypassParamsField.type` carries the field's declared surface type, so the
  binder system prompt's per-field line renders the inline object rather than
  `()`.
- `p: array<{}>` and an empty `p: {}` keep their current dispositions
  (`theta/parse/empty-schema-body` is the inline-object empty case per
  grammar.md `:109`).

## Actual behaviour / root cause

Two independent frames drop the same declaration, so a fix needs both:

1. **The frontmatter read discards a non-scalar value.**
   `extractParsedParams` (`frontmatter.ts:645`) accepts only
   `isScalar(item.value)` and substitutes `""` otherwise. YAML parses an
   unquoted `{a: Tirage, b: integer}` as a flow mapping, so the whole type
   expression is gone before `parseParams` is called. Recovering it means
   re-serialising the node's source span (the type side is theta's grammar,
   not YAML's, so the recovered text must be the author's bytes rather than a
   YAML round-trip) or reading the value node's range out of the
   `LineCounter` already threaded through this function.
2. **`lowerTypeExpr` has no inline-object arm.** `params.ts`'s lowering is a
   standalone walker; `lowerInlineObject`
   (`body-type-lowering.ts:85`) is reachable only from the body-type path, and
   `collectUnresolvedNamedTypes` (`body-type-lowering.ts:303`) — the walker
   the two positions fixed by 0028 use — dispatches `{ … }` to it and
   descends. `params.ts` is *upstream* of `body-type-lowering.ts`'s consumer
   `theta-document.ts` and already exports `splitTopLevel` to it, so the arm
   can be added in `params.ts` or the two walkers unified; the import
   direction rules out `parseParams` calling into `theta-document.ts`.

Note the deliberate `{}` mappings this must not disturb:
`collectBodyTypes` (`theta-document.ts:1108–1117`) maps alias-form and
imported names to `{}` **as resolved**, and 0028's diagnostic is threaded off
the resolution set for exactly that reason. An inline-object arm added here
must emit from the same resolution set, not from the lowered shape.

## Why it matters

- The `params:` position is where untrusted input arrives. A slash invocation
  or a binder inference fills these fields, and `{}` means the AJV envelope
  check for that field accepts anything — the same accept-anything hole bug
  0028 closed at the response boundary, still open at the argument boundary.
- It is silent for well-formed source. B and C are correct theta by the
  grammar; nothing tells the author their param lost its shape, and the
  symptom (a param that accepts junk, a binder prompt showing `()`) surfaces
  far from the declaration.
- It makes one of four registered positions of a closed DIAG-2 row
  under-emit, so the row over-states what the implementation does — the same
  condition 0025 §Residuals (i) recorded and 0028 discharged for the other
  two positions.
- The blank `type` also degrades the binder's grounding signal, which is the
  one input the binder has for deciding what to put in that field.

## Fix

Not yet decided. Both frames above must close for the fix to hold, and the
`params:`-position emission must come from the threaded resolution set rather
than the lowered shape, per the `collectBodyTypes` nuance. Adding the
inline-object arm without recovering the frontmatter text fixes only the
quoted form (fixture F); recovering the text without the arm turns A into
`properties.p = {}` with the type rendered — no diagnostic, no `$ref`.

The GOV-15 diagnostic-registry carve-out
(`docs/spec_topics/governance/source-language-stability.md:25`) covers the
newly-refused inputs within a 1.x minor, and no registry edit is needed: the
row already names this position.

## Provenance

- Origin: [0028](./0028-unresolved-annotation-silent-permissive-lowering.md)
  review rounds 2–3 (the `params:`/annotation asymmetry probe) and 0028
  §Residuals (i). Filed with the 0.38.0 fix.
- Spec: `docs/spec_topics/schema-subset.md:73` (step 2, inline-object hoist in
  any type position), `:76` (step 3, the `$ref` emission);
  `docs/spec_topics/grammar.md:109` (§Inline object types — `ObjectType` in any
  `Type` position, recursive `Type` inside each field);
  `docs/spec_topics/type-system.md:15` (one type grammar in every annotation
  position, `params:` named);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` (the `params:`
  type side and its unresolved-name diagnostic);
  `docs/spec_topics/diagnostics/code-registry-parse.md:88`
  (`theta/parse/unresolved-named-type`, the four-position row);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2);
  `docs/spec_topics/governance/source-language-stability.md:25` (the
  diagnostic-registry carve-out).
- Implementation evidence at the 0.38.0 fix commit:
  `src/parser/frontmatter.ts:572` (`splitParamValue`), `:627`
  (`extractParsedParams`), `:645` (the `isScalar` discard), `:646`;
  `src/parser/params.ts:130–142` (the emission loop), `:291–341`
  (`lowerTypeExpr`'s arms and its trailing catch-all);
  `src/parser/body-type-lowering.ts:85` (`lowerInlineObject`), `:303`
  (`collectUnresolvedNamedTypes`);
  `src/parser/theta-document.ts:1108–1117` (the deliberate resolved-`{}`
  mappings), `:4290–4296` (the doc comment attributing the gap to
  `lowerTypeExpr` alone);
  `src/binder/binder-envelope.ts:166–185` (`BypassParamsField.type`);
  `src/extension/production-theta-producer.ts:597`
  (`binderPromptParamField`); `src/binder/binder-system-prompt.ts:157`
  (`renderBinderParamLine`).
- Reproduction: scratch vitest at the 0.38.0 fix commit — the eight fixtures
  quoted verbatim above (unquoted typo, unquoted well-formed, unquoted
  primitives-only, the two plain-named controls, the quoted form, and the two
  sibling positions), run green on those signatures, then deleted per scratch
  policy.

## Coordination note — the deferred FM-5 collapse is fixed in bug 0263 (0.262.0)

§Related defers the `p: array<{a: string}>` collapse this report measures in
passing to bug 0028 §Residuals (iv). That class is filed and fixed as bug
[0263](./0263-params-type-bare-double-quote-breaks-frontmatter-misattributed.md):
a frontmatter block the YAML parser rejects now draws the located
`theta/load/malformed-frontmatter-yaml` row instead of the misattributed
`theta/load/missing-mode`. This report's own scope-bound cell over that
spelling was flipped to the new code under bug 0263 §Fix constraint 1; the
disposition it fences — fail-closed, no lowering, `frontmatter` null — is
unchanged.
