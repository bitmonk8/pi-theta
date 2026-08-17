# Bug 0174 — A typed `invoke<T>` of a `mode: prompt` callee fails return-validation for every named-enum position: `makeEnumValue` builds a boxed `String`, and on the in-process prompt→prompt cell that value reaches AJV still boxed (`typeof` `"object"`), so `{"type":"string","enum":[…]}` refuses it and the caller gets `Err(InvokeInfraError { cause: "return_validation" })` — where the byte-identical callee body as `mode: subagent` crosses a `JSON.stringify` envelope, arrives as a JSON primitive, and returns `Ok`

- **Status:** fixed (0.98.0). §Fix (0.98.0) below records what shipped. §Fix
  was constraint-pinned rather than settled — three candidate normalisation
  points with their measured blast radii, and the ordering constraint every
  route carries against the bug 0067 fix — and the fix run selected **§Fix
  (b)** on measurement: routes (a) and (c) were each driven and rejected, and
  the record below states the measurement that decided each. The fix site is
  `#validateInvokeReturn` — the method
  [0067](./0067-subagent-envelope-drops-enum-tag.md) landed in at 0.90.0 — so
  the route rebased onto that fix's hunks and left its post-AJV ordering intact
  (§Fix (d)(1)).
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)
  landed first, at 0.97.0, and is disjoint on the measured observable: 0172
  owned the inbound boundaries that never call `translateInbound`; this report
  owned the one boundary that does call it, on the cell where AJV refuses before
  the call is reached. This fix rebased onto 0172's hunks in that method (the
  re-signatured `#validateInvokeReturn`, the `InvokeReturnTyping` three-arm
  discriminator and `#resolveReturnSite`); 0172 face 2 remains open and
  untouched.
- **Sev/Diff estimate:** S2/D3 — S2 because the input is refused **loudly**, not
  silently mis-valued: a legal program the spec sanctions in one sentence
  (`invocation.md:36` — "A `prompt`-mode child attaches to the caller's current
  conversation, but the final value still propagates through the same return
  surface") cannot execute, and the caller observes
  `Err(InvokeInfraError { cause: "return_validation" })` with
  `message: "invoke<Sev> return value failed validation"` and `DIAGS=[]` (four
  measured cells, §Reproduction (a)). No value is corrupted and no comparison
  silently flips, which is what keeps it out of the S1 band. D3 because §Fix
  needs in-run adjudication: the remedy is confined to one method, but *where*
  the representation is normalised — unbox at the invoke boundary, validate
  against a wire-form projection, or teach the `AjvSchemaValidator` seam —
  decides whether the change is local, whether it re-enters 0067's fixed
  post-AJV ordering, and whether it moves verdicts at every other AJV boundary
  in the runtime; and the identity question it raises (does the caller receive
  the callee's own in-process object or a round-tripped copy?) touches
  [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md)'s
  undecided rebuild posture.
- **Kind:** defect — a callee's `mode:` frontmatter changes whether a typed
  `invoke<T>` return validates, which the spec fixes as mode-invariant and which
  the fix site's own doc-comment asserts it cannot. Four elements, each measured
  at HEAD `e18b30e5`.
  1. *The enum representation is a boxed `String`.* `makeEnumValue`
     (`src/runtime/value.ts:135`) returns `new String(wire)` (`:136`) carrying
     the module-private `ENUM_TAG` symbol (`:56`) installed non-enumerable
     (`:137–142`). Measured: `typeof makeEnumValue("Sev","high")` is `"object"`;
     `JSON.stringify` of it is `"high"`. The boxing is the reference encoding
     `runtime-value-model.md:16` names non-normatively ("a non-enumerable symbol
     property on the JS string wrapper") and `src/runtime/value.ts:127` states in
     the code.
  2. *AJV refuses it, at the fragment a named `enum` actually lowers to.*
     `#validateInvokeReturn` (`src/extension/production-theta-producer.ts:3436`)
     lowers the annotation (`:3454`), compiles it through the production
     `AjvSchemaValidator` (`:3462`, `src/seams/schema-validator.ts:104`) and
     calls `validator.validate(result.value as unknown)` (`:3463`) on the value
     as it stands. `enum Sev { High = "high", Low = "low" }` lowers to
     `{"type":"string","enum":["high","low"]}` (measured; committed as a
     lowering row at `tests/literal-union-string-enum-emission.test.ts:94`), and
     that fragment refuses the boxed value with two errors —
     `must be string` (`schemaPath` `#/type`) and
     `must be equal to one of the allowed values` (`#/enum`). The failure arm
     mints `InvokeInfraError { cause: "return_validation" }` (`:3480–3486`).
  3. *The subagent leg never meets the boxed value.* A subagent-mode callee
     serialises its final value into the PIC-59 envelope in the child process —
     `serializeOkEnvelope` (`src/runtime/subagent-envelope.ts:94`) is
     `JSON.stringify` of the payload (`:96`), called at
     `production-theta-producer.ts:2175` — and the parent re-reads it with
     `JSON.parse` (`parseEnvelopeLine`, `subagent-envelope.ts:149`, the parse at
     `:152`). The value reaching `:3463` on that cell is a JSON **primitive**.
     Measured end to end: the envelope line for `Sev.High` is
     `{"theta_result":{"v":1,"ok":"high"}}`, the re-read value's `typeof` is
     `"string"`, and the AJV verdict is `{"ok":true}`.
  4. *The prompt→prompt cell hands AJV the callee's own in-process object.* The
     attach cell (`production-theta-producer.ts:3298`, the guard
     `callerMode === "prompt" && callee.frontmatter.mode === "prompt"` inside
     `#driveCallee`, `:3235`) runs the callee body in-process and routes its
     terminal value through `surfaceCalleeFinalValue` (`:3516`) to the same
     `#validateInvokeReturn` (`:3332`). No serialisation intervenes, so the enum
     value arrives boxed. The defect applies at any depth: measured, a branded
     `Box { sev: Sev, who: string }` fails at `instancePath: "/sev"` and an
     `array<Sev>` element at `/0`. A `SCHEMA_TAG` brand alone is harmless — a
     non-enumerable symbol on a plain object — and a branded object whose fields
     are all primitives validates `{"ok":true}`.
- **Related:**
  - **0068** —
    [`0068-prompt-callee-invoke-final-value-null.md`](./0068-prompt-callee-invoke-final-value-null.md),
    **wontfix — not a defect**, the parent investigation. This report is what
    that investigation's isolation actually found. 0068 claimed the prompt→prompt
    cell drops a callee's final value; the isolation refuted that (the cell
    delivers strings, objects and arrays — §Reproduction (b)) and showed 0068's
    observable to be the specified untyped-`invoke` discard
    (`invocation.md:28`), which is mode-blind. The same run isolated this defect.
    **Boundary.** 0068's observable is a silent `Ok(null)` on the untyped form on
    every cell; this report's is a loud `Err` on the typed form on one cell.
    Different form, different observable, different mechanism. 0068's
    §Resolution links here.
  - **0067** —
    [`0067-subagent-envelope-drops-enum-tag.md`](./0067-subagent-envelope-drops-enum-tag.md),
    **fixed (0.90.0)**, the fix site's owner. **It did not cause this.** 0067
    added the post-AJV inbound translation block to `#validateInvokeReturn`'s
    success arm (`:3464–3479`) plus two imports and the doc-comment paragraphs at
    `:3419–3434`; it did not touch the depth walk, the lowering call, the
    `compile`, or the `validate` call that refuses here. Its own `## Fix (0.90.0)`
    record states the shipped change as "`#validateInvokeReturn`'s success arm
    derives an inbound translation plan … and returns the translated payload,
    after AJV, for the typed form only". The refusal predates it. **Its
    doc-comment is falsified by this defect and correcting it is part of this
    report's fix, not a separate report** (see §Actual behaviour / root cause 5).
    Its witness `tests/subagent-invoke-inbound-enum-tag.test.ts` drives the
    subagent leg only (every callee carries `SUBAGENT_FRONTMATTER`, `:83`), which
    is why it is green and this cell is unwitnessed.
  - **0172** —
    [`0172-inbound-translation-pass-unperformed-at-three-boundaries.md`](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md),
    **open**, §Fix unsettled. **Boundary, stated from both sides.** 0172 owns the
    inbound boundaries that do not call `translateInbound` at all — typed query
    results, typed `.theta`-callable tool-call returns, binder `args` — plus the
    `anyOf`-arm reach limit on the boundary 0067 wired. This report owns the one
    boundary that *does* call it, and a cell on which AJV refuses before the call
    is reached: the pass never runs because the gate ahead of it rejects. The two
    are disjoint on the observable — 0172's is a silent untagged/unbranded bind
    after `{"ok":true}`, this report's is `{"ok":false}` and no bind at all — and
    on the fix surface: 0172 adds call sites, this report changes what the
    existing call site's gate is given. Both cite `#validateInvokeReturn`
    (`:3436`) and its two call sites (`:3332`, `:3370`), so whichever lands
    second rebases onto the other's hunks in that method.
  - **0020** —
    [`0020-enum-schema-tags-presence-only-forgeable.md`](./0020-enum-schema-tags-presence-only-forgeable.md),
    **fixed (0.32.0)**, the source of the brand posture this defect rides. That
    fix installed one privacy posture for all three tags — a brand is genuine
    only when the own-property descriptor exists **and** is non-enumerable
    (`privateBrandOf`, `src/runtime/value.ts:186`, read by `enumTagOf`, `:236`,
    and `schemaTagOf`, `:300`) — which is why the
    `SCHEMA_TAG` half is harmless here: a non-enumerable symbol is invisible to
    `Object.entries`, so AJV's object walk never sees it. The enum half is not
    the tag but the *carrier*: the tag rides a boxed `String`, and it is the box,
    not the symbol, that AJV rejects. §Non-goals records that changing the
    carrier is a far wider blast radius than this report's route.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift.
    `src/extension/production-theta-producer.ts` is 6165 lines at this HEAD and
    every open report inserts into it, which is why every volatile position below
    is named by symbol beside its line and every line is stamped with the commit
    it was read at.
- **Affects** (every citation re-verified against the tree at HEAD `e18b30e5`,
  v0.90.0; symbols named beside lines):
  - **The refusing gate.** `#validateInvokeReturn`
    (`src/extension/production-theta-producer.ts:3436`), its
    `returnSchema === null` / `!result.ok` early return (`:3442–3443`), the
    ceiling-#4 depth walk that precedes AJV (`:3450`, over
    `enforceInvokeReturnDepth`, `src/runtime/invoke-ceiling-depth.ts:99`), the
    lowering call (`:3454–3458`), the `compile` (`:3462`), **the `validate` call
    this report is about (`:3463`)**, the success arm 0067 landed (`:3464–3479`)
    and the `InvokeInfraError` construction (`:3480–3486`). Its doc-comment
    (`:3413–3435`), of which `:3421–3424` is the sentence this defect falsifies.
  - **The two cells.** `#driveCallee` (`:3235`); the prompt→prompt attach guard
    (`:3298`) and its `#validateInvokeReturn` call (`:3332`); the subagent spawn
    path and its call (`:3370`). `surfaceCalleeFinalValue` (`:3516`) projects the
    callee body's terminal execution onto the crossing `Result` on both cells.
    `bindPromptConversation` (`:1435`) threads `callerMode: "prompt"` into
    `resolveInvoke` (`:1529`), and the subagent-root regime binds through the
    same method (`:2163`, PIC-58), which is why a `mode: subagent` theta running
    as its own process root still selects the prompt→prompt cell for a
    prompt-mode callee.
  - **The representation.** `makeEnumValue` (`src/runtime/value.ts:135`), the
    `new String(wire)` carrier (`:136`) and the `ENUM_TAG` install (`:137–142`);
    the `ENUM_TAG` declaration (`:56`) and the reference-encoding doc-comment
    (`:127`); `privateBrandOf` (`:186`) and the posture its doc-comment states,
    read by `enumTagOf` (`:236`) and `schemaTagOf` (`:300`) alike (bug 0020);
    `brandSchemaValue` (`:277`), `makeOk` (`:475`) and `valuesEqual` (`:494`),
    whose enum arm reads the tag off both operands (`:497–498`).
  - **The seam that already handles the box.** `translateInbound`
    (`src/runtime/wire-translation.ts:130`) and `rebuildInbound` (`:223`).
    `isPlainObject` (`:70–77`) excludes `value instanceof String` explicitly
    (`:75`), and the module header names the in-process leg by name — "the only
    one reaching this seam is an in-process `invoke` callee's own value, already
    theta-side and already tagged" (`:22`, restated at `:256`). The named-enum
    re-tag arm tests `typeof value === "string"` (`:231`), so a boxed value would
    fall through it untouched rather than be double-tagged. The pass is
    boxed-`String`-aware; the AJV gate ahead of it is not.
  - **The subagent leg's serialisation.** `serializeOkEnvelope`
    (`src/runtime/subagent-envelope.ts:94`) and its `JSON.stringify` (`:96`),
    called child-side at `production-theta-producer.ts:2175` beside
    `surfaceCalleeFinalValue` (`:2172`); `parseEnvelopeLine`
    (`subagent-envelope.ts:149`) and its `JSON.parse` (`:152`).
  - **The validator seam.** `AjvSchemaValidator`
    (`src/seams/schema-validator.ts:104`), its AJV construction
    (`:112` — `{ strict: false, allErrors: true, logger: false }`), its
    content-addressed `compile` (`:116`) and the underlying `#ajv.compile`
    (`:149`). Every other AJV boundary in the runtime shares this seam, which is
    what bounds §Fix (c).
  - **The lowering.** `lowerQueryResponseSchema`
    (`src/runtime/query-schema-lowering.ts:113`), reached with the theta body's
    decls through the module-private `schemaDeclsOf` / `enumDeclsOf`
    (`production-theta-producer.ts:5154`, `:5165`).
  - **Spec.** `docs/spec_topics/invocation.md:36` (§Final-value propagation
    across callees — the sentence this defect contradicts, and INV-5's subagent
    envelope rule), `:28` (§Typed return — `invoke<Schema>` is the form that
    carries a value back; the untyped form discards it, which bounds the domain),
    `:55` (§Cross-mode semantics — the callee's mode selects fresh-vs-attach and
    the caller's mode is irrelevant to that choice);
    `docs/spec_topics/runtime-value-model.md:13` (the enum row: the tag "MUST NOT
    appear in JSON output"), `:22` (cross-type equality), `:32` (the two-place
    opening), `:34` (the inbound bullet, whose ordering clause every route here
    is constrained by), `:37` (the `params:`-defaults bypass, which keeps
    frontmatter defaults out of scope);
    `docs/spec_topics/pi-integration-contract/subagent.md#pic-59` (the
    return-value envelope). Reference mirror:
    `docs/reference/type-system.md:145` (§Wire-name translation).
  - **The committed cells a fix must not red.**
    `tests/subagent-invoke-inbound-enum-tag.test.ts` — 0067's witness, one
    `it()` (`:157`) with six assertion cells over real spawned children; every
    callee is subagent-mode (`SUBAGENT_FRONTMATTER`, `:83`), so it exercises the
    leg that already works and says nothing about this one.
    `tests/wire-translation-inbound-retag.test.ts:200` pins that a brand at a
    plan-undescribed position survives the walk — the non-destructive property
    any route touching the value before `translateInbound` must preserve.
    `tests/invoke-ceiling-depth.test.ts:105` pins the ceiling-#4 return row: a
    depth-6 payload trips the theta-owned depth walk **before** AJV and surfaces
    the same `cause: "return_validation"` carrier, so a route must not reorder
    that walk relative to the normalisation it adds.
    `tests/invoke-cross-mode.test.ts:68` (the fresh-vs-attach matrix, including
    "a prompt-mode callee ATTACHES to the caller's current conversation", `:74`)
    and `tests/invoke-prompt-suspend.test.ts:75` (the prompt→prompt suspend
    window and its PIC-17 restore cells) both drive the cell under test and
    assert routing and lifecycle, not return validation.
  - **Corpus census, re-run at HEAD.** 34 committed `.theta` / `.thetalib`
    files; **none** declares a named `enum` (`rg -l "^\s*enum "` over the tracked
    set returns nothing), so no committed fixture can reach this defect, and the
    committed-fixture parse gate never meets one. No committed test drives a
    typed `invoke<T>` of a prompt-mode callee at all: the two files that reach
    `cause: "return_validation"` (`tests/invoke-ceiling-depth.test.ts`,
    `tests/production-live-resolvers.test.ts`) reach it through the depth walk
    and the resolver surface, not through this cell.
- **Observed at:** v0.90.0 (`e18b30e5`). Two independent measurement layers,
  both offline and provider-free. **(1)** The isolation run recorded in
  `.pi/tmp/fixes/0068-report.md` — five scratch vitest probes driving **real
  spawned `pi` children** through the production launch path
  (`launchSubagentChild` + `createProductionSpawnFn` + `driveSubagentChild`) with
  all three `AGENTS.md` `#subagent-child-pins` set, every theta body a pure tail
  expression so zero model turns were spent; written, run, deleted. **(2)** My
  own re-derivation for this filing, at the same HEAD: one scratch vitest probe
  over the shipped seams — `parseThetaDocument` (through `parseDoc`,
  `tests/helpers/e2e-s1.ts:39`), `lowerQueryResponseSchema`, `makeEnumValue`,
  `brandSchemaValue`, `serializeOkEnvelope`, and the production
  `AjvSchemaValidator` built with the shipped content-addressing — plus one
  direct `node` probe against the installed `ajv` (8.20.0). Both written, run and
  deleted; the tree carries no scratch file from either. Every value quoted below
  is one of those runs' output verbatim.

## Summary

`invocation.md:36` fixes the return surface as mode-invariant: "A `prompt`-mode
child attaches to the caller's current conversation, but the final value still
propagates through the same return surface." For a typed `invoke<T>` whose
payload contains a named-enum value at any position, it is not.

The enum representation is a boxed `String`. `makeEnumValue`
(`src/runtime/value.ts:135`) returns `new String(wire)` with the declaring-enum
tag installed as a non-enumerable symbol — the encoding that makes
`JSON.stringify` of an enum value yield the bare wire string, as
`runtime-value-model.md:13` requires. `typeof` that value is `"object"`.

`#validateInvokeReturn` (`production-theta-producer.ts:3436`) compiles the
lowered annotation and validates the callee's `Ok` payload as it stands
(`:3463`). What "as it stands" means differs by cell, and the difference is a
serialisation the runtime performs for an unrelated reason:

| cell | what reaches `:3463` | `typeof` | AJV verdict |
| --- | --- | --- | --- |
| subagent spawn (`:3370`) | `JSON.parse` of the PIC-59 envelope | `"string"` | `{"ok":true}` |
| prompt→prompt attach (`:3332`) | the callee's own in-process value | `"object"` | `{"ok":false}` |

`enum Sev { High = "high", Low = "low" }` lowers to
`{"type":"string","enum":["high","low"]}`, which refuses the boxed value with
two errors — `must be string` and `must be equal to one of the allowed values`.
The caller receives `Err(InvokeInfraError { cause: "return_validation" })`,
`message: "invoke<Sev> return value failed validation"`, and `DIAGS=[]`.

Four measured cells fail on the prompt leg and pass on the subagent leg with
byte-identical callee bodies differing only in `mode:`. Three controls on the
same cell — `invoke<string>`, `invoke<S>` over an enum-free object, and
`invoke<array<integer>>` — deliver their values, so the cell propagates final
values and the loss is specific to the enum representation. It applies at any
depth: a branded object fails at `/sev`, an array element at `/0`. A schema
brand alone is harmless.

The defect is **pre-existing**. Bug 0067's 0.90.0 fix added the post-AJV inbound
translation block to this method's success arm and never touched the AJV call
that refuses. It is nevertheless why this report is filed against a method that
changed at 0.90.0: that fix's doc-comment asserts "a callee's `mode:` frontmatter
cannot change the caller's equality semantics" (`:3421–3424`), and the
measurement falsifies that clause. Correcting it is part of this report's fix.

## Reproduction

Offline, deterministic, provider-free, at HEAD `e18b30e5`.

### (a) The four failing pairs — real spawned children

From the bug 0068 isolation run (`.pi/tmp/fixes/0068-report.md`, probes 3 and 5).
Callee bodies byte-identical, differing only in `mode:` frontmatter; `enum Sev`
declared in the root so the `invoke<Sev>` annotation is statically resolvable and
`lowerQueryResponseSchema` returns a document. `DIAGS=[]` on every row.

```
### a-prompt :: Err return_validation   ### a-sub :: {"ok":true,"value":"high"}
### b-prompt :: Err return_validation   ### b-sub :: {"ok":true,"value":{"crossed":true,"viaLet":true,"rawEnum":"high","rawStr":"PSTR"}}
### c-prompt :: Err return_validation   ### c-sub :: {"ok":true,"value":"high"}
### f-prompt :: Err return_validation   ### f-sub :: {"ok":true,"value":{"sev":"high","who":"w"}}
```

The `Err` carrier in full, as the caller observes it:

```json
{"ok":false,"error":{"kind":"invoke_infra",
 "message":"invoke<Sev> return value failed validation",
 "callee_path":"./kidp.theta","cause":"return_validation"}}
```

`f-prompt` / `f-sub` is the depth row: the payload is an object with one
named-enum field and one `string` field, so the failure is at `/sev`, not at the
root.

### (b) The controls — the same cell delivers non-enum payloads

Same run, same harness, same prompt→prompt cell:

```
### d-prompt :: {"ok":true,"value":"PSTR"}              invoke<string>
### e-prompt :: {"ok":true,"value":{"a":"x","b":true}}  invoke<S>, no enum field
### g-prompt :: {"ok":true,"value":[1,2,3]}             invoke<array<integer>>
```

A string, an object and an array all cross. A lost or empty tail value would have
failed `e-prompt` and `g-prompt` identically; it did not. The cell propagates
final values, and the AJV gate on it admits everything that is not an enum. This
is also what separates this report from
[0068](./0068-prompt-callee-invoke-final-value-null.md): value loss is refuted,
representation is the mechanism.

### (c) The mechanism, at unit level over the repository's own seams

My re-derivation for this filing. Fixture, parsed by the real
`parseThetaDocument` and loading with `diags []`:

```
enum Sev { High = "high", Low = "low" }
schema Box { sev: Sev, who: string }
```

Real `lowerQueryResponseSchema` output:

```json
Sev         {"type":"string","enum":["high","low"]}
Box         {"type":"object","properties":{"sev":{"$ref":"#/$defs/Sev"},"who":{"type":"string"}},
             "required":["sev","who"],"additionalProperties":false,
             "$defs":{"Sev":{"type":"string","enum":["high","low"]}}}
array<Sev>  {"type":"array","items":{"$ref":"#/$defs/Sev"},
             "$defs":{"Sev":{"type":"string","enum":["high","low"]}}}
```

Verdicts from the production `AjvSchemaValidator` over those documents:

```
typeof makeEnumValue("Sev","high") : object      JSON.stringify of it : "high"
Sev, primitive "high"              : {"ok":true}
Sev, enum value                    : {"ok":false,"errors":[
  {"instancePath":"","schemaPath":"#/type","keyword":"type","message":"must be string"},
  {"instancePath":"","schemaPath":"#/enum","keyword":"enum","message":"must be equal to one of the allowed values"}]}
Box branded, primitive sev field   : {"ok":true}
Box branded, enum sev field        : {"ok":false,"errors":[
  {"instancePath":"/sev","schemaPath":"#/$defs/Sev/type","keyword":"type","message":"must be string"},
  {"instancePath":"/sev","schemaPath":"#/$defs/Sev/enum","keyword":"enum","message":"must be equal to one of the allowed values"}]}
array<Sev>, ["high"]               : {"ok":true}
array<Sev>, [enum value]           : {"ok":false,"errors":[{"instancePath":"/0","schemaPath":"#/$defs/Sev/type", …}]}
JSON.stringify(branded Box w/ enum): {"sev":"high","who":"w"}
```

The `SCHEMA_TAG` brand is invisible to AJV at every row: a branded object whose
fields are primitives validates `{"ok":true}`, and the branded object's JSON
projection is exactly the payload AJV would have admitted. The rejection is the
enum carrier alone.

### (d) The subagent leg, measured at the same seams

The child's own serialisation and the parent's own parse, over the same value:

```
serializeOkEnvelope(Sev.High)     : "{\"theta_result\":{\"v\":1,\"ok\":\"high\"}}\n"
re-read payload typeof            : string
re-read payload, Sev verdict      : {"ok":true}
re-read Box payload, Box verdict  : {"ok":true}
```

`JSON.stringify` collapses the boxed `String` to a JSON primitive — the property
`runtime-value-model.md:13` requires of the enum row for a different reason — and
`JSON.parse` on the parent side produces a primitive. The subagent leg passes
AJV because of a serialisation the envelope performs, not because anything on
that path is aware of the representation.

### (e) The same measurement against `ajv` directly

Installed `ajv` 8.20.0, independent of the repository's seams, to confirm the
behaviour is AJV's and not the seam's:

```
typeof primitive        : string
typeof boxed            : object
validate primitive      : true
validate boxed          : false   [{"instancePath":"","schemaPath":"#/type","keyword":"type","message":"must be string"}]
JSON.stringify(boxed)   : "high"
branded obj, prim field : true
branded obj, enum field : false   [{"instancePath":"/sev","schemaPath":"#/properties/sev/type","message":"must be string"}]
array of boxed          : false   [{"instancePath":"/0","schemaPath":"#/items/type","message":"must be string"}]
```

Against a bare `{"type":"string"}` the error list carries one entry; against the
fragment a named `enum` actually lowers to it carries two, because the `enum`
keyword fails alongside `type`. The rejection itself is identical.

## Expected behaviour

- `docs/spec_topics/invocation.md:36` (§Final-value propagation across callees) —
  the sentence this defect contradicts, verbatim: "A `prompt`-mode child attaches
  to the caller's current conversation, but the final value still propagates
  through the same return surface." The same paragraph fixes the subagent leg's
  mechanism — "the final value crosses the subagent boundary as the `ok` arm of
  the single-JSONL-line `{"theta_result": …}` return envelope the child emits on
  stdout" — and, in INV-5, that a subagent parent "MUST derive the `invoke`
  result solely from the child's `theta_result` envelope". The envelope is
  specified as the *subagent* leg's carriage. Nothing makes it a precondition of
  validation, and the prompt leg is specified to reach the same return surface
  without it.
- `docs/spec_topics/invocation.md:28` (§Typed return) — "`invoke<Schema>(...)`
  annotates the expected return type; the runtime AJV-validates the child's
  return value against the schema. Untyped `invoke(...)` returns
  `Result<null, QueryError>` — the runtime discards the child's return value
  entirely. Use `invoke<Schema>` whenever the caller needs the value back". The
  typed form is the specified way to get a value back, and it is the only form
  this defect reaches; the untyped form carries no value to validate and is out
  of frame (§Non-goals).
- `docs/spec_topics/invocation.md:55` (§Cross-mode semantics) — "The callee's
  mode controls whether it gets a fresh conversation or attaches to its caller's
  current conversation. The caller's mode is irrelevant to that decision". The
  mode is specified to select *conversation isolation*. It is not specified to
  select whether a return value validates.
- `docs/spec_topics/runtime-value-model.md:13` (the enum row of the
  value-representation table) — "An enum value carries the variant's wire string
  plus an interpreter-private tag identifying the declaring enum. Cross-enum
  equality compares both … The tag MUST NOT appear in JSON output
  (`JSON.stringify` of an enum value yields the bare wire string)." The
  requirement is on the tag's absence from JSON output; the boxed-`String`
  carrier is the reference encoding that satisfies it (`:16`, non-normative:
  "the reference interpreter implements the enum tag as a non-enumerable symbol
  property on the JS string wrapper"). The spec fixes the JSON projection, which
  the measurement confirms is `"high"`; it fixes nothing about `typeof`, which is
  where the AJV boundary reads.
- `docs/spec_topics/runtime-value-model.md:34` (§Wire-name translation, inbound
  bullet) — the ordering every route here is constrained by: the pass runs
  "after AJV validation against the lowered schema", and "The rule applies
  uniformly to every inbound boundary — typed query results, tool-call return
  decoding where typed, `invoke` returns, and binder `args` — and is not
  restated per call site." The `invoke` return is named. Bug 0067 wired it at
  exactly the point this sentence fixes; on the prompt cell the AJV verdict the
  pass is ordered after is `{"ok":false}`, so the pass never runs and the value
  never binds.
- `docs/reference/type-system.md:145` (§Wire-name translation, the reference
  mirror) — restates both halves for the surface a theta author reads: the pass
  happens "after AJV validation", and it "Applies uniformly to typed query
  results, typed tool-call returns, `invoke` returns, and binder `args`."

## Actual behaviour / root cause

**1. The representation is a boxed `String`, chosen for its JSON projection.**
`makeEnumValue` (`src/runtime/value.ts:135`):

```ts
export function makeEnumValue(declaringEnum: string, wire: string): EnumValue {
  const boxed = new String(wire);
  Object.defineProperty(boxed, ENUM_TAG, {
    value: declaringEnum,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return boxed as unknown as EnumValue;
}
```

Its doc-comment (`:127`) states the reason: "`JSON.stringify` of a boxed string
yields the bare wire string, and the symbol tag is excluded from JSON output
regardless of enumerability, so the value serialises to the bare wire string
while still carrying its declaring-enum tag for cross-enum equality." That is the
`runtime-value-model.md:13` obligation discharged. The carrier's cost is
`typeof === "object"`, which is invisible on every JSON-facing surface and
decisive on a structural one.

**2. AJV is a structural surface.** The production `AjvSchemaValidator`
(`src/seams/schema-validator.ts:104`) compiles with
`{ strict: false, allErrors: true, logger: false }` (`:112`) and hands the value
to the compiled function unchanged (`:149`). AJV's `type: "string"` check is a
`typeof` test and a boxed `String` fails it. The `enum` keyword fails alongside
it, so the error list for a named-enum fragment carries two entries where a bare
`{"type":"string"}` carries one. Measured directly against `ajv` 8.20.0
(§Reproduction (e)) and through the repository's seam (§Reproduction (c)); the
verdicts agree.

**3. The subagent leg is normalised by an unrelated mechanism.** The PIC-59
envelope exists to carry a value across a process boundary, and a process
boundary is a JSON boundary. The child calls `serializeOkEnvelope`
(`src/runtime/subagent-envelope.ts:94`):

```ts
export function serializeOkEnvelope(value: unknown): string {
  const payload: EnvelopeOk = { v: THETA_ENVELOPE_VERSION, ok: value };
  return `${JSON.stringify({ [THETA_RESULT_KEY]: payload })}\n`;
}
```

and the parent calls `JSON.parse` (`parseEnvelopeLine`, `:149`, the parse at
`:152`). The boxed `String` becomes the JSON primitive `"high"` in the child and
comes back a primitive in the parent. Bug 0067 relied on exactly this fact from
the other direction — the value arrives untagged, which is why an inbound
translation pass was needed there — and the same fact is what makes the subagent
leg's AJV verdict `{"ok":true}`. The normalisation is a side effect of process
isolation, not a designed step of the return surface.

**4. The prompt→prompt cell has no such step, by design.** The attach cell
(`production-theta-producer.ts:3298`) runs the callee body in-process against the
caller's own session and takes the terminal value through
`surfaceCalleeFinalValue` (`:3516`) directly to `#validateInvokeReturn`
(`:3332`). An in-process value is the point of the cell: it is theta-side-named
and already branded, which is precisely why the inbound translation pass has
nothing to rebuild there. `rebuildInbound` states that in its own comments — "the
only one reaching this seam is an in-process `invoke` callee's own value, already
theta-side and already tagged" (`src/runtime/wire-translation.ts:22`, restated at
`:256`) — and `isPlainObject` (`:70–77`) excludes `value instanceof String`
explicitly (`:75`), so the translation seam is boxed-`String`-aware and passes
one through untouched. **The gate ahead of it is not.** The runtime knows the
in-process value can be a boxed `String` at the seam that follows AJV, and hands
it to AJV unexamined at `:3463`.

**5. The doc-comment 0067 landed asserts the invariant this breaks.**
`#validateInvokeReturn`'s doc-comment (`:3421–3424`) reads:

> Both call sites in `#driveCallee` (the prompt→prompt attach cell and the
> subagent spawn cell) route through this one method, so a callee's `mode:`
> frontmatter cannot change the caller's equality semantics.

The premise is true — both cells do route through `:3436`, verified at `:3332`
and `:3370` — and the conclusion does not follow, because the two cells deliver
values in different *representations* to the same method. The `a-prompt` /
`a-sub` pair falsifies the final clause directly: one `Err`, one `Ok("high")`,
one callee body. This is a **code comment**, not a specification sentence; no
spec text makes the claim, and `runtime-value-model.md` never mentions the cells.
Correcting it belongs to whatever route this report's §Fix takes, in the same
commit, and is not a separate defect.

**6. Nothing reports the asymmetry as such.** The failure is loud but its message
names the annotation, not the cause: `invoke<Sev> return value failed validation`
(`:3482`). There is no diagnostic code, no runtime event, and no hint carrying
the AJV error list, so a theta author reading that message sees a claim their
callee returned the wrong type. The callee returned exactly the right type; the
caller could not read it.

## Why it matters

- **A legal program cannot execute, and the message misdirects.** `invoke<Sev>`
  of a prompt-mode callee that returns `Sev.High` is spec-sanctioned in one
  sentence (`invocation.md:36`) and refused in practice. The author's evidence is
  `invoke<Sev> return value failed validation` — which points at the callee's
  return value, where the callee's return value is correct.
- **The workaround is a mode change, and the modes are not interchangeable.**
  Switching the callee to `mode: subagent` fixes the validation and changes the
  semantics: `invocation.md:55` fixes that a subagent-mode callee gets a *fresh
  isolated conversation* rather than attaching to the caller's, and its
  transcript is discarded. An author who follows the error message to the only
  thing that makes it go away loses conversation attachment, and nothing tells
  them that is what they traded.
- **It reaches every named-enum position at every depth.** Measured at the root
  (`instancePath: ""`), inside a branded object (`/sev`), and inside an array
  (`/0`). One enum field anywhere in a returned schema is enough to refuse the
  whole payload — `f-prompt` fails on an object whose other field is a plain
  `string` that validates.
- **The class is exactly what bug 0067 was filed and scored on, reflected.**
  0067's subject was an enum crossing the subagent envelope and losing its tag
  because it arrived as a primitive. This report's subject is the same
  representation on the cell where it never becomes a primitive. The two are the
  two halves of one unaddressed question — where in the return surface a value's
  representation is normalised — and the runtime currently answers it by
  accident on one leg and not at all on the other.
- **Two other open reports touch the same method.**
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)'s
  §Fix adds call sites around `#validateInvokeReturn`;
  [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md)'s open
  rebuild questions bear on what a route here does with an already-branded
  in-process object (§Fix (a)). Leaving this unfiled would let either land on top
  of it without knowing.
- **Nothing gates it.** No committed `.theta` / `.thetalib` declares a named
  `enum` (census: 0 of 34), so no fixture can reach it; no committed test drives
  a typed `invoke<T>` of a prompt-mode callee; and 0067's witness, the one
  committed cell that exercises named-enum values across an invoke boundary,
  spawns subagent-mode callees exclusively
  (`tests/subagent-invoke-inbound-enum-tag.test.ts:83`). The cell is unwitnessed
  in the direction that fails.

## Fix

Not settled. Three candidate normalisation points are pinned below with their
measured blast radii; the run selects one and states the evidence that decided
it. Every route carries the constraints in (d), and every route also corrects
`#validateInvokeReturn`'s doc-comment in the same commit ((d)(3)).

### (a) Project the payload to wire form before AJV, on the invoke boundary

Normalise the value `#validateInvokeReturn` validates — a `JSON.parse(JSON.stringify(v))`
round trip, or an equivalent structural projection — so both cells present AJV
the same shape, then run 0067's translation pass over the projection as today.

- **It makes the two cells identical by construction**, which is what the
  falsified doc-comment claims and what `invocation.md:36` requires. The subagent
  leg already does exactly this round trip through the envelope
  (§Reproduction (d)); this route performs it deliberately on the cell that does
  not have a process boundary to do it incidentally.
- **It changes what the caller receives from the callee's own object to a
  copy.** After the projection, an in-process callee's branded object reaches
  `translateInbound` unbranded and gets re-branded by the pass — the same path
  the subagent leg takes. That is a behaviour change on the prompt cell for
  payloads that validate **today** (§Reproduction (b)'s `e-prompt`), and it
  reaches 0120's territory: `rebuildInbound`'s brand-preservation comment
  (`wire-translation.ts:267–277`) and the cell at
  `tests/wire-translation-inbound-retag.test.ts:200` both rest on an in-process
  value arriving already branded. A route here states its posture and shows the
  cell still green.
- **It costs a deep copy per typed invoke return**, bounded by ceiling #4's
  depth cap (`enforceInvokeReturnDepth`, `:3450`) but unbounded in breadth.
- **`Result` payloads need care.** `Result` is not a lowerable type form, so a
  `Result` never appears under a `returnSchema`; but the projected value is the
  `Ok` payload, and a naive round trip over a nested constructor-built value
  would strip the `RESULT_TAG` brand that `match` and `?` read
  (`wire-translation.ts:249–261`, the `isResultValue` arm, documents the same
  hazard for the walk).

### (b) Validate against a projection, hand the original value downstream

Compute the wire-form projection for the AJV call only, and pass the callee's
own value — unchanged, still boxed, still branded — to `translateInbound` and on
to the caller.

- **It changes no value the caller receives**, so every payload that validates
  today reaches the caller byte-identically and `tests/wire-translation-inbound-retag.test.ts:200`
  is untouched by construction. The observable that moves is only the verdict.
- **It makes AJV's `instancePath` address a value the caller never sees.** The
  error list in a failure is computed over the projection; for this report's
  class that is harmless (the projection and the value agree on structure), but
  a route must state that the two are structurally identical or the diagnostic
  positions drift.
- **The translation seam already tolerates it.** `rebuildInbound` passes a boxed
  `String` through (`isPlainObject` excludes `value instanceof String`, `:75`)
  and its re-tag arm tests `typeof value === "string"` (`:231`), so an
  already-tagged boxed value is neither re-tagged nor damaged. Verified by
  reading at HEAD; a route must witness it rather than rely on the reading.
- **It still costs the projection walk**, and it introduces two values where
  there was one, which the code must make legible or it becomes a trap for the
  next reader.

### (c) Normalise inside the `AjvSchemaValidator` seam

Have the seam unbox boxed primitives (and, if taken further, project brands
away) before handing a value to the compiled validator.

- **It fixes every AJV boundary at once**, including any future one, and needs no
  change at `#validateInvokeReturn` at all.
- **Its blast radius is every AJV boundary in the runtime.** The seam
  (`src/seams/schema-validator.ts:104`) has seven `compile` call sites in `src/`
  at HEAD: the binder envelope validator
  (`production-theta-producer.ts:786`), the binder's post-default-merge check
  over `params.loweredSchema` (`:1225`), the subagent-root params intake
  (`:2040`), the respond-tool payload check (`:2657`), the Pi-tool `parameters`
  check (`:2976`), the typed-query loop (`typed-query-validation.ts:323`), and
  this one (`:3462`). A route here re-measures each: today no other site can be
  handed a boxed `String`, because their inputs are model-produced JSON or merged
  binder args — but "inert today" is a claim to measure, not assume, and the
  change silently widens what the seam promises to every future caller.
- **It puts a language-representation fact inside a schema-validation seam.**
  The seam's job is JSON Schema; teaching it about `ENUM_TAG`'s carrier couples
  it to `src/runtime/value.ts`. A route taking this argues the layering
  explicitly.

### (d) Constraints every route carries

1. **The translation pass stays after AJV.** `runtime-value-model.md:34` fixes
   the inbound pass "after AJV validation against the lowered schema", and bug
   0067's fix landed it in that order deliberately
   (`production-theta-producer.ts:3464–3479`, inside the `verdict.ok` arm).
   Normalising the value is not translating it: a route adds a step **before**
   AJV or **inside** the validate call, and leaves the `verdict.ok` arm's
   position unchanged. Re-ordering the translation pass ahead of AJV re-opens a
   question 0067 settled and is out of scope for this report.
2. **The ceiling-#4 depth walk stays first.** `enforceInvokeReturnDepth`
   (`:3450`, `src/runtime/invoke-ceiling-depth.ts:99`) runs before the lowering
   and before AJV, and `tests/invoke-ceiling-depth.test.ts:105` pins it as the
   first sub-check at this boundary. Any normalisation added here goes after the
   depth walk, so a hostile payload is refused before it is copied.
3. **The doc-comment is corrected in the same commit.**
   `#validateInvokeReturn`'s `:3421–3424` asserts that "a callee's `mode:`
   frontmatter cannot change the caller's equality semantics". It is false at
   HEAD and it becomes true only under whichever route lands. Until then the
   comment claims coverage the code lacks — the condition 0067's fix took care to
   avoid elsewhere by narrowing three comments to the reach they actually have.
   The correction is part of this fix, not a separate report.
4. **The subagent leg's verdicts do not move.** 0067's witness
   (`tests/subagent-invoke-inbound-enum-tag.test.ts`, six assertion cells
   including the `anon` control pinning `Severity.Low == "low"` at `false`) drives
   the leg that already passes. Every route re-runs it green; a route that
   changes what the subagent leg hands AJV has widened past this report.
5. **The anonymous-string-literal-union rule is untouched.** Those positions
   receive no tag by specification (`runtime-value-model.md:34`), so their values
   are plain strings and were never in the refused set. `Severity.Low == "low"`
   stays `false`.
6. **Test witness — unit, offline, provider-free, plus one real-child tier.**
   The unit half re-drives §Reproduction (c) over the shipped seams: the lowered
   fragments, the production `AjvSchemaValidator`, and the verdict for a boxed
   value at the root, inside a branded object and inside an array — asserting the
   verdict flips to `{"ok":true}` and that the value the caller receives still
   compares equal under `valuesEqual` (`src/runtime/value.ts:494`) to a locally
   constructed variant, and still resolves under `schemaTagOf` (`:300`) where the
   payload is schema-typed.
   The integration half re-drives §Reproduction (a)'s `a`/`b`/`c`/`f` pairs
   through real spawned children on the 0067 witness's harness pattern, with the
   §Reproduction (b) controls kept as the over-reach fence. Each new assertion is
   proved both directions once — red with the normalisation neutralised, green
   with it restored.
7. **GOV-15 observable**
   (`docs/spec_topics/governance/source-language-stability.md:5`). No route
   refuses an input that succeeds today; what
   moves is a refusal becoming a success, plus — under (a) only — the identity of
   the object a passing prompt-cell payload binds. A route taking (a) enumerates
   that second change rather than leaving it to be discovered.

### (e) Ordering

Nothing blocks this report from starting.
[0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md) is
open against the same method; the two are disjoint on observable and on fix
surface (§Related), so neither fix changes the other's verdicts and whichever
lands second rebases onto the other's hunks in `#validateInvokeReturn`. A route
taking (a) states its posture against
[0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md)'s open
rebuild questions rather than deciding them by implementation.

## Non-goals

- **Changing the enum representation itself.** Replacing the boxed-`String`
  carrier with a plain-object or primitive-plus-sidecar representation would
  remove the `typeof` mismatch at its source and is **not this report's route**
  unless a chosen route is shown to require it. Its blast radius is every
  consumer of the carrier: `valuesEqual` (`src/runtime/value.ts:494`), whose enum
  arm reads the tag off both operands (`:497–498`), and the whole cross-enum
  equality rule (`runtime-value-model.md:13`, `:22`); `privateBrandOf`'s shared
  posture over all three tags (`src/runtime/value.ts:186`, bug 0020's settled
  design), `translateInbound`'s re-tag arm and its `isPlainObject` exclusion
  (`wire-translation.ts:231`, `:75`), `translateOutbound`'s enum collapse
  (`:310`), and — decisively — the `JSON.stringify` behaviour the spec pins in
  the enum row (`runtime-value-model.md:13`) and on which the entire PIC-59
  subagent leg depends (§Reproduction (d)). Bug 0067's whole fix, 0172's face 1
  and this report's §Reproduction (d) all measure behaviour that follows from
  that projection.
- **Whether an untyped `invoke(...)` should discard the callee's value.**
  `invocation.md:28` fixes that it does. There is no value at that boundary to
  validate, so the untyped form cannot exhibit this defect — measured on both
  cells by the parent investigation. The design question was declined by the
  operator at 0068 and is not reopened.
- **Bug 0068's value-loss hypothesis.** Refuted by §Reproduction (b) and by that
  report's own §Resolution. This document does not restate the refutation beyond
  the boundary sentence in §Related.
- **The three inbound boundaries that never call `translateInbound`, and the
  `anyOf` reach limit.**
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)'s
  two faces. They are about a pass that does not run after a passing verdict;
  this report is about a verdict that does not pass.
- **What the inbound rebuild produces once it runs.** Declaration-order `keys()`
  and the brand-installation route are
  [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md)'s
  unsettled §Fix. Carried here only as a constraint on route (a) ((d) and (e)).
- **Frontmatter `params:` defaults.** They bypass the inbound pass by
  specification (`runtime-value-model.md:37`) and arrive already branded and
  theta-side-named; a default authored as `Severity.High` never reaches an AJV
  return boundary.
- **The `Err` arm and the `InvokeInfraError` carrier's shape.**
  `#validateInvokeReturn` returns `result` unchanged for a non-`ok` result
  (`:3442–3443`), and the `cause: "return_validation"` carrier is the specified
  one for a genuine validation failure. This report changes which inputs reach
  that arm, not the arm.
- **The wording of the failure message.** `invoke<Sev> return value failed
  validation` (`:3482`) names the annotation and carries no AJV error detail.
  Whether the message should carry the error list is a separate question about
  every `return_validation` failure, not only this class.

## Provenance

Filed from residual **R2** of the bug 0068 investigation
(`.pi/tmp/fixes/0068-report.md` §"Residuals / notes", R2 — "A REAL DEFECT,
unfiled, full bundle for the parent"). That investigation shipped no fix and no
commit: it terminated in Phase 0 on its own STOP clause after establishing that
bug 0068 as written is a non-defect, and isolated this defect in the same run.
Its probes were **provider-free** — every theta body a pure tail expression, zero
model turns — drove real spawned `pi` children through the production launch
path, and were **deleted after the run**; the report records the scratch sweep
confirming it. R1 of the same report carries 0068's disposition and R4 its
citation drift; both are recorded there, not restated here.

**Re-verified at HEAD `e18b30e5` for this filing, not copied.** R2's bundle was
treated as a set of claims to check. What I checked and what I found:

- **The mechanism, re-measured twice.** One scratch vitest probe over the shipped
  seams (`parseDoc` → `parseThetaDocument`, `lowerQueryResponseSchema`,
  `makeEnumValue`, `brandSchemaValue`, `serializeOkEnvelope`, and the production
  `AjvSchemaValidator` built with the shipped content-addressing) and one direct
  `node` probe against the installed `ajv` 8.20.0. Both written, run and deleted;
  no scratch file remains. Every value in §Reproduction (c), (d) and (e) is those
  runs' output verbatim. R2's four headline measurements reproduce exactly:
  `typeof` `object`, primitive `true`, boxed `false` with message
  `must be string`, `JSON.stringify` → `"high"`.
- **One correction to R2's unit-level bundle.** R2's probe 4 validated against a
  bare `{"type":"string"}` and recorded a single AJV error. The fragment a named
  `enum` actually lowers to is `{"type":"string","enum":["high","low"]}`
  (measured through the real `lowerQueryResponseSchema`; committed as a lowering
  row at `tests/literal-union-string-enum-emission.test.ts:94`), so the real
  error list carries **two** entries — `must be string` at `#/type` and
  `must be equal to one of the allowed values` at `#/enum`. The first error's
  message is the one R2 quotes, so its conclusion is unaffected; §Reproduction
  (c) records the full list. Likewise the object-field failure's `schemaPath` is
  `#/$defs/Sev/type`, not `#/properties/sev/type`, because a named-enum field
  lowers through `$ref` — R2 quoted only `instancePath`, which is `/sev` in both
  cases and is correct.
- **The location citations.** R2 cites `#validateInvokeReturn` at `:3436`, the
  `validate` call at `:3463`, the prompt→prompt guard at `:3298` and its
  `#validateInvokeReturn` call at `:3332`. All four are exact at this HEAD. I
  additionally read the subagent-cell call (`:3370`), the `InvokeInfraError`
  construction (`:3480–3486`), `#driveCallee` (`:3235`) and
  `surfaceCalleeFinalValue` (`:3516`), which R2 does not cite.
- **The "pre-existing, not a 0067 regression" claim, verified without a diff.**
  R2's evidence is a `git show` filter. Running git was outside this filing's
  scope, so I checked it two other ways at HEAD and both agree: (i) 0067's own
  `## Fix (0.90.0)` block states the shipped change to this file as
  "`#validateInvokeReturn`'s success arm derives an inbound translation plan from
  the already-lowered annotation and returns the translated payload, after AJV,
  for the typed form only" — the success arm, not the verdict; and (ii) the
  method as it stands segregates cleanly, with 0067's contribution confined to
  the `verdict.ok` block (`:3464–3479`) and the doc-comment paragraphs
  (`:3419–3434`), while the depth walk (`:3450`), the lowering (`:3454–3458`),
  the `compile` (`:3462`) and the `validate` (`:3463`) are the pre-0067 gate. The
  claim holds; I record the substituted method rather than assert the diff I did
  not read.
- **The falsified doc-comment.** Present at `:3421–3424`, quoted verbatim in
  §Actual behaviour / root cause 5, and it is a code comment: no sentence in
  `runtime-value-model.md` or `invocation.md` makes the cells-are-equivalent
  claim, so this is code-vs-code, not code-vs-spec. Recorded as part of this
  report's fix ((d)(3)), not as a second defect.
- **Spec citations.** `invocation.md:36` carries the §Final-value-propagation
  sentence and INV-5 verbatim as quoted; `:28` (§Typed return) and `:55`
  (§Cross-mode semantics) read as cited. `runtime-value-model.md:13` (the enum
  row, "MUST NOT appear in JSON output"), `:22`, `:32`, `:34` (the inbound
  bullet's post-AJV ordering and four-boundary sentence) and `:37` (the
  `params:`-defaults bypass) read as cited. `docs/reference/type-system.md:145`
  carries the mirror.
- **One sibling-doc citation drift, flagged not chased.**
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)
  cites the `params:`-defaults bypass paragraph at `runtime-value-model.md:36`;
  at this HEAD `:36` is blank and the paragraph is `:37`. Bug
  [0134](./0134-params-shift-induced-stale-citations.md)'s class. This document
  cites `:37`.
- **The corpus census and the gate inventory.** Re-run at HEAD: 34 committed
  `.theta` / `.thetalib` files, none declaring a named `enum`; 0067's witness
  drives subagent-mode callees only (`SUBAGENT_FRONTMATTER`, `:83`); the two test
  files reaching `cause: "return_validation"` reach it through the ceiling-#4
  depth walk and the resolver surface, not through the prompt→prompt cell. The
  committed-cell inventory in §Affects was grepped over `tests/` at the same
  HEAD.
- **What is read from source rather than exercised**, marked as such in the text:
  `rebuildInbound`'s tolerance of a boxed `String` (`wire-translation.ts:75`,
  `:231`) — the function is module-private and this filing did not drive a boxed
  value through `translateInbound`; §Fix (b) records it as a reading a route must
  witness. §Reproduction (a) and (b) are the parent investigation's spawned-child
  output, re-quoted from `.pi/tmp/fixes/0068-report.md` and not re-driven here;
  §Reproduction (c), (d) and (e) are my own runs and reproduce their mechanism at
  unit level.

Every `src/`, `tests/`, spec, reference and bug-doc citation above was read at
HEAD `e18b30e5`; volatile positions in
`src/extension/production-theta-producer.ts` (6165 lines) are named by symbol
beside their line numbers, per bug 0134's adjudication.

## Fix (0.98.0)

- **Route chosen: §Fix (b)** — validate against a wire-form projection, hand the
  ORIGINAL value downstream. The projection is computed for the AJV call alone;
  the callee's own value, boxed enum carriers and schema brands intact, reaches
  the post-AJV inbound translation pass and the caller unchanged.

  **Why not §Fix (a)** (project before AJV, translate the projection). Measured,
  not argued: `decodeInboundValue` fed the wire primitive `"high"` under a
  `Sev | null` annotation returns a **bare string** that does not `valuesEqual`
  a locally constructed `Sev.High`. `Sev | null` lowers to
  `{"anyOf":[{"$ref":"#/$defs/Sev"},{"type":"null"}],"$defs":{"Sev":{"type":"string","enum":["high","low"]}}}`,
  and an `anyOf` arm carries no JSON-Pointer position a sidecar can key
  ([0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)
  face 2, spec-blocked and unwired), so the pass cannot re-tag there. Route (a)
  would therefore have traded this report's loud `Err` for a silent untagged
  bind on every union-typed enum return — the class 0172 face 2 owns. Under
  route (b) the same call with the ORIGINAL boxed value returns the **same
  reference**, still tagged (`valuesEqual` `true`), so `invoke<Sev | null>` of a
  prompt callee flips from `Err` to `Ok` with the tag intact. The `(ANYOF)` cell
  pins that end state; it pins pass-through of an already-tagged value and never
  `anyOf` arm dispatch.

  **Why not §Fix (c)** (normalise inside `AjvSchemaValidator`): breadth without
  need. The seam has seven `compile` call sites and the layering argument §Fix
  (c) demands; nothing but this boundary is handed a boxed value in production.

- **What shipped.**
  - `src/runtime/wire-translation.ts` — one exported
    `projectForValidation(value: ThetaValue): unknown` (`:494`), appended after
    `lowerOutbound`: **+68/−0**, a pure append, so every pre-existing citation
    into this file is unmoved. A boxed `String` collapses to `value.valueOf()`
    (the rule `lowerOutbound` states at `:435`); arrays and plain objects are
    walked; a `Result` passes through, mirroring `rebuildInbound`'s own
    `isResultValue` arm (`:266`) — `Result` is not a lowerable type form
    (`schema-subset.md` §"Lowering Algorithm" step 3), so no described position
    can hold one. It renames nothing: the value here is the callee's own
    theta-side value and the lowered document this boundary validates against
    already emits theta-side property names, so a rename would corrupt an
    already-correct key. The walk is **copy-on-change** — the SAME array/object
    reference is returned wherever no descendant needed collapsing — which is
    load-bearing rather than an optimisation (see GOV-15 below).
  - `src/extension/production-theta-producer.ts` — the import (`:225`) and one
    changed argument: `#validateInvokeReturn`'s AJV call (`:3591`) is now
    `validator.validate(projectForValidation(result.value))`. **§Fix (d)(1)
    holds:** the `verdict.ok` arm did not move and still passes
    `validated: result.value` — the original — to `decodeInboundValue`
    (`:3594`). **§Fix (d)(2) holds:** the ceiling-#4 depth walk
    (`enforceInvokeReturnDepth`) still runs first, before the lowering, the
    `compile` and the projection, so a hostile payload is refused before
    anything copies it.
  - `src/extension/production-theta-producer.ts` — **§Fix (d)(3)**, the
    doc-comment correction, in the same commit. Before:

    > On success the payload also runs through the inbound translation pass
    > runtime-value-model.md §"Wire-name translation" names for `invoke`
    > returns, ordered — as that section fixes — after AJV validation. Both call
    > sites in `#driveCallee` (the prompt→prompt attach cell and the subagent
    > spawn cell) route through this one method, so a callee's `mode:`
    > frontmatter cannot change the caller's equality semantics.

    After:

    > AJV is a structural surface — its `type: "string"` check is a `typeof`
    > test — and the enum carrier `makeEnumValue` builds is a boxed `String`
    > (`typeof === "object"`), so the AJV `validate` call runs only through
    > `projectForValidation`'s wire-form projection of the payload —
    > copy-on-change, so where no descendant needs collapsing the projection is
    > the payload, unchanged. Both call sites in `#driveCallee` (the
    > prompt→prompt attach cell and the subagent spawn cell) route through this
    > one method, and the method projects the value to its wire form for the AJV
    > call, so the boxed-`String` representation difference between the two
    > cells is normalised at the gate: a callee's `mode:` frontmatter cannot
    > change whether a named-enum return validates, or what the caller binds for
    > one.
    >
    > On success the ORIGINAL payload — never the projection — also runs through
    > the inbound translation pass […]

    The conclusion is **scoped to named-enum returns** deliberately. Review
    round 1 measured that the unscoped form would have reproduced the very
    overclaim §Actual behaviour 5 indicts: under `invoke<number>` a callee
    returning `n / 0` yields `Infinity`, which the prompt cell's projection
    preserves and AJV admits, while the subagent leg's `serializeOkEnvelope`
    emits `{"theta_result":{"v":1,"ok":null}}` (`JSON.stringify(Infinity)` is
    `null`) and AJV refuses it. Mode still moves that verdict. Normalising it
    here would newly refuse an input that succeeds today — GOV-15 forbids it,
    and it is outside this report's subject; it is recorded as a residual
    instead. The clause "never the projection" in the paragraph below is left
    intact and is true on its own terms: the `verdict.ok` arm binds
    `result.value`.
  - `tests/invoke-return-enum-carrier-projection.test.ts` — **§Fix (d)(6) unit
    half**, new, 868 lines / 16 cells. It drives the real in-process
    prompt→prompt attach cell end to end (`parseThetaDocument` →
    `createProductionProducerDeps({ parseCallee })` → `bindPromptConversation` →
    `executeBody`, explicit `invoke<T>("./kidp.theta")` form, a real
    `AjvSchemaValidator` on the runtime root): `(a)` root-position `Sev`, `(c)`
    `array<Sev>`, `(f)` branded `Box` with one enum field, `(ANYOF)`
    `Sev | null`; the `(d)/(e)/(g)` over-reach controls; `SEAM-1a/b/c`
    re-driving §Reproduction (c) over the shipped lowering and validator seams;
    `SEAM-2a/b/c` observing the verdict the shipped gate actually takes through
    a pass-through recording `SchemaValidator` decorator; the boxed-pass-through
    control §Fix (b) demands be **witnessed** rather than read; and the
    subagent-leg envelope control that pins §Fix (d)(4).
  - `tests/invoke-prompt-cell-enum-return.test.ts` — **§Fix (d)(6) integration
    half**, new, 556 lines, one `it()` over 27 soft cells. It re-drives
    §Reproduction (a)'s `a`/`b`/`c`/`f` pairs through REAL spawned `pi` children
    on bug 0067's witness pattern (`createProductionSpawnFn` +
    `launchSubagentChild` + `driveSubagentChild`, all three AGENTS.md
    `#subagent-child-pins` plus parent-pid carriage, `requirePath` fail-loudly
    preconditions, every theta body a pure tail expression so zero model turns
    are spent). The root is the spawned child and the prompt→prompt cell runs
    inside it. §Reproduction (b)'s `d`/`e`/`g` controls are kept as the
    over-reach fence and assert UNCHANGED values.
  - `tests/live/live-production-acceptance.test.ts` — one additive H8a cell
    (**+138/−0**, a pure append; no existing cell weakened, reworded, reordered
    or deleted). No pre-existing live cell drove this shape: every typed
    `invoke<T>` cell in the file targets a `mode: subagent` callee (the leg the
    PIC-59 envelope normalises incidentally), 0172's boundary-2 callee is
    `mode: subagent` by the `theta/load/prompt-mode-callable` load gate, and
    `tests/live/hardening/session-invoke-attach.test.ts` drives the attach
    topology with `invoke<number>`, which is never boxed. The new cell is the
    bug 0067 cell with the callee's `mode:` changed to `prompt`.

- **Structural identity of the projection** (the route-(b) caveat §Fix (b)
  raises — "a route must state that the two are structurally identical or the
  diagnostic positions drift"). Measured: the projection preserves key order
  (`["sev","who"]` both sides), array shape
  (`[boxed, [boxed], {k: boxed}]` → `["high",["high"],{"k":"high"}]`) and every
  own key including one spelled `__proto__` (which lands as an own key on the
  null-prototype record, bug 0173's discipline). A payload failing for a
  NON-enum reason reports the identical `instancePath`: a `Box` with
  `who: 42` yields `/who #/properties/who/type` under the projection, exactly
  the position it reports without one. AJV `instancePath` addresses therefore
  remain truthful.

- **GOV-15** (`docs/spec_topics/governance/source-language-stability.md:5`,
  §Fix (d)(7)). Refusals become successes; nothing that succeeds is refused, and
  **no passing payload's bound identity changes** — under route (b) the caller
  receives `result.value`, the callee's own object, on every path, so
  `tests/wire-translation-inbound-retag.test.ts`'s brand-survival cell is
  untouched by construction. Copy-on-change makes the other half structural
  rather than incidental: a payload carrying no boxed value anywhere reaches the
  AJV seam as the SAME reference it always did. The spellings that flip from
  refusal to success are exactly the typed `invoke<T>` returns of a
  **prompt-mode** callee whose `Ok` payload carries a named-enum value at a
  position the walk reaches:
  1. the annotated root — `invoke<Sev>` returning `Sev.High`;
  2. a named-enum FIELD of a schema-typed object — `invoke<Box>` returning
     `Box { sev: Sev.High, who: "w" }` (previously `instancePath` `/sev`);
  3. an ARRAY ELEMENT — `invoke<array<Sev>>` returning `[Sev.High]` (`/0`);
  4. a union arm — `invoke<Sev | null>` returning `Sev.High`;
  5. every nesting of 1–4 the walk recurses through.

  Nothing else moves. The subagent leg's payloads are already JSON primitives,
  so the projection is a no-op copy there and its verdicts are unchanged
  (§Fix (d)(4)): bug 0067's witness
  `tests/subagent-invoke-inbound-enum-tag.test.ts` is byte-identical to HEAD and
  green, including its `anon` control pinning `Severity.Low == "low"` at
  `false`. §Fix (d)(5) holds untouched: anonymous string-literal-union positions
  carry plain strings, were never in the refused set, and the walk gives them no
  tag.

- **New-caller coverage** (the callers bug 0172 landed on this seam at 0.97.0).
  (i) The `.theta`-callable **callee-inferred** arm resolves through the same
  `#resolveReturnSite` and validates through the same `#validateInvokeReturn`
  gate, so the normalisation covers it automatically with no second call site.
  Its callees are `mode: subagent` **by load gate**
  (`theta/load/prompt-mode-callable`, `src/parser/callable-set.ts`;
  `frontmatter-fields-a.md:79`), so in production they are envelope-serialised
  and never boxed; the hand-built past-the-gate combination exists only in
  `tests/result-value-privacy.test.ts`, whose callee returns are enum-free and
  which is green either way.
  (ii) The **typed-query** and **binder-`args`** boundaries validate parsed JSON
  and are never handed a boxed value; their validators are not this gate and
  needed no change. Their AJV sites (`typed-query-validation.ts`, and the binder
  envelope / post-default-merge / subagent-root-params / respond-tool /
  Pi-tool-`parameters` sites in the producer) are untouched.
  On the 0172 interaction generally: this fix's site is DOWNSTREAM of 0172's
  wiring — the boundaries 0172 wired feed AJV primitives — so the two are
  disjoint on inputs. Both edited `#validateInvokeReturn`; this fix rebased onto
  0172's hunks (the re-signatured method, the `InvokeReturnTyping` three-arm
  discriminator, `#resolveReturnSite`).

- **Gates** (at the fix commit, on the shipped tree):
  - Witness — `npx vitest run tests/invoke-return-enum-carrier-projection.test.ts tests/invoke-prompt-cell-enum-return.test.ts`:
    `Test Files 2 passed (2) / Tests 17 passed (17)`.
  - Full default suite — `npx vitest run`:
    `Test Files 302 passed (302) / Tests 4938 passed (4938)`.
  - Typecheck — `npx tsc -p tsconfig.json --noEmit`: clean, exit 0.
  - Lint — `npm run lint`
    (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`): clean, exit 0.
  - Live (H8a) —
    `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts`:
    `Test Files 1 passed (1) / Tests 38 passed (38)`, 135.32 s — the 37
    pre-existing cells plus the new bug-0174 attach cell, all green on the first
    pass, no known live signature encountered.
    `tests/fixtures/h7a/permitted-codes.json` byte-unchanged; H9a not required
    (no load or registration surface changed).

- **Review:** 2 rounds. Round 1 (deep) — FINDINGS, three items, all comment or
  assertion-message text; it judged the code change itself correct, faithful to
  §Fix (b) and inside every (d)-constraint, and raised no `correctness`,
  `fidelity` or `spec` finding. Round 2 (confirmation, required because one
  remedy touched a string literal inside an `expect(...)` call) — CLEAN. One
  pre-review CORRECTION round ran before round 1 (citation text only; round
  numbering unaffected).

- **Verification:** SOLID, all four obligations discharged with quoted evidence.
  (1) The witnesses genuinely red: neutralising the fix to
  `validator.validate(result.value as unknown)` reds both files with the bug's
  own signature (`Err(InvokeInfraError{cause:"return_validation"})`, and
  `{"ok":false}` at `instancePath` `""`, `/sev`, `/0`); restoring returns the
  file to blob `ee6c7d60…`, byte-exact, and both files green. (2) Full default
  suite green. (3) One end-to-end live test exercises the fixed path, run for
  real, proved both directions — pre-fix its red is
  `theta /b174liveppparent returned Err: invoke of ./b174liveppkid.theta failed (return_validation)`.
  (4) Lint and typecheck clean.

- **Residuals:**
  1. **The mode-invariance of the return surface is still not total, for a
     different reason.** Under `invoke<number>` a callee returning `n / 0`
     yields `Infinity`: the prompt cell binds it, the subagent leg's PIC-59
     envelope serialises it as `null` (`JSON.stringify(Infinity)`) and AJV
     refuses. Measured in review round 1. Out of this report's subject (a
     non-finite `number`, not a named-enum carrier) and out of reach of a fix
     here — normalising it would newly refuse a today-passing prompt-cell input,
     which GOV-15 forbids. Unfiled; a report of its own.
  2. **The same representation class at the binder defaults-merge AJV boundary,
     unfiled and unwitnessed.** `#recoverDeclaredDefaults` →
     `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts`) evaluates a
     `params:` default authored as an enum access through the shared environment
     (`lexical-environment.ts` → `makeEnumValue` → boxed `String`) and hands it
     un-projected into the merged args. Measured at the seam: a default
     `Sev.High` under a `{sev: Sev}` params schema yields
     `{"kind":"ajv_args","ajvSummary":"/sev must be equal to one of the allowed values; /sev must be string"}`.
     `runtime-value-model.md:37` blesses `Severity.High` as a default and the
     type-compat deferral table (`tests/params-default-type-compat.test.ts:452`,
     row c6) defers exactly this shape "to the invocation-time AJV check", which
     then refuses it for its representation rather than its value.
     `tests/binder-post-merge-ajv-enforcement.test.ts` carries no
     enum-access-default row, so the cell is unwitnessed. §Non-goals declines it
     here ("a default authored as `Severity.High` never reaches an AJV
     **return** boundary" — true; it reaches the binder-args boundary instead),
     so it is a separate report. It also falsifies §Fix (c)'s reading that "no
     other site can be handed a boxed `String` … merged binder args".
  3. **A bare `catch { … }` in the new integration witness**
     (`tests/invoke-prompt-cell-enum-return.test.ts`, the `rmSync` scratch
     cleanup) is byte-identical — comment included — to the committed
     convention at `tests/subagent-invoke-inbound-enum-tag.test.ts:350`, the
     harness §Fix (d)(6) directed it to mirror. The repository's
     `no-broad-catch` closing gate scans `src/**` only. Left as the convention;
     if the house rule is ever tightened for tests, both sites move together.
  4. **§Non-goals' failure-message clause is still true under this fix.**
     `invoke<Sev> return value failed validation` still names the annotation and
     carries no AJV error detail. This fix changed which inputs reach that arm,
     not the arm.

- **Discharge notes appended:** none. 0068's §Resolution already links here and
  is not edited; 0172, 0120 and 0177 are not edited.

- **Pinned dispositions / non-goals:** the enum carrier stays a boxed `String` —
  `src/runtime/value.ts` and `src/seams/schema-validator.ts` are untouched, so
  `makeEnumValue`, `valuesEqual`, `privateBrandOf`, `ENUM_TAG` and
  `brandSchemaValue` keep the blast radius §Non-goals enumerates. 0172 face 2
  (`anyOf` arm dispatch) remains spec-blocked, open and unwired: this report's
  `(ANYOF)` cells pin pass-through end states only.

## Coordination note — bug 0181 (0.103.0)

Append-only; nothing above is edited.

**Residual 2 of `## Fix (0.98.0)` is discharged.** It recorded "the same
representation class at the binder defaults-merge AJV boundary, unfiled and
unwitnessed". It was filed as
[0181](./0181-enum-access-params-default-boxed-string-refused-at-merge.md) and
fixed at 0.103.0 by **route (a) sub-variant a1**: `#recoverDeclaredDefaults`
(`src/extension/production-theta-producer.ts`) now returns each recovered
default through `projectForValidation` — the very helper this fix shipped — so
the merged `args` reaching `fillDefaultsAndRevalidate` are homogeneous wire
form. The declaring-enum tag and the schema brand are re-established downstream
by the binder-`args` inbound boundary. The cell is witnessed offline by
`tests/params-default-enum-access-merge.test.ts` (10 cells) and live by cell 41
of `tests/live/live-production-acceptance.test.ts`.

**§Fix (c)'s "inert today" premise is now moot rather than merely falsified.**
That section reasoned partly from "today no other site can be handed a boxed
`String`, because their inputs are model-produced JSON or merged binder args",
flagging it as a claim to measure. 0181 measured it false — merged binder args
could carry one — and 0181's fix removes the counterexample at its source: the
merge no longer hands AJV a boxed value at all. The rejection of route (c)
(normalising inside the shared `AjvSchemaValidator` seam) stands on its other
ground and is not reopened; `src/seams/schema-validator.ts` remains untouched by
both fixes.

**§Non-goals is unchanged and stays true.** "A default authored as
`Severity.High` never reaches an AJV **return** boundary" was true because the
boundary it reached was the binder defaults-merge one; 0181 changed what that
gate is given, not this report's gate.
`tests/invoke-return-enum-carrier-projection.test.ts` and
`tests/invoke-prompt-cell-enum-return.test.ts` are byte-untouched by 0181 and
green at 0.103.0.

## Discharge note — residual 1 (R1) is bug 0180, fixed (0.105.0)

`## Fix (0.98.0)` §*Residuals* item 1 — the return surface's mode-invariance is
not total for a non-finite `number`, because the prompt cell preserves the value
and AJV admits it while `serializeOkEnvelope` substitutes `null` for it — was
filed as
[0180](./0180-invoke-return-nonfinite-number-mode-variance.md) and is **fixed
(0.105.0)** by that report's §Fix route **(b)**: the child refuses to emit an
`Ok` envelope for a payload carrying a non-finite `number`, emitting
`theta/runtime/subagent-return-value-not-representable` plus
`Err(InvokeInfraError { cause: "return_validation", ... })` naming the value and
its RFC-6901 position, rather than an envelope carrying a value the callee never
produced. R1's own reasoning that "normalising it would newly refuse a
today-passing prompt-cell input, which GOV-15 forbids" is why the prompt leg was
left alone: 0180 moves the subagent leg instead.

**This report's shipped mechanism is untouched by that fix.**
`src/runtime/wire-translation.ts` is byte-identical across it (verified by blob
hash), `projectForValidation`'s collapse arm and the validated-projection /
bound-original split are unchanged, and both witnesses
(`tests/invoke-return-enum-carrier-projection.test.ts`, 16 cells;
`tests/invoke-prompt-cell-enum-return.test.ts`) are green at 0.105.0.

**The `#validateInvokeReturn` doc-comment clause stays SCOPED to named-enum
returns.** Review round 1 of this report measured the counterexample that forced
the scoping, and 0180 does not retire it: the prompt leg still admits a
non-finite `number` the subagent leg now refuses, so the unscoped claim — that a
callee's `mode:` frontmatter cannot change whether a return validates — remains
false, and un-scoping it would reproduce the overclaim §Actual behaviour 5
indicts. 0180 §Fix (0.105.0) records that disposition and the residual
mode-variance it leaves, which PIC-59 now states normatively.
