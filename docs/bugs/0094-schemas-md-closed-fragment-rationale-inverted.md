# Bug 0094 — `docs/spec_topics/schemas.md:19`'s rationale states the closed empty-object fragment `{type:"object", properties:{}, required:[], additionalProperties:false}` "would silently accept every object"; under the shipped validator that fragment accepts only `{}` and rejects every non-empty object, every array and every scalar — the rule the sentence justifies is correct and, since 0045 (0.57.0), emitted at every position it governs

- **Status:** fixed (0.248.0)
- **Kind:** spec-prose defect where the behaviour is correct. The rule the
  sentence carries — a zero-field `schema X { }` is
  `theta/parse/empty-schema-body` with the message *`'X' has no fields; an empty
  schema cannot be validated.`* — holds at HEAD, is emitted from a single
  construction point (`src/parser/schema-declarations.ts:63–74`), and since
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)'s fix
  (0.57.0) also fires for an empty inline object `{}` at every `Type` position
  and every nesting depth (`src/parser/type-grammar.ts:474`). Only the
  rationale clause appended to the rule is false, and it is false in the
  opposite direction from the truth: the fragment it names is the most
  restrictive object schema the subset can express, not the most permissive
  one.
- **Related:**
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) — the
  filing origin, fixed in 0.57.0. Its §Non-goals bullet (`:783–789`) names this
  sentence and rules the correction outside its frame ("Correcting the sentence
  is a documentation edit outside this report's scope, flagged here because
  this fix cites the rule it accompanies"), and its §Fix *Residuals* item (iv)
  (`:296–298`) records the sentence as unchanged by that fix. The AJV table
  this report re-derives is 0045's own (§Reproduction, "The lowered bytes").
  [0092](./0092-renderobject-first-field-unguarded-cast.md) — cites
  `schemas.md:19` twice (`:292`, `:393`) for the parse-time rejection only,
  quoting no part of the rationale clause. Its citations survive an in-place
  rewrite unchanged.
- **Affected** (citations verified at HEAD `9ea93511`, 0.57.0):
  - The defective sentence: `docs/spec_topics/schemas.md:19`, the second
    paragraph of §Object schema (`:5`). It opens with the rule and its
    *Message*, then continues: "Empty bodies have no use case and the lowered
    `{type:"object", properties:{}, required:[], additionalProperties:false}`
    shape would silently accept every object — almost certainly not what the
    author intended." The first clause is the rule; the defect is the second.
    Quoted whole in §Reproduction.
  - The one in-tree restatement: `src/parser/schema-declarations.ts:93–94`, the
    comment above the zero-field arm (`:95–98`) — "`schema X { }` with no
    fields — the lowered empty-object shape would silently accept every object
    (schemas.md §Object schema)". It cites the defective sentence and repeats
    its claim.
  - The fragment the sentence names, and where it is minted:
    `src/parser/body-type-lowering.ts:130–135` — `lowerObjectFields` returns
    `{ type: "object", properties, required, additionalProperties: false }`
    unconditionally, with `$defs` attached only when non-empty (`:136–138`).
    Over an empty `fields` array the loop at `:119–129` never runs, so
    `properties` is `{}` and `required` is `[]` and the return value is the
    fragment verbatim.
  - The validator the fragment is enforced by:
    `src/seams/schema-validator.ts:112–113` — `new Ajv({ strict: false,
    allErrors: true, logger: false })` plus `ajv-formats`, compiled at `:148–167`.
    `ajv ^8.17.1` / `ajv-formats ^3.0.1` (`package.json:50–51`); installed
    8.20.0 / 3.0.1. Contract: PIC-11
    (`docs/spec_topics/pi-integration-contract/host-interfaces-services.md:38`).
  - Not affected — `docs/reference/` carries no mirror of the rationale. `rg`
    over `docs/` for the distinctive phrase returns `schemas.md:19` and 0045's
    quotation of it and nothing else. The reference pages state the rule
    without a rationale clause: `docs/reference/schema-subset.md:45` ("Empty
    body is `theta/parse/empty-schema-body`.") and `:71` (the alias arm),
    `docs/reference/grammar.md:178` (the inline `{}` case),
    `docs/reference/diagnostics.md:135` (the registry row's *Message*). None
    moves.
  - Not affected — `docs/spec_topics/grammar.md:109`, which defers the named
    case to this section and adds no rationale of its own; the registry row
    `docs/spec_topics/diagnostics/code-registry-parse.md:86`, whose *Trigger*,
    *Message* and *Doc* link are unchanged by a rationale rewrite; and
    `docs/spec_topics/diagnostics/placeholder-rendering-b.md:55`, which fixes
    the `<X>` rendering for both triggers.
  - Not affected — the tests. No cell reads either doc page as a file, and no
    test string quotes the rationale (`rg` over `tests/` for the phrase is
    empty). The rule's witnesses stay green as written:
    `tests/inline-empty-object-type.test.ts` (0045's 44-cell lock, including
    the declaration controls at `:661–719`) and
    `tests/schema-alias-union-decl.test.ts:1172–1180` (`schema X { }`
    byte-unchanged).
- **Observed at:** `0.57.0` (HEAD `9ea93511`). Offline, deterministic; no live
  model, no provider. Doc text read from the tree; AJV behaviour re-derived by
  one `node --input-type=module -e` probe over the repo's own `ajv` /
  `ajv-formats` with the production seam's flags (§Reproduction), written and
  deleted; `tests/inline-empty-object-type.test.ts` run to confirm the rule is
  emitted (44/44 green).

## Summary

`schemas.md:19` gives the empty-body rule and then a reason for it. The reason
is inverted.

The fragment the sentence names —
`{type:"object", properties:{}, required:[], additionalProperties:false}` — is
what `lowerObjectFields` produces over an empty field list
(`body-type-lowering.ts:130–135`). Under the validator theta ships
(`schema-validator.ts:112`, AJV with `strict: false`), that fragment accepts
exactly one value, `{}`, and rejects every non-empty object on
`additionalProperties`, plus every array, every scalar and `null` on `type`
(§Reproduction). The schema that "silently accepts every object" is the *bare*
`{}` — the permissive fragment produced at other positions — not this one.

The rule itself is sound and the fix is not behavioural. `schema X { }` draws
`theta/parse/empty-schema-body` from a single construction point
(`schema-declarations.ts:63–74`, `:95–98`), and 0045's fix (0.57.0) extended
the same code to an empty inline `{}` at every `Type` position
(`type-grammar.ts:467–476`). Because both spellings are refused at parse, the
lowering the sentence describes is unreachable from source at HEAD: the
sentence is a counterfactual, and the counterfactual's stated effect is wrong.

The paragraph's point survives the correction. An empty schema body is not a
usable contract in either reading — under the closed fragment it admits only
the empty object, so no informative payload satisfies it. That is the reason
the rule exists, and it is what the sentence should state.

## Reproduction

**1. The sentence at HEAD.** Verbatim, with its line number:

```text
docs/spec_topics/schemas.md
 5  ## Object schema
19  A `schema X { }` declaration with no fields is `theta/parse/empty-schema-body`: *`"'X' has no fields; an empty schema cannot be validated."`* Empty bodies have no use case and the lowered `{type:"object", properties:{}, required:[], additionalProperties:false}` shape would silently accept every object — almost certainly not what the author intended.
```

**2. The mirror sweep.** Three hits, one of them 0045's quotation of the
sentence:

```console
$ rg -no "silently accept every object" docs/ src/ tests/ --glob '!docs/bugs/0094-*'
docs/spec_topics/schemas.md:19:silently accept every object
src/parser/schema-declarations.ts:94:silently accept every object
docs/bugs/0045-inline-empty-object-type-missing-empty-schema-body.md:785:silently accept every object
```

No `docs/reference/` page restates it, in this phrasing or another: the four
reference sites that carry the rule (`schema-subset.md:45`, `:71`,
`grammar.md:178`, `diagnostics.md:135`) state it without a rationale clause.

**3. What the fragment does.** One command, offline, no file written; the AJV
construction matches the production seam (`schema-validator.ts:112–113`) flag
for flag, including `ajv-formats`:

```console
$ node --input-type=module -e "
import Ajv from 'ajv'; import addFormats from 'ajv-formats';
const ajv = new Ajv({ strict: false, allErrors: true, logger: false }); addFormats(ajv);
const closed = { type: 'object', properties: {}, required: [], additionalProperties: false };
const vals = [['{}',{}],['{\"a\":1}',{a:1}],['{\"a\":null}',{a:null}],['[]',[]],['3',3],['\"s\"','s'],['null',null]];
for (const [label, schema] of [['closed  ', closed], ['bare {} ', {}]]) {
  const v = ajv.compile(schema);
  console.log(label + vals.map(([n,x]) => n + ' -> ' + v(x)).join('   '));
}
const v = ajv.compile(closed); v({ a: 1 }); console.log('error   ' + JSON.stringify(v.errors[0]));
"
closed  {} -> true   {"a":1} -> false   {"a":null} -> false   [] -> false   3 -> false   "s" -> false   null -> false
bare {} {} -> true   {"a":1} -> true   {"a":null} -> true   [] -> true   3 -> true   "s" -> true   null -> true
error   {"instancePath":"","schemaPath":"#/additionalProperties","keyword":"additionalProperties","params":{"additionalProperty":"a"},"message":"must NOT have additional properties"}
```

Reading the rows:

- **`closed`** — the fragment `schemas.md:19` names. One accepted value, `{}`.
  Every non-empty object fails on `additionalProperties`, keyword
  `additionalProperties`, message `must NOT have additional properties`; the
  array, the three scalars and `null` fail on `type`. This is the opposite of
  "accepts every object".
- **`bare {}`** — the empty schema document, for contrast. It accepts all seven
  values. This is the fragment that accepts every object, and it is not the one
  the sentence names.

Versions: `ajv` 8.20.0, `ajv-formats` 3.0.1, resolved from `package.json:50–51`
(`^8.17.1` / `^3.0.1`).

**4. The rule the sentence justifies is emitted.** 0045's lock, unmodified:

```console
$ npx vitest run tests/inline-empty-object-type.test.ts
 ✓ tests/inline-empty-object-type.test.ts (44 tests) 32ms
 Test Files  1 passed (1)
      Tests  44 passed (44)
```

The declaration controls in that file (`:661–719`, `schema S { }` at
`:662–669`) and
`tests/schema-alias-union-decl.test.ts:1172–1180` hold the `schema X { }`
rendering; the remaining cells hold the inline `{}` emission at every `Type`
position. Nothing in this report proposes changing any of them.

## Expected behaviour

- `docs/STYLE.md` §Claims — "Every claim is testable or is removed." A
  rationale clause in a normative spec page is a claim about the system, and
  this one is measurable in one command.
- The lowering the sentence describes is fixed by
  `src/parser/body-type-lowering.ts:130–135`, and its validation effect is
  fixed by PIC-11's validator contract
  (`docs/spec_topics/pi-integration-contract/host-interfaces-services.md:38`)
  and the shipped AJV configuration (`src/seams/schema-validator.ts:112–113`).
  Prose about that fragment matches what the fragment does.
- The subset definition already implies the measured behaviour:
  `docs/spec_topics/schema-subset.md:8` emits `additionalProperties: false` for
  every object and `:78` gives the object emission shape, mirrored at
  `docs/reference/schema-subset.md:17–18`. A closed object with no declared
  property admits no property, so prose on this page agrees with that page.
- The rule stands as written: `schema X { }` and an empty inline `{}` are
  `theta/parse/empty-schema-body` at every position and every nesting depth
  (`docs/spec_topics/grammar.md:109`,
  `docs/spec_topics/diagnostics/code-registry-parse.md:86`). The correction
  changes the reason recorded for the rule, not the rule.

Expected concretely: `schemas.md:19` keeps its rule clause and its judgement
that an empty body is not a usable contract, and its factual clause says the
lowered fragment admits only the empty object.

## Actual behaviour / root cause

The clause asserts the fragment's permissiveness and the fragment is closed.
`additionalProperties: false` with an empty `properties` map is the "closed
over nothing" case: AJV's `additionalProperties` keyword takes every instance
property not named in `properties` (or matched by `patternProperties`, absent
here) and validates it against `false`, so the first property of any object
fails. `required: []` imposes nothing, and `type: "object"` rejects the
non-object instances. The measured verdicts in §Reproduction are the direct
consequence.

The root cause is a conflation of two different lowerings of the same source
text, the same conflation 0045's §Summary anatomises. Two fragments are in
play:

- the **closed** fragment, minted by `lowerObjectFields` over an empty field
  list (`body-type-lowering.ts:130–135`) and reached from the `@<T>` /
  `invoke<T>` annotation root before 0045 refused the input; and
- the **bare** `{}`, the permissive fragment the schema-field, alias-RHS and
  `params:` positions produced for the same two source bytes.

"Silently accept every object" is a true statement about the second and a false
statement about the first. The sentence names the first and describes the
second. 0045's §Reproduction table records both side by side and its
§Non-goals bullet (`:783–789`) is where the mismatch was first written down.

The claim propagated once, into the code. `schema-declarations.ts:93–94` is a
comment above the zero-field arm that repeats the clause and cites this section
as its authority. It documents an emission whose correctness does not depend on
the claim, so nothing detects the drift.

Nothing mechanically checks it either. The closing gate reads
`docs/spec_topics/**` whole (`tools/closing-gate/live-corpus.js:123`, `:146`),
but its recognisers key on REQ-IDs, `MUST` sentences and registry table rows;
`schemas.md` carries no `<a id="…">` REQ-ID anchor and no `MUST`, so every
recogniser is structurally inert over the page. No test opens either file.

## Why it matters

- **A normative page states a measurable falsehood about the schema subset it
  defines.** A reader who takes the clause at face value concludes that a
  closed object schema with no declared properties is maximally permissive.
  The subset's own rule — `additionalProperties: false` always emitted
  (`docs/spec_topics/schema-subset.md:8`,
  `docs/reference/schema-subset.md:17–18`) — implies the opposite, so the page
  contradicts the subset definition it belongs to.
- **The inversion points at the failure mode it is meant to warn about.** An
  author who believes the fragment accepts everything reads a typed query
  annotated with an empty object as harmlessly lax. It is the strictest
  possible object annotation: the model is offered a reply schema that admits
  no property, terminal non-conformance is
  `Err(QueryError { kind: "validation", cause: "schema_validation" })`, and the
  repair rounds burn first. 0045 §Why-it-matters records exactly that
  trajectory for the pre-fix input.
- **The claim is load-bearing for the reader's mental model of two adjacent
  positions.** The bare `{}` and the closed fragment differ by nothing in the
  source text and by everything at the validation boundary. A page that labels
  the closed one with the bare one's behaviour removes the distinction a reader
  needs to predict either.
- **It has one propagation already.** `schema-declarations.ts:93–94` cites the
  section and repeats the clause, so the false statement now sits at the
  construction point of the diagnostic it explains.
- **The correction is bounded and measured.** One sentence and one comment; no
  `src/` behaviour, no registry row, no test, no line-count change, and no
  inbound anchor drift (§Fix).

## Fix

**Rewrite the second clause of `docs/spec_topics/schemas.md:19` in place.** The
rule clause, the message quotation and the paragraph's judgement are kept; the
factual clause is replaced by what the fragment does:

```text
A `schema X { }` declaration with no fields is `theta/parse/empty-schema-body`: *`"'X' has no fields; an empty schema cannot be validated."`* Empty bodies have no use case: the lowered `{type:"object", properties:{}, required:[], additionalProperties:false}` shape accepts only the empty object `{}` and rejects every non-empty object, so no informative payload satisfies it — almost certainly not what the author intended.
```

One line replaces one line. `schemas.md` stays 147 lines, `## Object schema`
stays at `:5`, and every inbound `schemas.md:<n>` citation keeps its target —
measured: 24 distinct line anchors cited across `docs/` and `tests/` (none in
`src/`), all at or below the page's 147 lines, four of them `:19` itself
([0045](./0045-inline-empty-object-type-missing-empty-schema-body.md)`:783`,
`:806` and [0092](./0092-renderobject-first-field-unguarded-cast.md)`:292`,
`:393`), all still resolving to the same sentence.

**Correct the one in-tree restatement in the same commit.**
`src/parser/schema-declarations.ts:93–94`'s comment carries the same inverted
claim and cites this section. It becomes a statement of what the arm does and
why, without the false effect claim:

```text
  // `schema X { }` with no fields — the lowered empty-object shape is closed
  // over nothing, so it admits only `{}` (schemas.md §Object schema).
```

Comment text only. No statement, no condition, no emission and no exported
signature moves; `emptySchemaBodyDiagnostic` (`:63–74`) and the zero-field arm
(`:95–98`) are byte-unchanged, so no test observable can move.

**No `docs/reference/` edit.** The reference pages carry the rule and not the
rationale (`docs/reference/schema-subset.md:45`, `:71`;
`docs/reference/grammar.md:178`; `docs/reference/diagnostics.md:135`), verified
by the §Reproduction sweep. Nothing there is false, so nothing there moves.

**Nothing else in the paragraph or the page moves.** The `theta/parse/empty-schema-body`
spelling, the italicised *Message* quotation (fixed character-for-character by
[DIAG-4](../spec_topics/diagnostics/diagnostic-shape.md#diag-4)), the
`{type:"object", …}` fragment as written, and the closing "almost certainly not
what the author intended" all stay. `:17` (the required-fields /
`additionalProperties: false` paragraph, six inbound citations) and `:21`
(§Wire-name renaming) are untouched.

**DIAG-2/3/4 are not engaged, and neither is GOV-15.** No diagnostic code is
added, removed, renamed or retriggered; no *Trigger*, *Message*, *Hint* or
severity changes; `code-registry-parse.md:86` keeps its row. No source language
input changes disposition, so GOV-15's (a)/(b)/(c) observables
(`docs/spec_topics/governance/source-language-stability.md:5`) are untouched
and no carve-out is needed.

**Gate behaviour is re-proved, not assumed.** The closing gate ingests
`docs/spec_topics/**` (`tools/closing-gate/live-corpus.js:123`, `:146`;
hard-failed by `tests/live-corpus-release-gate.test.ts:145`). The edited line
carries no `theta/` code beyond the one already there, no `MUST`, and no
REQ-ID, and `schemas.md` carries no `<a id="…">` anchor at all, so every
recogniser is inert. A resolution demonstrates that on the diff.

**No test witness is owed.** The rule the sentence accompanies is already
locked by `tests/inline-empty-object-type.test.ts` (44 cells) and
`tests/schema-alias-union-decl.test.ts:1172–1180`, both green at HEAD and
neither touching the prose. Asserting spec prose from a test would invert
DIAG-4's direction for expected strings
(`docs/spec_topics/diagnostics/diagnostic-shape.md:74`). The AJV verdicts
§Reproduction measures are a property of AJV under a pinned configuration, not
of theta code, and pinning them in the default gate would test the dependency.

**Ordering.** Independent. 0045 is fixed (0.57.0) and this report is its
documentation residual, so no fix blocks on this and this blocks on nothing.
One open report will edit `schemas.md` elsewhere —
[0046](./0046-by-clause-undecided-inputs-load-silently.md), whose §Fix is an
undecided §Discriminated unions decision (`:95–117`), 76 lines below this
paragraph. Every other open report citing the page reads it:
[0092](./0092-renderobject-first-field-unguarded-cast.md) at `:19` itself,
[0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md) at
`:44–45`, [0061](./0061-nonparams-type-positions-keep-junk-arm-text-silent.md)
at `:17`, `:62` and `:64`,
[0063](./0063-two-unsupported-feature-tails-missing-from-construct-table.md) at
`:17` and `:62`,
[0055](./0055-literal-union-lowering-omits-type-string-vs-subs1.md) at `:62`,
[0056](./0056-params-literal-sublanguage-absent-lowers-permissive.md) at `:89`.
One line replaces one line here, so no anchor moves in either landing order.

## Non-goals

- **The rule.** `schema X { }` and inline `{}` keep
  `theta/parse/empty-schema-body` at every position, with the rendering 0045
  settled (`'X'` at the declaration positions, `'{}'` at the inline ones,
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:55`). This report
  changes prose about a lowering the rule makes unreachable.
- **The two lowerings themselves.** That the same two source bytes lower to a
  closed fragment at some positions and a bare `{}` at others is the condition
  0045 removed by refusing the input; the lowerers' zero-field arms remain as
  unreachable defence in depth (`body-type-lowering.ts:119–135`;
  `src/parser/params.ts:672–673`, `hoistInlineObjectType`'s zero-entry return).
  Rationalising them is not in scope.
- **A prose/behaviour consistency gate.** Nothing mechanically compares spec
  rationale against measured behaviour, which is why this survived from the
  page's authoring through 0045's fix. Building such a gate is the same
  standing gap
  [0062](./0062-grammar-trailing-trigger-table-omits-equals.md) §Non-goals and
  [0037](./0037-placeholder-vector-mislabels-bracket-indexing-as-member-access.md)
  §Fix *Residuals* (ii) record.
- **Rewriting §Object schema.** The paragraph at `:17` and the §Wire-name
  renaming subsection are correct as written and are not re-edited for style.

## Provenance

- Origin: bug
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) — its
  §Non-goals bullet (`:783–789`), which names the sentence, states the measured
  contradiction and rules the correction out of that report's scope, and its
  §Fix (0.57.0) *Residuals* item (iv) (`:296–298`), which records the sentence
  as unchanged by the fix. This report is that filing.
- Spec: `docs/spec_topics/schemas.md:5` (§Object schema and the
  `#object-schema` anchor), `:17` (the required-fields and
  `additionalProperties: false` paragraph), `:19` (the defective sentence);
  `docs/spec_topics/grammar.md:109` (§Inline object types — the rule, deferring
  the named case to this section);
  `docs/spec_topics/diagnostics/code-registry-parse.md:86` (the registry row,
  *Trigger* widened by 0045, *Message* unchanged);
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:55` (the `<X>`
  rendering for both triggers);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:74` (DIAG-4);
  `docs/spec_topics/pi-integration-contract/host-interfaces-services.md:38`
  (PIC-11, the validator contract), `:43` (the unknown-`format` clause the
  `strict: false` configuration serves);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15's
  observables, none engaged); `docs/spec_topics/schema-subset.md:8` (the
  always-emitted `additionalProperties: false`), `:78` (the object emission
  shape the fragment instantiates).
- Mirror pages read, none defective and none changed:
  `docs/reference/schema-subset.md:17–18` (`additionalProperties: false` always
  emitted), `:45` (the empty-body rule), `:71` (the alias arm);
  `docs/reference/grammar.md:178` (the inline `{}` rule);
  `docs/reference/diagnostics.md:135` (the registry row).
- Implementation: `src/parser/schema-declarations.ts:63–74`
  (`emptySchemaBodyDiagnostic`, the sole construction point), `:93–94` (the
  comment restating the defective claim), `:95–98` (the zero-field arm);
  `src/parser/type-grammar.ts:467–476` (`walkType`'s `object` arm, 0045's
  inline rule at `:474`); `src/parser/body-type-lowering.ts:109–139`
  (`lowerObjectFields`; `:119–129` the field loop, `:130–135` the emitted
  skeleton, `:136–138` the conditional `$defs`), `:153–174`
  (`lowerInlineObject`, which reaches it with no entries), `:558` (the
  declaration-lowering call site); `src/parser/params.ts:652–673`
  (`hoistInlineObjectType`, the `params:` position's zero-entry return);
  `src/seams/schema-validator.ts:112–113` (the
  production AJV construction), `:148–167` (`#build`); `package.json:50–51`
  (`ajv ^8.17.1`, `ajv-formats ^3.0.1`).
- Tests read, none changed: `tests/inline-empty-object-type.test.ts` (0045's
  44-cell lock; `:661–719` the declaration controls, `schema S { }` at
  `:662–669`), run green at HEAD;
  `tests/schema-alias-union-decl.test.ts:1172–1180` (`schema X { }`
  byte-unchanged).
- Tooling read, none changed: `tools/closing-gate/live-corpus.js:123`, `:146`;
  `tests/live-corpus-release-gate.test.ts:145`.
- Verification at HEAD `9ea93511` (0.57.0): every citation above read from the
  tree; the phrase sweep over `docs/`, `src/` and `tests/` (three hits, one of
  them 0045's quotation); the inbound `schemas.md:<n>` anchor sweep (24
  distinct anchors, four at `:19`); the `MUST` / REQ-ID-anchor sweep over
  `schemas.md` (both empty); the AJV probe quoted verbatim in §Reproduction,
  written as a scratch file, run, and deleted; and
  `tests/inline-empty-object-type.test.ts` run (44/44). No scratch file left in
  the tree; no file modified other than this report.

## Fix (0.248.0)

- **What shipped:**
  - `docs/spec_topics/schemas.md:19` — the second clause of the empty-body
    paragraph replaced in place with §Fix's settled text: "Empty bodies have no
    use case: the lowered `{type:"object", properties:{}, required:[],
    additionalProperties:false}` shape accepts only the empty object `{}` and
    rejects every non-empty object, so no informative payload satisfies it —
    almost certainly not what the author intended." The rule clause, the
    italicised *Message* quotation, the fragment spelling and the closing
    judgement are byte-unchanged, as are the two later sentences on the line
    (`theta/parse/malformed-schema-field`, `theta/parse/schema-body-unclosed`).
    One line replaces one line; the page stays 147 lines.
  - `src/parser/schema-declarations.ts:93–94` — the comment above the
    zero-field arm rewritten to §Fix's settled text ("the lowered empty-object
    shape is closed over nothing, so it admits only `{}`"). Two comment lines
    in, two out; `emptySchemaBodyDiagnostic` and the zero-field arm are
    byte-unchanged and the file stays 875 lines.
  - `tests/schema-body-unclosed-at-eof.test.ts:36–38`, `:525–527` — two comment
    blocks re-attributed. See *Bounded scope extension* below.
  - Not changed, as §Fix directs: no `docs/reference/` page, no registry row,
    no test cell, no `src/` executable line — and, under this lane's protocol,
    no `package.json`, no `CHANGELOG.md` and no `docs/bugs/README.md`.
- **Bounded scope extension (self-authorized, on the record).** §Fix names
  *one* in-tree restatement. At the fix HEAD (`86c28eea`, 0.241.0) the phrase
  had propagated to two further sites, both comments in
  `tests/schema-body-unclosed-at-eof.test.ts` (bug 0245's witness file, 0245
  fixed in 0.226.0), each quoting the corrected sentence as schemas.md's stated
  rationale. Question that would have been asked: *does the same-commit
  correction of "the one in-tree comment that restates the claim" extend to
  restatements that landed after filing?* Settled affirmatively on three
  independent sources: (i) §Fix's own instruction to correct the in-tree
  restatement in the same commit, whose purpose is that no in-tree text quote a
  sentence the page no longer carries; (ii) §Why it matters, "It has one
  propagation already" — a count of the tree at filing, not a cap; (iii)
  `docs/STYLE.md` §Claims, "Every claim is testable or is removed" — a comment
  attributing a removed claim to a live page is a claim that fails that test.
  Bound declared and held: comments only, in one file, two hunks, 3-for-3 and
  3-for-7 lines, zero assertions, zero executable lines, file line count
  unchanged at 773. STOP valve: if any further file were implicated or any gate
  reddened, stop and report. Neither fired.
- **Gates** (run by the orchestrator after the change, offline):
  - Sweep — `rg -no "silently accept every object" docs/spec_topics/ src/
    tests/ tools/` returns nothing (rc=1). `docs/bugs/**` retains the
    historical quotations by design (Residual 1).
  - Witness of the rule the sentence carries — `npx vitest run
    tests/schema-body-unclosed-at-eof.test.ts
    tests/inline-empty-object-type.test.ts
    tests/schema-alias-union-decl.test.ts`: `Test Files 3 passed (3)`,
    `Tests 143 passed (143)`.
  - Full default suite — `npm test`: `Test Files 423 passed (423)`,
    `Tests 8896 passed (8896)`.
  - `npm run typecheck` (`tsc -p tsconfig.json --noEmit`): clean, exit 0.
    `npm run lint` (`eslint "src/**/*.ts"`): clean, exit 0.
  - Citation-symbol-form gate — `npx vitest run
    tests/citation-symbol-form-gate.test.ts`: `Tests 3 passed (3)`. The new
    comment text cites `schemas.md §Object schema` in section form and
    introduces no bare `:NN` continuation.
  - Anchor stability — `diff <(git show HEAD:docs/spec_topics/schemas.md)
    docs/spec_topics/schemas.md` reports `19c19` and nothing else; all three
    edited files keep HEAD's line counts (147 / 875 / 773). §Fix's
    inbound-anchor claim holds: `schemas.md:17`, `:19`, `:21`, `:23`, `:39`,
    `:44`, `:78`, `:93`, `:97` and `:104` were compared line-for-line against
    HEAD and are identical apart from the rewritten clause on `:19`.
- **Re-derivation at the fix HEAD.** The report was filed at `9ea93511`
  (0.57.0); every claim was re-measured at `86c28eea` (0.241.0) before editing.
  The defect is live and unchanged: the sentence still sits at
  `docs/spec_topics/schemas.md:19` and the comment still at
  `src/parser/schema-declarations.ts:93–94`. Drift found and accounted for: the
  `schemas.md:19` paragraph has grown two sentences (the
  `malformed-schema-field` and `schema-body-unclosed` rules), so the edit is a
  clause replacement inside the line rather than the whole-line substitution
  §Fix quotes; the AJV construction has moved to
  `src/seams/schema-validator.ts:384` and now has a hardened sibling at
  `src/seams/schema-validator.ts:386` (`ownProperties: true`), both carrying the
  same `strict: false, allErrors: true, logger: false` flags;
  `lowerObjectFields`'s emitted skeleton has moved to
  `src/parser/body-type-lowering.ts:150–155`, its field loop to
  `src/parser/body-type-lowering.ts:132–149` and its conditional `$defs` to
  `src/parser/body-type-lowering.ts:156–158`; the `docs/reference/` rule sites
  have moved to `docs/reference/schema-subset.md:45`,
  `docs/reference/schema-subset.md:91`, `docs/reference/schema-subset.md:120`,
  `docs/reference/diagnostics.md:144` and `docs/reference/grammar.md:243`, and
  each still carries the rule without a rationale clause, so §Fix's "no
  `docs/reference/` edit" stands.
- **AJV verdicts, re-measured** (`ajv` 8.20.0 / `ajv-formats` 3.0.1, production
  flags, one `node --input-type=module -e` command, no file written), and
  independently reproduced by the reviewer and the verifier:

  ```console
  closed  {} -> true   {"a":1} -> false   [] -> false   3 -> false   "s" -> false   null -> false
  bare {} {} -> true   {"a":1} -> true    [] -> true    3 -> true    "s" -> true    null -> true
  ```

  The removed claim is false of the fragment the sentence names; the shipped
  claim is true of it.
- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) — CLEAN, no findings, no
  residuals; fidelity, correctness (AJV re-derived independently), scope,
  anchor stability, house rules and the citation gate each discharged with
  quoted evidence.
- **Verification:** SOLID (`bug-fix-verifier`). Obligation A — every added and
  removed line in `src/` and `tests/` has `//` as its first two non-whitespace
  characters, and the `docs/` hunk is markdown prose. Obligation B — `npm test`
  423/423 files, 8896/8896 tests. Obligation C — typecheck and lint clean.
  Obligation D — the closed fragment re-derived under the production flags
  accepts only `{}`, and `src/parser/body-type-lowering.ts:150–155` still mints
  it verbatim over an empty field list. Obligation E — one-hunk `19c19` diff,
  line counts preserved. Obligation F — no live coverage owed. The
  revert-to-red obligation is inapplicable: §Fix settles that no test witness is
  owed, so the equivalence proof of Obligation A stands in its place. The
  verifier's one finding (F1) asked that the third file be named in the record;
  it is, in *What shipped* and *Bounded scope extension*.
- **No live run.** The change carries no executable line. `git diff --stat --
  src/` is non-empty only by a comment-only hunk
  (`src/parser/schema-declarations.ts | 4 ++--`, every `-`/`+` line
  `//`-prefixed), which emits no JavaScript and can move no live-observable
  channel. No live test was run by the orchestrator or by any nested worker.
- **Residuals:**
  1. The historical quotations of the removed clause in `docs/bugs/**` are left
     as written —
     `docs/bugs/0045-inline-empty-object-type-missing-empty-schema-body.md:792`,
     `docs/bugs/0244-colon-less-inline-object-entry-silently-discarded.md:306`,
     `docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:38`,
     `docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:120`,
     `docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md:414`,
     `docs/bugs/0257-empty-inline-object-entry-slot-silently-tolerated.md:361`
     and this report's own §Reproduction. Bug documents are dated records of the
     tree at their filing; rewriting them would falsify them, and bug 0257 is
     open and owned elsewhere. Those quotations are to be read against this
     record.
  2. `docs/bugs/README.md:116` still carries this report's title, which quotes
     the removed clause as the defect. It is accurate as a description of the
     defect and is not edited here; this lane's protocol forbids touching that
     file in this change.
  3. No prose/behaviour consistency gate is added, per §Non-goals. Nothing
     mechanically compares a spec rationale against measured behaviour; the
     standing gap that
     [0062](./0062-grammar-trailing-trigger-table-omits-equals.md) §Non-goals
     and
     [0037](./0037-placeholder-vector-mislabels-bracket-indexing-as-member-access.md)
     §Fix *Residuals* (ii) record is unchanged by this fix.
- **Discharge notes appended:** none.
- **Pinned dispositions / non-goals:** §Non-goals stands unchanged — the rule,
  the two lowerings, a prose/behaviour consistency gate and a restyling of
  §Object schema are all out of scope and none was touched.
