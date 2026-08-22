# Bug 0092 — `renderObject` reads `value[first.name]` with no own-key guard and no record check, and its own descriptor producer manufactures the mismatch: one array element's shape decides the descriptor for every element, so a `Shape | null` or discriminated-union array aborts a successfully bound slash invocation with a `TypeError` out of the echo path

- **Status:** fixed (0.211.0). The constraint-pinned §Fix is settled and shipped;
  the record is `## Fix (0.211.0)` at the end of this document.
- **Kind:** defect — one unguarded read at the renderer, fed by one
  once-per-array descriptor derivation at the producer. Neither half is
  reachable alone: the renderer's read is total whenever the descriptor is
  derived from the value it renders, and the producer's array arm is harmless
  whenever every element has the same shape. Together they abort the
  invocation. The crash is out of the failure model: the bind has already
  succeeded (`src/extension/production-theta-producer.ts:845` runs the echo
  after the defaults merge and before `return { bound: true }`), the theta
  body never runs, and the user sees a `theta/runtime/internal-error` framing
  instead of the success echo.
- **Related:**
  - [0087](./0087-echo-note-newline-unsanitised.md) (fixed 0.56.0) — its
    §Fix (0.56.0) *Residuals* item (ii) records this read as pre-existing and
    untouched by that fix. 0087 changed the throw class and nothing else: the
    `string` arm now routes through `sanitizeSystemNoteSubstring`
    (`src/binder/system-note.ts:71`), so a missing string-typed first field
    fails on `.replace` (`:74`) where before 0087 it failed on `.length`.
  - [0031](./0031-ctor-field-value-typing-unchecked.md) (fixed 0.43.0) and
    [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md)
    (fixed 0.48.0) — the hazard class this read belongs to: a record keyed by
    author- or model-controlled strings, read without an own-key guard. 0038's
    remedy (null-prototype the record, guard the read) applies to the shape of
    the read here; it does not address the descriptor derivation that supplies
    the violating input, so a 0038-style edit alone leaves the defect standing
    in its `null`-element form.
  - [0066](./0066-ajv-verdict-discarded-unreachable-enforcement.md) (open) —
    adjacent on the same merged-args value, on the validation side. No
    interaction: both carriers below are AJV-clean against the lowered
    `params` schema, so restoring the discarded verdict does not gate them.
- **Affected** (citations verified at HEAD `1d26a86a`, 0.56.0):
  - **The read.** `renderObject` (`src/render/argument-echo.ts:141`) takes
    `first = fields[0]` (`:145`), guards only the empty-descriptor case
    (`:146–152`, a `RangeError`), then at `:153` evaluates
    `` `{${renderEchoValue(value[first.name] as ThetaValue, first.type)}, …}` ``.
    The read assumes two premises the signature does not enforce: that `value`
    is a non-null record, and that `first.name` is an own key of it. Neither
    is checked, and the `as ThetaValue` cast erases the `undefined` a missing
    key produces.
  - **The producer of the mismatch.** `echoTypeFromValue`
    (`src/extension/production-theta-producer.ts:5403`) is the only
    construction of an object `EchoType` in the tree (`:5440`; the
    `{ kind: "object" }` at `:5690` belongs to a different descriptor type).
    Its object arm derives `fields` from `Object.entries(value)` (`:5434`) —
    the value's own keys — so a descriptor derived from a value always
    matches that value. Its array arm (`:5416–5425`) derives ONE element
    descriptor from `value[0]` (`:5423`) and `EchoType`'s array arm carries
    one `element` for the whole array (`src/render/argument-echo.ts:49`), so
    `renderArray` (`:125–126`) applies element 0's descriptor to every
    element. That is the only place in the tree where a descriptor and the
    value it renders can disagree.
  - **The stale invariant.** `echoTypeFromValue`'s docstring
    (`src/extension/production-theta-producer.ts:5395–5396`) states the
    derivation is "VALUE-driven so it can never mismatch the value's runtime
    shape and crash the renderer". Its array arm defeats that property.
    `renderObject`'s docstring (`src/render/argument-echo.ts:137–138`) states
    the first field is "the leading entry of the declaring schema block's
    source order carried in the descriptor's `fields`"; at HEAD `fields`
    carries the value's own key insertion order, which for a binder-returned
    object is the model's key order.
  - **The own-key guard the same function already applies elsewhere.**
    `#emitBinderEchoNote` (`:860`) guards its `binderArgs` read with
    `Object.prototype.hasOwnProperty.call` at `:883`. The two adjacent record
    reads in the same expression — `properties?.[field.wireName]` (`:887`)
    and `props?.[name]` (`:5437`) — carry no such guard, and the lowered
    `properties` record is a plain `{}` (`src/parser/params.ts:275–278`).
  - **The escape route.** The throw leaves `runBinder` uncaught and is caught
    at the top-level slash dispatch (`await deps.runBinder(...)`,
    `src/extension/theta-composition-producer.ts:389`; the catch at `:443`),
    classified by `surfaceUnexpectedThrow`
    (`src/runtime/runtime-panics.ts:496`) at `:481`, and framed at `:492` as
    `theta /<name> aborted with internal error: <detail>`.
  - **The value carriers.** `mergedArgs` (`:844`) is the binder-supplied
    envelope `args`, fill-if-absent-merged with the declared defaults
    recovered by `#recoverDeclaredDefaults` (`:1188`). Both carry object and
    array values whose element shapes vary within one array.
- **Observed at:** 0.56.0 (`1d26a86a`), offline, deterministic,
  provider-free — `ProductionThetaProducer.runBinder()` with the off-session
  forced-tool `complete()` scripted, the harness of
  `tests/echo-value-rule1-sanitisation.test.ts:437–590`.
- **Scope:** the `theta-system-note` success-echo path only. The echo is the
  sole consumer of `EchoType` in the tree, so no other surface renders a
  descriptor that can disagree with its value.

## Summary

`renderObject` renders the §"Echo policy" object rule `{first-field-value, …}`
by reading `value[first.name]` off the runtime record. It does not test that
`value` is a record, and it does not test that `first.name` is an own key. The
value flowing in is the merged binder args — model- and author-controlled.

The mismatch is reachable because the sole descriptor producer derives one
element descriptor per array from element 0 and reuses it for every element.
An array whose element type admits more than one shape — `array<T | null>`, or
`array<X>` where `X` is a discriminated union — therefore renders element `i`
under element 0's descriptor. Both spellings lower to an `anyOf` items schema
and validate clean, so nothing upstream rejects them.

Two throws result, both escaping the echo path and aborting a slash invocation
whose bind already succeeded:

- `value` is `null` and the descriptor says object →
  `TypeError: Cannot read properties of null (reading '<field>')` at `:153`.
- `value` is a record lacking `first.name` → the cast passes `undefined` into
  `renderEchoValue`, and the `string` arm reaches
  `sanitizeSystemNoteSubstring` →
  `TypeError: Cannot read properties of undefined (reading 'replace')`.

Two further shapes do not throw and render text outside the BNDR-6 table: a
missing key under a numeric first-field type renders the literal `{undefined,
…}`, and an object element rendered under a `null` descriptor renders `null`.

The declared-default carrier puts all of this under author control with no
model in the loop.

## Reproduction

Offline, deterministic, provider-free. Reuses the group-G rig of
`tests/echo-value-rule1-sanitisation.test.ts` (`:437–590`): the real
`ProductionThetaProducer.runBinder()` with the off-session `complete()`
scripted to return a ToolCall carrying `{ envelope }`, a real
`AjvSchemaValidator` in the runtime root, and `pi.sendMessage` captured. The
runtime root needs a `fileSystem.readBytes` double returning the theta source
for the declared-default case, which `#recoverDeclaredDefaults` re-reads.

**Carrier 1 — declared default, no model in the loop.**

```
---
mode: prompt
bind_model: binder-model
params:
  topic: string
  items: 'array<Shape | null> = [Shape { label: "x" }, null]'
---
schema Shape { label: string }
@`x ${topic}`
```

Parses with zero diagnostics. `defaultedFields` is `["items"]`; the lowered
schema is
`{"type":"object","properties":{"topic":{"type":"string"},"items":{"type":"array","items":{"anyOf":[{"$ref":"#/$defs/Shape"},{"type":"null"}]}}},"required":["topic"],…}`.
Script `{ kind: "ok", args: { topic: "t" } }` and call `runBinder`. The
promise rejects:

```
TypeError: Cannot read properties of null (reading 'label')
```

Zero `theta-system-note` messages are delivered — the throw precedes
`pi.sendMessage` (`:894`).

**Carrier 2 — binder-supplied args, discriminated union.**

```
---
mode: prompt
bind_model: binder-model
params:
  items: array<Shape>
  topic: string
---
schema Circle { kind: "circle", label: string }
schema Square { kind: "square", size: integer }
schema Shape = Circle | Square
@`x ${topic}`
```

Script
`{ kind: "ok", args: { topic: "t", items: [{ label: "x", kind: "circle" }, { kind: "square", size: 2 }] } }`.
The envelope AJV-validates against the lowered schema (`Shape` lowers to
`{"anyOf":[{"$ref":"#/$defs/Circle"},{"$ref":"#/$defs/Square"}]}`). The
promise rejects:

```
TypeError: Cannot read properties of undefined (reading 'replace')
```

Element 0's own-key order puts `label` first, so the descriptor names `label`,
which `Square` does not carry.

**Observed rows, one run each at `1d26a86a`:**

| Input | Result |
| --- | --- |
| default `[Shape { label: "x" }, null]` | `TypeError … (reading 'label')`, 0 notes |
| union args, element 0 keyed `label, kind` | `TypeError … (reading 'replace')`, 0 notes |
| union args, element 0 keyed `kind, label` | bound; `Running /<name>: items=[{circle, …}, {square, …}], topic=t` |
| `array<Shape \| null>` args, `[null, {label:"x"}]` | bound; `Running /<name>: items=[null, null], topic=t` |
| `item: Shape` args `{}` | not bound; `theta /<name>: argument binding failed — could not parse arguments` (AJV rejects) |
| `item: Shape` args `{label:"x"}` | bound; `Running /<name>: item={x, …}, topic=t` |

Row 3 shows the crash is decided by the model's JSON key order in element 0.
Row 4 shows the same root cause in its silent form. Rows 5–6 show a
single-object param cannot reach either: every declared field is in `required`
and `additionalProperties` is `false`
(`docs/spec_topics/schema-subset.md:8`), so a record missing a declared key is
rejected before the echo. An array `anyOf` is the only admitted heterogeneity.

**Direct renderer rows** (`renderEchoValue` called with a hand-built
descriptor, no producer):

| Value, descriptor | Result |
| --- | --- |
| `{b:"y"}`, `object` with first field `a: string` | `TypeError … (reading 'replace')` |
| `null`, same descriptor | `TypeError … (reading 'a')` |
| `{b:1}`, `object` with first field `a: integer` | renders `{undefined, …}` |
| `{}`, `object` with `fields: []` | `RangeError` from `:149` |

## Expected behaviour

- `docs/spec_topics/binder/defaulting-system-note-echo.md:43` — "Object values
  shown as `{first-field-value, …}` — just the first field's value as a hint",
  and "'First field' of an object value is the first field listed in the
  declaring `schema` block's source order". For a discriminated union, "the
  variant's declared fields are used in the variant's own source order" — the
  variant is resolved per value, so an array of variants has one first-field
  answer per element, not one per array.
- `:42` — the array rule renders each element recursively, "a nested object
  element renders as `{first-field-value, …}`". Per element.
- `:28` — "When echo is on (and the bypass did not apply), the runtime appends
  a one-line system note to the user's session immediately before the theta
  starts." `:20` fixes its grammar as `Running /<name>: <formatted-args>`.
  Neither gives the echo a failure arm.
- `docs/spec_topics/binder/determinism-cancellation-failure.md:35` and `:52`
  enumerate the binder's terminating failure classes. A renderer throw at the
  echo step is in none of them.

Expected for carrier 1:
`Running /<name>: topic=t, items=[{x, …}, null] (default)` — the object element
by the object rule, the `null` element by the `null` rule. Expected for
carrier 2: `Running /<name>: items=[{circle, …}, {square, …}], topic=t` — each
variant's own source order, which puts `kind` first in both.

## Actual behaviour / root cause

`echoTypeFromValue` (`:5403`) is value-driven everywhere except its array arm.
The object arm builds `fields` from `Object.entries(value)` (`:5434`), so a
descriptor is always in step with the value it was derived from, and every
nested field recurses on its own value (`:5437`). The array arm breaks the
recursion's shape-per-value discipline:

```ts
const element =
  value.length > 0
    ? echoTypeFromValue(value[0] as ThetaValue, itemProp)
    : ({ kind: "string" } as EchoType);
return { kind: "array", element };
```

`EchoType`'s array arm holds one `element` (`src/render/argument-echo.ts:49`),
so `renderArray` (`:126`) has nothing else to render elements 1..n-1 with. For
a homogeneous array the reuse is invisible. For an `anyOf` items schema the
descriptor describes element 0 and misdescribes the rest.

`renderObject` then trusts the descriptor completely. `:153` dereferences
`value` without a record check and indexes it without an own-key guard, and
the `as ThetaValue` cast tells the type system the result is a value. The
failure surfaces one frame down, in whichever leaf the first field's declared
type selects: `renderString` → `sanitizeSystemNoteSubstring`
(`src/binder/system-note.ts:74`) throws on `.replace`; `renderCanonicalNumber`
returns the string `undefined`; the `boolean` arm returns `false`; the `array`
arm throws on `.map`; the `object` arm recurses and throws one level deeper.
Which of these fires is decided by the declared type of a field the value does
not have.

The `null` shape does not even reach a leaf: `null[first.name]` throws at
`:153` itself.

`#emitBinderEchoNote` is invoked at `:845`, after `#mergeDeclaredDefaults`
returns and before `runBinder` returns `{ bound: true, args: mergedArgs }`.
There is no try/catch between `:845` and the top-level dispatch, so the
`TypeError` propagates out of `runBinder` into the catch at
`src/extension/theta-composition-producer.ts:443`, is classified
`theta/runtime/internal-error` by `surfaceUnexpectedThrow` (`:481`), and is
framed at `:492`:

```
theta /<name> aborted with internal error: Cannot read properties of undefined (reading 'replace')
```

(The classification and the framing text are composed from those two lines and
a direct `surfaceUnexpectedThrow` call on the thrown `TypeError`; the
end-to-end `run()` dispatch was not driven.)

The empty-descriptor guard at `:146–152` states its premise as "An object
schema (or discriminated-union variant) always declares at least one field; an
empty descriptor is a caller-side construction bug." That premise is about the
declaring schema, and `schema X { }` is rejected at parse time
(`docs/spec_topics/schemas.md:19`). Under the value-driven derivation the
descriptor's emptiness tracks the VALUE's key count instead, so the guard's
stated reasoning no longer covers its own arm — though no probed input reaches
it, because a record with no keys fails AJV wherever an object schema is
declared.

## Why it matters

1. A successful bind is turned into an aborted invocation. The theta parses
   with zero diagnostics, the binder returns `ok`, AJV accepts the args, the
   defaults merge, and the note announcing the run aborts it. The body never
   executes.
2. Carrier 1 needs no model. The default literal is author-controlled, so the
   crash repeats on every invocation in which the binder omits `items` — the
   fill-if-absent arm the default exists for — with a message that names
   neither the theta's `params:` block nor the echo.
3. The user-visible surface is `theta/runtime/internal-error` carrying a
   V8 message. It names no source position in the theta, no field, and no
   spec rule; nothing in it points at the `params:` default or the array
   element that caused it.
4. Two rows of the same root cause emit no signal at all: `{undefined, …}`
   and an object element rendered `null` are outputs no BNDR-6 row admits,
   and both are delivered on the success channel as if conformant.
5. The read is the same hazard shape 0031 and 0038 closed — a record keyed by
   strings the author or the model chose, read without an own-key guard. The
   function that builds the descriptor already applies that guard to one of
   its three record reads (`src/extension/production-theta-producer.ts:883`)
   and not to the other two.

## Non-goals

- Not about the echo's field ORDER. `:43` requires the declaring schema
  block's source order and `echoTypeFromValue` supplies the value's own key
  insertion order, which for a binder-returned object is the model's key
  order. That divergence produces a wrong-but-rendered echo, not a crash, and
  is unfiled at this HEAD. A fix for this report must not silently adopt one
  order as if it settled that question.
- Not about the two unguarded reads of the lowered `properties` record
  (`:887`, `:5437`). Both fall back cleanly when the read answers a prototype
  member, because both test `typeof property === "object"` before indexing
  further. They belong to the 0031/0038 class and are recorded here as
  adjacent, not fixed here.
- Not about `renderString`'s rule-1 pass, the quote predicate, the escape set,
  the 120-scalar cap, the `(default)` tag, or the numeric rows — all settled
  by 0087 and pinned byte-exact by `tests/argument-echo.test.ts` and
  `tests/echo-value-rule1-sanitisation.test.ts`.
- Not about the AJV verdict 0066 reports discarded. Both carriers here are
  AJV-clean.

## Fix

Restore the per-value descriptor discipline `echoTypeFromValue` claims at
`:5395`, and stop `renderObject` from assuming what it can test.

**Producer.** `EchoType`'s array arm carries a per-element descriptor list in
element order rather than one `element` for the whole array
(`src/render/argument-echo.ts:49`). `echoTypeFromValue`'s array arm
(`:5416–5425`) maps every element through `echoTypeFromValue` with the same
`itemProp`, so each element is described by itself and an `anyOf` items schema
produces one descriptor per variant. `renderArray`
(`src/render/argument-echo.ts:125`) renders element `i` under descriptor `i`.

**Renderer.** `renderObject` (`:141`) tests both premises before `:153`:
`value` must be a non-null, non-array object, and `first.name` must satisfy
`Object.prototype.hasOwnProperty.call(value, first.name)`. A violation raises
the caller-side-construction-bug class the `:146–152` arm already uses, naming
the offending field and the value's own keys, so the descriptor/value
disagreement is reported where it originates instead of as a `.replace`
`TypeError` two frames away. With the producer edit in place no production
input reaches it; the guard exists so the next producer cannot reintroduce the
defect silently.

Constraints any fix must satisfy:

- Every BNDR-6 rendering is byte-identical for conforming input. The 26 pins
  in `tests/argument-echo.test.ts` and the 25 in
  `tests/echo-value-rule1-sanitisation.test.ts` stay green unchanged; the
  array rule still renders at most the first three elements and still computes
  `…+N more` as `total − 3` over the full length.
- An empty array keeps rendering `[]` without needing a synthetic element
  descriptor — the `{ kind: "string" }` placeholder at `:5424` exists only to
  satisfy the current single-`element` shape and goes away with it.
- The `integer` / `number` discriminator keeps coming from the lowered
  `properties` and never from runtime integrality
  (`loweredSchemaKindIsInteger`, `:5448`), for every element of an array.
- The echo must not be able to fail a bind that succeeded. After the fix, no
  binder-supplied or default-supplied `args` value that passes the envelope
  AJV validation may throw out of `#emitBinderEchoNote`.
- Field order is not changed by this fix (see §Non-goals).

Regression coverage: the two carriers above as offline rows through the
group-G rig, the `[null, {…}]` silent row, and the `{undefined, …}` numeric
row, each asserted on the delivered `theta-system-note` content rather than on
`runBinder` resolving.

## Fix (0.211.0)

- What shipped:
  - `src/render/argument-echo.ts` — `EchoType`'s array arm carries a
    per-element descriptor list (`elements`) in element order, replacing the
    single `element`; `renderArray` renders element `i` under descriptor `i`
    and raises the caller-side-construction-bug `RangeError` on a
    descriptor/element count mismatch; `renderObject` tests both premises
    before the first-field read — a non-null, non-array object, and
    `Object.prototype.hasOwnProperty.call(value, first.name)` — each violation
    raising that same class naming the field and the value's own keys; the
    `EchoType`, `EchoField`, `renderArray` and `renderObject` doc-comments
    corrected to what the descriptor actually carries, without settling the
    field-ORDER question (§Non-goals).
  - `src/extension/production-theta-producer.ts` — `echoTypeFromValue`'s array
    arm maps EVERY element through `echoTypeFromValue` with the same
    `itemProp`, so each element is described by itself and an `anyOf` items
    schema yields one descriptor per variant; the `{ kind: "string" }`
    empty-array placeholder is gone (an empty array yields `elements: []`),
    and the docstring's "VALUE-driven so it can never mismatch" claim is true
    again.
  - `tests/argument-echo.test.ts`, `tests/echo-value-rule1-sanitisation.test.ts`
    — eight array-descriptor literals converted mechanically from the
    `element:` spelling to `elements: [...]`, one descriptor per element of the
    value under test. No assertion, expected string, test name or comment
    claim changed; 26 + 25 pins green.
  - `tests/echo-array-per-element-descriptor.test.ts` (new) — the regression
    witness, 12 cells.
  - `tests/live/live-echo-array-.test.ts` (new) — the H8a live witness
    for the declared-default carrier.
- Gates: witness `npx vitest run tests/echo-array-per-element-descriptor.test.ts`
  → `Test Files 1 passed (1) / Tests 12 passed (12)` (8 of the 12 red before the
  fix); full default suite `npm test` →
  `Test Files 395 passed (395) / Tests 8193 passed (8193)`; `npm run typecheck`
  → clean (`tsc -p tsconfig.json --noEmit`, no output); `npm run lint` → clean
  (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`, no output).
- Review: 2 rounds. Round 1 (`bug-fix-reviewer`) — no correctness / fidelity /
  spec finding; two prose findings (a stale `renderArray` doc sentence; a false
  cast-concession comment in the new test) and two residuals (a dead cast at
  `renderEchoValue`'s object case; a fixture path `/theta/t.theta` surfacing to
  the closing-gate extractor as the pseudo-code `theta/t`), all four applied by
  `bug-fix-fixer-light`. Round 2 (`bug-fix-reviewer-fast`) — clean, one
  pre-existing prose residual (the `EchoField` doc-comments still claiming
  declaring-schema order), closed by a comment-only polish round; that polish
  was gate-diff verified (comment-only hunks, gates green) and its confirmation
  review round was skipped on that basis.
- Verification: PASS on all four obligations. (i) Witness reds for the right
  reason: with `src/render/argument-echo.ts` and
  `src/extension/production-theta-producer.ts` written back to HEAD content the
  witness runs `8 failed | 4 passed (12)` with the document's own signatures
  (`TypeError: Cannot read properties of null (reading 'label')`,
  `TypeError … (reading 'replace')`, the silent `items=[null, null]` note);
  restored byte-exactly (`git hash-object` equality against the pre-revert
  copies) and 12/12 green again. (ii) Full default suite green (above).
  (iii) Live: `tests/live/live-echo-array-.test.ts` drives the
  declared-default carrier through the shipped discovery→registration→binder→
  echo path and asserts the delivered `theta-system-note` carries
  `items=[{x, …}, null] (default)` with no abort framing — green with the fix,
  and proved red in the same lock-held run with the two source files reverted:
  `Notes: ["theta /b0092live aborted with internal error: Cannot read
  properties of null (reading 'label')"]`. (iv) Lint and typecheck clean.
- Residuals:
  1. Field ORDER is unchanged, per §Non-goals: the descriptor still carries the
     value's own key insertion order, so §"Expected behaviour"'s carrier-2 line
     `items=[{circle, …}, {square, …}]` is NOT what the fixed tree renders when
     element 0's own key order puts `label` first — it renders
     `items=[{x, …}, {square, …}]`. The crash is gone; which order the echo
     should use (`defaulting-system-note-echo.md:43` asks for the declaring
     schema block's source order) remains unfiled. Evidence: cell `a2` of
     `tests/echo-array-per-element-descriptor.test.ts`, and the corrected
     `renderObject` doc-comment, which records the divergence without settling
     it.
  2. The two unguarded reads of the lowered `properties` record
     (`#emitBinderEchoNote`'s `properties?.[field.wireName]` and
     `echoTypeFromValue`'s `props?.[name]`) are untouched, as §Non-goals
     directs; both still fall back cleanly through their
     `typeof property === "object"` test.
  3. The new `renderArray` count-mismatch arm and the two `renderObject`
     premise arms are unreachable from production input: `echoTypeFromValue`
     derives every descriptor from the value it renders in the same
     synchronous call. They are witnessed only by direct-renderer cells
     (`b1`–`b4`), which is the point — the guard exists so the next producer
     cannot reintroduce the defect silently.
  4. `EchoType`'s array arm is a breaking shape change for any caller
     constructing a descriptor by hand; the only such callers in the tree are
     the two pin files, converted here.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: field order (§Non-goals) stays unsettled;
  the 0031/0038-class `properties` reads stay out of scope; the BNDR-6 rows,
  rule-1 pass, quote predicate, 120-scalar cap and `(default)` tag settled by
  0087 are byte-unchanged.

## Provenance

- Spec: `docs/spec_topics/binder/defaulting-system-note-echo.md:20`, `:28`,
  `:42`, `:43`; `docs/spec_topics/schema-subset.md:8` (`required` lists every
  property, `additionalProperties: false` always emitted), `:12`
  (discriminated unions as `anyOf` of object schemas);
  `docs/spec_topics/schemas.md:19` (`theta/parse/empty-schema-body`);
  `docs/spec_topics/binder/determinism-cancellation-failure.md:35`, `:52`.
- Implementation: `src/render/argument-echo.ts:40–50`, `:125–132`, `:134–154`,
  `:163–187`; `src/extension/production-theta-producer.ts:845`, `:860–903`,
  `:1188`, `:5395–5441`, `:5448`; `src/binder/system-note.ts:71–88`;
  `src/parser/params.ts:275–285`;
  `src/extension/theta-composition-producer.ts:389`, `:443`, `:481`, `:492`;
  `src/runtime/runtime-panics.ts:496`.
- Origin: [0087](./0087-echo-note-newline-unsanitised.md) §Fix (0.56.0)
  *Residuals* item (ii), which records the read as pre-existing and untouched
  and leaves its reachability unsettled. This report settles it.
- Observations: two throwaway offline vitest probes at `1d26a86a` over the
  group-G harness shape of `tests/echo-value-rule1-sanitisation.test.ts`,
  deleted after the runs (the 0033/0087 precedent). Ten rows in the first
  (four direct-renderer, six through `runBinder`), two in the second (the
  declared-default carrier and the `surfaceUnexpectedThrow` classification).
- Existing reports read for duplicate separation: 0031, 0036, 0038, 0066,
  0087.
