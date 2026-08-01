# Bug 0036 — `MissingObjectKeyPanic` interpolates `<key>` bare-always, so `o["my-key"]` renders `missing object key: my-key` where §5's own normative vector pins `missing object key: "my-key"`; the conformant category-5 renderer exists in-tree, is pinned green by unit tests, and has no production caller

- **Status:** fixed (0.41.0). §Fix as settled — the one emission site routed
  through the existing category-5 renderer; no spec amendment, no registry
  edit. See §Fix (0.41.0) below.
- **Kind:** defect — the implementation diverges from a pinned normative
  rendering rule at its one emission site. Not a spec gap: the §5 `<key>`
  rule, its runtime identifier-shape predicate, and its two test vectors —
  which name this exact template — are complete and mutually consistent, and
  the in-tree renderer implements them correctly. The emission site bypasses
  the renderer.
- **Related:** bug
  [0032](./0032-absent-member-binds-undefined.md) — its settled §Fix widens
  the same `missing object key: <key>` template from indexed access to member
  access through a shared presence gate, so the rendering correction must
  live in the path both spellings share; whichever report lands second
  rebases onto one interpolation point. Bug
  [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md) —
  no interaction: its `theta/runtime/non-object-receiver` row pins its own
  bare-always index rendering and states it is deliberately **not**
  category 5; that contrast is coherent only if category 5 quotes, which is
  one more witness for the rule this report enforces. The false "matching the
  `<key>` convention" parity claim its fix originally drafted is what
  surfaced this divergence (review round 1 of commit `5f0ca9cd`), and its
  §Fix (0.39.0) residual (iii) records it as unfiled.
- **Affected** (citations at HEAD `1b20c75e`, 0.40.0):
  - The one emission site: `evaluateIndexAccess`
    (`src/runtime/runtime-panics.ts:223`) — the presence test at `:269` and
    the throw at `:270`,
    `` throw new MissingObjectKeyPanic(`missing object key: ${key}`) `` —
    interpolates the raw key with no identifier-shape test and no quoting.
    Both hosts route indexed access through this one function
    (`src/runtime/statement-executor.ts` and
    `src/extension/production-theta-producer.ts` call sites), so the defect
    and its fix have one definition point.
  - The conformant renderer, unused: `renderSourceDerived`
    (`src/diagnostics/placeholder.ts:182`), whose `key` arm (`:191–197`)
    returns the text bare when `isIdentifierShaped` (`:216`,
    `^[A-Za-z_][A-Za-z0-9_]*$`) and `JSON.stringify`-quoted otherwise —
    byte-exactly the §5 rule, pinned green by
    `tests/placeholder-rendering.test.ts:123–124` with the spec's own
    `my-key` / `kind` vectors. Production callers outside `placeholder.ts`:
    zero (grep at HEAD).
  - The registry surfaces the site must satisfy:
    `docs/spec_topics/diagnostics/code-registry-runtime.md:17` (the
    `theta/runtime/missing-object-key` row, Message
    `missing object key: <key>`),
    `docs/spec_topics/errors-and-results/error-model.md:76` (the normative
    panic-message paragraph), `:84` (the template summary row), and the
    reference mirrors `docs/reference/errors-and-results.md:88/:110`.
  - Not affected: identifier-shaped keys — the two rules agree and render
    bare (`missing object key: kind`, `missing object key: definitely_absent`),
    which is why every existing message assertion in the suite is green under
    both rules; the panic's code, severity, class and bypass semantics; and
    bug 0027's `non-object-receiver` row, which owns a different rendering
    rule on a different code.
- **Observed at:** `0.40.0` (HEAD `1b20c75e`). Offline and deterministic; no
  live model.

## Fix (0.41.0)

The settled §Fix, implemented as written. Line anchors are at the fix commit.

**One emission site routed through the existing renderer**
(`src/runtime/runtime-panics.ts:270`). The `MissingObjectKeyPanic` message is
now built with the category-5 renderer —
`` `missing object key: ${renderSourceDerived({ kind: "key", text: key })}` ``
— with `renderSourceDerived` imported beside the `renderInteger` import the
module already carried. One line plus an import; both hosts
(`statement-executor.ts:704`, `production-theta-producer.ts:5749`) share the
site, so the wire behaviour has one definition point. A non-identifier-shaped
key now renders quoted (`o["my-key"]` → `missing object key: "my-key"`,
`o["25"]` → `missing object key: "25"` — the stringly-`"25"`/numeric-`25`
distinction is live); identifier-shaped keys are byte-unchanged, including
reserved-keyword collisions (`o["match"]` → bare, the `:129` carve-out).

**No spec amendment, no registry edit.** §5 stands as written; the
`theta/runtime/missing-object-key` row's code, severity, phase and Message
cell are untouched; `tests/fixtures/h7a/permitted-codes.json` unchanged
(no new code, H9a unaffected) — the GOV-15 standing recorded below.

**Reproduction re-derived at the fix baseline** (`442db300`, 0.40.0): all
five §Reproduction observables byte-identical to the recorded table before
the fix; X1/X3 now emit `missing object key: "my-key"`, X2 and every
identifier-shaped key unchanged.

**Offline lock.** `tests/missing-object-key-rendering.test.ts` (7 tests,
offline, deterministic): (a) executor-route pair through the production
binding (`parseThetaDocument` → `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody`) — `o["my-key"]` pinned to the
byte-exact quoted message, `o["kind"]` and `o["definitely_absent"]` pinned
bare (over-correction controls); (b) the same pair directly at
`evaluateIndexAccess`, so the throw site stays pinned even if the executor
route later gains layers; (c) a DIAG-4 drift guard asserting the registry
row's Message cell is still `missing object key: <key>`. Panic class,
`isThetaPanic`, and code are asserted ahead of every message line, so the
only red axis is the byte shape. The renderer-side vector pins
(`tests/placeholder-rendering.test.ts:123–124`) stay as the unit-level lock,
now connected to production. Verified in both directions: neutralising the
rendering back to raw interpolation reds exactly a1/b1 with the
quoted-vs-bare signature (`expected 'missing object key: my-key' to be
'missing object key: "my-key"'`), byte-exact restore greens 7/7. Full
default gate 232 files / 2792 tests green; typecheck and lint clean. Live:
H8a `tests/live/live-production-acceptance.test.ts` 7/7 green.

**Coordination with bug 0032.** Unchanged posture: `evaluateMemberAccess`
is untouched and the rendering lives at the single interpolation point both
spellings will share; 0032's presence gate rebases onto it, so `o.absent`
and `o["absent"]` will render identically when it lands.

**Residuals.** None. Bug 0027 §Fix (0.39.0) residual (iii) — this exact
divergence, then unfiled — is discharged by this fix.

## Summary

Placeholder-rendering §5 defines `<key>` as quoted-when-not-identifier-shaped
and spells out this exact template in its two test vectors: a missing
`obj["my-key"]` renders `missing object key: "my-key"`, a missing
`obj["kind"]` renders `missing object key: kind`. error-model.md makes the
templates normative — "a conformant runtime MUST emit the registered string
(with template placeholders filled from the offending value) … interpolated
by the per-category rules", and "conformance tests MAY assert on the exact
string."

The panic site does not implement the rule. `evaluateIndexAccess` builds the
message with a raw template-literal interpolation, so every key renders bare:
`o["my-key"]` on an object lacking that key emits
`missing object key: my-key`. The renderer that does implement the rule —
`renderSourceDerived`'s `key` arm, complete with the §5 predicate and the
reserved-keyword nuance — sits in `src/diagnostics/placeholder.ts`, passes
the spec's own vectors in its unit tests, and is called by nothing in
production. The suite therefore affirms the rule at the unit level while the
wire behaviour diverges from it, which is how the divergence stayed invisible
until bug 0027's fix review tried to cite the row as a bare-rendering
precedent and found the citation false.

The blast radius is the message string's byte shape for non-identifier-shaped
keys, nothing else. The index spelling `o["my-key"]` is not an exotic input:
it is the only spelling for keys that are not identifier-shaped (member
access cannot name them), which is exactly why §5's vector uses one.

## Reproduction

Offline, at HEAD `1b20c75e`, via a scratch vitest (written, run, deleted per
scratch policy): probes X1/X2 drive the production executor
(`parseThetaDocument` → `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody`) on a parse-clean prompt-mode
source; X3–X5 call the two functions directly. Fixture:
`schema F { x: integer }` / `let o = F { x: 1 }`. Verbatim output:

```text
X1 o["my-key"] (executor)  :: THREW MissingObjectKeyPanic: missing object key: my-key | isThetaPanic=true code=theta/runtime/missing-object-key
X2 o["kind"]   (executor)  :: THREW MissingObjectKeyPanic: missing object key: kind   | isThetaPanic=true code=theta/runtime/missing-object-key
X3 evaluateIndexAccess({a:1},"my-key") :: THREW MissingObjectKeyPanic: missing object key: my-key
X4 renderSourceDerived({kind:"key",text:"my-key"}) :: "my-key"
X5 renderSourceDerived({kind:"key",text:"kind"})   :: kind
```

Reading the table:

- **X1 is the defect.** The §5 vector for this input pins
  `missing object key: "my-key"`; the emission renders the key bare. X3
  shows the divergence is the throw site itself, not anything executor-level.
- **X2 is the agreement case.** An identifier-shaped key renders bare under
  both the rule and the implementation — the common case, and the reason no
  existing test reds.
- **X4/X5 are the conformant renderer, in the same tree.** It disagrees with
  the emission site on X1's input and agrees on X2's — byte-exactly the §5
  vectors, already pinned by `tests/placeholder-rendering.test.ts:123–124`.
- X1 is parse-clean by construction: the static object-index check
  (`checkObjectIndex`, `src/runtime/stdlib-object.ts`) requires only that the
  index be a `string`.

## Expected behaviour (what the spec says)

- `docs/spec_topics/diagnostics/placeholder-rendering-b.md:11` — the §5
  `<key>` rule: "quoted with double quotes only when the key string is *not*
  identifier-shaped per Lexical — Identifiers (i.e. would not match
  `[A-Za-z_][A-Za-z0-9_]*`); otherwise rendered bare. The identifier-shape
  predicate is a runtime check on the key string, not a parse-time grammar
  production."
- `:19–20` — the two test vectors, naming this template: "A `match` on
  `obj["my-key"]` against a missing key renders
  `missing object key: "my-key"` (key is not identifier-shaped, so quoted)"
  and "A member access `obj["kind"]` on a missing key renders
  `missing object key: kind` (key is identifier-shaped, so bare)."
  The `:20` quotation above is the page's text as this report read it and is
  retained verbatim as a dated record. Its "A member access" label was the
  defect of bug
  [0037](./0037-placeholder-vector-mislabels-bracket-indexing-as-member-access.md),
  discharged by its fix (0.47.0): the sentence now reads "An indexed access",
  the name `expressions.md:10` gives the bracket spelling both vectors quote.
  Only the label moved — the byte strings this report pins are unchanged.
- `:129` — the predicate restated as a normative edge case, with the
  reserved-keyword carve-out ("a key like `kind` renders bare, `my-key`
  renders quoted").
- `docs/spec_topics/errors-and-results/error-model.md:76` — "The templates
  are normative: a conformant runtime MUST emit the registered string (with
  template placeholders filled from the offending value) for every panic of
  that source, and conformance tests MAY assert on the exact string. The
  `<…>` placeholders inside each template are interpolated by the
  per-category rules in Diagnostics — Placeholder rendering."
- Post-fix observables: X1 and X3 emit `missing object key: "my-key"`; X2
  and every identifier-shaped key are byte-unchanged; the panic's code,
  severity, class, and `?`/`match` bypass are untouched.

## Actual behaviour / root cause

One line. `runtime-panics.ts:270` interpolates the raw key —
`` `missing object key: ${key}` `` — where the registered template's `<key>`
slot demands the category-5 rendering. The renderer implementing that
rendering (`renderSourceDerived`, `key` arm) exists in the module the
diagnostics layer owns for exactly this purpose, is exercised by the spec's
own vectors in unit tests, and has no production call site: the emission
layer and the rendering layer were never connected on this code. The panic
site predates the placeholder-rendering module's category-5 work, and nothing
— no shared constant, no build-time check, no test above the unit level —
ties the emitted string to the rule, so the two drifted without a red.

## Why it matters

- **A normative MUST is violated deterministically on a parse-clean input.**
  error-model.md:76 licenses conformance tests to assert the exact string; a
  test asserting §5's own published vector reds against the shipped runtime.
- **The suite's green is misleading at exactly this seam.**
  `tests/placeholder-rendering.test.ts` pins the vectors against the
  renderer, so the rule reads as implemented-and-locked; no test drives the
  vector through the emission site, which is the only place the rule is
  live. The divergence class — emission site bypasses the rendering layer —
  is invisible to unit coverage by construction.
- **The quoting carries information.** Bare rendering collapses
  distinguishable keys: a string key `"25"` renders `missing object key: 25`,
  indistinguishable from a numeric rendering; a key with trailing whitespace
  renders as its trimmed lookalike. The §5/`<observed>` machinery quotes
  precisely to keep a stringly `"25"` distinct from the number `25`
  (`placeholder-rendering-b.md:90`) — the same rationale applies to the key
  an operator greps for after a panic.
- **Non-identifier keys are the index spelling's home ground.** Ingress
  objects (tool returns, query payloads) carry hyphenated and dotted keys,
  and `o[k]` is the only read that can name them; expressions.md:10 sends
  authors to exactly this surface.
- **The scope is honestly small.** Message byte-shape for non-identifier
  keys, one emission site, no code/severity/class change, and the common
  identifier-shaped case is unaffected — which is also why the defect is
  cheap to fix and cheap to lock.

## Fix

**Route the one emission site through the existing renderer.** At
`src/runtime/runtime-panics.ts:270`, build the message with the category-5
renderer instead of raw interpolation:
`` `missing object key: ${renderSourceDerived({ kind: "key", text: key })}` ``
(import from `../diagnostics/placeholder`, beside the `renderInteger` import
the module already carries). One line plus an import; both hosts share the
site, so there is no lockstep obligation. `renderSourceDerived` is pure and
already tested against the spec vectors, including the reserved-keyword edge
(`placeholder.ts:216` docstring).

**Do not amend §5 to bare-always.** The rule text, the `:129` predicate
restatement, the two vectors, the green unit pins, and bug 0027's
deliberately-not-category-5 contrast on the adjacent row all pin quoting;
legitimising the one-line divergence would be a five-surface spec rewrite
that also destroys the `"25"`-vs-`25` distinction the category exists to
draw.

**Coordinate with bug 0032.** Its settled §Fix widens this same template to
member access through a presence gate shared with the index path. The
rendering belongs in that shared path so `o.absent` and `o["absent"]` render
identically; whichever report lands second rebases onto the single
interpolation point (the same one-guard-chain posture 0032 already records
for its overlap with 0027).

**GOV-15 standing.** The change is to the message byte-shape for
non-identifier-shaped keys only. The current string was never conformant —
error-model.md:76 is a MUST and §5 is the rule it points at — so the
equivalence promise is not engaged; no registry edit occurs (code, severity,
phase and the `missing object key: <key>` Message cell are all unchanged;
the template always carried §5 semantics). H9a is untouched: no new code,
`tests/fixtures/h7a/permitted-codes.json` unchanged.

**Test witness — offline unit test, no live test.** Extend the suite at both
levels the defect spans: (1) an executor-level probe (the
`tests/non-object-receiver-gate.test.ts` harness pattern) asserting
`o["my-key"]` panics with the byte-exact quoted message
`missing object key: "my-key"` and `o["kind"]` with the bare
`missing object key: kind`; (2) a direct `evaluateIndexAccess` unit for the
same pair, so the emission site is pinned even if the executor route later
gains layers. Keep `tests/placeholder-rendering.test.ts:123–124` as the
renderer-side pin. Existing assertions on identifier-shaped keys
(`missing object key: definitely_absent`) stay green in both directions.

## Provenance

- Origin: review round 1 of the bug 0027 fix (commit `5f0ca9cd`, 0.39.0) —
  finding F3's side observation, recorded in
  [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md)
  §Fix (0.39.0) residual (iii) as a pre-existing spec/impl disagreement,
  unfiled at that fix's commit time. The 0027 row's draft had cited this row
  as a bare-rendering precedent; verifying that claim against §5 exposed the
  divergence.
- Spec: `docs/spec_topics/diagnostics/placeholder-rendering-b.md:11` (§5
  `<key>` rule), `:19–20` (the two vectors naming this template), `:90` (the
  `<observed>` quoting rationale), `:129` (the runtime predicate and
  reserved-keyword edge);
  `docs/spec_topics/errors-and-results/error-model.md:76` (normative
  templates, per-category interpolation, exact-string conformance licence),
  `:71/:84` (the panic bullet and template row);
  `docs/spec_topics/diagnostics/code-registry-runtime.md:17` (the registry
  row); `docs/reference/errors-and-results.md:88/:110` (mirrors);
  `docs/spec_topics/expressions.md:10` (indexed access over theta-side
  names — the absent-key panic and the surface non-identifier keys live on).
- Implementation evidence at `1b20c75e`:
  `src/runtime/runtime-panics.ts:223` (`evaluateIndexAccess`), `:269`
  (presence test), `:270` (the bare interpolation);
  `src/diagnostics/placeholder.ts:182` (`renderSourceDerived`), `:191–197`
  (`key` arm), `:216` (`isIdentifierShaped`);
  `tests/placeholder-rendering.test.ts:110/:123–124` (the renderer-side
  vector pins); zero `renderSourceDerived` callers outside `placeholder.ts`
  (grep).
- Reproduction: scratch vitest at HEAD per §Reproduction — two
  executor-level probes and three direct calls, output quoted verbatim
  above, then deleted per scratch policy.
