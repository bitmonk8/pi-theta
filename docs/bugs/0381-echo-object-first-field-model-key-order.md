# Bug 0381 — The echo's object rule renders the binder model's first-emitted key, not the declared first field: `echoTypeFromValue` builds `EchoType.fields` from `Object.entries(value)` (model key order), so one theta and one bound value render `pet={red, …}` or `pet={Whiskers, …}` depending on the key order the binder model happened to emit, where the Echo policy pins "the first field listed in the declaring `schema` block's source order" and BNDR-6g/6j/6l are normative byte vectors

- **Status:** fixed (0.369.0).
- **Sev/Diff estimate:** S2/D2 — S2 because a user-visible system note renders
  the wrong field's value nondeterministically (the note is the operator's
  record of what was bound; a model-order flip silently swaps which value the
  hint shows), and BNDR-6 rows are normative reference renderings tests MUST
  reproduce — but the bound value itself is correct and the theta runs
  unaffected. D2 because the producer already holds the lowered `properties`
  record (declaration-ordered) at the derivation site and only consults it for
  type kinds; reordering `fields` by it is localised, but the inline-anonymous
  and discriminated-union arms need the same order source threaded.
- **Kind:** defect — implementation diverges from a normative rendering rule
  (`defaulting-system-note-echo.md:43`) and its BNDR-6 vectors. The divergence
  was named and left unfiled by bug 0092 §Non-goals.
- **Related:**
  - 0092 (fixed 0.211.0) — its §Non-goals states this exactly: "Not about the
    echo's field ORDER. `:43` requires the declaring schema block's source
    order and `echoTypeFromValue` supplies the value's own key insertion
    order, which for a binder-returned object is the model's key order. That
    divergence produces a wrong-but-rendered echo, not a crash, and is unfiled
    at this HEAD." This report is that filing.
  - 0120 (fixed 0.97.0) — settled declaration order for the *inbound rebuild*
    (`rebuildInbound`) on the typed-query/invoke path; the echo's
    `mergedArgs` come from the binder envelope + default fill and never pass
    through that rebuild, so 0120's fix does not reach this surface. Site
    disambiguation: 0120's fixed `rebuildInbound`
    (`src/runtime/wire-translation.ts:318`) has no caller on the binder-echo
    path (its only callers are `wire-translation.ts:293/:346/:420`); the echo
    reads `merged.args` straight from `#dispatchBinder`
    (`production-theta-producer.ts:1081`) into `#emitBinderEchoNote` (`:1099`)
    — this is not a fixed-in-flight overlap.
  - 0080 (fixed 0.70.0) — the outbound direction of the same ordering law
    (`keys()`/`values()` declaration-ordered).
- **Affected** (verified at `9474dfa8`, v0.347.0):
  - `src/extension/production-theta-producer.ts:6789–6829` —
    `echoTypeFromValue`. The object arm (`:6816–6828`) builds `fields` from
    `Object.entries(value)` — the JSON parse order of the binder model's
    `args`. The doc comment (`:6787`) asserts "insertion order (declaration
    order for a binder-returned object)", which is false: nothing orders a
    model-emitted JSON object by the schema. The lowered `properties` record —
    which *is* declaration-ordered — is in hand (`props`, `:6817–6821`) and is
    consulted only for per-field type kinds.
  - `src/render/argument-echo.ts:153–159, 159–186` — `renderObject` picks
    `fields[0]` and documents the order as "whatever the producer supplies …
    an open question this function does not settle
    (docs/bugs/0092-renderobject-first-field-unguarded-cast.md §Non-goals)".
  - `src/extension/production-theta-producer.ts:1126–1140` —
    `#emitBinderEchoNote` builds `EchoParam[]` off `mergedArgs` (binder args +
    fill-if-absent defaults) and renders.
- **Observed at:** v0.347.0 (`9474dfa8`). Offline, deterministic: scratch
  vitest driving the production `runBinder()` with a scripted `ok` envelope
  (the `tests/e2e-s5-binder-echo-emission.test.ts` rig), capturing the
  `theta-system-note`. Probe run and deleted.

## Reproduction

Offline at `9474dfa8`. Theta:

```
---
mode: prompt
bind_model: binder-model
params:
  pet: {name: string, color: string}
---
@`hi ${pet}`
```

The inline type's leftmost field is `name`, so the Echo policy's inline-object
clause (`defaulting-system-note-echo.md:43`: "the first field is the leftmost
field of the inline type expression as written in the theta source") and
BNDR-6j (`{ name: "Whiskers", color: "red" }` → `{Whiskers, …}`) pin the
rendering.

- Scripted envelope
  `{ kind: "ok", args: { pet: { color: "red", name: "Whiskers" } } }`
  (model emits `color` first) → captured note:
  `Running /probe: pet={red, …}`.
- Scripted envelope
  `{ kind: "ok", args: { pet: { name: "Whiskers", color: "red" } } }`
  (model emits `name` first) → captured note:
  `Running /probe: pet={Whiskers, …}`.

Same theta, same bound value (AJV-identical), two different user-facing notes;
the first contradicts the normative vector.

## Expected behaviour

`defaulting-system-note-echo.md:43`: "'First field' of an object value is the
first field listed in the declaring `schema` block's source order … For a
value whose static type is an [inline anonymous object] `{ field: T, ... }` …
the first field is the leftmost field of the inline type expression as written
in the theta source." BNDR-6g/6j/6l are "Reference renderings (normative;
conforming implementations MUST reproduce these exactly)". The rendering must
be `pet={Whiskers, …}` regardless of the model's key emission order.

## Actual behaviour / root cause

`echoTypeFromValue`'s object arm derives field order from
`Object.entries(value)` — for a binder-returned object, the model's JSON key
order, which JSON.parse preserves. The declaration-ordered lowered
`properties` record is available at the same site and unused for ordering.
`renderObject` then renders `fields[0]`. The doc comment's parenthetical
"(declaration order for a binder-returned object)" encodes the false
assumption.

## Why it matters

- The echo is the user's one-line record of what was bound; which field's
  value it shows is currently a coin-flip over model serialisation habits.
  Two runs of the same slash command can render different notes for identical
  bound values — nondeterministic user-visible bytes on a surface whose
  formatting rules exist to be deterministic ("two conformant implementations
  produce byte-identical strings").
- BNDR-6g/6j/6l are normative vectors; a conformance test driving the
  production echo with a color-first model reply fails today.
- 0092 explicitly deferred this with "A fix for this report must not silently
  adopt one order as if it settled that question" — the spec settles it; the
  implementation never followed.

## Non-goals

- The per-element array descriptor discipline and `renderObject` guards (0092,
  fixed).
- The value-side rendering rules (quote predicate, rule-1 pass — 0087, fixed).
- The inbound-rebuild ordering (0120, fixed; different surface).
- Field order in the lowered schema or on the wire — only the echo's
  first-field selection.

## Fix

Order `EchoType.fields` by the declaration-ordered source available at the
producer: the lowered `properties` record's own key order (it is built from
declaration order) for schema-typed and inline-object fields, with
`Object.entries(value)` retained only as the fallback when no `properties`
record is available (the descriptor-less recursion arms). Discriminated-union
variants need the variant's own source order per `:43`; the lowered `anyOf`
branch matching the value supplies it. Tests: the color-first reply must
render `{Whiskers, …}` (red direction proved by reverting the ordering), and
a value-key-order-equals-declaration-order control stays byte-identical.
Alternative — respecify the echo to value key order — is a GOV-7/GOV-8
breaking change to BNDR-6 and contradicts 0080/0120's settled
declaration-order law; not recommended.

## Provenance

Spec read: `binder/defaulting-system-note-echo.md:43` (object rule), BNDR-6
table rows 6g/6j/6l. Implementation read:
`src/extension/production-theta-producer.ts:6789–6829`, `:1126–1151`;
`src/render/argument-echo.ts:153–186`. Prior bugs read in full: 0092
(including §Non-goals and Fix record), 0080/0120 (headers + scope). Probe: one
scratch vitest over the production `runBinder()` with scripted envelopes in
both key orders, run at `9474dfa8`, deleted.

## Fix (0.369.0)

- What shipped:
  - `src/extension/production-theta-producer.ts` — `echoTypeFromValue` now orders
    `EchoType.fields` by declaration order (§Fix). The object arm reads the lowered
    `properties` key order, dereferencing `{"$ref":"#/$defs/<name>"}` into the params
    schema's `$defs` (bounded by `ECHO_REF_CHASE_LIMIT`) since every schema-typed /
    inline-object / union position lowers to a `$ref`; a discriminated-union position
    matches the value against the lowered `anyOf` arms in source order (key-set +
    `const` discriminator) and takes the matching variant's `properties`; the array arm
    dereferences its own `$ref` before reading `items` (so an alias-named `array<Cat>`
    element is ordered too). `Object.entries(value)` value order is retained only as the
    descriptor-less fallback. `#emitBinderEchoNote` threads the lowered schema's `$defs`.
  - `src/render/argument-echo.ts` — the `EchoType` / `EchoField` / `renderObject`
    doc-comments now state the producer supplies declaration order (was: the value's own
    key insertion order, "an open question 0092 §Non-goals"). No code change —
    `renderObject` still selects `fields[0]`.
  - `tests/b0381-echo-object-first-field-declaration-order.test.ts` (new) — offline
    production-producer witness: w1 inline object color-first → `pet={Whiskers, …}`,
    w2 name-first control (byte-identical across the fix), w3 schema-typed `Cat`, w4
    discriminated union → `pet={circle, …}`, w5 alias-named `array<Cat>` →
    `pets=[{Whiskers, …}]`, w6 nested object (BNDR-6l) → `owner={{Whiskers, …}, …}`.
  - `tests/echo-array-per-element-descriptor.test.ts` — cell a2 updated
    `items=[{x, …}, {square, …}]` → `items=[{circle, …}, {square, …}]`: a
    doc-enumerated flip (0381 §Fix discriminated-union clause; 0092's own a2 comment
    predicted `{circle, …}` verbatim; spec `:43`). 0092's per-element-descriptor
    primary assertion is unchanged.
- Gates: witness `npx vitest run tests/b0381-echo-object-first-field-declaration-order.test.ts`
  → 6/6 green; a revert-restore proves RED for the right reason (w1/w3/w4/w5 fall to the
  model's key order, w6 → `owner={L, …}`; w2 control green) then GREEN, the source
  restored byte-identical (`git hash-object` match). Full suite `npm test` → 531 files /
  10026 tests green. `npm run typecheck` clean. `npm run lint` clean. Live
  `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/echo-array-per-element-live-cell.test.ts`
  → green (real discovery→registration→binder→echo path; `items=[{x, …}, null] (default)`,
  exercising the `$ref`-deref + declaration-order object arm live).
- Review: 2 rounds. Round 1 (deep) — 3 correctness findings: F1 (array-alias `$ref` not
  dereferenced in the array arm), F2 (undiscriminated multi-object-arm union arm-match),
  F3 (canonical-index wire-name JS key reordering), plus residuals R1/R2/R3. Fixer landed
  F1 (deref the array arm + w5 witness), R1 (w6 BNDR-6l witness), R2 (own-key guard the
  `$defs` read), R3/F2/F3 (honest comment-scoping). Round 2 (fast) — CLEAN, no findings.
- Verification: SOLID. Witness reds on a scratch revert and greens on restore
  (byte-identical); full default suite green (10026); typecheck + lint clean; live echo
  cell green (run by the orchestrator between phases).
- Residuals:
  1. F2 — an undiscriminated union carrying ≥2 object arms (reachable only via a mixed
     union `A | B | string` or an inline object union, which `schemas.md` does not
     discriminator-gate) whose arms share a key set in different declared order: the echo's
     key-set + `const` match selects a DETERMINISTIC but possibly non-AJV-matching arm's
     order. Exotic / non-normative (no BNDR-6 vector); 0381's determinism thesis holds
     either way. Faithful fix: re-test each arm through the injected `SchemaValidator`
     (runtime-value-model.md §"Wire-name translation"). The `firstAdmittingArmProperties`
     comment scopes the claim honestly. Recommend a follow-up filing.
  2. F3 — a non-identifier wire name JS canonicalises (a numeric-string wire name, e.g.
     `field as "0"`) is reordered by `Object.keys(properties)` ahead of declaration order,
     so the echo's first-field selection can be wrong for that exotic class. Outside every
     BNDR-6 vector; determinism satisfied. Faithful fix: consult the step-5 `fieldOrder`
     sidecar (schema-subset.md map 4). The `declarationOrderedEchoFields` comment records
     the limitation. Recommend a follow-up filing.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: the value-side and per-element-array rules (0087 / 0091
  / 0092) and the inbound-rebuild ordering (0120) are unchanged; `renderObject` still
  selects `fields[0]` — only the producer's field ORDERING changed. The a2 update in
  0092's test file is a doc-enumerated consequence of this settled §Fix, not a
  re-litigation of 0092.
