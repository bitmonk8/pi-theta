# Bug 0079 — `theta/parse/interpolated-result` has no emitter: a `Result`-valued `${…}` renders the interpreter-private `{"ok":…,"value":…}` encoding into the prompt text sent to the model

- **Status:** open.
- **Kind:** defect. QRY-18 prescribes a static parse rejection for a
  `Result`-typed interpolation and a runtime panic carrying the same code when
  the type is statically unresolvable. Neither fires at any input: the code is
  registered, its renderer arm exists, and no production caller can select it.
  The value instead takes the `object` arm and serialises the `Result` brand's
  carrier shape.
- **Related:**
  - [0027](../../../docs/bugs/0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md)
    (fixed 0.39.0) closed the *receiver-dispatch* leak of the same encoding
    (`r.ok` readable outside `match` / `?`). It gated enum and `Result`
    receivers at the four runtime **read** entry points. The interpolation
    **render** path is a fifth site with its own mechanism
    (`interpolationTypeOf` classifying by JS `typeof`), was not in 0027's fix
    set, and is unfixed at this HEAD. Same encoding, different escape hatch.
  - [0036](../../../docs/bugs/0036-missing-object-key-bare-key-rendering.md)
    (fixed 0.41.0) has the same shape at the diagnostics layer: a conformant
    renderer in-tree, pinned green by a unit test, with no production caller.
    Here the unit test is `tests/query-render.test.ts:176`.
  - [0019](../../../docs/bugs/0019-question-operand-bypasses-result-normalisation.md)
    (fixed 0.31.0) is the sibling "`Result`-shaped static gate is partial"
    finding on the `?` operand; this report is the same class on the QRY-18
    render, and neither gate covers the other's position.
- **Affected** (citations verified at HEAD `d06daae3`):
  - `interpolationTypeOf` (`src/extension/production-theta-producer.ts:5668`)
    — the sole production derivation of the QRY-18 `InterpolationType`. Its
    seven arms end at `return { kind: "object" }` (`:5690`); there is no
    `result` arm. Its own docstring (`:5661–5667`) records the choice: "a
    `Result` is rendered as compact JSON via the `object` arm, preserving the
    prior non-crashing render (the static `result`-rejection arm is a
    parse-time concern, not reachable on this runtime render path)".
  - `stringifyInterpolation` (`:5570`) reads that discriminator at `:5578` and
    routes the `object` arm through `translateInterpolationOutbound` +
    `JSON.stringify` (`:5580–5587`). Its comment at `:5589–5591` states the
    `ok: false` branch is unreachable: "`stringifyInterpolatedValue` only
    reports `ok: false` for the static `result` arm, which
    `interpolationTypeOf` never selects".
  - `stringifyInterpolatedValue`'s conformant `case "result"`
    (`src/render/query-render.ts:410`) returns the registered diagnostic. The
    arm is reachable only from a caller that supplies
    `{ kind: "result" }` (`:356`).
  - The other production caller cannot supply it either: `toInterpolationType`
    (`src/parser/system-interpolation.ts:390`) has no `result` arm, correctly —
    `params:` types never include `Result` (`:385–387`, `:449–451`).
  - `grep -rn "interpolated-result" src/` at this HEAD returns one hit outside
    `query-render.ts`: the comment at `system-interpolation.ts:450` saying the
    code cannot arise there. No emitter exists.
  - The only in-tree exercise is a direct seam call:
    `tests/query-render.test.ts:176` passes `{ kind: "result" }` by hand and
    asserts the diagnostic, so the registry row is pinned green by a test no
    production input can reach.
- **Observed at:** 0.52.0 (`d06daae3`), offline, through the production
  composition (`createProductionProducerDeps` → `bindPromptConversation` →
  `executeBody`, the `tests/conformance/production-conformance.test.ts` drive
  harness) with the rendered user turn captured at `pi.sendUserMessage`.

## Summary

QRY-18 gives `Result<T, E>` one disposition in the interpolation table: parse
error `theta/parse/interpolated-result`. The implementation classifies the
interpolated value by its JS runtime shape, and a `Result` — a
`{ ok, value | error }` object carrying a non-enumerable symbol brand — falls
into the `object` arm. `JSON.stringify` then emits the brand's carrier shape.
The author gets no diagnostic at load and no panic at run; the model receives
`{"ok":true,"value":1}` where the spec says the theta must not have loaded.

## Reproduction

Offline, through the production composition. Drive theta source, capture the
text handed to `pi.sendUserMessage`:

```theta
---
mode: prompt
---
let r = Ok(1)
@`x${r}`
```

Observed:

- `parseThetaDocument(...).diagnostics` is `[]` — no diagnostic of any
  severity.
- The rendered user turn is exactly `x{"ok":true,"value":1}`.

Two further inputs, same harness, same outcome:

| Source | Rendered turn |
| --- | --- |
| `schema E { m: string }` / `let r = Err(E { m: "boom" })` / ``@`x${r}` `` | `x{"ok":false,"error":{"m":"boom"}}` |
| `fn mk(): Result<integer, QueryError> { Ok(1) }` / `let r = mk()` / ``@`x${r}` `` | `x{"ok":true,"value":1}` |

The third row is the case QRY-18's own note (`:32`) singles out as one the
static rejection must catch — "fires even when the `Result`-valued expression
sits behind a function call whose return type the parser can resolve". The
return annotation `Result<integer, QueryError>` is written out and still draws
nothing.

Probe: a throwaway vitest file reusing the conformance drive harness, with
`ctx.sessionManager` stubbed to an empty entry list and `pi.sendUserMessage`
recording its argument then throwing (PIC-50 maps the sync throw to a
`TransportError`, so the drive settles instead of hanging).

## Expected behaviour

- `docs/spec_topics/query/query-escapes-stringification.md:28` — the QRY-18
  table's last row: "`Result<T, E>` | parse error
  `theta/parse/interpolated-result` — *"`Result` value cannot be interpolated;
  unwrap with `?` or `match` first"*".
- `:32` — "The `Result` rejection is **static**, resolved from the expression's
  type, and fires even when the `Result`-valued expression sits behind a
  function call whose return type the parser can resolve. When the type is
  unresolvable (e.g. an inferred binding that widens past the parser's view),
  the runtime renderer falls back to a panic carrying the same
  `theta/parse/interpolated-result` diagnostic code".
- `docs/spec_topics/diagnostics/code-registry-parse.md:72` registers the row
  with Trigger "`${expr}` interpolation whose `expr` has Theta static type
  `Result<T, E>` (the runtime renderer raises the same code as a panic when the
  type is statically unresolvable)"; `docs/reference/diagnostics.md:121`
  mirrors it.
- `docs/spec_topics/runtime-value-model.md`, `Result` row: "Theta code observes
  `Result` only through `Ok` / `Err` constructors, `match` patterns, and `?`;
  the in-memory shape is not part of the language surface. … a `Result` value
  never crosses the wire". The reference-encoding paragraph names
  `{ ok: true, value: T }` / `{ ok: false, error: E }` as an implementation
  detail that "may change without a spec revision".

## Actual behaviour / root cause

`interpolationTypeOf` (`production-theta-producer.ts:5668`) is a runtime-shape
classifier, not a static-type read. It tests `typeof value === "string"`,
`"number"`, `"boolean"`, `value === null`, `isEnumValue`, `Array.isArray`, and
falls through to `{ kind: "object" }` at `:5690`. `isResultValue` is never
consulted, and no `{ kind: "result" }` is ever constructed on any production
path. `stringifyInterpolation` then routes the value through
`translateInterpolationOutbound` (`:5606`) — which, for a `Result`, resolves no
declaring schema and recurses with keys unchanged (`:5629–5645`) — and
`JSON.stringify`s the result, emitting the brand's carrier keys `ok` /
`value` / `error`.

Because the classification is by runtime shape, the *static* half of QRY-18 is
absent as well: no parse pass inspects the interpolated expression's Theta type
for `Result`-ness at all, so the statically-resolvable case (`let r = Ok(1)`,
and the annotated-`fn`-return case) draws nothing either. The registered code
therefore has no emitter anywhere in `src/`.

## Why it matters

1. The prompt sent to the model is silently wrong. An author writing
   ``@`Fix this: ${result}` `` intends the payload; the model receives a JSON
   object whose keys are interpreter bookkeeping. Nothing in the transcript,
   the diagnostics, or the runtime event channel says so.
2. It re-exposes the encoding runtime-value-model.md declares unreachable and
   free to change. `{ok,value}` is the same shape bugs 0017, 0019 and 0027 were
   each filed to keep out of author- and model-visible positions; it is now
   reachable from one character of ordinary source.
3. `theta/parse/interpolated-result` is a registered closed-registry row with
   an unsatisfiable Trigger — the same defect class as bug 0050
   (`fn-arg-type-mismatch`), and one the `tests/e2e-s4-*` never-emitted-
   diagnostic campaign exists to prevent.

## Non-goals

- Not a proposal to render `Result` usefully (e.g. as its payload). QRY-18
  fixes the disposition as a rejection; changing that is a spec edit under
  GOV-30, not a bug fix.
- Not about the enum, array, object, or numeric rows of the QRY-18 table; those
  were probed at this HEAD and render conformantly (`-0` → `0`, `1e21`
  fixed-point, `NaN` / `Infinity` verbatim, enum bare wire value, outbound
  wire-name renames applied).
- Not about the `system:` interpolation surface, which cannot carry a `Result`
  by construction.

## Fix

Two halves, both required by QRY-18's "static where possible, runtime where
not" posture.

**(a) Static gate.** Add a type-layer check over each `${…}` interpolation's
inferred expression type: a type of the form `Result<…>` is
`theta/parse/interpolated-result` at the interpolation's range. The inference
pass already types `Ok(…)` / `Err(…)` / an annotated `fn` return / a `@`-query,
so all three reproduction rows are statically reachable. Placement alongside
the existing per-expression walks in `src/parser/type-layer-checks.ts` keeps
one emission site.

**(b) Runtime fallback.** In `interpolationTypeOf`, test `isResultValue`
*before* the `object` fall-through and return `{ kind: "result" }`; in
`stringifyInterpolation`, turn the existing dead `ok: false` branch into a
thrown panic carrying the registered code and message, so the statically
unresolvable case (an interpolation over a laundered binding) matches the
prescribed panic rather than the current JSON render. The panic must land on
the closed runtime-panic routing already used by
`MissingObjectKeyPanic`/`NullMemberAccessPanic` so QRY-21 (panics during
interpolation are not caught by `let _ =`) continues to hold.

Recommendation: land (b) first — it is three lines, closes the wire leak
immediately, and is independent — then (a), which upgrades the disposition from
runtime panic to load refusal for the cases the parser can see. Landing (a)
alone leaves the leak open for unresolvable types; landing (b) alone leaves the
spec's "static" claim false but no longer harmful.

Constraint any fix must satisfy: the `object` arm must keep classifying an
ordinary user/model object that happens to carry a boolean `ok` field as an
object (bug 0017). Testing `isResultValue` (the non-enumerable symbol brand)
rather than key presence preserves that.

## Provenance

- Spec: `docs/spec_topics/query/query-escapes-stringification.md` (QRY-18,
  `:16`, `:28`, `:32`); `docs/spec_topics/runtime-value-model.md` (`Result`
  row, reference-encoding paragraph);
  `docs/spec_topics/diagnostics/code-registry-parse.md:72`;
  `docs/reference/diagnostics.md:121`.
- Implementation: `src/extension/production-theta-producer.ts:5544`,
  `:5570–5593`, `:5606–5645`, `:5661–5690`; `src/render/query-render.ts:79`,
  `:340–420`; `src/parser/system-interpolation.ts:384–410`, `:444–452`.
- Existing reports read in full for duplicate separation: 0017, 0019, 0020,
  0027, 0036, 0050.
- Observations: throwaway vitest probe over the production composition drive at
  `d06daae3`, deleted after the run.
