# Bug 0251 — a `params:` field type carrying a segment the lowering discarded renders that segment RAW into the binder system prompt, so the prompt's `Parameters:` line and the forced-tool envelope schema state two different contracts over the same field: `p: '{a: integer, b > c, m: integer}'` loads with zero diagnostics, lowers to `{a, m}` with `additionalProperties: false`, and asks the binder model to bind `p ({a: integer, b > c, m: integer})`

- **Status:** fixed (0.239.0).
- **Sev/Diff estimate:** S2/D2 — S2 because the defect is confined to input that
  is already malformed (a well-formed declared type renders byte-identically,
  and zero committed `.theta` / `.thetalib` files carry a carrier type), but on
  that input it reaches a live provider call: the binder model receives a
  contract it cannot satisfy under the tool schema it is handed, and the merge
  gate of bug [0238](./0238-stray-close-token-underflows-top-level-split.md)
  measured the spawned `pi -p` leg returning exit 0 with an EMPTY
  stdout+stderr on 4 of 5 runs over identical bytes. D2 because the render seam
  is one function (`renderBinderParamLine`,
  `src/binder/binder-system-prompt.ts:251`) fed by one mapper
  (`binderPromptParamField`, `src/extension/production-theta-producer.ts:675`),
  but the value it renders — `BypassParamsField.type` — is the verbatim source
  slice two other consumers depend on being verbatim, and the *Type display*
  rule that governs the rendering is normative with a pinned reference table, so
  the fix needs a spec sentence and must not move those bytes.
- **Kind:** defect — implementation, plus one spec sentence to take. The spec
  fixes what the prompt line renders (*Type display*,
  `docs/spec_topics/binder/binder-bypass-and-envelope.md:129`: the declared
  Theta type in surface syntax, not the JSON Schema lowering) and separately
  fixes what the envelope schema encodes (the lowered `params:` schema,
  `:79`). It states no relation between the two, so the case where the declared
  text denotes more than the lowering encodes is unaddressed rather than
  blessed.
- **Related:**
  - [0238](./0238-stray-close-token-underflows-top-level-split.md) — **fixed
    (0.218.0)**, the filing origin and the reason the carrier class exists in
    its current form. Its clamp made a close token matching no open frame of
    its kind inert in `splitTopLevelSegments` / `topLevelColon`
    (`src/parser/params.ts`) and in `TypeParser.skipMalformedEntry`
    (`src/parser/type-grammar.ts:938`), so `{a: integer, b > c, m: integer}`
    now lowers to both declared fields instead of one. Tolerating the junk
    segment is that fix's stated behaviour; this report is about where the
    tolerated text then goes.
  - [0244](./0244-colon-less-inline-object-entry-silently-discarded.md) —
    **open**, the parse-side sibling and an **ordering dependency**. Its §Fix
    refuses the colon-less inline object entry at
    `TypeParser.parseObject`'s resync, which is the same arm that swallows
    every carrier measured below. If 0244 lands first, a refused document does
    not register and cannot reach a binder call, so this report's carrier set
    for `params:` inline objects empties and what remains here is the spec
    sentence plus a witness that no divergence is reachable. Fix 0244 first, or
    fix this one knowing 0244 may retire its inputs.
  - [0060](./0060-binder-parameters-line-shape-violable-by-embedded-newlines.md)
    — **fixed (0.61.0)**, the landed precedent at this exact render seam: an
    author-controlled value reaching the `Parameters:` line was transformed at
    the seam rather than at its source, and `normaliseParamLineBreaks`
    (`src/binder/binder-system-prompt.ts:295`) is that transform. The same seam
    is where this defect's remedy lands.
  - [0243](./0243-verbatim-echo-drive-sentinels-read-as-prompt-injection.md) —
    **open**, the sibling class of "theta-controlled text reaching a live model
    changes what the model does". Different carrier (a drive sentinel, not a
    type), same failure mode of an unstated text-to-model contract.
- **Affected** (every citation verified at HEAD `b9cf2f26`, 0.219.0; `params.ts`
  is cited by symbol per `docs/STYLE.md`):
  - `src/parser/frontmatter.ts:848–856` — the recording site.
    `extractParsedParams` (`:726`) pushes one `BypassParamsField` per declared
    field with `type: typeSource` (`:850`), where `typeSource` is
    `splitParamValue`'s (`:661`, called at `:753`) verbatim left-hand slice of
    the `params:` scalar. No normalisation, no validation, no re-derivation from
    the lowering.
  - `src/binder/binder-envelope.ts:166–170` — `BypassParamsField` and its
    `type` field (`:169–170`), documented as "the field's declared surface
    type".
  - `src/extension/production-theta-producer.ts:675–684` —
    `binderPromptParamField`, which copies `field.type` into
    `SystemPromptParamField.type` unchanged (`:678`).
  - `src/extension/production-theta-producer.ts:896–905` — the
    `buildBinderSystemPrompt` call of the dispatch path;
    `params: params.fields.map(binderPromptParamField)` (`:900`).
  - `src/extension/production-theta-producer.ts:868–871` — the OTHER channel of
    the same dispatch: `buildBinderEnvelopeSchema({ paramsSchema:
    params.loweredSchema, … })`. The forced-tool schema the provider receives is
    built from the LOWERED params schema; the system prompt beside it is built
    from the raw declared text. Nothing reconciles them.
  - `src/binder/binder-system-prompt.ts:251–262` — `renderBinderParamLine`. The
    only transform applied to `field.type` is `normaliseParamLineBreaks`
    (`:252`), which is identity on text carrying no U+000D and no U+000A
    (`:295–297`, fast path). The interpolation is
    `` `  ${field.wireName} (${type}) ${requirement}` `` (`:258`).
  - `src/binder/binder-system-prompt.ts:368` — `buildBinderSystemPrompt`, which
    assembles the `Parameters:` block from those lines (item 4).
  - `lowerParamsFieldType` and `splitTopLevelSegments` (`src/parser/params.ts`)
    — the lowering that produces the second contract. Over
    `{a: integer, b > c, m: integer}` the emitted fragment is
    `{"type":"object","properties":{"a":{"type":"integer"},"m":{"type":"integer"}},"required":["a","m"],"additionalProperties":false}`
    (measured). The `b > c` segment appears nowhere in it.
  - `src/extension/production-composition.ts:1510–1521` — a second consumer that
    requires `field.type` to stay verbatim: the per-argument type-mismatch
    checks (`theta/parse/tool-arg-type-mismatch`,
    `theta/parse/invoke-arg-type-mismatch`) read `typeSource: field.type`
    positionally. A fix that rewrites `BypassParamsField.type` at the recording
    site moves this consumer's input; a fix at the render seam does not.
  - `docs/spec_topics/binder/binder-bypass-and-envelope.md:117` — item 4, the
    Parameters block; `:123` — the per-field template
    `<wire-name> (<type>) <requirement>[ — <description>]`; `:129` — *Type
    display* and its eight-row normative reference table; `:144` — the
    *Parameter-line reference renderings* table. None of the four states any
    relation between the rendered `<type>` and the schema the envelope encodes.
  - `docs/spec_topics/binder/binder-bypass-and-envelope.md:79` — the envelope
    `args` arm, built from the lowered params schema with its `$defs` closure.
    This is the second contract's authority.
  - `tests/binder-system-prompt.test.ts:185–203` — the *Type display* reference
    cells, eight declared/rendered pairs, all well-formed types. `:140–179` and
    `:229–266` are the item-4 block and reference-rendering cells. Every one of
    these is identity input for a render-seam fix and must stay byte-exact.
  - **No divergence test.** No cell in `tests/` feeds `renderBinderParamLine` a
    type carrying a segment the lowering drops, and no cell compares a rendered
    `Parameters:` line against the lowered fragment of the same field.
  - **The corpus.** 35 committed `.theta` / `.thetalib` files. Every `params:`
    field in them declares `string`, `number` or a named schema (`Author`);
    zero declare an inline object type, so zero committed files change their
    rendered prompt under any fix.
- **Observed at:** `0.219.0` (HEAD `b9cf2f26`) for the offline half — two
  scratch vitest probes over `parseDoc` (`tests/helpers/e2e-s1.ts`),
  `renderBinderParamLine` and `buildBinderSystemPrompt`, written, run, deleted.
  The live half is `0.218.0` (`98bddb7a`), from the merge-gate captures of bug
  0238 named in §Reproduction (b); no live run was spawned for this report.

## Summary

The binder dispatch builds two descriptions of the same `params:` field and
sends both to the provider in one call.

The forced-tool schema is built from the lowered params schema
(`src/extension/production-theta-producer.ts:868–871`). The system prompt's
per-field line is built from the field's verbatim declared source text
(`:675–684` → `src/binder/binder-system-prompt.ts:251`). For a well-formed
declared type the two agree by construction. For a type carrying a segment the
lowering discards, they do not:

```yaml
params:
  p: '{a: integer, b > c, m: integer}'
```

loads with `[]` diagnostics and registers. Its lowered fragment carries `a` and
`m`, `required ["a","m"]`, `additionalProperties: false`. Its rendered prompt
line is:

```
  p ({a: integer, b > c, m: integer}) required
```

The `b > c` segment reaches the model as part of the contract it is told to
bind, while the tool schema it must answer through forbids any property but `a`
and `m`. The tolerance is deliberate — bug 0238's clamp (0.218.0) makes a close
token matching no open frame inert, which is why both declared fields now
survive the lowering — but nothing in that fix or in the spec says the tolerated
text should also be shown to the model.

The consequence is measured, not inferred. Over identical bytes, the spawned
`pi -p` leg of 0238's own H9a acceptance file returned exit 0 with an empty
stdout and empty stderr on four of five merge-gate runs, and produced off-task
narration on a scratch probe. The byte-neighbour control
`{a: integer, m: integer}` — same stem, same slash argument, same model —
passed every time.

## Reproduction

### (a) Offline — the two contracts, at HEAD

`0.219.0`, HEAD `b9cf2f26`. Scratch vitest over `parseDoc` and
`buildBinderSystemPrompt`; no provider.

Each row declares one `params:` field `p` with the type in column 1, in a
`mode: prompt` theta whose body interpolates `${p.a}`.

| # | Declared type | Diagnostics | Lowered `$defs` fragment | Rendered prompt line |
| --- | --- | --- | --- | --- |
| a1 | `{a: integer, b > c, m: integer}` | `[]` | `{"a":{"type":"integer"},"m":{"type":"integer"}}`, `required ["a","m"]`, `additionalProperties:false` | `  p ({a: integer, b > c, m: integer}) required` |
| a2 | `{a: integer, bogus, m: integer}` | `[]` | identical to a1 | `  p ({a: integer, bogus, m: integer}) required` |
| a3 | `{a: integer, ) , m: integer}` | `[]` | identical to a1 | `  p ({a: integer, ) , m: integer}) required` |
| a4 | `{a: integer, b ] c, m: integer}` | `[]` | identical to a1 | `  p ({a: integer, b ] c, m: integer}) required` |
| a5 (control) | `{a: integer, m: integer}` | `[]` | identical to a1 | `  p ({a: integer, m: integer}) required` |

Rows a1–a4 all lower to the byte-identical fragment of the control a5 and all
render a prompt line the control does not. The class is the set of inline-object
segments `TypeParser.skipMalformedEntry` (`src/parser/type-grammar.ts:938`)
consumes; the four rows are four spellings of it, not four separate defects.

The whole system prompt for row a1, at HEAD, with the slash argument
` a is 17 and m is 23`:

```
You bind free-form slash-command arguments to typed theta parameters.

Theta: /b0251

Parameters:
  p ({a: integer, b > c, m: integer}) required

User arguments: a is 17 and m is 23

Return one of three envelopes:
- { "kind": "ok", "args": { ... } } when every required parameter can be confidently extracted.
- { "kind": "needs_info", "message": "<one sentence>" } when a required parameter cannot be determined.
- { "kind": "ambiguous", "message": "<one sentence>", "candidates": [...] | null } when multiple bindings are plausible.

Do not invent values for defaulted parameters that the user did not specify; omit them.
```

### (b) Live — the merge-gate captures of bug 0238

Recorded at `0.218.0` during 0238's merge gate; not re-run for this report.
The file is `tests/live/acceptance/inline-object-stray-close-token-load.test.ts`,
which spawns the real `pi -p` twice: the control `{a: integer, m: integer}`
first, then the offender `{a: integer, b > c, m: integer}`. Both thetas are
byte-identical apart from the declared type text, both carry the same
`bind_model:` re-derived from `resolveAcceptanceHost()`, and both are driven with
the same slash argument. The assertion in force at the time demanded the
arithmetic oracle `391` (17 × 23), computable only from a bind carrying both
values.

| Capture | Offender leg | Control leg |
| --- | --- | --- |
| `.pi/tmp/fix-open-bugs/live-h9a-0238-merged.log` | fail — `expected '' to contain '391'`, `stdout:` empty, `stderr:` empty, exit 0 | pass |
| `.pi/tmp/fix-open-bugs/live-h9a-0238-rerun.log` | fail — same signature, empty capture | pass |
| `.pi/tmp/fix-open-bugs/live-h9a-0238-rerun2.log` | fail — same signature, empty capture | pass |
| `.pi/tmp/fix-open-bugs/live-h9a-0238-rerun3.log` | fail — same signature, empty capture | pass |
| `.pi/tmp/fix-open-bugs/live-h9a-0238-rerun4.log` | pass — reached `391` | pass |

Four of five offender legs printed nothing at all on either stream and still
exited 0. The control passed five of five.

The discrimination is recorded in `.pi/tmp/fix-open-bugs/RESUME.md` §MERGED
20/21 (lines 522–549): scratch probes (deleted, swept) swapped the stem and the
type text independently and the empty/narration outcome followed the TYPE TEXT,
not the theta stem and not the spawn order. The same section records three
distinct replies over identical bytes — one clean `391`, one empty, one off-task
narration quoting "binder model" warnings and file paths — and records that an
unknown-slash control replies normally, so registration is not the cause. The
narration capture itself was a scratch probe and is not preserved in a log; the
RESUME entry is its record.

The offender leg's assertion was subsequently moved off the oracle for this
reason. The comment now standing at that leg
(`tests/live/acceptance/inline-object-stray-close-token-load.test.ts`, the block
introducing the `must NOT have additional|additionalProperty` assertion) states
it: "the tolerated `b > c` segment renders into the live contract text and
measurably derails the binder model's reply at random (narration or empty text
over identical bytes), so a content demand on this reply would gate on model
mood, not on the fix. The oracle stays on the byte-neighbour control above."
`.pi/tmp/fix-open-bugs/live-h9a-0238-final.log` is that amended file green.

## Expected behaviour

The binder system prompt states the contract the binder's forced-tool schema
enforces. A field whose declared type text denotes more than the lowered schema
encodes is rendered as what the schema encodes, so a model that satisfies the
prompt satisfies the tool schema and vice versa.

A well-formed declared type is unaffected: it renders in the surface syntax of
Type System exactly as *Type display*
(`docs/spec_topics/binder/binder-bypass-and-envelope.md:129`) pins it, and all
eight reference renderings plus the four *Parameter-line reference renderings*
stay byte-exact.

## Actual behaviour / root cause

`BypassParamsField.type` is the verbatim `params:` source slice
(`src/parser/frontmatter.ts:850`, from `splitParamValue` at `:661`). It is
recorded before, and independently of, the lowering, and no later pass compares
the two. `binderPromptParamField`
(`src/extension/production-theta-producer.ts:675`) copies it into the
system-prompt descriptor unchanged, and `renderBinderParamLine`
(`src/binder/binder-system-prompt.ts:251`) interpolates it into the per-field
line after a line-break normalisation that is identity on single-line text
(`:295–297`). The forced-tool schema is built on the other branch of the same
dispatch from `params.loweredSchema`
(`src/extension/production-theta-producer.ts:868–871`), where the tolerated
segment has already been discarded by `splitTopLevelSegments` /
`lowerParamsFieldType` (`src/parser/params.ts`).

Two derivations of one field, from two different inputs, joined at the provider
call and never checked against each other. Before bug 0238's clamp the
divergence was masked at a different point — the lowering dropped a declared
field too, so the schema was wrong in the same direction as the prompt. The
clamp fixed the schema; the prompt kept the raw text.

The live effect is a property of what the model is handed, not of the runtime:
the prompt asks for a value shaped by a contract the tool schema rejects, and
the model's response to that contradiction is not stable across identical
requests. Empty assistant text with exit 0 is one of its outcomes.

## Why it matters

- The failure is silent and exit-0. An empty `pi -p` capture is
  indistinguishable at the process boundary from a theta that ran and produced
  nothing, so an author sees no diagnostic, no note and no non-zero code.
- It is nondeterministic over identical bytes, which defeats the ordinary
  bisection an author would use. 0238's gate spent five live runs and a set of
  swap probes to attribute it.
- It costs live-test authority. The one H9a file covering this input class
  cannot assert a content oracle on the offender leg, so the strongest available
  live observable for that leg is the absence of a pre-fix signature.
- The declared-type text is author-controlled and reaches a provider verbatim.
  Bug 0060 and bug 0087 both hold that author-controlled text arriving at a
  render seam is the seam's responsibility; this seam applies that rule to line
  breaks only.

## Non-goals

- Refusing the tolerated segment. That is bug 0244's subject at the parse layer.
  This report takes the tolerance as given and constrains what is rendered from
  it.
- Changing what the lowering emits. The lowered fragment for rows a1–a4 already
  equals the control's, which is bug 0238's landed behaviour.
- The `default=<literal>` half of the same line. `ParamRequirement.literal` is
  the verbatim default RHS (`src/parser/frontmatter.ts:854`) and carries the
  same class of question, but no measured carrier: bug 0239 refuses the
  unterminated-literal default (fixed, 0.201.0) and no tolerated default
  spelling is known to survive load. If one is found it is a separate filing.

## Fix

Render the field's type from what the lowering kept.

At the render seam, `SystemPromptParamField.type` carries the declared surface
type with every interior segment the lowering discarded removed, so the
`Parameters:` line and the forced-tool envelope schema describe the same field.
`lowerParamsFieldType` (`src/parser/params.ts`) already computes which top-level
segments of an inline interior it consumed; that set is threaded to the prompt
descriptor and `binderPromptParamField`
(`src/extension/production-theta-producer.ts:675`) renders the retained
segments. Row a1 renders `  p ({a: integer, m: integer}) required` — the
control's line, for the contract the control's schema encodes.

Binding on the fix:

- **`BypassParamsField.type` does not move.** It stays the verbatim
  `params:` slice `splitParamValue` produced
  (`src/parser/frontmatter.ts:850`), because the per-argument type-mismatch
  checks read it positionally as verbatim source
  (`src/extension/production-composition.ts:1510–1521`). The projection is
  computed for the prompt, not substituted at the recording site.
- **Identity on well-formed input.** A declared type whose every top-level
  segment lowers renders byte-identically to HEAD. The eight *Type display*
  reference cells (`tests/binder-system-prompt.test.ts:185–203`), the four
  *Parameter-line reference renderings* cells (`:229–266`) and the item-4 block
  cells (`:140–179`) are re-derived, not weakened, and all 35 committed corpus
  files render unchanged.
- **The spec sentence.** *Type display*
  (`docs/spec_topics/binder/binder-bypass-and-envelope.md:129`) gains one
  sentence, in the same commit, stating that the rendered `<type>` denotes the
  type the field's envelope `args` fragment (`:79`) encodes: a segment of the
  declared type that the lowering does not encode is not rendered. The
  surface-syntax rule and the reference table are unchanged; the sentence
  closes the case the page is silent on.
- **Ordering.** This fix comes after
  [0244](./0244-colon-less-inline-object-entry-silently-discarded.md) or
  knowingly ahead of it. 0244's §Fix refuses the entry that produces every
  carrier in §Reproduction (a) at
  `TypeParser.parseObject`'s resync; a refused document does not register and
  reaches no binder call. If 0244 lands first, re-measure §Reproduction (a):
  what survives is the spec sentence plus a witness pinning that no
  prompt/schema divergence is reachable.
- **Witness.** One offline test file pairing, per row of §Reproduction (a), the
  rendered `Parameters:` line against the field's lowered `$defs` fragment, with
  the control row proving the pairing non-vacuous, plus the four
  reference-rendering identity cells. Live cover is owed only if the offender
  leg of `tests/live/acceptance/inline-object-stray-close-token-load.test.ts`
  can then carry a content oracle again — which is the fix's own claim, and is
  the check that settles it. Re-taking that oracle needs repeat runs, not one:
  the pre-fix behaviour was green 1 of 5.

## Provenance

Filed as the residual-wave candidate recorded at bug 0238's merge gate:
`.pi/tmp/fix-open-bugs/RESUME.md` §MERGED 20/21 names it "tolerated malformed
segment text renders RAW into the live binder contract (product question;
evidence = the swap discriminator logs live-h9a-0238-rerun{,2,3,4}.log + the
narration capture)". The live evidence in §Reproduction (b) is those captures,
read at HEAD; no live run was spawned for this report.

The offline half was derived independently at HEAD `b9cf2f26` (0.219.0): two
scratch vitest files, the first over `parseDoc` (`tests/helpers/e2e-s1.ts`)
reading `frontmatter.params.fields[0].type` and
`frontmatter.params.loweredSchema` for the five rows of §Reproduction (a), the
second over `renderBinderParamLine` and `buildBinderSystemPrompt`
(`src/binder/binder-system-prompt.ts`) capturing the rendered line and the whole
prompt. Both written, run, deleted; sweep clean.

Ownership checked at HEAD: 0238 is fixed and its subject is the depth
arithmetic, not the prompt; 0244 is open and its subject is the parse-time
refusal, not the rendering; 0060 is fixed and its subject at this seam is line
breaks. No open report claims the prompt/schema divergence.

## Fix (0.239.0)

- **What shipped:**
  - `src/parser/params.ts` — new exported pure `projectRenderedParamType(source)`
    projects a declared `params:` type to the top-level inline-object segments
    its lowering kept, mirroring `lowerParamsFieldType`'s dispatch order
    (literal sublanguage → single enclosing brace group → the
    `lowerBraceGroupUnionArms` guard, reproduced byte-for-byte → verbatim
    fallback); module-private `projectBraceGroup` does one group; the per-entry
    accept/reject decision is factored into `classifyInlineObjectEntry`, now the
    ONE owner of the drop rule, shared with `hoistInlineObjectType` so the
    rendering can never drop a different entry set than the schema encodes.
  - `src/extension/production-theta-producer.ts` — `binderPromptParamField`
    sets `type: projectRenderedParamType(field.type)`; the sole production call
    site, per §Fix's render-seam constraint.
  - `src/binder/binder-system-prompt.ts` — `SystemPromptParamField.type`'s
    doc-comment states the projection rule. `renderBinderParamLine` unchanged.
  - `docs/spec_topics/binder/binder-bypass-and-envelope.md` — the one §Fix spec
    sentence, inside the one-physical-line *Type display* paragraph: the
    rendered `<type>` denotes the type the field's `args` arm schema fragment
    encodes; a segment the lowering does not encode is not rendered. File stays
    152 lines, so every downstream `:NNN` citation is unmoved.
  - **`BypassParamsField.type` did not move.** `src/parser/frontmatter.ts` and
    `src/extension/production-composition.ts` are untouched; the verbatim
    `splitParamValue` slice the per-argument type-mismatch checks read
    positionally is intact.
- **Gates:**
  - Witness RED before: `npx vitest run tests/binder-param-type-projection.test.ts`
    → `Tests 10 failed | 17 passed (27)`, e.g.
    `expected '  p ({a: integer, b > c, m: integer}) required' to be '  p ({a: integer, m: integer}) required'`.
  - Witness GREEN after: `Tests 30 passed (30)`.
  - Full default suite: `npm test` → `Test Files 421 passed (421)` /
    `Tests 8847 passed (8847)`.
  - `npm run typecheck` → `tsc -p tsconfig.json --noEmit`, clean.
  - `npm run lint` → `eslint … "src/**/*.ts"`, clean.
  - Live: `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/b0251live-tolerated-junk-carrier-live-cell.test.ts`
    → `Tests 1 passed (1)` on four independent runs (the pre-fix live behaviour
    §Reproduction (b) records was green 1 of 5, so repeat runs are the check).
- **Review:** 2 rounds. Round 1 (deep) — 3 findings: the new
  `InlineObjectEntry` block orphaned `hoistInlineObjectType`'s doc-comment;
  the production seam was revert-survivable (nothing offline redded when
  `binderPromptParamField` was reverted to `type: field.type`); an untestable
  "object identity" claim in `projectBraceGroup`'s doc-comment. Plus 3
  residuals. All five actioned items closed in one fixer round. Round 2 (fast)
  — `CLEAN`, no deep-review recommendation.
- **Verification:** VERIFIED.
  - The offline tests genuinely witness the bug: two hand-edited
    neutralisations, each hash-verified byte-exact on restore
    (`git hash-object`, no `git checkout`/`restore`/`stash`). Reverting the
    production seam reds the real-dispatch cell alone (`1 failed | 29 passed`);
    making `projectRenderedParamType` a pass-through reds the divergence
    cells with the `b > c` signature (`11 failed | 19 passed`).
  - Full default suite green (above).
  - Live end-to-end cover added and run for real (above): an H8a cell planting
    the §Reproduction (a) row-a1 carrier theta, driving one binder pass plus one
    body turn over the slash argument ` a is 17 and m is 23`, and asserting the
    deterministic outbound render carries both bound fields, that no
    fail-closed `theta-system-note` landed, and that the task-framed arithmetic
    oracle `40` is in the real reply. No live red occurred at any point, so no
    signature needed attributing to an open report.
  - Lint and typecheck pass (above).
- **Residuals:**
  1. **The doc's §Reproduction (a) rows a2–a4 are no longer carriers.** Bugs
     0244 and 0252 landed between filing and fix. Re-measured at this HEAD:
     `{a: integer, bogus, m: integer}`, `{a: integer, ) , m: integer}` and
     `{a: integer, b ] c, m: integer}` now REFUSE with
     `theta/parse/malformed-schema-field`, register no field and reach no
     binder prompt. The surviving carrier class is the `>`-bearing colon-less
     segment — row a1 `{a: integer, b > c, m: integer}` plus the spellings
     `b > c > d` and `b >` — together with the nested
     `{q: {a: integer, b > c, m: integer}, z: string}` and the brace-arm union
     `{a: integer, b > c} | {m: integer}`. All are pinned, carriers and retired
     rows alike, in `tests/binder-param-type-projection.test.ts`. The bug was
     therefore NOT mooted by the ordering dependency §Fix flagged.
  2. **Generic arguments are deliberately not projected.** Measured:
     `array<{a: integer, b > c, m: integer}>` lowers to the permissive `{}` —
     `lowerTypeExpr`'s generic arm never hoists its argument, so NO interior
     segment is encoded. Projecting the interior would render a property set
     the schema never asked for, diverging in the opposite direction. Route 4
     of the projection leaves such a type verbatim; two cells pin it. A group
     whose every entry is junk (`{b > c, d > e}`, and `q` in
     `{q: {b > c}, z: string}`) lowers permissively for the same reason and is
     likewise left verbatim.
  3. **The spec sentence's word "segment".** Read with this page's vocabulary
     (a hoist-processed top-level inline-object segment) the sentence is exact;
     a reader without that vocabulary could misread it as demanding
     generic-interior projection. §Fix pinned exactly ONE sentence, so a
     qualifying clause was deferred rather than taken — it needs the owning
     doc's authority.
  4. **Citation drift in this document, measured at the rebased HEAD.**
     `production-theta-producer.ts:868–871` → `862–865`;
     `:896–905` / `:900` → the `binderPromptParamField` map call at `:894`
     (pre-fix numbering; `:898` after this fix's import and doc-comment lines);
     `type-grammar.ts:938` → `skipMalformedEntry` declared at `:1009`;
     `production-composition.ts:1510–1521` → `:1523`. The corpus is 34
     committed `.theta`/`.thetalib` files, not 35. Every other cited line
     verified accurate.
  5. **Corpus renderings that changed: NONE.** All 34 committed
     `.theta`/`.thetalib` files declare only `string`, `number` or `Author` in
     `params:`; zero declare an inline object type, so zero carry tolerated
     junk and zero renderings move. Discharged by a sweep cell that walks
     `git ls-files -- *.theta *.thetalib` and fails loudly on a zero-file or
     zero-field sweep, not by a scratch probe.
- **Discharge notes appended:** none. One sibling doc-comment was corrected
  rather than a doc appended: `tests/binder-param-line-newline-normalisation.test.ts`
  documented its local mirror as reproducing production's "surface type
  verbatim" mapping and cited a stale `:603–612`. That claim became false with
  this fix, so the doc-comment was corrected to state that production now
  projects while the mirror deliberately does not (every fixture there declares
  a well-formed type, on which the projection is identity, so the file's
  newline-normalisation assertions are unaffected) and the range was re-derived
  to `:679–688` (doc block `:669–678`). Comment-only: zero assertions, zero
  expected strings, zero fixture bytes, zero test names; file still 44/44 green.
  This was a self-authorized bounded edit to a locked file — recorded here
  because an invisible self-authorization would itself be a violation.
- **Pinned dispositions / non-goals:** the tolerance itself is bug 0238's
  landed behaviour and is not touched; refusing the segment stays bug 0244's
  parse-layer subject; the lowering's emitted bytes are unchanged
  (`hoistInlineObjectType`'s refactor is pure factoring, proven by the full
  suite and the committed-fixture parse gate); the `default=<literal>` half of
  the same line stays out of scope for want of a measured carrier;
  `tests/live/acceptance/inline-object-stray-close-token-load.test.ts` keeps its
  signature-absence assertion — re-taking its content oracle was left to a
  separate decision rather than folded in here.
