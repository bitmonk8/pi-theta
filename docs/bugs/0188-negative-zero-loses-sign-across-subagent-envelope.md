# Bug 0188 — `-0` crosses the subagent return envelope as `+0` while the prompt→prompt attach leg binds it unchanged: `0 * -1` parses with `[]` diagnostics and evaluates to `-0`, whose sign theta code observes through division (`1 / (0 * -1)` is `-Infinity` where `1 / 0` is `Infinity`), `serializeOkEnvelope(-0)` is `{"theta_result":{"v":1,"ok":0}}` because `JSON.stringify` never emits a sign the JSON grammar itself admits (`JSON.parse("-0")` IS `-0`), the parent re-reads `+0`, and BOTH legs validate `{"ok":true}` with no diagnostic — so the callee's `mode:` frontmatter selects the sign of the value the caller binds, the second JSON hole a legal theta value can occupy after the non-finite class bug 0180 closed at 0.105.0

- **Status:** open. §Fix is **constraint-pinned, not settled**: the surface, the
  mechanism and the reachable spellings are fixed and measured, and four
  dispositions are stated with their costs, but which one lands is undecided —
  each moves GOV-15 observable (a)
  (`docs/spec_topics/governance/source-language-stability.md:5`) for a different
  leg, and one of them (§Fix (a)) turns on a PIC-59 wire-format question
  (`docs/spec_topics/pi-integration-contract/subagent.md:101`) the corpus has not
  answered. The run adjudicates against the evidence in §Fix (a)–(d) under the
  constraints in §Fix (e).
  Residual **2** of the bug 0180 fix (0.105.0, commit `bf32ad03`), recorded in
  that run's report (`.pi/tmp/fixes/0180-report.md` §*Residuals / notes*, item 2)
  and in that document's `## Fix (0.105.0)` §*Residuals* 1, and not filed there —
  a fix run creates no bug docs.
  Ordering: nothing blocks this report from starting, and it blocks nothing.
  [0180](./0180-invoke-return-nonfinite-number-mode-variance.md) is **fixed
  (0.105.0)**; it owns the envelope writer's refusal seam and three committed
  cells that pin *this* report's behaviour as a deliberate non-goal, so every
  route here re-pins those cells under its own authority in its own commit
  (§Fix (e)(4) names them).
- **Sev/Diff estimate:** S1/D3 — S1 by the letter: a value is silently altered on
  a production path and the alteration is selected by the callee's `mode:`
  frontmatter, which is GOV-15 observable (a). Measured end to end: a callee whose
  body is `0 * -1` returns `-0` to an `invoke<number>` caller on the prompt→prompt
  attach leg (`Object.is(bound, -0)` is `true`, §Reproduction (d)) and `+0` on the
  subagent leg (the envelope is `{"theta_result":{"v":1,"ok":0}}`, the parent
  re-reads `+0`, and the committed integration witness's `negOk`/`negVal` rows
  measure the caller binding `0` over REAL spawned children); both legs validate
  `{"ok":true}`; neither emits a diagnostic, a runtime event or a
  `theta-system-note`. The caller's own arithmetic then diverges: with the same
  caller body `1 / z` is `-Infinity` on the prompt leg and `Infinity` on the
  subagent leg (§Reproduction (d), (a)).
  **The counterweight, stated rather than buried:** the blast radius is the sign
  of zero, and it is narrow. `-0` is `==`-equal to `+0`
  (`runtime-value-model.md:26`, measured), orders identically (`0 * -1 < 0` is
  `false`), and renders `0` on every text surface the corpus decides — the
  interpolation table (`query-escapes-stringification.md:21–22`), the binder echo
  (BNDR-6p, `defaulting-system-note-echo.md:66`), the lowered-fragment canonical
  hash (`schema-subset.md:102`) and the category-2 panic placeholder
  (`placeholder-rendering-a.md:79`). Division (and anything derived from it) is
  the only channel that observes the difference, and no committed `.theta` /
  `.thetalib` can mint a `-0` at all (census: 0 of 34, §Affected). This is the
  narrowest S1 on the open list, and the score should reflect that.
  **Downgrade condition, stated so the fixer can rescore honestly:** if the run
  adjudicates that the sign of zero is not part of a theta `number`'s identity —
  the reading the five rendering-boundary decisions above already take, and which
  `placeholder-rendering-a.md:79` localises to "the rendering boundary" — then
  §Fix (d) is the whole fix, nothing an author can observe is corrupt by
  specification, and the same evidence rescores **S4**: a spec-silence defect at
  the return boundary. That adjudication cannot be made by ignoring the reciprocal
  channel, which is measured and which `expressions.md:232` specifies by naming
  `-Infinity` among division's results.
  D3 because §Fix needs in-run adjudication among four dispositions that each move
  a different today-passing input; because the leading candidate is a change to the
  bytes a `v: 1` envelope carries for a given value, which PIC-59 versions and
  which no `JSON.stringify` hook can express (measured, §Reproduction (b)); and
  because every route must move three committed `-0` cells plus one integration
  fixture that bug 0180 shipped as fences against exactly this widening.
- **Kind:** defect — a callee's `mode:` frontmatter changes *which value the
  caller binds*, which `docs/spec_topics/invocation.md:36` fixes as
  mode-invariant. Same sentence as bug 0180, disjoint value class: 0180's class is
  a value JSON cannot express at all, closed at 0.105.0 by refusing it child-side;
  this class is a value JSON **can** express and the serialiser does not emit.
  Five elements, each measured at HEAD `bf32ad03` (v0.105.0).
  1. *`-0` is a theta value, reachable from clean source, and its sign is
     observable from theta code.* Four spellings parse with `[]` diagnostics and
     evaluate to `-0`: `0 * -1`, `-1 * 0`, `0 / -1` and the literal `-0`
     (§Reproduction (a)) — the first two by `expressions.md:232`'s `*` rule, the
     third by its `/` rule, the fourth by its unary-minus rule. The sign is not
     inert: `1 / (0 * -1)` evaluates `-Infinity` where `1 / 0` evaluates
     `Infinity`, and `expressions.md:232` names `-Infinity` among division's
     specified results. `0 - 0` and `0 * 1` are `+0` and serve as the controls.
  2. *The envelope writer erases the sign, and JSON is not the reason.*
     `serializeOkEnvelope` (`src/runtime/subagent-envelope.ts:107`) is
     `JSON.stringify` of the payload (`:109`), and `JSON.stringify(-0)` is `"0"`.
     The JSON **grammar** admits `-0`: `JSON.parse("-0")`, `JSON.parse("{\"n\":-0}")`
     and `JSON.parse("[-0]")` all recover `-0` (`Object.is` true, §Reproduction
     (b)). No `replacer` and no `toJSON` can make `JSON.stringify` emit it
     (measured). So the loss is a property of the writer, not of the wire format —
     the asymmetry that distinguishes this class from 0180's.
  3. *The 0180 refusal deliberately does not see it.* The shipped detection is
     finiteness only — `Number.isFinite(value)`
     (`src/runtime/subagent-envelope.ts:368`) inside `firstNonFiniteNumber`
     (`:359`), consulted by `mapNonRepresentableReturnValue` (`:416`) — and `-0`
     is finite. Measured: `mapNonRepresentableReturnValue(-0, …)` is `undefined`
     at the root, at a schema field and at an array element, so
     `driveSubagentRootRegime` takes its `serializeOkEnvelope` arm
     (`src/extension/production-theta-producer.ts:2261`) and writes an `ok`
     envelope with no diagnostic (§Reproduction (c), (d)).
  4. *Both legs return `Ok`, with different values, and nothing reports it.*
     `number`, `integer` and `number | null` all lower to documents that admit
     `-0` and `+0` alike (measured through the real `lowerQueryResponseSchema`,
     `src/runtime/query-schema-lowering.ts:120`, and the production
     `AjvSchemaValidator`, `src/seams/schema-validator.ts:112`). So no AJV flag is
     in play: the verdicts agree and the *values* differ. The prompt cell binds
     the callee's `-0` (`production-theta-producer.ts:3462` → `:3657`); the
     subagent cell binds the parent's re-read `+0`
     (`src/runtime/subagent-json-driver.ts:118`, `:121` →
     `production-theta-producer.ts:3500` → `:3657`).
  5. *The sign cannot be recovered parent-side.* The wire byte is `0`; the
     inbound translation pass (`runtime-value-model.md:34`) rebuilds names, not
     magnitudes. Every route is therefore either child-side or an erasure applied
     to both legs — which is what bounds §Fix to its four candidates.
- **Related:**
  - **0180** —
    [`0180-invoke-return-nonfinite-number-mode-variance.md`](./0180-invoke-return-nonfinite-number-mode-variance.md),
    **fixed (0.105.0)**, commit `bf32ad03`. Provenance (its residual 2) and the
    owner of every seam this report cites. Its route (b) put a refusal in front of
    `serializeOkEnvelope` for the non-finite class, corrected PIC-59's
    `Ok`-values bullet, and registered
    `theta/runtime/subagent-return-value-not-representable`
    (`docs/spec_topics/diagnostics/code-registry-runtime.md:32`). **It did not
    cause this**: `JSON.stringify(-0)` was `"0"` before that commit and is `"0"`
    after, and the refusal never sees a finite value. What it did do is **fence**
    the behaviour: its §Non-goals fixes that a route finding a second JSON hole
    "records it rather than widening", and three committed cells plus one
    integration fixture assert the current `-0` behaviour as correct-for-now
    (§Affected, §Fix (e)(4)). A route here moves those cells under its own
    authority, in its own commit, or it has widened 0180's detection by accident —
    which is the outcome those cells exist to prevent. **This report does not
    reopen 0180.** Its refusal of the non-finite class stays; §Non-goals says so.
  - **0068** —
    [`0068-prompt-callee-invoke-final-value-null.md`](./0068-prompt-callee-invoke-final-value-null.md),
    **wontfix — not a defect**, cited for the bound it establishes. Its
    §Resolution fixes that the untyped `invoke(...)` form discards the callee's
    value by specification (`invocation.md:28`), mode-blind. That discard **bounds
    this report's domain**: only a form that carries a value into theta code can
    exhibit a mode-variant sign, so the typed `invoke<T>` form is where this is
    measured. A subagent-mode `.theta` callable called through `tools:` returns
    its value to theta code as well and crosses the same writer — that surface is
    named in the shipped registry row (`code-registry-runtime.md:32`) and is
    **read from source here, not driven** (§Provenance).
  - **PIC-59** —
    `docs/spec_topics/pi-integration-contract/subagent.md:101`, with its
    `Ok`-values bullet at `:110`. Bug 0180 rewrote that bullet in the same commit
    as its fix; the corrected text at HEAD is quoted and adjudicated against this
    class in §Expected behaviour. Short form: `-0` sits **outside** the bullet's
    enumeration (which is closed to `Infinity` / `-Infinity` / `NaN`) and
    **inside** its establishment check (which is finiteness), while falsifying its
    opening clause on the fidelity reading — the value the parent reconstructs is
    not the value the child serialised. The bullet's account of the residual
    mode-variance is also incomplete: it names one class where the legs differ and
    the subagent leg *reports*; this is a second class where they differ and
    nothing reports.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift.
    `src/extension/production-theta-producer.ts` is 6350 lines at this HEAD and
    every landed fix inserts into it — 0180's own report records the citations of
    its own document going stale between filing and fix — so every volatile
    position below is named by symbol beside its line and every line is stamped
    with the commit it was read at.
- **Affected** (every citation re-verified against the tree at HEAD `bf32ad03`,
  v0.105.0, by `rg` and by reading the file; symbols named beside lines):
  - **The writer that erases the sign.** `serializeOkEnvelope`
    (`src/runtime/subagent-envelope.ts:107`) and its `JSON.stringify` (`:109`);
    its doc-comment (`:98–106`), whose "The caller establishes `value`'s
    representability before calling this" (`:100–101`) is true of finiteness and
    false of the sign of zero; the `EnvelopeOk` interface and its comment (`:58`,
    `:59`), which now says representability is established "rather than assuming
    it by construction".
  - **The detection that admits it.** `firstNonFiniteNumber`
    (`src/runtime/subagent-envelope.ts:359`), its `Number.isFinite` leaf test
    (`:368`), its `MAX_JSON_DEPTH` bound and the doc-comment paragraph stating
    what the bound costs (`:334–351`); `mapNonRepresentableReturnValue` (`:416`)
    and its walk call (`:420`); `SUBAGENT_RETURN_VALUE_NOT_REPRESENTABLE_CODE`
    (`:92`).
  - **The child-side call site.** `driveSubagentRootRegime`
    (`src/extension/production-theta-producer.ts:2150`), its
    `surfaceCalleeFinalValue` projection (`:2246`), the refusal consult (`:2253`)
    and the `emitEnvelope(serializeOkEnvelope(...))` arm a `-0` payload takes
    (`:2261`).
  - **The parent's re-read and settle.** `parseEnvelopeLine`
    (`src/runtime/subagent-envelope.ts:162`) and its `JSON.parse` (`:165`); the
    driver's parse and settle (`src/runtime/subagent-json-driver.ts:118`, `:121`).
  - **The gate that judges both legs, and the bind.** `#validateInvokeReturn`
    (`src/extension/production-theta-producer.ts:3622`) and the `verdict.ok` arm's
    `validated: result.value` (`:3657`) — the bind is the ORIGINAL value, so on the
    prompt leg it is the callee's `-0` and on the subagent leg it is the driver's
    `+0`. The two cells: the prompt→prompt attach guard
    `callerMode === "prompt" && callee.frontmatter.mode === "prompt"` (`:3428`)
    with its call at `:3462`, and the subagent spawn cell's `binding.drive()`
    (`:3494`) with its call at `:3500`.
  - **The lowering and the validator seam — both legs agree here.**
    `lowerQueryResponseSchema` (`src/runtime/query-schema-lowering.ts:120`);
    `AjvSchemaValidator`'s AJV construction
    (`src/seams/schema-validator.ts:112` — `{ strict: false, allErrors: true,
    logger: false }`). Measured: `{"type":"number"}`, `{"type":"integer"}` and
    `{"type":["number","null"]}` each admit `-0` **and** `+0`
    (§Reproduction (d)), so unlike bug 0180 this report engages no AJV flag and
    0180's §Fix (d) is not resurrected (§Non-goals).
  - **Spec.** `docs/spec_topics/invocation.md:36` (§Final-value propagation across
    callees — the sentence this defect contradicts, plus INV-5's envelope-only
    rule for the subagent leg), `:28` (§Typed return — the form that carries a
    value back; the untyped form discards it, which bounds the domain), `:55`
    (§Cross-mode semantics — the callee's mode selects conversation isolation and
    nothing else); `docs/spec_topics/runtime-value-model.md:8` (the `number` row —
    JS `number`, silent on the sign of zero), `:26` (§Equality — "`+0` and `-0`
    compare equal (`+0 == -0` is `true`), consistent with the `-0`→`0`
    normalisation the rendering pipeline applies"), `:34` (the inbound pass, which
    runs after AJV and rebuilds names), `:45` (the engine value model naming
    IEEE-754 `number`s and native `JSON.stringify` as non-checked invariants);
    `docs/spec_topics/expressions.md:232` (the `*` / `/` / unary-minus rules that
    mint `-0`, and division's `-Infinity`);
    `docs/spec_topics/pi-integration-contract/subagent.md:101` (PIC-59), `:110`
    (the `Ok`-values bullet as corrected at 0.105.0) and `:114` (the fail-closed
    non-representable-`Ok` requirement, whose class is `Infinity` / `-Infinity` /
    `NaN`); `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15,
    observables (a) return values and (c) `theta-system-note` content strings).
  - **The four rendering boundaries that DO decide `-0`, cited as the contrast.**
    `docs/spec_topics/query/query-escapes-stringification.md:21` (the `integer`
    interpolation row, "`-0` → `0`") and `:22` (the `number` row, same);
    `docs/spec_topics/binder/defaulting-system-note-echo.md:36` (BNDR-4, "`-0`
    renders as `0`"), `:37` (BNDR-5, same) and `:66` (BNDR-6p, the normative
    reference-rendering row "`-0` (integer or number) | `0`");
    `docs/spec_topics/schema-subset.md:102` (the canonical-hash recipe borrows the
    same algorithm — "`-0` as `0`"); `docs/spec_topics/diagnostics/placeholder-rendering-a.md:79`
    (the category-2 integer placeholder — "`0` for the value `-0` (signed zero is
    normalised at the rendering boundary)"). Five sites name the value; all five
    normalise it; all five are **rendering** boundaries. The return boundary,
    which hands the value to theta code rather than to text, names nothing.
    Implementations: `canonicalDecimal`'s `value === 0` arm
    (`src/render/canonical-number.ts:55`, comment `:54` — "Covers both `+0` and
    `-0` (bndr-6p)"), `stringifyInterpolatedValue`
    (`src/render/query-render.ts:396`, the `integer` arm `:404` and the `number`
    arm `:406`), the non-exhaustive-`match` scrutinee summary
    (`src/runtime/match-result.ts:70` — `Object.is(value, -0) ? "0" : String(value)`),
    and the equality relation (`src/runtime/value.ts:494`, the numeric compare
    `:563–565` under the comment at `:559–561`).
  - **The committed cells a fix must move deliberately (0180's `-0` fences).**
    `tests/subagent-envelope-nonfinite-ok-refusal.test.ts:801`
    (`CONTROL (FENCE-NEGATIVE-ZERO)` — `mapNonRepresentableReturnValue(-0)` is
    `undefined` at the root and at a schema field, and
    `serializeOkEnvelope(-0)` is `'{"theta_result":{"v":1,"ok":0}}\n'`); `:1084`
    (the `CHILD-FINITE` row `0 * -1 (-0)`, driving the REAL child-side writer and
    asserting the `ok` line plus `diagnostics: []`); `:1350–1360` (the
    `PROMPT-FINITE` rows, asserting `Object.is(bound, -0)` through the real
    prompt→prompt attach cell). `tests/subagent-invoke-nonfinite-return-refusal.test.ts:243`
    (the `kidneg.theta` fixture, body `0 * -1`), `:283–284` (the driven root's
    `negOk` / `negVal` bindings) and `:536`, `:541` (the two soft assertions —
    `negOk` `true`, `negVal` `0` — measured over REAL spawned children). All six
    assert the behaviour this report calls a defect; both files are green at HEAD
    (27/27 and 1/1, re-run for this filing).
  - **The committed cells a fix must not red.**
    `tests/expression-evaluator.test.ts:207` and `:213` pin the evaluation half of
    `/` and `%` and must stay green under every route — no route touches the
    operators (§Non-goals). `tests/runtime-value-model.test.ts:89–90`
    (`valuesEqual(+0, -0)` both directions) pins the equality relation.
    `tests/canonical-number-render.test.ts:45` and `:86`,
    `tests/argument-echo.test.ts:181–185` (BNDR-6p) and
    `tests/placeholder-rendering.test.ts:105` pin the four rendering boundaries'
    `-0` → `0`. `tests/subagent-envelope.test.ts:59` declares the eight-value
    `OK_VALUES` envelope round-trip corpus (driven at `:178`); **no row is `-0`**,
    and the doc-comment above it (`:58`) still carries the parenthetical PIC-59
    dropped at 0.105.0 ("JSON-representable by construction").
    `tests/live/hardening/session-invoke-attach.test.ts:95` drives the attach
    topology with `invoke<number>("./ppnum.theta")` — the one live cell already on
    this annotation. `tests/live/live-production-acceptance.test.ts:6938` is bug
    0180's live cell 43 (a `mode: subagent` callee whose tail is `1 / 0`); a live
    row for this class is its natural neighbour.
  - **Corpus census, re-run at HEAD.** 34 committed `.theta` / `.thetalib` files.
    **None contains an arithmetic operator outside comment prose**: the only `*`
    occurrence in the tracked set is inside a comment
    (`tests/fixtures/h7a/acceptance.theta:18`), there is no `%`, and every `/` is
    inside a comment or a path/model reference. No committed fixture can mint a
    `-0`, so `tests/committed-fixture-parse-gate.test.ts` never meets one and the
    class is unreachable from the shipped corpus.
- **Observed at:** v0.105.0 (`bf32ad03`). Offline, deterministic, provider-free:
  one scratch vitest probe driving the REAL in-process prompt→prompt attach cell
  end to end (`parseThetaDocument` →
  `createProductionProducerDeps({ parseCallee })` → `bindPromptConversation` →
  `executeBody`, explicit `invoke<T>("./kid.theta")` form, a real
  `AjvSchemaValidator` on the runtime root), the REAL child-side writer
  (`driveSubagentRootRegime` under the `PI_THETA_SUBAGENT_ROOT` regime marker with
  `emitResultEnvelope` / `emitDiagnostic` captured), and the seams directly
  (`serializeOkEnvelope`, `parseEnvelopeLine`, `mapNonRepresentableReturnValue`,
  `lowerQueryResponseSchema`, `evaluateSource`, `valuesEqual`,
  `renderCanonicalNumber`, `stringifyInterpolatedValue`), plus one `node -e`
  measurement of `JSON.stringify` / `JSON.parse` behaviour on `-0`. Every callee
  and caller body is a pure tail expression or a `match` over one, so zero model
  turns were spent. Written, run, deleted; the tree carries no scratch file from
  it. Every value in §Reproduction is that run's output verbatim.
  Two committed witnesses were additionally re-run unmodified at this HEAD for
  the parent-binding claim and the fence inventory:
  `tests/subagent-invoke-nonfinite-return-refusal.test.ts` (`Tests 1 passed (1)`,
  6.4 s, REAL spawned children) and
  `tests/subagent-envelope-nonfinite-ok-refusal.test.ts` (`Tests 27 passed (27)`).

## Summary

`invocation.md:36` fixes the return surface as mode-invariant: "A `prompt`-mode
child attaches to the caller's current conversation, but the final value still
propagates through the same return surface." For a typed `invoke<T>` whose payload
carries `-0` at any position, the value the caller binds is selected by the
callee's `mode:` frontmatter.

`-0` is minted from clean source. `0 * -1`, `-1 * 0`, `0 / -1` and the literal
`-0` each parse with `[]` diagnostics and evaluate to `-0`; `0 - 0` and `0 * 1`
evaluate to `+0` (§Reproduction (a)). The sign is observable from theta code
through division — `1 / (0 * -1)` is `-Infinity` where `1 / 0` is `Infinity` —
and `expressions.md:232` names `-Infinity` among division's specified results.

The subagent leg loses it:

| cell | envelope / what reaches the bind | what the caller binds |
| --- | --- | --- |
| prompt→prompt attach (`:3462`) | the callee's own `-0`, unserialised | `-0` (`Object.is` true) |
| subagent spawn (`:3500`) | `{"theta_result":{"v":1,"ok":0}}` | `+0` |

Both legs validate `{"ok":true}` under `{"type":"number"}` — and under
`{"type":"integer"}` and `{"type":["number","null"]}`. Neither emits a
diagnostic. With the same caller body, `1 / z` is `-Infinity` on the prompt leg
and `Infinity` on the subagent leg (§Reproduction (d)).

**JSON is not the reason.** The JSON grammar admits `-0`, and the parent's own
`JSON.parse` recovers it at the root, at a field and in an array
(§Reproduction (b)). What cannot express it is `JSON.stringify` — and no
`replacer` or `toJSON` hook changes that (measured). So where bug 0180's class was
"the format has no form for this value", this class is "the writer does not emit a
form the format has".

That distinction is why 0.105.0's refusal does not reach it, deliberately. The
shipped detection is `Number.isFinite` (`subagent-envelope.ts:368`) and `-0` is
finite, so `mapNonRepresentableReturnValue(-0, …)` is `undefined` and the writer
takes its `ok` arm (`production-theta-producer.ts:2261`). Bug 0180's §Non-goals
fixed that a route finding a second JSON hole "records it rather than widening",
and three committed cells plus one integration fixture pin the current `-0`
behaviour so a later change cannot widen the detection into it unnoticed
(§Affected). This report is that record, filed.

The contrast the corpus does draw is with its rendering boundaries. Five spec
sites name `-0` and all five normalise it to `0`: the two interpolation rows
(`query-escapes-stringification.md:21–22`), BNDR-4 / BNDR-5 / BNDR-6p
(`defaulting-system-note-echo.md:36`, `:37`, `:66`), the lowered-fragment
canonical hash (`schema-subset.md:102`), and the category-2 panic placeholder
(`placeholder-rendering-a.md:79`, which localises the decision — "signed zero is
normalised at the rendering boundary"). The value model's `number` row
(`runtime-value-model.md:8`) says nothing about the sign of zero, and its equality
clause (`:26`) ties `+0 == -0` back to that same rendering normalisation. The
return boundary hands the value to theta code rather than to text, decides
nothing, and erases the sign on one leg out of two.

## Reproduction

Offline, deterministic, provider-free, at HEAD `bf32ad03`. One scratch vitest
probe plus one `node -e` measurement; written, run, deleted. Output verbatim. The
`--- A ---` … `--- F ---` labels inside the fences are the probe's own block names
and do not track the sub-section letters below.

### (a) Which theta-source spellings produce `-0`, and what theta code observes

Real `parseThetaDocument` over the body, then the real `evaluateSource`.

```
--- A: parse diagnostics ---
  "0 * -1"  diags []
  "-1 * 0"  diags []
  "0 / -1"  diags []
  "-0"  diags []
  "let z = 0 * -1\n1 / z"  diags []
  "1 / (0 * -1)"  diags []
  "1 / 0"  diags []

--- A: evaluated values ---
  0 * -1     -> 0 [Object.is(-0)=true] [Object.is(+0)=false]
  -1 * 0     -> 0 [Object.is(-0)=true] [Object.is(+0)=false]
  0 / -1     -> 0 [Object.is(-0)=true] [Object.is(+0)=false]
  -0         -> 0 [Object.is(-0)=true] [Object.is(+0)=false]
  0 - 0      -> 0 [Object.is(-0)=false] [Object.is(+0)=true]
  0 * 1      -> 0 [Object.is(-0)=false] [Object.is(+0)=true]

--- A: the sign is OBSERVABLE through division ---
  1 / (0 * -1)   -> -Infinity
  1 / 0          -> Infinity
  1 / (0 * 1)    -> Infinity
  1 / -0         -> -Infinity
  1 / (0 - 0)    -> Infinity
  -1 / 0         -> -Infinity

--- A: the channels that ERASE the sign ---
  0 * -1 == 0                     -> true
  valuesEqual(-0, 0)              -> true
  (0 * -1) < 0                    -> false
  String(-0)                      -> "0"
  renderCanonicalNumber(-0,number)-> "0"
  renderCanonicalNumber(-0,integer)-> "0"
  stringifyInterpolatedValue(-0,number) -> {"ok":true,"text":"0"}
  stringifyInterpolatedValue(-0,integer) -> {"ok":true,"text":"0"}
```

Four spellings mint the value with zero diagnostics; two controls mint `+0`.
Division is the one channel that distinguishes them: `1 / (0 * -1)` and
`1 / (0 * 1)` differ in sign while their operands are `==`-equal, order
identically, and render identically. That is what makes the sign a value
property rather than a JS trivium — and it is why the erasure at the return
boundary is observable from theta code.

### (b) JSON has a form for `-0`; `JSON.stringify` does not emit it

```
plain            0
replacer id      {"n":0}
replacer -0      {"n":0}
toJSON           {"n":0}
parse -0         true
parse {n:-0}     true
parse [-0]       true
parse -0.0       true
```

Rows 1–4: `JSON.stringify(-0)` is `"0"`, and neither an identity `replacer`, nor
a `replacer` that re-returns `-0` for a `-0` leaf, nor a `toJSON` returning `-0`
changes the emitted byte. Rows 5–8: `JSON.parse` recovers `-0` (`Object.is` true)
from `-0` at the root, from `{"n":-0}`, from `[-0]`, and from `-0.0`. The reader
is faithful and the grammar is sufficient; the writer is the hole. A route that
preserves the sign therefore needs no parent-side change (§Fix (a)).

### (c) The envelope round trip, and what the 0180 detection does with `-0`

The child's own `serializeOkEnvelope`, the parent's own `parseEnvelopeLine`, and
the shipped `mapNonRepresentableReturnValue`.

```
--- C: envelope ---
  -0 (root)        envelope "{\"theta_result\":{\"v\":1,\"ok\":0}}\n"
                     re-read 0
                     probed member 0 [Object.is(-0)=false] [Object.is(+0)=true]
                     0180 detection: "undefined (admitted)"
  {n:-0,who:'w'}   envelope "{\"theta_result\":{\"v\":1,\"ok\":{\"n\":0,\"who\":\"w\"}}}\n"
                     re-read {"n":0,"who":"w"}
                     probed member 0 [Object.is(-0)=false] [Object.is(+0)=true]
                     0180 detection: "undefined (admitted)"
  [-0, 1]          envelope "{\"theta_result\":{\"v\":1,\"ok\":[0,1]}}\n"
                     re-read [0,1]
                     probed member 0 [Object.is(-0)=false] [Object.is(+0)=true]
                     0180 detection: "undefined (admitted)"
  +0 control       envelope "{\"theta_result\":{\"v\":1,\"ok\":0}}\n"
                     re-read 0
                     probed member 0 [Object.is(-0)=false] [Object.is(+0)=true]
                     0180 detection: "undefined (admitted)"
```

The `-0` and `+0` root rows produce **byte-identical** envelope lines: the wire
carries no information distinguishing them, which is why no parent-side route can
recover the sign (element 5). The detection admits every row, at every position —
correctly, by its own stated class: `Number.isFinite(-0)` is `true`.

### (d) Both legs, driven: the verdicts, the bind, and the caller's arithmetic

```
--- D: AJV over the lowered annotation ---
  number         -0  -> {"ok":true} (schema {"type":"number"})
  number         +0  -> {"ok":true} (schema {"type":"number"})
  integer        -0  -> {"ok":true} (schema {"type":"integer"})
  integer        +0  -> {"ok":true} (schema {"type":"integer"})
  number | null  -0  -> {"ok":true} (schema {"type":["number","null"]})
  number | null  +0  -> {"ok":true} (schema {"type":["number","null"]})

--- D: PROMPT leg, real attach cell ---
  callee "0 * -1"         -> Ok(0 [Object.is(-0)=true] [Object.is(+0)=false])
  callee "1 / (0 * -1)"   -> Ok(-Infinity [Object.is(-0)=false] [Object.is(+0)=false])
  callee "0 * 1"          -> Ok(0 [Object.is(-0)=false] [Object.is(+0)=true])
  callee NBox{n:0*-1}      -> Ok(n=0 [Object.is(-0)=true] [Object.is(+0)=false])

--- D: SUBAGENT leg, real child-side writer ---
  callee "0 * -1"
    lines ["{\"theta_result\":{\"v\":1,\"ok\":0}}\n"] diagnostics []
    parent re-reads 0 [Object.is(-0)=false] [Object.is(+0)=true]
    parent AJV over {"type":"number"} -> {"ok":true}
  callee "schema NBox { n: number | null, who: string } NBox { n: 0 * -1, who: \"w\" }"
    lines ["{\"theta_result\":{\"v\":1,\"ok\":{\"n\":0,\"who\":\"w\"}}}\n"] diagnostics []
    parent re-reads 0 [Object.is(-0)=false] [Object.is(+0)=true]
    parent AJV over {"type":"number"} -> {"ok":true}
  callee "[0 * -1]"
    lines ["{\"theta_result\":{\"v\":1,\"ok\":[0]}}\n"] diagnostics []
    parent re-reads 0 [Object.is(-0)=false] [Object.is(+0)=true]
    parent AJV over {"type":"number"} -> {"ok":true}

--- E: caller computes 1 / <bound value> ---
  callee "0 * -1"   caller tail -> Ok(-Infinity)
  callee "0 * 1"    caller tail -> Ok(Infinity)
  (subagent leg: the parent re-reads +0, and 1 / +0 is Infinity — see A and D)
```

The AJV block is why this report engages no validator flag: every lowered numeric
annotation admits both signs, so the two legs' *verdicts* already agree and only
their *values* differ. The prompt rows are driven end to end through the real
attach cell — at the root and at a nullable schema field (`NBox`) — and bind the
callee's `-0` itself. The subagent rows drive the real child-side writer at the
root, at a schema field and at an array element: one `ok` line, no diagnostic, and
a re-read `+0` in every case.

The `--- E ---` block is the harm, end to end on the leg that can be driven
in-process: the caller body is

```
let r = invoke<number>("./kid.theta")
let z = match r { Ok(v) => v, Err(e) => 1 }
Ok(1 / z)
```

and its value is `Ok(-Infinity)` against a `mode: prompt` callee returning
`0 * -1`, `Ok(Infinity)` against the `+0` control. On the subagent leg the same
caller binds `+0` (measured above) and `1 / +0` is `Infinity` (§Reproduction (a)),
so the identical caller and the identical callee body produce opposite-signed
infinities selected by one frontmatter line.

**The parent's bind on the subagent leg is also measured over real spawned
children**, by the committed integration witness re-run unmodified at this HEAD:
`tests/subagent-invoke-nonfinite-return-refusal.test.ts` passes (`Tests 1 passed
(1)`, 6.4 s), and its `negOk` / `negVal` assertions (`:536`, `:541`) are exactly
"the caller binds `0` for a callee returning `0 * -1`, through an `ok` envelope".

### (e) The contrast 0.105.0 created

Same real child-side writer, two callee bodies whose only difference is whether
the callee returns the reciprocal or the zero:

```
--- F: subagent leg, reciprocal vs the zero itself ---
  callee "1 / (0 * -1)"
    lines ["{\"theta_result\":{\"v\":1,\"err\":{\"kind\":\"invoke_infra\",\"message\":\"subagent return value is not JSON-representable: -Infinity\",\"callee_path\":\"./kid.theta\",\"cause\":\"return_validation\"}}}\n"]
    diagnostics ["theta/runtime/subagent-return-value-not-representable"]
  callee "0 * -1"
    lines ["{\"theta_result\":{\"v\":1,\"ok\":0}}\n"]
    diagnostics []
```

A callee that divides *before* returning is refused, loudly, with the value named
and a registered code. A callee that returns the zero and lets its caller divide
crosses silently and the caller computes the opposite sign. The two programs
differ only in which side of the boundary the division sits on.

### (f) The rendering boundaries, for comparison

From the `--- A ---` block above: `renderCanonicalNumber(-0, …)` is `"0"` for both
kinds, and `stringifyInterpolatedValue(-0, …)` is `{"ok":true,"text":"0"}` for
both. Each is the shipped implementation of a spec rule that names `-0`
explicitly (BNDR-4 / BNDR-5 / BNDR-6p; the two interpolation rows) and each is
witnessed (`tests/canonical-number-render.test.ts:45`, `:86`;
`tests/argument-echo.test.ts:181–185`; `tests/placeholder-rendering.test.ts:105`).
So an author who prints the bound value — `${z}` — sees `0` on both legs, and an
author who compares it — `z == 0` — gets `true` on both legs. Every channel that
would reveal the divergence is a channel the corpus has already decided to
normalise; the one channel that reveals it is arithmetic.

## Expected behaviour

- **`docs/spec_topics/invocation.md:36` (§Final-value propagation across
  callees)** — verbatim: "A `prompt`-mode child attaches to the caller's current
  conversation, but the final value still propagates through the same return
  surface." The same paragraph fixes the subagent leg's *mechanism* — the value
  "crosses the subagent boundary as the `ok` arm of the single-JSONL-line
  `{"theta_result": …}` return envelope" — and INV-5 requires the parent to
  "derive the `invoke` result solely from the child's `theta_result` envelope".
  The envelope is specified as that leg's carriage. Nothing specifies it as a
  transform on the values it carries.
- **`docs/spec_topics/invocation.md:55` (§Cross-mode semantics)** — "The callee's
  mode controls whether it gets a fresh conversation or attaches to its caller's
  current conversation. The caller's mode is irrelevant to that decision." The
  mode selects conversation isolation. It is not specified to select the sign of
  the value the caller binds.
- **`docs/spec_topics/pi-integration-contract/subagent.md:110` (PIC-59, `Ok`
  values), as corrected at 0.105.0** — verbatim at HEAD: "**`Ok` values**
  serialise per the runtime value model. The value model admits a value JSON has
  no form for — a non-finite `number` (`Infinity`, `-Infinity`, `NaN`), per
  [Runtime Value Model]'s `number` row — so representability is **established, not
  assumed**: the child refuses to emit an `ok` arm for a payload carrying a
  non-finite `number` (see the fail-closed requirement below) and the parent
  receives the named `Err` instead. The prompt→prompt attach leg does not
  serialise: a `prompt`-mode callee's non-finite `number` propagates to its caller
  unchanged, so the two legs differ for that value class — the subagent leg
  reports it, the prompt leg admits it." Adjudicated against `-0`, clause by
  clause:
  1. "**`Ok` values** serialise per the runtime value model" — **falsified on the
     fidelity reading.** The value model's `number` row (`runtime-value-model.md:8`)
     makes a theta `number` a JS `number`, and `-0` is a JS `number` the same
     corpus distinguishes by division (`expressions.md:232` names `-Infinity`).
     Serialisation maps `-0` and `+0` onto one byte (§Reproduction (c)), so what
     the parent reconstructs is not the value the child held.
  2. "The value model admits a value JSON has no form for — a non-finite `number`
     (`Infinity`, `-Infinity`, `NaN`)" — `-0` sits **outside** this enumeration,
     and would falsify it if extended: JSON *does* have a form for `-0` and the
     parent's `JSON.parse` reads it (§Reproduction (b)). The corrected sentence is
     accurate about its own class and does not reach this one.
  3. "representability is **established, not assumed**" — **established for the
     property that is checked.** The check is finiteness
     (`subagent-envelope.ts:368`), which `-0` passes; nothing establishes that the
     serialised form reparses to the value serialised. So the sentence holds as
     written and is narrower than the property its wording suggests.
  4. "the two legs differ for that value class — the subagent leg reports it, the
     prompt leg admits it" — **incomplete.** There is a second class for which the
     legs differ and *neither* reports: the subagent leg substitutes and admits.
  Whichever way §Fix goes, this bullet is restated in the same commit so its
  account of what crosses the envelope is complete (§Fix (f)).
- **`docs/spec_topics/runtime-value-model.md:8` (the `number` row)** — "JS
  `number` (the static type system enforces the distinction; at runtime they are
  the same value). Division produces IEEE-754 `Infinity` / `NaN` per JS
  semantics." The row is silent on the sign of zero. `:26` (§Equality) is the
  nearest ruling — "`+0` and `-0` compare equal (`+0 == -0` is `true`), consistent
  with the `-0`→`0` normalisation the rendering pipeline applies" — and it scopes
  its own normalisation claim to the *rendering pipeline*. A route that erases the
  sign at the return boundary (§Fix (b), (c)) is extending that normalisation to a
  non-rendering boundary and says so; a route that preserves it (§Fix (a)) is
  reading the row as value-preserving and says that.
- **`docs/spec_topics/expressions.md:232`** — the `*`, `/` and unary-minus rules
  that mint the value, and "Division by zero produces IEEE-754 `Infinity` /
  `-Infinity` / `NaN` per JS semantics; it does not panic." `-Infinity` from `1 / x`
  requires `x` to be `-0` (or the numerator to be negative), so the specified
  result set presupposes the sign is carried.
- **`docs/spec_topics/diagnostics/placeholder-rendering-a.md:79`** — "`0` for the
  value `-0` (signed zero is normalised at the rendering boundary)". The
  parenthetical is the corpus's most explicit statement of where the erasure
  belongs. The envelope is not a rendering boundary; it is a value boundary that
  happens to use a text encoding.
- **`docs/spec_topics/governance/source-language-stability.md:5` (GOV-15)** —
  observable (a), identical return values for any given input, and observable (c),
  equivalent `theta-system-note` content strings. Observable (a) already differs
  *between modes* at HEAD, which is the defect; and every candidate in §Fix moves
  (a) or (c) *between releases* for some input that loads cleanly today. That is
  why §Fix is an adjudication rather than a patch.

## Actual behaviour / root cause

**1. The value is legal, computed, and distinguishable from `+0` only by
arithmetic.** Four spellings mint it with `[]` diagnostics (§Reproduction (a)).
Equality (`runtime-value-model.md:26`), ordering, and all four rendering
boundaries (`query-escapes-stringification.md:21–22`,
`defaulting-system-note-echo.md:36`/`:37`/`:66`, `schema-subset.md:102`,
`placeholder-rendering-a.md:79`) normalise it away. Division does not
(`expressions.md:232`). The corpus therefore contains one channel that observes
the sign and five decisions that hide it — and no decision at all about the
channel that transports it.

**2. The writer erases the sign; the format would have carried it.**
`serializeOkEnvelope` (`subagent-envelope.ts:107`) is `JSON.stringify` of the
payload (`:109`):

```ts
export function serializeOkEnvelope(value: unknown): string {
  const payload: EnvelopeOk = { v: THETA_ENVELOPE_VERSION, ok: value };
  return `${JSON.stringify({ [THETA_RESULT_KEY]: payload })}\n`;
}
```

`JSON.stringify(-0)` is `"0"`, and no `replacer` / `toJSON` hook can change it
(§Reproduction (b)). Meanwhile the parent's `JSON.parse` (`:165`) reads `-0`
faithfully wherever it appears. **The hole is in the serialiser, not in JSON** —
which is the precise respect in which this class differs from bug 0180's, and the
reason 0180's own framing ("JSON has no form for one") does not transfer.

**3. The 0180 refusal is finiteness-only, by design, and this is the value it was
designed not to see.** `firstNonFiniteNumber`'s leaf test is
`Number.isFinite(value)` (`subagent-envelope.ts:368`);
`mapNonRepresentableReturnValue` (`:416`) therefore answers `undefined` for `-0`
at every position (§Reproduction (c)), and `driveSubagentRootRegime` takes the
`serializeOkEnvelope` arm (`production-theta-producer.ts:2261`) with no
diagnostic. This is not an implementation slip: 0180 §Non-goals fixed that a
second JSON hole is "recorded rather than widened" into, and 0.105.0 shipped three
cells asserting exactly the behaviour above (§Affected). The defect is that the
record was a residual in a fix report rather than a filed report — which this
document corrects — not that the refusal admits the value.

**4. Both legs answer `Ok` and the values differ, with no channel reporting it.**
`number`, `integer` and `number | null` all admit both signs at the shipped AJV
seam (§Reproduction (d)), so unlike bug 0180 there is no annotation shape at
which the divergence turns loud. The prompt cell's `verdict.ok` arm binds the
original value — the callee's `-0` — and the subagent cell's binds the driver's
`+0` (`production-theta-producer.ts:3657`, fed from
`subagent-json-driver.ts:118`, `:121`). The caller then computes with whichever it
got: `1 / z` is `-Infinity` or `Infinity` (§Reproduction (d)).

**5. Two shipped claims are narrower than their wording.** PIC-59's `Ok`-values
bullet (`subagent.md:110`) says representability is "established, not assumed" —
established for finiteness, not for round-trip fidelity (§Expected behaviour).
`serializeOkEnvelope`'s doc-comment says "The caller establishes `value`'s
representability before calling this" (`subagent-envelope.ts:100–101`) — the
caller establishes finiteness, and the function then substitutes `0` for a `-0`
the callee did produce, which is the substitution the rest of that same comment
says the check exists to prevent.

**6. The current behaviour is witnessed as correct-for-now, and the divergence is
witnessed nowhere.** Three cells in
`tests/subagent-envelope-nonfinite-ok-refusal.test.ts` (`:801`, `:1084`,
`:1350–1360`) and two soft assertions in
`tests/subagent-invoke-nonfinite-return-refusal.test.ts` (`:536`, `:541`) assert
the `-0` envelope is written and the caller binds `0`. No cell asserts that the
two legs agree, that anything reports the difference, or that the sign survives.
The envelope round-trip corpus (`tests/subagent-envelope.test.ts:59`) has eight
rows and none is `-0`. No committed `.theta` can mint one (0 of 34).

## Why it matters

- **A caller binds a value whose sign its callee did not produce, and the sign
  selects the branch of any subsequent division.** Measured: the same caller body
  computes `Ok(-Infinity)` against a prompt-mode callee and `Infinity` against
  the same file as `mode: subagent` (§Reproduction (d)). GOV-15 observable (a),
  moving on frontmatter alone, with no diagnostic code, no runtime event and no
  system note.
- **Every channel an author would debug with erases the difference.** `${z}`
  renders `0` on both legs (BNDR-6p and the interpolation rows, measured),
  `z == 0` is `true` on both legs (`runtime-value-model.md:26`, measured),
  `z < 0` is `false` on both legs. An author comparing the two legs by echoing
  the value sees identical output while the arithmetic differs. The
  non-exhaustive-`match` panic summary erases it too
  (`src/runtime/match-result.ts:70`).
- **0.105.0 raised the expectation that this boundary is now faithful.** PIC-59
  now states that representability is "established, not assumed" and that a
  payload the writer cannot express is refused. For `-0` it is neither
  established nor refused: the writer substitutes, exactly as it did for
  `Infinity` before 0.105.0, and the sentence's enumeration does not admit that
  this class exists.
- **The boundary's behaviour is not predictable from the value's type.** A
  `mode: subagent` callee returning `1 / (0 * -1)` is refused with a registered
  code naming `-Infinity`; the same callee returning `0 * -1` crosses silently and
  its caller's own division produces the opposite sign (§Reproduction (e)). Which
  side of the boundary the division sits on decides whether the author is told.
- **The workaround is a mode change, and the modes are not interchangeable.**
  `invocation.md:55` fixes that a subagent-mode callee gets a fresh isolated
  conversation rather than attaching to its caller's. An author who switches to
  `mode: prompt` to keep the sign trades conversation isolation for it, and
  nothing says so.
- **The record says the opposite of the behaviour in one place and nothing in
  another.** Five spec sites name `-0` and normalise it at rendering boundaries;
  the value model's `number` row and PIC-59 say nothing about it at the value
  boundary that erases it. An author reading `placeholder-rendering-a.md:79`
  ("signed zero is normalised at the rendering boundary") would conclude the
  erasure is confined to text.
- **Nothing gates it.** No committed fixture contains an arithmetic operator
  outside comment prose (0 of 34), the envelope round-trip corpus has no `-0`
  row, and the only committed `-0` cells at this boundary assert that the loss
  happens. The cell is unwitnessed in the direction that matters.

## Fix

Not settled. The surface, the mechanism and the reachable spellings are fixed and
measured; which disposition lands is not. Four candidates follow with their
measured costs; every one of them carries the constraints in (e) and the
same-commit corrections in (f).

Two measurements bound the whole space. First, **the sign cannot be recovered
parent-side**: the `-0` and `+0` envelope lines are byte-identical
(§Reproduction (c)), so no change at `parseEnvelopeLine`, at the driver, at AJV or
in the inbound pass can distinguish them. Second, **both legs' AJV verdicts
already agree** (§Reproduction (d)), so no validator-flag route exists here —
bug 0180's §Fix (d) has no analogue in this class.

### (a) Sign-preserving envelope encoding — the writer emits the form JSON admits

Have the child render numeric leaves itself so a payload holding `-0` serialises
as `-0`. Measured basis: `JSON.parse` already recovers `-0` at the root, at a
field and in an array (§Reproduction (b)), so the parent, the driver and the
pinned envelope *shape* are untouched; the change is confined to the writer.

- **It makes the two legs identical by construction**, which is what
  `invocation.md:36` requires, and it is the only candidate that does so without
  destroying information.
- **It changes the bytes a `v: 1` envelope carries for a given value**, and PIC-59
  (`subagent.md:101`) versions the envelope schema and asserts skew is "detected,
  not tolerated". A route taking (a) adjudicates whether a change to a leaf's
  rendering is a schema change at all — the payload shape, the key set and the
  parse behaviour are unchanged, and both sides ship in the same extension build —
  and states the answer normatively rather than leaving it implied.
- **It cannot be done through `JSON.stringify`.** Measured: neither a `replacer`
  nor a `toJSON` can emit the sign (§Reproduction (b)). So the writer walks the
  payload, which makes it a second payload walk in the envelope module — bounded
  by `MAX_JSON_DEPTH` per CIO-3 exactly as `firstNonFiniteNumber` is
  (`subagent-envelope.ts:334–351`), and inheriting the same "a boundary that runs
  no depth check has no backstop" scope that walk's doc-comment already records.
  A route taking (a) states whether the walk is shared with the 0180 walk or a
  second one, and re-states the bound in both places consistently.
- **GOV-15:** observable (a) moves on the subagent leg only — a caller that binds
  `+0` today binds `-0` — in the direction of the prompt leg and of
  `invocation.md:36`. No prompt-leg input moves.

### (b) Refuse child-side — extend the 0.105.0 fail-closed class to `-0`

Have `mapNonRepresentableReturnValue` treat `-0` as non-representable, so a
subagent callee returning it gets an `err` envelope naming the value and its
position instead of an `ok` envelope carrying `0`.

- **It is the shape 0180 shipped**, so the mechanism, the message composition and
  the registered code already exist (`subagent-envelope.ts:416`,
  `code-registry-runtime.md:32`).
- **Its ground is weaker than 0180's, and the difference is measured.** 0180
  refused a value the wire cannot carry. `-0` the wire *can* carry
  (§Reproduction (b)); the refusal would be "our writer does not emit it", which
  is a statement about the implementation rather than the format. A route taking
  (b) states that ground explicitly, and states why (a) — emitting the form the
  format admits — is refused.
- **It requires a DIAG-2 registry edit in the same commit.** The shipped
  row's *Trigger* names "a non-finite `number` (`Infinity`, `-Infinity`, `NaN`)"
  and its *Message* carries the category-2 `<value>` placeholder
  (`code-registry-runtime.md:32`, mirrored at `docs/reference/diagnostics.md:260`).
  The shipped renderer is `String(hit.value)`
  (`src/runtime/subagent-envelope.ts:425`) and `String(-0)` is `"0"` (measured,
  §Reproduction (a)); the category-2 rule agrees
  (`placeholder-rendering-a.md:79`). So the refusal message for this class reads
  `… is not JSON-representable: 0` unless the rendering is decided separately, and
  a route taking (b) resolves that or the diagnostic names a value the author
  cannot recognise.
- **GOV-15:** observable (a) moves on the subagent leg — a today-succeeding `Ok`
  becomes an `Err` for every call form, exactly as 0180's route did (its
  `## Fix (0.105.0)` (e)(7) enumerates the classes; (i), (ii), (iv), (vi) and
  (vii) transfer unchanged). Observable (c) moves for a top-level `/name` of a
  `mode: subagent` theta, under GOV-15's diagnostic-registry carve-out.

### (c) Normalise both legs — erase the sign at the prompt cell too

Have the prompt→prompt attach cell project `-0` to `+0` before the bind, so both
legs bind `+0`. This is the reading that the value model's five rendering
decisions and `runtime-value-model.md:26`'s equality clause already take, applied
to the return boundary.

- **It makes the verdict and the value mode-invariant** with no wire change and
  no new diagnostic.
- **It destroys information on the leg that currently preserves it**, and it does
  so for a value the language mints from clean source. GOV-15 observable (a) moves
  on the **prompt** leg: a caller that binds `-0` today binds `+0`, so the
  measured prompt-leg fence (`tests/subagent-envelope-nonfinite-ok-refusal.test.ts:1350–1360`)
  reds by design and must be re-pinned inverted.
- **It owes a normative sentence, not a projection alone.** A route taking (c)
  writes into `runtime-value-model.md` that the sign of zero is not part of a
  theta `number`'s identity at a value boundary, and reconciles that with
  `expressions.md:232`'s `-Infinity` — which remains reachable from `-1 / 0` and
  from a locally computed `-0`, so the erasure would apply to values crossing a
  boundary and not to values inside one theta. That asymmetry is the cost to
  state.
- **It interacts with bug 0174's shipped split.** `#validateInvokeReturn`
  validates a projection and binds the ORIGINAL value
  (`production-theta-producer.ts:3657`), so a projection-only change at
  `projectForValidation` would not move the bind at all; (c) has to alter the
  bound value, which is a different site from the one 0174 established.

### (d) Document the erasure — a spec sentence, no code change

State in PIC-59 (and in `runtime-value-model.md`'s `number` row or its equality
clause) that the sign of zero does not survive the subagent return envelope, that
the behaviour is therefore mode-dependent, and what a caller observes on each leg.

- **It is the honest floor and it moves nothing.** No input's verdict or value
  changes, so GOV-15 (a) and (c) are untouched. It converts an unstated
  divergence into a stated one and completes PIC-59's account of what crosses the
  envelope.
- **It leaves the divergence live.** A caller still binds the wrong sign under a
  `mode:` change with no diagnostic; the document would say so and the program
  would still do it. A route taking only (d) says why the silent divergence is
  acceptable — the argument available to it is the one in the estimate's
  downgrade condition, and it should be made explicitly rather than by omission.
- **It is a genuine saving only if (a), (b) and (c) are all refused.** Every other
  route owes a normative sentence anyway (§Fix (f)), so (d) alone is a choice, not
  a default.

### (e) Constraints every route carries

1. **The evaluation semantics do not move.** `expressions.md:232` fixes what
   `*`, `/`, `%` and unary `-` produce, and `tests/expression-evaluator.test.ts:207`
   / `:213` pin the division and modulo halves. No route refuses `0 * -1`, adds a
   panic at the operator, changes a static type, or stops `1 / -0` evaluating
   `-Infinity` inside one theta. §Non-goals repeats this.
2. **The rendering boundaries do not move.** BNDR-4, BNDR-5 and BNDR-6p
   (`defaulting-system-note-echo.md:36`, `:37`, `:66`), the two interpolation rows
   (`query-escapes-stringification.md:21–22`), the canonical-hash recipe
   (`schema-subset.md:102`) and the category-2 placeholder rule
   (`placeholder-rendering-a.md:79`) each decide `-0` → `0`, and their witnesses
   (`tests/canonical-number-render.test.ts:45`, `:86`;
   `tests/argument-echo.test.ts:181–185`;
   `tests/placeholder-rendering.test.ts:105`) stay green untouched. No route makes
   `${z}` render `-0`.
3. **Equality does not move.** `runtime-value-model.md:26` fixes `+0 == -0` as
   `true` and `tests/runtime-value-model.test.ts:89–90` pins it both directions.
   A route that preserves the sign on the wire leaves two values that compare
   equal and divide differently — which is IEEE-754 and is already the situation
   inside a single theta.
4. **Bug 0180's `-0` fences are re-pinned under the new route's authority, in the
   same commit, deliberately.** Six assertions across two files encode the current
   behaviour: `tests/subagent-envelope-nonfinite-ok-refusal.test.ts:801`
   (`CONTROL (FENCE-NEGATIVE-ZERO)` — the seam admits `-0` at the root and at a
   field, and `serializeOkEnvelope(-0)` is `'{"theta_result":{"v":1,"ok":0}}\n'`),
   `:1084` (the `CHILD-FINITE` `0 * -1 (-0)` row over the real writer), and
   `:1350–1360` (the `PROMPT-FINITE` `Object.is(bound, -0)` row over the real
   attach cell); plus `tests/subagent-invoke-nonfinite-return-refusal.test.ts:243`
   (the `kidneg.theta` fixture), `:283–284` and `:536` / `:541` (`negOk` `true`,
   `negVal` `0`, over real spawned children). Both files are green at HEAD. Each
   route moves exactly the cells its own claim inverts and states which — (a)
   flips the envelope byte and the subagent-side binding while leaving the prompt
   row alone; (b) flips both `CHILD-*`/`neg*` cells from `ok` to `err` and
   contradicts `FENCE-NEGATIVE-ZERO`'s stated purpose, which must be rewritten
   rather than deleted; (c) flips the prompt row. A route that leaves all six
   untouched has not changed the behaviour.
5. **GOV-15 is named, not absorbed.** Every route except (d) moves observable (a)
   for at least one input that loads cleanly today. The chosen route enumerates
   exactly which spellings flip, on which leg, and for which call forms — typed
   `invoke<T>`, untyped `invoke(...)`, a `tools:`-declared `.theta` callable, and
   a top-level `/name` — in the form bug 0180's `## Fix (0.105.0)` (e)(7)
   enumeration uses, and states the zero-flip legs as verified rather than assumed.
6. **The detection's predicate stays stated.** At HEAD it is finiteness
   (`subagent-envelope.ts:368`). A route that widens it (b) restates the class in
   the doc-comment, in the registry row's *Trigger* and in PIC-59's fail-closed
   bullet (`subagent.md:114`) in the same commit; a route that does not widen it
   (a), (c), (d) says so, so a later reader does not infer that `-0` was
   overlooked.
7. **Any new payload walk is depth-bounded.** CIO-3 forbids unbounded recursion in
   the envelope writer, and the existing walk's doc-comment
   (`subagent-envelope.ts:334–351`) already records what its `MAX_JSON_DEPTH`
   bound does and does not cost. A second walk inherits both the bound and that
   recorded scope, and the two statements agree afterwards.
8. **Witness — unit, offline, provider-free.** Re-drive §Reproduction (a), (c),
   (d) and (e) over the shipped seams: the real prompt→prompt attach cell for the
   prompt leg, the real `driveSubagentRootRegime` writer plus `parseEnvelopeLine`
   and the production `AjvSchemaValidator` for the subagent leg, at the root, at a
   schema field and at an array element, under `number`, `integer` and
   `number | null`. The `+0` controls (`0 - 0`, `0 * 1`) and the finite controls
   assert UNCHANGED values on both legs. The caller-side reciprocal
   (`Ok(1 / z)`) is the cell that measures the harm rather than the mechanism.
   Each new assertion is proved both directions once — red with the change
   neutralised, green with it restored. A live row belongs beside bug 0180's cell
   43 (`tests/live/live-production-acceptance.test.ts:6938`) only if the chosen
   route changes an observable a live cell can see.

### (f) Same-commit corrections every route carries

1. **PIC-59's `Ok`-values bullet**
   (`docs/spec_topics/pi-integration-contract/subagent.md:110`) — its enumeration
   of what the value model admits and JSON cannot carry, and its account of the
   residual per-leg difference, are both incomplete for this class (§Expected
   behaviour). Corrected to state what actually holds under the chosen route.
2. **`serializeOkEnvelope`'s doc-comment**
   (`src/runtime/subagent-envelope.ts:98–106`, the claim at `:100–101`) — "The
   caller establishes `value`'s representability before calling this" is true of
   finiteness only. Narrowed or made true, at the function that performs the
   substitution.
3. **`tests/subagent-envelope.test.ts:58`** — the `OK_VALUES` doc-comment still
   carries the parenthetical "(JSON-representable by construction)" that PIC-59
   dropped at 0.105.0. Corrected where the route touches that file; recorded and
   left otherwise, per bug 0134's do-not-chase adjudication.

### (g) Ordering

Nothing blocks this report and it blocks nothing.
[0180](./0180-invoke-return-nonfinite-number-mode-variance.md) is **fixed
(0.105.0)**: every route here lands on the seams that fix created
(`src/runtime/subagent-envelope.ts`'s walk and mapping,
`driveSubagentRootRegime`'s refusal consult) and must re-pin its `-0` fences per
(e)(4) and re-run both its witnesses green.
[0068](./0068-prompt-callee-invoke-final-value-null.md) is **wontfix** and bounds
the domain to value-carrying call forms; no route revisits the untyped discard.

## Non-goals

- **Bug 0180's non-finite class.** Fixed at 0.105.0. The child-side refusal of
  `Infinity` / `-Infinity` / `NaN`, its registered code
  (`code-registry-runtime.md:32`), its message shape and PIC-59's fail-closed
  bullet (`subagent.md:114`) are settled and are not reopened. A route here may
  widen the detection's predicate to cover `-0` (§Fix (b)), which is a change to
  the class boundary, not to that refusal.
- **`NaN` payload identity.** `NaN` already has a JSON-hole disposition decided at
  0.105.0 — refuse — and `runtime-value-model.md:26` fixes `NaN == NaN` as `true`,
  so payload-bit identity of a `NaN` is not a theta observable and no route here
  introduces one.
- **The `-0` → `0` decision at the rendering boundaries.** BNDR-4, BNDR-5,
  BNDR-6p, the two interpolation rows, the canonical-hash recipe and the
  category-2 placeholder rule are cited as evidence that the corpus contemplates
  this value, not as surfaces to change (§Fix (e)(2)). `${z}` keeps rendering `0`
  under every route.
- **The equality relation.** `+0 == -0` stays `true` (`runtime-value-model.md:26`,
  `src/runtime/value.ts:563–565`). No route makes theta's `==` sign-sensitive, and
  no route adds an `Object.is`-style operator to the language.
- **What `*`, `/`, `%` and unary `-` produce, and their static types.**
  `expressions.md:232` owns those. This report is about a value at a return
  boundary, whatever the operator assigned it.
- **The AJV seam's `strict: false` posture.** Measured: `-0` and `+0` both
  validate under every lowered numeric annotation (§Reproduction (d)), so no AJV
  flag decides anything here and bug 0180's §Fix (d) has no analogue. The seam's
  construction (`src/seams/schema-validator.ts:112`) is untouched.
- **The untyped `invoke(...)` discard.** `invocation.md:28` fixes that the untyped
  form returns `Result<null, QueryError>` and discards the callee's value;
  [0068](./0068-prompt-callee-invoke-final-value-null.md) settled the design
  question as wontfix. There is no value at that boundary for the caller to
  observe a sign on.
- **The wording of `invoke<T> return value failed validation`.** Unchanged by this
  class — no route here produces that message, and whether it should carry AJV
  detail is the separate question bug 0180 §Non-goals already declined.
- **Other `JSON.stringify` holes at the envelope.** `undefined`, functions and
  symbols are not theta values, and a `Result` never crosses the wire by
  specification (`runtime-value-model.md`, the `Result` row). With the non-finite
  class closed at 0.105.0 and `-0` filed here, the enumeration of holes a legal
  theta value can occupy is closed at two; a route finding a third records it
  rather than widening, on the same terms 0180 set.

## Provenance

Filed as residual **2** of the bug 0180 fix (0.105.0, commit `bf32ad03`). That
run's report (`.pi/tmp/fixes/0180-report.md` §*Residuals / notes*, item 2 — "`-0`
crosses the subagent envelope as `+0` — a second JSON hole, recorded and
deliberately NOT closed … **Not filed** (a fix run creates no bug docs)") is the
source, and the same finding is recorded in that document's `## Fix (0.105.0)`
§*Residuals* item 1. It was measured during that fix's own run, which is why the
commit that landed 0180 also shipped the fences this report must move.

**Re-verified at HEAD `bf32ad03` for this filing, not copied.** The residual's
bundle was treated as a set of claims to check. All four headline measurements
reproduce exactly: `0 * -1` parses with `[]` diagnostics; the prompt leg binds
`Ok(-0)`; the envelope is `{"theta_result":{"v":1,"ok":0}}` and the re-read value
is `+0`; both legs validate `{"ok":true}`. Five things the residual does not say,
established here:

- **JSON is not the reason, and that separates this class from 0180's.**
  `JSON.parse("-0")`, `JSON.parse("{\"n\":-0}")` and `JSON.parse("[-0]")` all
  recover `-0`, and no `replacer` or `toJSON` can make `JSON.stringify` emit it
  (§Reproduction (b)). The residual describes `-0` as "a second JSON hole"; it is
  a hole in the serialiser, and the distinction is what makes §Fix (a) a candidate
  at all.
- **The sign is observable from theta code, which is what makes the loss a value
  defect rather than a representation curiosity.** `1 / (0 * -1)` is `-Infinity`
  where `1 / 0` is `Infinity` (§Reproduction (a)), and the caller's own `1 / z`
  after the bind is `Ok(-Infinity)` on the prompt leg against `Infinity` on the
  subagent leg (§Reproduction (d)).
- **The reachable spelling set.** The residual names `0 * -1`. Measured:
  `-1 * 0`, `0 / -1` and the literal `-0` also mint the value with `[]`
  diagnostics, and `0 - 0` / `0 * 1` are the `+0` controls.
- **The depth reach and the annotation reach.** The loss is measured at the root,
  at a schema field (`/n`) and at an array element, and under `number`,
  `integer` and `number | null` — every one of which admits both signs at the
  shipped AJV seam, so there is no loud arm anywhere in this class.
- **The corpus's five `-0` decisions and the one silence.** BNDR-4, BNDR-5,
  BNDR-6p, the two interpolation rows, `schema-subset.md:102` and
  `placeholder-rendering-a.md:79` all name the value and normalise it, every one
  at a rendering boundary; `runtime-value-model.md:8` and PIC-59 say nothing about
  it at the value boundary that erases it. `runtime-value-model.md:26` ties the
  equality refinement to "the `-0`→`0` normalisation the rendering pipeline
  applies", which is the nearest the corpus comes to a ruling and is scoped away
  from this boundary.

**Measured independently for this filing** by one scratch vitest probe (written,
run, deleted) plus one `node -e` measurement. The probe drove the real in-process
prompt→prompt attach cell end to end for §Reproduction (d)'s prompt rows and (d)'s
caller-side reciprocal, the real `driveSubagentRootRegime` child-side writer for
the subagent rows and §Reproduction (e), and the shipped
`serializeOkEnvelope` / `parseEnvelopeLine` / `mapNonRepresentableReturnValue` /
`lowerQueryResponseSchema` / `AjvSchemaValidator` / `evaluateSource` /
`valuesEqual` / `renderCanonicalNumber` / `stringifyInterpolatedValue` entry
points for (a), (b), (c) and (f). Every theta body is a pure tail expression or a
`match` over one, so zero model turns were spent. The working tree was clean at
HEAD when the probe ran, and the probe was deleted afterwards; `git status
--porcelain` is empty.

**Two committed witnesses were re-run unmodified** at this HEAD rather than
re-implemented: `tests/subagent-invoke-nonfinite-return-refusal.test.ts`
(`Tests 1 passed (1)`, 6.4 s, REAL spawned children with the three AGENTS.md
`#subagent-child-pins` its own harness sets) — which is where the parent's `+0`
bind is measured end to end — and
`tests/subagent-envelope-nonfinite-ok-refusal.test.ts` (`Tests 27 passed (27)`),
which is where the three `-0` fences live.

**Read from source rather than driven, and marked as such in the text.** Two
hops: the `tools:`-declared `.theta`-callable return surface, which crosses the
same child-side writer and hands its value to theta code (named in the shipped
registry row, `code-registry-runtime.md:32`) — no probe drove a `tools:` call
here; and the top-level `/name` dispatch of a `mode: subagent` theta, whose
envelope is written by the same arm (`production-theta-producer.ts:2261`) and
whose surfacing is bug 0180's own (v) flip class. Both are cited for reach, not
measured.

Every `src/`, `tests/`, spec, reference and bug-doc citation above was read at
HEAD `bf32ad03`; volatile positions in
`src/extension/production-theta-producer.ts` (6350 lines) are named by symbol
beside their line numbers, per
[0134](./0134-params-shift-induced-stale-citations.md)'s adjudication.
