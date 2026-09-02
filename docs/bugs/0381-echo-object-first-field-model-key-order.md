# Bug 0381 — The echo's object rule renders the binder model's first-emitted key, not the declared first field: `echoTypeFromValue` builds `EchoType.fields` from `Object.entries(value)` (model key order), so one theta and one bound value render `pet={red, …}` or `pet={Whiskers, …}` depending on the key order the binder model happened to emit, where the Echo policy pins "the first field listed in the declaring `schema` block's source order" and BNDR-6g/6j/6l are normative byte vectors

- **Status:** open.
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
