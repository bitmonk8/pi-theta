# Bug 0214 — Two record writes past bug 0210's scope still drop a `__proto__`-named `params:` field, newly reachable now that the lowered document compiles: `fillDefaultsAndRevalidate` fills the declared default into the prototype slot and reports the field as default-supplied anyway, so the fill-step report claims a value the merged args do not carry, and `inlineDefsRefs` drops the same own key out of the binder tool's model-facing schema one seam later, reinstating the `required`-names-what-`properties`-omits malformation bug 0210 removed

- **Status:** open. §Fix is constraint-pinned: the write idiom is settled
  (`defineRecordField`, `src/runtime/value.ts:596`, the helper 0119 exported and
  0210 applied at five sites), and the two open dispositions are named below —
  what the fill step reports when it cannot produce an own key, and whether the
  echo's read half is converted in the same change. No ordering dependency on
  [0212](./0212-ajv-drops-declared-proto-named-property.md); the two are
  independently fixable and independently witnessable, and a `__proto__`-named
  param binds end to end only when both land.
- **Sev/Diff estimate:** S1/D2 — a declared default is silently not applied
  while the fill step reports it as applied, and the binder tool's model-facing
  schema is emitted malformed, both on the binder arm of a parse-clean theta
  with no diagnostic on any channel; D2 because the two writes are one-line
  conversions to a landed idiom inside one subsystem (`src/binder/`), reachable
  from exported functions offline, with one report-shape disposition to settle.
- **Kind:** defect against
  `docs/spec_topics/binder/defaulting-system-note-echo.md:9` (fill-if-absent and
  the `(default)` tagging rule) and `docs/spec_topics/schema-subset.md:8`
  (`required` "must list *every* declared property"), plus a registry gap.
  `defaulting-system-note-echo.md:9` fixes the merged `args` and the echo's
  `(default)` tagging as identical across conforming implementations on
  identical binder responses: measured below, the merged args do not carry the
  filled field while `defaultedWireNames` names it. `schema-subset.md:8` is
  breached by the document `buildBinderCompleteCall` puts on the wire, whose
  `required` names `__proto__` and whose `properties` omits it — the exact
  malformation 0210 removed at the lowering, re-created one seam later. No
  registry row fires for either: the field-name position's only case rule,
  `theta/parse/binding-case-mismatch`
  (`docs/spec_topics/diagnostics/code-registry-parse.md:19`), admits any name
  starting with a lowercase letter or `_`, so `__proto__` is admitted by rule.
- **Related:**
  - [0210](./0210-remaining-record-writes-reach-the-prototype-slot.md) —
    **fixed (0.136.0)**, the filing origin and the reason these two sites are
    reachable. Its §Fix (0.136.0) *Residuals* items 2 and 3 name both sites and
    record them measured but unconverted ("converting it is an executable
    behaviour change at an unnamed file, so it was refused rather than
    self-authorized"). Pre-fix, both paths died earlier on
    `AjvSchemaValidator.compile` throwing `schema is invalid:
    data/properties/type must be object,boolean`; post-fix the document compiles,
    the surviving key reaches these two writes, and each drops it silently. This
    report re-measures both from the shipped exports and adds the downstream
    observable (the success echo).
  - [0119](./0119-proto-named-field-silently-dropped.md) — **fixed (0.132.0)**,
    which exported `defineRecordField` (`src/runtime/value.ts:596`) and settled
    the route: a declared field named `__proto__` survives rather than being
    refused. That idiom is the write half of this fix; no field-name refusal is
    proposed here.
  - [0212](./0212-ajv-drops-declared-proto-named-property.md) — **open**, 0210's
    residual 1: AJV's generated validator mishandles the same declared property
    name in both directions. Disjoint subject — that report is about the
    third-party validator's verdicts on a conformant document, this one is about
    two of our own writes dropping the key. It interacts once: the post-merge
    validation verdict quoted below is AJV's, so a witness here must assert the
    *args* and the *report*, not the verdict.
  - [0031](./0031-ctor-field-value-typing-unchecked.md) — **fixed (0.43.0)**,
    [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md) —
    **fixed (0.48.0)** and
    [0173](./0173-inbound-rebuild-record-not-null-prototyped.md) — **fixed
    (0.96.0)**, the null-prototype-with-own-key-guards family. All three hold
    author-controlled names in `Object.create(null)` records or guard reads with
    own-key tests; the two sites here are the same input class with neither
    defence applied.
- **Affected** (every citation verified at HEAD `689fc630`, 0.137.0; `src/` is
  byte-identical to `cea6665f`, 0.136.0, where the measurements were taken):
  - `src/binder/defaulting.ts:136` — **site (1)**, inside
    `fillDefaultsAndRevalidate` (declared `:124`): `merged[field.wireName] =
    field.defaultValue`, an assignment keyed by the author's wire name into the
    plain record `merged` built at `:133` by spread. `:137` then pushes the same
    name onto `defaultedWireNames` unconditionally, which is what turns the drop
    into a false report. The depth walk at `:146` and the AJV re-validation at
    `:158` both run over the record the assignment failed to extend.
  - `src/binder/binder-inference.ts:266` — **site (2)**, inside `inlineDefsRefs`
    (declared `:226`): `copy[key] = inlineDefsRefs(value, defs, expansionPath,
    survivingRefs)`, the same idiom over `copy` (`:259`) keyed by every key of
    the walked document — including a `properties` table's field names. Reached
    in production from `binderToolParametersSchema` (`:153`, its call at `:162`)
    through the exported `buildBinderCompleteCall` (`:374`), whose
    `Type.Unsafe<unknown>(…)` wrap at `:382` is where the replaced prototype is
    discarded (measured below), leaving the model-facing table with the field
    gone and `required` still naming it.
  - `src/extension/production-theta-producer.ts:1001` — **site (3)**, the read
    half in `#emitBinderEchoNote` (declared `:984`): `const value =
    (mergedArgs[field.wireName] ?? null) as ThetaValue` is a prototype-chain
    read, so for an absent `__proto__` field it answers `Object.prototype`
    instead of taking the `?? null` arm. `:1011`'s
    `properties?.[field.wireName]` is the same shape but reads the lowered
    properties table, which carries the own key post-0210, so that read is
    correct today.
  - `src/extension/production-theta-producer.ts:1318` — the production call of
    `fillDefaultsAndRevalidate`, inside `#mergeDeclaredDefaults` (`:1294`);
    `:1317` compiles the validator it passes; `:966` emits the success echo from
    `merged.args` and `merged.defaultedWireNames`; `:1162` is the production call
    of `buildBinderCompleteCall`.
  - `src/binder/binder-envelope.ts:137` — `relaxParamsSchema`, the seam
    immediately before site (2). It copies by rest-destructuring and spread
    (`:144`, `:152`), both of which *define* rather than assign, so the own
    `__proto__` key survives it (measured); it is the control that localises the
    drop to `inlineDefsRefs`.
  - `src/runtime/value.ts:596` — `defineRecordField`, the landed write idiom.
  - `src/render/argument-echo.ts:196` — `renderArgumentEcho`; `:149` — the
    `RangeError` an empty-field object descriptor raises, the throw the dropped
    field's downstream read produces.
  - `docs/spec_topics/binder/defaulting-system-note-echo.md:9` — fill-if-absent
    and the `(default)` tagging rule; `:5` — the
    `#post-default-merge-ajv-validation` anchor;
    `docs/spec_topics/schema-subset.md:8`, `:78` — the object emission form;
    `docs/spec_topics/diagnostics/code-registry-parse.md:19` —
    `theta/parse/binding-case-mismatch`, the only case rule on the field-name
    and param-name positions.
  - `tests/proto-named-record-write-sites.test.ts` — 0210's 17-cell offline
    witness. Its header states its five sites explicitly and asserts nothing
    about `src/binder/defaulting.ts` or `src/binder/binder-inference.ts`, so no
    existing cell contradicts this report.
  - **Test coverage of these three sites: none.** No cell in the default suite
    drives a defaulted `__proto__`-named param through
    `fillDefaultsAndRevalidate`, or a `__proto__`-named param through
    `buildBinderCompleteCall`.
- **Observed at:** `0.137.0` (HEAD `689fc630`; `src/` unmoved from `cea6665f`,
  0.136.0). Offline, deterministic; no live model, no provider. Scratch vitest
  under a gitignored directory with its own config, driving the shipped
  `parseParams`, `AjvSchemaValidator`, `classifyBinderBypass`,
  `fillDefaultsAndRevalidate`, `buildBinderEnvelopeSchema`,
  `buildBinderCompleteCall`, `renderArgumentEcho` and `typebox`'s `Type.Unsafe`.
  Written, run, deleted.

## Summary

Bug 0210 made `parseParams` emit a properties table that carries an own
`__proto__` key, so the document compiles and the binder arm now runs where it
previously died on the compile throw. Two writes downstream drop that key again.

**Site (1) — the fill step drops the default and reports it as supplied.**
`fillDefaultsAndRevalidate` fills absent defaults with `merged[field.wireName] =
field.defaultValue` (`defaulting.ts:136`). For `wireName === "__proto__"` the
assignment hits the inherited accessor: a primitive default is discarded, an
object default replaces `merged`'s prototype. Either way `merged` gains no own
key, and `:137` pushes the name onto `defaultedWireNames` regardless. Measured:
for `params: { a: string, __proto__: string = "x" }` and binder args
`{"a":"1"}`, the returned `args` are `{"a":"1"}` with own `__proto__` false,
while the report is `defaultedWireNames: ["__proto__"]`, `validation:
{"ok":true}`, `classification: {"kind":"ok"}` — a clean bind that claims a
default it did not apply. With an object-valued default the merged record's
prototype becomes the default value, and the post-merge validation then reds
with `additionalProperty: "i"`, naming a key the author never wrote.

**Site (2) — the binder tool's model-facing schema loses the field.**
`inlineDefsRefs` rebuilds every walked node with `copy[key] = …`
(`binder-inference.ts:266`). The envelope's relaxed `args` table still carries
the own key on entry (`relaxParamsSchema` copies by spread, which defines);
after the walk and the `Type.Unsafe` wrap the model-facing table is
`{"type":"object","properties":{"a":{"type":"string"}},"required":["a","__proto__"],"additionalProperties":false}`
— `required` naming a property `properties` omits, under `additionalProperties:
false`, which is exactly the malformation 0210's §Fix removed at the lowering.
The document is unsatisfiable as written, and it is what the provider is asked
to produce a tool call against.

**Site (3) — the echo's read half turns site (1)'s silence into a throw.**
`#emitBinderEchoNote` reads each field as `mergedArgs[field.wireName] ?? null`
(`production-theta-producer.ts:1001`), a prototype-chain read that answers
`Object.prototype` for the dropped field. `Object.prototype` has no own
enumerable keys, so the value-driven type derivation yields an object descriptor
with zero fields and `renderArgumentEcho` raises `RangeError: renderObject:
object EchoType carries no fields; the object rule needs a first field`
(`argument-echo.ts:149`). With `bind_echo: false` the read is never taken and
the drop stays silent.

The three sites are one family: an assignment or a prototype-chain read keyed by
an author-controlled name over a plain object, the same idiom 0119 and 0210
converted at eleven sites.

## Reproduction

Offline, at `689fc630`. Scratch vitest. Every `@@` block is the probe's output
verbatim.

### Reach — the fixture is parse-clean and takes the binder arm

```theta
---
mode: prompt
params:
  a: string
  __proto__: string = "x"
---
@`hi`
```

```
@@ R1 parse diagnostics :: []
@@ R1 params fields :: [{"wireName":"a","type":"string","hasDefault":false,"nullable":false},{"wireName":"__proto__","type":"string","hasDefault":true,"defaultSource":"\"x\"","nullable":false}]
@@ R1 loweredSchema :: {"type":"object","properties":{"a":{"type":"string"},"__proto__":{"type":"string"}},"required":["a"],"additionalProperties":false}
@@ R1 defaultedFields :: ["__proto__"]
@@ R1 classifyBinderBypass :: {"kind":"binder"}
```

Two fields, so no bypass: the binder arm compiles this document
(`production-theta-producer.ts:1317`) and reaches
`fillDefaultsAndRevalidate` (`:1318`). `required` omits `__proto__` because the
field is defaulted (`params.ts`'s `defaultSource` gate), so the document is
satisfiable and the compile succeeds.

### Site (1) — the fill step, through the shipped export

`fillDefaultsAndRevalidate({ binderArgs: {a:"1"}, defaults:
[{wireName:"__proto__", defaultValue:"x"}], validator })`, the validator
compiled by `AjvSchemaValidator` from the document above:

```
@@ P2 lowered bytes :: {"type":"object","properties":{"a":{"type":"string"},"__proto__":{"type":"string"}},"required":["a"],"additionalProperties":false}
@@ P2 IN  binderArgs :: {"a":"1"}
@@ P2 OUT args own keys :: ["a"]
@@ P2 OUT args own __proto__ :: false
@@ P2 OUT args JSON :: {"a":"1"}
@@ P2 OUT args prototype :: Object.prototype
@@ P2 REPORT defaultedWireNames :: ["__proto__"]
@@ P2 REPORT validation :: {"ok":true}
@@ P2 REPORT classification :: {"kind":"ok"}
```

What arrives: `{"a":"1"}` plus one declared default. What leaves: `{"a":"1"}`.
What the report claims: the field took its declared default, the merged args
validate, the bind is `ok`.

An object-valued default, same call shape:

```
@@ P2b lowered bytes :: {"type":"object","properties":{"a":{"type":"string"},"__proto__":{"$ref":"#/$defs/__inline_4cc9b813434a088c"}},"required":["a"],"additionalProperties":false,"$defs":{"__inline_4cc9b813434a088c":{"type":"object","properties":{"i":{"type":"integer"}},"required":["i"],"additionalProperties":false}}}
@@ P2b OUT args own keys :: ["a"]
@@ P2b OUT args prototype :: {"i":1}
@@ P2b '"i" in args' :: true
@@ P2b OUT args JSON :: {"a":"1"}
@@ P2b REPORT defaultedWireNames :: ["__proto__"]
@@ P2b REPORT validation :: {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/additionalProperties","keyword":"additionalProperties","message":"must NOT have additional properties","params":{"additionalProperty":"i"}}]}
```

The default value became the merged record's prototype, `"i" in args` is `true`
for a key no schema declares, and the post-merge validation reds naming `i`.

The control, an ordinary defaulted field name through the same call:

```
@@ P2c control OUT args :: {"a":"1","p":"x"} defaulted :: ["p"] validation :: {"ok":true}
```

### Site (2) — the binder tool's parameters, through the shipped export

`parseParams` for `{ a: string, __proto__: string }` (no default, so both names
are `required`), then `buildBinderEnvelopeSchema`, then
`buildBinderCompleteCall`:

```
@@ P3 lowered params bytes :: {"type":"object","properties":{"a":{"type":"string"},"__proto__":{"type":"string"}},"required":["a","__proto__"],"additionalProperties":false}
@@ P3 envelope ok-arm args own keys of properties :: ["a","__proto__"]
@@ P3 envelope relaxed args own __proto__ :: true
@@ P3 envelope relaxed args bytes :: {"type":"object","properties":{"a":{"type":"string"},"__proto__":{"type":"string"}},"required":["a","__proto__"],"additionalProperties":false}
@@ P3 attached args properties own keys :: ["a"]
@@ P3 attached args own __proto__ :: false
@@ P3 attached args prototype :: Object.prototype
@@ P3 attached args required :: ["a","__proto__"]
@@ P3 attached args bytes :: {"type":"object","properties":{"a":{"type":"string"}},"required":["a","__proto__"],"additionalProperties":false}
```

What arrives at the walk: a table with the own key. What leaves: a table without
it, with `required` unchanged. `relaxParamsSchema` is the control — its spread
copy preserves the key, so the drop is `inlineDefsRefs`'s assignment.

The assignment replaces the copy's prototype with the lowered node; that
replacement does not survive the `Type.Unsafe` wrap, which walks own keys:

```
@@ T pre own :: ["a"] protoIsObjectPrototype :: false
@@ T post own :: ["a"] protoIsObjectPrototype :: true sameIdentity :: false
```

So the model-facing document carries neither the field nor any trace of it
beyond the stale `required` entry.

### Site (3) — what the success echo does with the dropped field

The two production lines are reproduced statement-for-statement
(`production-theta-producer.ts:1001` and the object arm of the value-driven
`echoTypeFromValue` at `:5961`, neither of which is exported) around the shipped
`renderArgumentEcho`:

```
@@ R2 mergedArgs["__proto__"] typeof :: object
@@ R2 is Object.prototype :: true
@@ R2 renderArgumentEcho :: THREW RangeError: renderObject: object EchoType carries no fields; the object rule needs a first field
```

The echo runs unless `bind_echo:` is `false`
(`production-theta-producer.ts:990`), on the success path after the bind is
classified `ok`, so the throw lands where the theta would otherwise start.

## Expected behaviour

- **Site (1).** The merged `args` carry the filled field as an own property, so
  `Object.keys(args)` is `["a","__proto__"]`, `JSON.stringify(args)` is
  `{"a":"1","__proto__":"x"}`, and the record's prototype is `Object.prototype`
  for a primitive default and for an object default alike. `defaultedWireNames`
  reports the fields the step actually filled — no report claims a fill that did
  not happen (the same discipline `#emitBinderEchoNote:1002–1006` already
  states for the recovery arms). The control's behaviour (`@@ P2c`) is the shape
  the `__proto__` row must take.
- **Site (2).** The model-facing document is the relaxed table verbatim except
  for the inlining: own keys `["a","__proto__"]`, `required` `["a","__proto__"]`,
  `properties` and `required` in agreement, per `schema-subset.md:8`.
- **Site (3).** The echo reads each field by own key, so an absent field takes
  the `?? null` arm and renders `null` rather than materialising
  `Object.prototype`; `renderArgumentEcho` does not throw on any bind the
  classifier called `ok`.

## Actual behaviour / root cause

Measured above. `__proto__` is not an ordinary string key on a plain object: it
is an accessor inherited from `Object.prototype`, so `record["__proto__"] =
value` invokes the setter (a no-op for a primitive, a prototype replacement for
an object) and never creates an own property, and `record["__proto__"]` answers
the prototype rather than a missing own key. Both writes in `src/binder/` use
that idiom over a key space the author controls:

- `defaulting.ts:136` assigns; `:137` records the intent unconditionally, so the
  report and the record disagree with no code path able to notice.
- `binder-inference.ts:266` assigns inside a copy walk that is otherwise
  faithful, so one key of one table is lost between two conformant documents.
- `production-theta-producer.ts:1001` reads through the prototype chain, so a
  key absent from the merged args yields an object where the code's own
  fallback (`?? null`) is written for absence.

Neither site is defended by an `Object.create(null)` carrier, and neither read is
own-key guarded — the two defences bugs 0031, 0038 and 0173 landed elsewhere for
the same input class.

## Why it matters

The binder arm is the ordinary path for any theta with more than one `params:`
field, and the name is admitted by rule
(`code-registry-parse.md:19`), so all three are reachable from parse-clean
source with no diagnostic:

- A declared default is not applied while the runtime's own fill-step report
  says it was. Everything downstream of that report is misinformed: the
  `(default)` tagging in the success echo
  (`defaulting-system-note-echo.md:9`), and the merged `args` the body binds
  from, which lack a field the author declared a value for. Where the echo is on,
  the misinformation escalates into a `RangeError` on the success path; where it
  is off, the theta runs with the field unbound and nothing is said.
- The binder is asked to satisfy an unsatisfiable schema: `required` names a
  property `properties` does not declare, under `additionalProperties: false`.
  Provider-side behaviour on that document is not measured here; the document is
  malformed against `schema-subset.md:8` whatever the provider does, and the
  binder arm's retry budget (ceiling #3) is what absorbs the consequences.
- 0210's fix removed exactly this malformation at the lowering. Leaving site (2)
  unconverted means the malformation is still on the wire for the binder tool,
  so the corpus-level claim that the emission is conformant holds only up to the
  attachment.

## Fix

Constraint-pinned; two dispositions are left to the run.

**The write idiom is settled.** `defineRecordField` (`src/runtime/value.ts:596`)
is the landed helper for a record write keyed by an author-controlled name; 0119
exported it and 0210 applied it at five sites, adjudicating against a
null-prototype carrier on the grounds that the emitted bytes and every
prototype-sensitive reader must be unmoved. Both writes here take it directly:
`defaulting.ts:136` and `binder-inference.ts:266`. No new helper, no
`Object.create(null)`, no registry work — no route below mints a code or widens
a *Trigger*, so DIAG-2
(`docs/spec_topics/diagnostics/diagnostic-shape.md:72`) is not engaged.

**Constraints.**

1. Byte-invariance for every input that declares no such name. The lowered
   `params:` document's bytes feed the schema-slug cache's byte comparison
   (`src/seams/schema-validator.ts:123`), and the binder tool's parameters are
   compared byte-exactly by existing witnesses; `defineRecordField` over a plain
   record stringifies identically to an assignment for every ordinary key
   (measured in 0210's route adjudication).
2. `required` is not touched. It is correct at both sites under
   `schema-subset.md:8`; it is the `properties`-side write that must change.
3. No field-name refusal, per 0119's settled route.
4. The post-merge AJV verdict is not this report's subject. Once site (1) puts
   the own key into the merged args, the validator refuses that payload for
   [0212](./0212-ajv-drops-declared-proto-named-property.md)'s reason
   (`additionalProperties`), which is a loud registered failure rather than a
   silent wrong bind. A witness here must assert the merged `args` and the fill
   step's report, not the verdict, or it will red on 0212's fix.

**Open dispositions.**

- *What the fill step reports when it cannot fill.* Converting the write makes
  the fill succeed, so `defaultedWireNames` becomes true by construction — but
  the class of report-without-effect is what made the defect silent, and the
  file's own discipline for the recovery arms is the opposite
  (`production-theta-producer.ts:1002–1006`: a field the step could not recover
  a value for is absent from `defaultedWireNames` "rather than claiming a fill
  that did not happen"). Decide whether `:137` becomes conditional on the write
  having taken effect, or whether the conversion alone discharges it.
- *Whether site (3) is converted in the same change.* The read at
  `production-theta-producer.ts:1001` is a prototype-chain read independent of
  site (1): with site (1) fixed it answers correctly for this input, but it still
  answers `Object.prototype` for any wire name that names an
  `Object.prototype` member and is absent from the merged args (the shape 0210's
  site (b) fixed in the respond wire with
  `Object.prototype.hasOwnProperty.call`). Decide whether it lands here or is
  filed separately; if it lands here, the echo's throw is the witness cell.

**Ordering.** Sites (1) and (2) are independent of each other and of 0212;
either may land alone, and each has its own offline red. Site (3)'s observable
depends on site (1) being unfixed, so a change that lands (1) without (3) must
red (3) on a different absent-member name, not on `__proto__`.

**Witness.** One offline file, cells per site, each able to red on its own site
alone: `fillDefaultsAndRevalidate` through the shipped export for a primitive
and an object default, asserting the merged args' own keys and the report
together, with an ordinary-name control; `buildBinderCompleteCall` through the
shipped export, asserting the model-facing `args` table's own keys, its
`required`, and its bytes, with an ordinary-name control asserting today's bytes
exactly; and the echo read, if site (3) lands here.
`tests/proto-named-record-write-sites.test.ts` (0210's 17 cells) asserts nothing
about these files and must stay byte-unmoved and green.

## Provenance

Filed against HEAD `689fc630` (0.137.0; `src/` byte-identical to `cea6665f`,
0.136.0) from bug 0210's §Fix (0.136.0) *Residuals* items 2 and 3, which name
both sites, record the round-1 reviewer's measurements, and state that
converting them was refused as an unauthorized scope widening. Both were
re-located by symbol and re-measured here through the shipped exports —
`fillDefaultsAndRevalidate` for site (1), `buildBinderEnvelopeSchema` +
`buildBinderCompleteCall` for site (2) — rather than by re-quoting the residual;
`relaxParamsSchema`'s spread copy was measured as the control that localises
site (2)'s drop, and the `Type.Unsafe` wrap was measured to establish where the
replaced prototype is discarded. Site (3) and the object-valued-default
measurement are new here and are named by no report. Site (3)'s two production
lines are not exported (`#emitBinderEchoNote` and `echoTypeFromValue` are
private), so they are reproduced statement-for-statement around the shipped
`renderArgumentEcho`, the same method 0210 used for its two child-spawning
loops. Scratch vitest under a gitignored directory, deleted after the run;
`src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
unmodified by this filing.
