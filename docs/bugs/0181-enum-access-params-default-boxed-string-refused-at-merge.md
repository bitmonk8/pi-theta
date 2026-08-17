# Bug 0181 — A `params:` default authored as `Enum.Variant` — the spelling `frontmatter-fields-a.md:67` supplies as its own worked example — is refused by the post-default-merge AJV check: `#recoverDeclaredDefaults` evaluates it through the body's environment to `makeEnumValue`'s boxed `String` (`typeof` `"object"`) and `fillDefaultsAndRevalidate` hands it un-projected to the compiled validator, so `{"type":"string","enum":[…]}` refuses the runtime's own default, the slash invocation ends `bound: false` behind `theta /<name>: argument binding produced invalid args — /p must be equal to one of the allowed values; /p must be string`, and the binder model call that preceded it is spent — where the same field defaulted to the bare wire string binds and reaches body scope tagged

- **Status:** fixed (0.103.0). The route §Fix left constraint-pinned is settled
  and shipped — **(a) sub-variant a1**, the projection applied at recovery — and
  the record is `## Fix (0.103.0)` at the end of this document. What decided the
  choice is a re-measurement: §Reproduction (f)'s route-divergence, the single
  position where the two candidates produced different end states, no longer
  exists at the fixed HEAD, because bug 0172 face 2 (0.102.0) threads the
  compiled-validator seam into the binder-`args` inbound boundary and a
  union-arm default now re-tags. Residual **R2** of the bug
  [0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) fix (0.98.0,
  commit `f912a8c3`), recorded there as `## Fix (0.98.0)` *Residuals* item 2 and
  in that fix's report (`.pi/tmp/fixes/0174-report.md` §"Residuals / notes",
  R2). §Fix was constraint-pinned, not settled: two candidate projection points
  on one path are pinned with their measured end states, and the choice decides
  whether a second surface (the BND-1 success echo) needs an arm of its own.
  Ordering: nothing blocks this report from starting. 0174's fix shipped the
  mechanism a route here would reuse (`projectForValidation`,
  `src/runtime/wire-translation.ts:494`) and is closed;
  [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)'s
  face-1 fix (0.97.0) wired the binder-`args` inbound projection that sits
  *downstream* of the refusing check, and this report's end-state trace runs
  through it, so a route here reads that wiring rather than moving it.
- **Sev/Diff estimate:** S2/D2 — S2 because conformant input is refused
  **loudly** and the refusal names the wrong party: the spec's own worked
  example spelling (`severity: Severity = Severity.Medium`,
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:67`) cannot be invoked,
  the caller observes `theta /<name>: argument binding produced invalid args —
  <ajv-summary>` on the `theta-system-note` channel and `{ bound: false }` (the
  body never runs), and the binder produced valid args — what AJV refuses is the
  value the runtime itself filled in. No value is corrupted and no comparison
  flips, which is what keeps it out of the S1 band. D2 because the remedy is one
  argument at one of two named points on one path, the projection helper already
  ships and is measured non-destructive here, and the witness is offline and
  provider-free — but the route choice is a real in-run adjudication: one arm
  leaves a boxed `String` in the merged `args` and reds the argument echo
  (measured: `box={{h, …}, …}` instead of `box={high, …}`, §Reproduction (e)),
  the other relies on the inbound pass 0172 wired to restore the tag — which
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:71` describes as
  happening "without a separate restoration pass", and which measurably does
  **not** restore it at a union arm (§Reproduction (f)). Not D1 for that reason.
- **Kind:** defect — a value the specification blesses as a `params:` default is
  refused by the invocation-time check the specification defers that value's
  type-compatibility *to*, on its representation rather than on its value. Four
  elements, each measured at HEAD `a1eec82c`, v0.98.0.
  1. *The recovered default is a boxed `String`.* `#recoverDeclaredDefaults`
     (`src/extension/production-theta-producer.ts:1268`) re-reads the theta's
     frontmatter, splits each defaulted field's `= <literal>` RHS
     (`splitParamDefaultSource`, `:1300`), parses it (`parseExpressionSource`,
     `:1304`, `src/parser/theta-document.ts:1169`) and evaluates it against an
     environment built from the theta's own body (`buildBoundEnvironment`,
     `:1288`) with `evaluatePureExpression` (`:1308`, the function at `:6009`).
     Its `member` arm (`:6040–6052`) routes `Enum.Variant` to
     `LexicalEnvironment.resolveEnumVariant`
     (`src/runtime/lexical-environment.ts:526`), which returns
     `makeEnumValue(enumName, wire)` (`:533`) — `new String(wire)`
     (`src/runtime/value.ts:135`, the carrier at `:136`). Measured: `typeof` is
     `"object"`; `JSON.stringify` of it is `"high"`.
  2. *The merge hands that value to AJV unchanged.* `#mergeDeclaredDefaults`
     (`:1231`) compiles the lowered `params:` document and calls
     `fillDefaultsAndRevalidate` (`:1254`, `src/binder/defaulting.ts:117`),
     whose fill loop writes `field.defaultValue` straight into the merged record
     (`defaulting.ts:127–131`) and whose AJV step is
     `input.validator.validate(merged)` (`:151`) over that record. AJV's
     `type: "string"` check is a `typeof` test, so the boxed carrier fails it and
     the `enum` keyword fails alongside. Measured verdict:
     `{"ok":false,"errors":[{"instancePath":"/sev","schemaPath":"#/$defs/Sev/type",…,"message":"must be string"},{"instancePath":"/sev","schemaPath":"#/$defs/Sev/enum",…,"message":"must be equal to one of the allowed values"}]}`.
  3. *The refusal is terminal and reaches the operator as a binder failure.*
     `classifyBinderArgs` (`src/binder/retry-taxonomy.ts:184`) turns a non-empty
     AJV issue set into `{ kind: "ajv_args", ajvSummary }` (`:198`), and
     `runBinder` routes on it before the success echo (`:905–908`):
     `#emitBinderFailureNote` then `return { bound: false }`. Measured
     end to end through the production producer: exactly one binder model call
     (the class carries no retry, HC3-c), one `theta-system-note` entry with
     `display: true` and `details.event` `{}`, and no `args` surfaced.
  4. *The same field defaulted to the bare wire string binds — and binds
     tagged.* `sev: 'Sev = "high"'` merges the JSON primitive `"high"`, AJV
     admits it, the echo reads `Running /…: sev=high (default)`, and the
     merged record then passes through `bindParamsInbound`
     (`src/runtime/inbound-boundary.ts:114`, called from `paramBindingsFrom`,
     `src/extension/theta-composition-producer.ts:105`), whose named-enum re-tag
     arm (`src/runtime/wire-translation.ts:248–254`, the `makeEnumValue` at
     `:253`) turns it back into a tagged variant. Measured: `isEnumValue`
     `true`, `valuesEqual` against a local `Sev.High` `true`. The spelling the
     spec blesses is refused; the spelling it merely declines to refuse at load
     works.
- **Related:**
  - **0174** —
    [`0174-typed-invoke-enum-return-validation-prompt-cell.md`](./0174-typed-invoke-enum-return-validation-prompt-cell.md),
    **fixed (0.98.0)**, the finder. Same representation class, different
    boundary: 0174 owned the typed `invoke<T>` **return** gate on the
    prompt→prompt attach cell; this report owns the binder **defaults-merge**
    gate. **0174's §Fix (c) premise is falsified by this report and this report
    is the counterexample.** That section reads "today no other site can be
    handed a boxed `String`, because their inputs are model-produced JSON or
    merged binder args — but 'inert today' is a claim to measure, not assume".
    Merged binder args can carry a boxed `String`, by exactly the route measured
    below. The falsification **strengthens** 0174's rejection of its route (c)
    (normalising inside the shared `AjvSchemaValidator` seam) rather than
    weakening it — the seam is still the wrong place, and two boundaries needing
    the collapse is not seven — but the sentence is wrong, and 0174's
    §Non-goals sentence "a default authored as `Severity.High` never reaches an
    AJV **return** boundary" is true only because the boundary it reaches is
    this one. 0174's fix is closed and is not reopened here; its shipped
    `projectForValidation` is an available mechanism, named in §Fix.
  - **0172** —
    [`0172-inbound-translation-pass-unperformed-at-three-boundaries.md`](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md),
    **open**, face 1 **fixed at 0.97.0**. **Boundary, and a dependency in one
    direction only.** 0172 face 1 wired the binder-`args` inbound projection
    (`bindParamsInbound`, `theta-composition-producer.ts:105`) that runs
    *after* this report's check passes. It is the reason a projected default
    would reach body scope tagged at all (§Reproduction (e)), so a route here
    reads it as a fact and does not move it. The two are disjoint on the
    observable — 0172's is a silent untagged bind after `{"ok":true}`, this
    report's is `{"ok":false}` and no bind at all — and on the fix surface:
    0172 added call sites downstream, this report changes what the upstream
    gate is given. 0172 face 2 (`anyOf` arm dispatch) stays open, spec-blocked
    and untouched — and it is what makes one §Fix route lossy at one position:
    a union-typed enum default projected to its wire form is never re-tagged,
    measured in §Reproduction (f). No route here wires arm dispatch; a route
    that would need it has widened into 0172.
  - **0178** —
    [`0178-subagent-callee-nonbypass-params-unregistered-in-child.md`](./0178-subagent-callee-nonbypass-params-unregistered-in-child.md),
    **open**. **Interaction, stated from both sides.** The defect measured here
    is on the **parent-side slash-dispatch binder path**: `runBinder` is reached
    only on a slash invocation (`production-theta-producer.ts:1319–1321`), and
    `fillDefaultsAndRevalidate` has exactly one production caller
    (`rg -n "fillDefaultsAndRevalidate" src/` → the definition, one import, one
    call). The subagent-root leg does not fill declared defaults at all: it
    validates the marshalled params and binds them directly
    (`#intakeSubagentRootParams`, `:2047`; the projection at `:2181`), so it
    never constructs a default value and never meets this gate. That leg is
    additionally masked by 0178 for the sub-case it owns — a `mode: subagent`
    callee whose `params:` are not bypass-eligible (a named `enum` type is one
    of its listed triggers) and whose binder model does not resolve inside the
    child fails registration there entirely. A named-`enum` `params:` field is a
    non-bypass shape on both reports' reading, which is why the reproduction
    below is driven parent-side and offline rather than through a spawned child.
  - **0066** — [`0066-ajv-verdict-discarded-unreachable-enforcement.md`](./0066-ajv-verdict-discarded-unreachable-enforcement.md),
    **fixed (0.88.0)**, the owner of the hook this report fires. Its fix is what
    makes the refusal reach the operator at all: before it the verdict was
    computed and discarded, and a merged document AJV refused bound behind the
    success echo. Nothing here asks for that to be undone — the hook is correct
    and the input it refuses is not. Its witness
    `tests/binder-post-merge-ajv-enforcement.test.ts` carries **no**
    enum-access-default row (measured: the file declares no `enum` and names no
    enum type; its subject fixture is an all-string-literal union
    `'"x" | "y" = "zzz"'`, `:213–223`), so this cell is unwitnessed — the same
    posture 0174 was filed from.
  - **0163** —
    [`0163-params-default-type-compat-unchecked-at-load.md`](./0163-params-default-type-compat-unchecked-at-load.md),
    **fixed (0.88.0)**, the owner of the load-time companion gate and of the
    deferral table this report's shape sits in. Row **c6**
    (`tests/params-default-type-compat.test.ts:452`, `"Sev = Sev.A"` against
    `enum Sev { A, B }`, `:209`) asserts that the shape **loads silently**,
    licensed by `docs/spec_topics/type-system.md:48` ("the parse-time check is
    skipped and the runtime AJV check is the safety net"). The deferral is
    correct; the check it defers to is what refuses. **Boundary:** 0163's fix
    owns what happens at load, this report owns what happens at invocation. That
    test never invokes its fixtures, which is why the row has stayed green while
    the shape is unusable.
  - **0165** / **0166** —
    [`0165-empty-params-default-literal-admitted-and-never-bound.md`](./0165-empty-params-default-literal-admitted-and-never-bound.md)
    (**fixed 0.92.0**) and
    [`0166-unary-minus-default-admits-non-numeric-literal.md`](./0166-unary-minus-default-admits-non-numeric-literal.md)
    (**fixed 0.91.0**), the two other reports against this recovery path. Both
    are about which literal *spellings* the sublanguage admits and what
    `#recoverDeclaredDefaults` then evaluates them to. This report is about a
    spelling all three surfaces agree is legal, whose evaluated value the next
    step cannot read. Their fixes are in the parser and in the is-literal check;
    a route here does not touch either.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift.
    `src/extension/production-theta-producer.ts` is 6288 lines at this HEAD,
    against 6165 at `e18b30e5` (v0.90.0) — +123 across the 0172 and 0174 fixes,
    of which 0174's own hunk is `+22/−11`. Every 0174 citation into this file
    was already stale when that report was written. Every volatile position
    below is therefore named by symbol beside its line, and every line is
    stamped with the commit it was read at.
- **Affects** (every citation re-verified against the tree at HEAD `a1eec82c`,
  v0.98.0; symbols named beside lines):
  - **The refusing gate.** `fillDefaultsAndRevalidate`
    (`src/binder/defaulting.ts:117`), its fill-if-absent loop (`:127–131`, the
    write at `:129`), the ceiling-#4 depth walk that precedes AJV (`:139`) and
    **the `validate` call this report is about (`:151`)**; the classification it
    returns (`:153–161`, over `classifyBinderArgs`,
    `src/binder/retry-taxonomy.ts:184`, the `ajv_args` construction at `:198`).
    `DefaultedField` (`defaulting.ts:34`) and its `defaultValue` field (`:38`),
    whose doc-comment (`:37`) reads "a literal-sublanguage form, already lowered"
    — the value at this position is neither lowered nor wire-form (§Actual
    behaviour 2).
  - **The producer half.** `#mergeDeclaredDefaults`
    (`src/extension/production-theta-producer.ts:1231`), its `loweredSchema`
    narrowing (`:1236`), the recovery call (`:1247–1249`), the `compile`
    (`:1253`) and the `fillDefaultsAndRevalidate` call (`:1254`).
    `#recoverDeclaredDefaults` (`:1268`), its `sourcePath` / `readBytes` /
    frontmatter-YAML early returns (`:1272–1286`), the environment build
    (`:1288`), the per-field loop (`:1295–1309`) and **the evaluation this
    report's value comes from (`:1308`)**. The single call site
    (`:898`) and the routing that consumes the verdict (`:905–908`).
  - **The evaluation.** `evaluatePureExpression` (`:6009`) and its `member` arm
    (`:6040–6052`, the `resolveEnumVariant` call at `:6045`);
    `LexicalEnvironment.resolveEnumVariant`
    (`src/runtime/lexical-environment.ts:526`) and its `makeEnumValue` return
    (`:533`); `makeEnumValue` (`src/runtime/value.ts:135`), the `new String(wire)`
    carrier (`:136`) and the `ENUM_TAG` install (`:137–142`); `valuesEqual`
    (`:494`) and `isEnumValue` (`:420`); `buildObjectSchemaValue` (`:385`) and
    `brandSchemaValue` (`:277`), the pair a `Box { … }` default is built through.
  - **The surfaces downstream of a passing verdict.** `bindParamsInbound`
    (`src/runtime/inbound-boundary.ts:114`), reached from `paramBindingsFrom`
    (`src/extension/theta-composition-producer.ts:105`); the named-enum re-tag
    arm (`src/runtime/wire-translation.ts:248–254`) and `isPlainObject`'s
    explicit `value instanceof String` exclusion (`:78–85`, the clause at `:83`),
    which is what makes a boxed value pass the walk untouched.
    `#emitBinderEchoNote` (`production-theta-producer.ts:928`), its
    `echoTypeFromValue` call (`:955`) and `echoTypeFromValue` itself (`:5697`,
    the `typeof value === "string"` test at `:5698` and the plain-object fallback
    at `:5721–5734`); `renderArgumentEcho` (`src/render/argument-echo.ts:196`)
    and `renderEchoValue` (`:163`, its `enum` case at `:175`).
  - **The mechanism a route would reuse.** `projectForValidation`
    (`src/runtime/wire-translation.ts:494`), 0174's shipped boxed-`String`
    collapse (`:495–499`), its array walk (`:500–510`), its `Result`
    pass-through (`:511–518`) and its copy-on-change plain-object walk
    (`:519–531`).
  - **The validator seam.** `AjvSchemaValidator`
    (`src/seams/schema-validator.ts:104`), its construction
    (`:112` — `{ strict: false, allErrors: true, logger: false }`) and its
    content-addressed `compile` (`:116`). Unchanged by any route pinned here.
  - **The note surface.** `renderFailureNote` (`src/binder/system-note.ts:131`),
    `capSystemNote` (`:99`) and `SYSTEM_NOTE_CODEPOINT_CAP` (`:38`) — the
    120-code-point cap that truncates the rendered summary for any theta whose
    slash name pushes the row past it (measured, §Reproduction (a)).
  - **Two code comments the measurement falsifies.**
    `src/runtime/inbound-boundary.ts:109–112` — "Frontmatter `params:` DEFAULTS
    never arrive here: they bypass the inbound pass by specification … and are
    merged before this projection as already-theta-side values". Measured: a
    filled default is written into the merged `args` (`defaulting.ts:129`) and
    the merged `args` are exactly what `paramBindingsFrom` hands
    `bindParamsInbound`, so a filled default DOES arrive there. It survives
    unchanged when it is a boxed carrier and is **re-tagged** when it is a bare
    wire string (§Reproduction (e)). `src/runtime/wire-translation.ts:35–39`
    states the same claim in the module header ("neither passes through
    `translateInbound`"). Both are code comments; no route here is required to
    make them true, but a route must not rely on them.
  - **Spec.** `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60`
    (§Defaults — the admitted production set including "`Enum.Variant` access",
    and "When a slash-command invocation omits the corresponding positional
    argument, the default is filled in before AJV validation"), `:67` (the
    worked example `severity: Severity = Severity.Medium`), `:71` ("`Enum.Variant`
    defaults preserve the runtime enum brand … without a separate restoration
    pass"); `docs/spec_topics/grammar.md:26`
    (`NamedValueLit ::= Ident "." Ident`); `docs/spec_topics/type-system.md:48`
    (§Unresolvable operands — "the parse-time check is skipped and the runtime
    AJV check is the safety net", the sentence the deferral rests on);
    `docs/spec_topics/binder/defaulting-system-note-echo.md:9` (fill-if-absent),
    `:11` (the post-default-merge AJV hook);
    `docs/spec_topics/binder/determinism-cancellation-failure.md:35` (the
    AJV-on-`args` class, not retried), `:42` (`<ajv-summary>`), `:52` (the
    rendered row), `:58` (no retry budget);
    `docs/spec_topics/runtime-value-model.md:13` (the enum row — the tag "MUST
    NOT appear in JSON output"), `:34` (the inbound bullet's post-AJV ordering
    and four-boundary sentence), `:37` (the `params:`-defaults bypass clause);
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15).
    Reference mirrors: `docs/reference/frontmatter.md:101` (§Defaults), `:111`
    ("the default fills in before AJV validation");
    `docs/reference/type-system.md:145` (§Wire-name translation).
  - **The committed cells a fix must not red.**
    `tests/params-default-type-compat.test.ts` — the load-time companion gate;
    its deferral table (`:437–468`) and row **c6** (`:452`) must keep loading
    silently, and its shared body declares `enum Sev { A, B }` (`:209`).
    `tests/binder-post-merge-ajv-enforcement.test.ts` — the `runBinder` half of
    0066's witness, five cells over an all-string-literal-union default
    (`ENUM_DEFAULT_THETA`, `:213–223`) and two depth-chain fixtures; it names no
    enum type, so no route here moves it.
    `tests/defaulting-post-merge-classification.test.ts` — the leaf-level
    `fillDefaultsAndRevalidate` cells.
    `tests/e2e-s5-binder-echo-emission.test.ts` — the BND-1 echo's emission,
    which a route leaving a boxed carrier in the merged `args` must be measured
    against (§Fix (c)(4)).
    `tests/invoke-return-enum-carrier-projection.test.ts` — 0174's witness over
    `projectForValidation`, including its boxed-pass-through cell; and
    `tests/wire-translation-inbound-retag.test.ts` — the inbound walk's
    brand-survival cells. A route reusing either mechanism keeps both green.
  - **Corpus census, re-run at HEAD.** 34 committed `.theta` / `.thetalib`
    files; **none** declares a named `enum` (`git ls-files | grep -E
    '\.(theta|thetalib)$' | xargs rg -l '^\s*enum '` returns nothing), so no
    committed fixture can reach this defect and the committed-fixture parse gate
    never meets one. Across `tests/`, the only enum-access `params:` default at
    HEAD is deferral row c6 (`tests/params-default-type-compat.test.ts:452`),
    which is asserted at **load** and never invoked.
- **Observed at:** v0.98.0 (`a1eec82c`). One measurement layer, offline,
  deterministic and provider-free: a single scratch vitest probe driving the
  production `ProductionThetaProducer.runBinder()` end to end on the
  bug-0011 / e2e-s5 pattern (real `parseThetaDocument`, real
  `createProductionProducerDeps`, the real `AjvSchemaValidator` with the shipped
  content-addressing, an in-memory `FileSystem` seam resolving each fixture's
  `sourcePath` so the real `#recoverDeclaredDefaults` re-reads the bytes the
  parser saw, and the off-session pi-ai `complete()` mocked to return one
  scripted `ok` envelope), plus direct calls into
  `fillDefaultsAndRevalidate`, `projectForValidation`, `bindParamsInbound` and
  `renderArgumentEcho`. Every theta body is a pure tail expression and the
  binder reply is scripted, so zero model turns were spent. Written, run and
  deleted; the tree carries no scratch file from it. Every value quoted below is
  that run's output verbatim.

## Summary

`docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` admits `Enum.Variant`
access as a `params:` default and fixes when it is used: "When a slash-command
invocation omits the corresponding positional argument, the default is filled in
before AJV validation." Its worked example (`:67`) is
`severity: Severity = Severity.Medium`. At HEAD that shape cannot be invoked.

`#recoverDeclaredDefaults` (`production-theta-producer.ts:1268`) evaluates the
default's literal against an environment built from the theta's own body, so
`Sev.High` resolves through `LexicalEnvironment.resolveEnumVariant`
(`lexical-environment.ts:533`) to `makeEnumValue`'s boxed `String`
(`value.ts:135`) — the representation `runtime-value-model.md:13` requires the
JSON projection of, and whose `typeof` is `"object"`.
`fillDefaultsAndRevalidate` (`defaulting.ts:117`) writes that value into the
merged `args` (`:129`) and validates the merged record as it stands (`:151`).
AJV's `type: "string"` check is a `typeof` test, so the runtime's own default is
refused:

```json
{"kind":"ajv_args","ajvSummary":"/sev must be equal to one of the allowed values; /sev must be string"}
```

`runBinder` routes that classification before the success echo
(`:905–908`): one `theta-system-note` row, `{ bound: false }`, no retry
(HC3-c), and the theta does not start. The binder model call that produced a
correct `ok` envelope has already been spent.

The refusal is representational, not semantic. The identical field defaulted to
the bare wire string — `sev: 'Sev = "high"'` — merges a JSON primitive, passes
AJV, echoes `sev=high (default)` and reaches body scope **tagged**, because the
inbound pass 0172 wired re-tags it at the named-enum position. The spelling the
specification supplies is refused; the spelling it merely declines to refuse at
load works.

Four positions fail, all measured: the annotated field itself (`/sev`), a
named-enum field of a schema-typed default (`/box/sev`, under both the
`Box { … }` and the bare-object spellings), an array element (`/sevs/0`), and a
union arm (`Sev | null`, four AJV errors rather than two). A schema brand alone
is harmless — a `Plain { who: "w" }` default binds, echoes and carries its
`Plain` brand through — so the boxed `String` is the sole refusing carrier.

`tests/params-default-type-compat.test.ts:452` (deferral row c6, `Sev = Sev.A`)
defers this exact shape "to the invocation-time AJV check", licensed by
`type-system.md:48`. That check refuses it. The row asserts loading only and has
stayed green throughout.

## Reproduction

Offline, deterministic, provider-free, at HEAD `a1eec82c`. Fixtures parse with
`diagnostics []`; the scripted binder envelope is `{ kind: "ok", args: { topic:
"hello" } }` on every row — the defaulted field omitted, exactly as the binder
system prompt instructs.

### (a) The subject, end to end through the production binder

```
---
mode: prompt
bind_model: binder-model
params:
  topic: string
  sev: 'Sev = Sev.High'
---
enum Sev { High = "high", Low = "low" }
@`t=${topic}`
```

Lowered `params:` document, from the real parser:

```json
{"type":"object","properties":{"topic":{"type":"string"},"sev":{"$ref":"#/$defs/Sev"}},
 "required":["topic"],"additionalProperties":false,
 "$defs":{"Sev":{"type":"string","enum":["high","low"]}}}
```

`defaultedFields` is `["sev"]` and the retained `defaultSource` is `Sev.High`.
`runBinder` returns:

```
bound            : false
args             : undefined
binder calls     : 1
theta-system-note: theta /b1: argument binding produced invalid args — /sev must be equal to one of the allowed values; /sev must be string
                   display=true  details.event={}
```

The note above is the untruncated row, measured on a two-character slash name
(120 code points exactly). For the eight-character name `b181enum` the same row
renders past the cap and the operator sees it truncated:

```
theta /b181enum: argument binding produced invalid args — /sev must be equal to one of the allowed values; /sev must be…
```

The deferral table's own spelling, driven the same way — `p: 'Sev = Sev.A'`
against `enum Sev { A, B }`, the fixture of
`tests/params-default-type-compat.test.ts` row c6 with a required `topic: string`
added so the pass is a genuine binder pass:

```
parse diagnostics: []
lowered $defs Sev: {"type":"string","enum":["A","B"]}
bound            : false
theta-system-note: theta /b1c6: argument binding produced invalid args — /p must be equal to one of the allowed values; /p must be string
```

### (b) The controls — the same cell binds everything that is not the boxed carrier

Same harness, same scripted envelope.

```
sev: 'Sev = "high"'                   bound=true   args={"topic":"hello","sev":"high"}
                                      note = Running /b181str: topic=hello, sev=high (default)

sev: 'Sev = Sev.High', arg SUPPLIED   bound=true   args={"topic":"hello","sev":"low"}
                                      note = Running /b181enum: topic=hello, sev=low
                                      (fill-if-absent: the wire name is present, so the
                                       default is never constructed and never validated)

plain: 'Plain = Plain { who: "w" }'   bound=true   args={"topic":"hello","plain":{"who":"w"}}
                                      note = Running /b181plain: topic=hello, plain={w, …} (default)
                                      schemaTagOf(args.plain) = "Plain"
```

The third row is the brand control: the recovered default is a genuinely branded
object (`schemaTagOf` resolves `Plain`), AJV admits it, and it binds. A
`SCHEMA_TAG` brand is a non-enumerable symbol, invisible to `Object.entries`, so
AJV's object walk never sees it — the same reading 0174 measured at its own
boundary, confirmed here. The rejection is the enum carrier alone.

### (c) Depth — every named-enum position the merged document reaches

```
box:  'Box = Box { sev: Sev.High, who: "w" }'   bound=false
      note … /box/sev must be equal to one of the allowed values; /box/sev …

box:  'Box = { sev: Sev.High, who: "w" }'       bound=false
      note … /box/sev must be equal to one of the allowed values; /box/sev …

sevs: 'array<Sev> = [Sev.High]'                 bound=false
      note … /sevs/0 must be equal to one of the allowed values; /sevs/0 …
```

Both object spellings the sublanguage admits behave identically — the
`NamedObjectLit` (`Box { … }`) and the bare-object literal — because the
difference between them is the brand, and the brand is not what AJV reads. One
enum-valued position anywhere in a default is enough to refuse the whole merged
document: `Box`'s other field is a plain `string` that validates.

### (d) The seam, isolated

`fillDefaultsAndRevalidate` called directly with the two carriers, over the same
compiled validator and the same `binderArgs`:

```
typeof makeEnumValue("Sev","high")   : object       JSON.stringify of it : "high"

UN-PROJECTED default value:
  classification {"kind":"ajv_args","ajvSummary":"/sev must be equal to one of the allowed values; /sev must be string"}
  validation     {"ok":false,"errors":[
    {"instancePath":"/sev","schemaPath":"#/$defs/Sev/type","keyword":"type","message":"must be string"},
    {"instancePath":"/sev","schemaPath":"#/$defs/Sev/enum","keyword":"enum","message":"must be equal to one of the allowed values"}]}

projectForValidation(default) as the merged value:
  classification {"kind":"ok"}
  merged args    {"topic":"hello","sev":"high"}     typeof merged.sev : string
```

Two errors, not one, because the fragment a named `enum` lowers to carries both
`type` and `enum`; the `schemaPath` is `#/$defs/Sev/…` rather than
`#/properties/sev/…` because a named-enum field lowers through `$ref`.

At the same seam, over a schema-typed default:

```
AJV, branded Box with a BOXED sev field : {"ok":false, /box/sev #/$defs/Sev/type, #/$defs/Sev/enum}
AJV, same object with a PRIMITIVE field : {"ok":true}
projectForValidation(branded Box)       : {"sev":"high","who":"w"}
AJV over that projection                : {"ok":true}
```

### (e) The end-state trace — what a projected default becomes downstream

The merged `args` flow into `bindParamsInbound`
(`inbound-boundary.ts:114`) through `paramBindingsFrom`
(`theta-composition-producer.ts:105`) after the verdict. Measured over the same
lowered `params:` document and the theta's own body:

```
merged sev = projectForValidation(Sev.High)   → typeof object, isEnumValue true,
                                                valuesEqual(local Sev.High) true,
                                                JSON.stringify "high"
merged sev = the ORIGINAL boxed value         → SAME reference, isEnumValue true,
                                                valuesEqual(local Sev.High) true
merged sev = the bare wire string "high"      → typeof object, isEnumValue true,
                                                valuesEqual(local Sev.High) true

merged box = projectForValidation(Box{…})     → schemaTagOf "Box", .sev isEnumValue true,
                                                valuesEqual true
merged box = the ORIGINAL branded object      → rebuilt (new reference), schemaTagOf "Box",
                                                keys ["sev","who"], .sev isEnumValue true,
                                                valuesEqual true
```

At a `$ref`-addressed position both carriers reach body scope as a tagged
variant, by two different mechanisms: a projected value is **re-tagged** by the
inbound walk's named-enum arm (`wire-translation.ts:248–254`), and the original
boxed value is **passed through** untouched, because `isPlainObject` excludes
`value instanceof String` (`:83`) and the re-tag arm tests
`typeof value === "string"`. The end state is the same for every position
measured here; (f) below is the one position where it is not.

The BND-1 argument echo reads the merged `args`, and it is not carrier-blind.
`echoTypeFromValue` (`production-theta-producer.ts:5697`) tests
`typeof value === "string"` first (`:5698`) — false for a boxed carrier — and
falls through every primitive and array arm to the plain-object arm, whose
fields come from `Object.entries`. Measured:

```
typeof boxed              : object      Array.isArray(boxed) : false
Object.entries(boxed)     : [["0","h"],["1","i"],["2","g"],["3","h"]]
String(boxed)             : high

renderArgumentEcho, boxed carrier    : Running /b1: sev={h, …} (default)
renderArgumentEcho, wire string      : Running /b1: sev=high (default)
renderArgumentEcho, boxed Box field  : Running /b1: box={{h, …}, …} (default)
renderArgumentEcho, projected field  : Running /b1: box={high, …} (default)
```

`renderEchoValue` has an `enum` arm (`src/render/argument-echo.ts:175`) that
renders the underlying wire string correctly, but `echoTypeFromValue` never
mints `{ kind: "enum" }` — its doc-comment (`:5692–5694`) states the premise
"An enum value is a string at runtime and renders identically to a string
through the quote predicate, so the `string` arm is used for it", which the
`typeof` measurement falsifies. The echo is unreachable today because the bind
is refused before it, so this is not a second defect at HEAD; it is a surface a
route must clear.

### (f) The union-typed default — where the two carriers stop agreeing

`sev: 'Sev | null = Sev.High'` parses with `diagnostics []` and lowers the
field to `{"anyOf":[{"$ref":"#/$defs/Sev"},{"type":"null"}]}`. It is refused at
the merge like every other row here — four AJV errors rather than two, the two
named-enum ones plus `must be null` at `#/properties/sev/anyOf/1/type` and
`must match a schema in anyOf`. Downstream the two carriers diverge:

```
AJV, boxed carrier        : {"ok":false, /sev ×4}
AJV, projected            : {"ok":true}

projected → bindParamsInbound : isEnumValue false, valuesEqual(local Sev.High) false
ORIGINAL  → bindParamsInbound : isEnumValue true,  valuesEqual(local Sev.High) true
```

The inbound sidecar is keyed by JSON Pointer and an `anyOf` arm carries no
data-space position
([0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md) face
2), so a value projected to its wire form at a union-typed position is never
re-tagged. This is the one measured place where the two §Fix routes produce
different end states.

## Expected behaviour

- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60` (§Defaults) — the
  admitted production set, verbatim: "Primitive literals (including unary-`-` on
  numeric literals), `null`, array literals, bare-key object literals (the
  param's declared type supplies the schema), `Enum.Variant` access, and
  variant-schema construction (`Cat { ... }`) are all admitted." The same
  sentence fixes the invocation-time behaviour: "When a slash-command invocation
  omits the corresponding positional argument, the default is filled in before
  AJV validation." The default is specified to be filled and then validated —
  not to be filled and refused for its representation.
- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:67` — the section's own
  worked `params:` block includes `severity: Severity = Severity.Medium`
  alongside `author: Author = { … }` and `pet: Animal = Cat { … }`. A spec
  example that cannot be invoked is the plainest statement of the gap.
- `docs/spec_topics/frontmatter/frontmatter-fields-a.md:71` — "Because the
  literal sublanguage *is* a subset of the body expression grammar,
  `Enum.Variant` defaults preserve the runtime enum brand (see Runtime Value
  Model) **without a separate restoration pass**". The default is specified to
  arrive at the body carrying its tag, and to do so without a rebuild. Both
  measured end states in §Reproduction (e) satisfy the first half at a
  `$ref`-addressed position; only the pass-through carrier satisfies it at a
  union arm (§Reproduction (f)), and only the pass-through carrier satisfies the
  second half anywhere.
- `docs/spec_topics/type-system.md:48` (§Unresolvable operands) — "the
  parse-time check is skipped and the runtime AJV check is the safety net". This
  is the sentence that licenses deferring an enum-access default's
  type-compatibility to invocation time, and it is what
  `tests/params-default-type-compat.test.ts:452` (row c6) cites. A safety net
  that refuses the value it was handed to catch is not performing the role the
  sentence assigns it: the check is specified to adjudicate whether the default
  *is* a `Sev`, and `Sev.High` is one.
- `docs/spec_topics/binder/defaulting-system-note-echo.md:9` (fill-if-absent) and
  `:11` (the post-default-merge AJV hook) — the hook is "the
  `SchemaValidator.validate()` call that AJV-validates the merged `args` object
  against the lowered `params` schema after the runtime has filled the defaults
  above". Its subject is the merged document's conformance to the declared
  types. The declared type of `sev` is `Sev`; the filled value is a `Sev`.
- `docs/spec_topics/binder/determinism-cancellation-failure.md:35` — the
  AJV-on-`args` class exists for "a binder that returned a structurally valid
  envelope whose `args` violate the params schema … hallucinating field shapes".
  The binder here returned an envelope with no `sev` at all, exactly as
  instructed for a defaulted field. The class is being minted for a value the
  binder never produced, which is why `:52`'s rendered row —
  `theta /<name>: argument binding produced invalid args` — misnames the party
  at fault.
- `docs/spec_topics/runtime-value-model.md:13` (the enum row) — the requirement
  is on the tag's absence from JSON output; `JSON.stringify` of the recovered
  default is `"high"`, measured. The spec fixes the JSON projection and fixes
  nothing about `typeof`, which is where the AJV boundary reads. `:16`
  (non-normative) names the boxed-`String` carrier as the reference encoding.
- `docs/spec_topics/runtime-value-model.md:34` (§Wire-name translation, inbound
  bullet) — the pass runs "after AJV validation against the lowered schema" and
  applies to "binder `args`" among its four boundaries. Any route here leaves
  that ordering alone: the pass is downstream of the verdict this report is
  about, and the verdict is what must change.
- `docs/reference/frontmatter.md:101`, `:111` — the reference mirror restates
  both halves for the surface a theta author reads: `Enum.Variant` is an
  admitted default form, and "the default fills in before AJV validation".

## Actual behaviour / root cause

**1. The recovery evaluates a default with the body's own evaluator, which is
the point.** `#recoverDeclaredDefaults` builds an environment over the theta's
body and imports (`:1288`) precisely so "an enum / schema-literal default
resolves against the body's declarations" — its own doc-comment (`:1266`).
`evaluatePureExpression`'s `member` arm (`:6040–6052`) recognises
`Enum.Variant` as "a pure enum-value read, NOT a generic member access on a
null target" and returns `env.resolveEnumVariant(...)`, which is
`makeEnumValue(enumName, wire)` (`lexical-environment.ts:533`). The value is
correct at every level the language cares about: it carries the declaring-enum
tag, it compares equal to a body-code `Sev.High`, and it serialises to `"high"`.
Its `typeof` is `"object"`.

**2. The merge treats that value as if it were already wire-form.**
`fillDefaultsAndRevalidate`'s fill loop writes `field.defaultValue` into the
merged record verbatim (`defaulting.ts:129`), and `DefaultedField.defaultValue`'s
own doc-comment (`:37`) describes it as "a literal-sublanguage form, already
lowered". It is neither: it is a runtime `ThetaValue` produced by the body
evaluator, and nothing between the evaluator and the `validate` call (`:151`)
projects it. The binder-supplied half of the same record *is* wire-form — it is
`JSON.parse`d model output — so the merged document is a mixture of two
representations validated as one.

**3. AJV is a structural surface.** The production `AjvSchemaValidator`
(`src/seams/schema-validator.ts:104`) compiles with
`{ strict: false, allErrors: true, logger: false }` (`:112`) and hands the value
to the compiled function unchanged. A named `enum` lowers to
`{"type":"string","enum":[…]}`, whose `type` check is a `typeof` test; the boxed
carrier fails it and the `enum` keyword fails alongside, which is why the summary
carries two clauses. This is the same mechanism 0174 measured at the invoke
return gate, against the same lowering, on the same seam.

**4. The verdict is terminal and the message names the binder.**
`classifyBinderArgs` (`retry-taxonomy.ts:184`) has no representation-aware arm
and correctly reports what AJV said (`:198`). `runBinder` routes the
classification before the echo (`:905–908`) — bug 0066's fix, and correct — so
the operator gets one row, `{ bound: false }`, and no retry (HC3-c). The row's
fixed phrase is `argument binding produced invalid args`, and the argument
binding produced valid args: the envelope omitted `sev` exactly as instructed.
The invalid value was supplied by the runtime, one step later. There is no
diagnostic code on this path (`details.event` is `{}`, measured), so nothing
else carries the distinction.

**5. Two code comments assert the property this breaks, and a third asserts a
premise the carrier falsifies.** `bindParamsInbound`'s doc-comment
(`inbound-boundary.ts:109–112`) states "Frontmatter `params:` DEFAULTS never
arrive here"; they do — `paramBindingsFrom` hands it the merged `args`, defaults
included. `wire-translation.ts:35–39` restates it ("neither passes through
`translateInbound`"). Measured: a bare-wire-string default passes through and is
*re-tagged* (§Reproduction (e)); a boxed one passes through unchanged. Both
comments' conclusion — that a default reaches the body indistinguishable from a
body-code `Severity.High` — holds today, but by the walk's boxed-`String`
tolerance rather than by the bypass they claim. Separately,
`echoTypeFromValue`'s doc-comment (`:5692–5694`) asserts "An enum value is a
string at runtime", which the `typeof` measurement falsifies and which is why
the echo would render a boxed carrier through its object arm. None of the three
is a specification sentence; each is a claim a route must not rest on.

**6. Nothing gates the shape.** No committed `.theta` / `.thetalib` declares a
named `enum` (0 of 34), so no fixture reaches it. The one committed test that
spells an enum-access default (`tests/params-default-type-compat.test.ts:452`)
asserts only that it loads. 0066's `runBinder` witness
(`tests/binder-post-merge-ajv-enforcement.test.ts`) drives the post-merge hook
with an all-string-literal-union default and names no enum type, so the hook is
witnessed at exactly the representation that cannot exhibit this.

## Why it matters

- **The specification's own worked example cannot be invoked.**
  `frontmatter-fields-a.md:67` writes `severity: Severity = Severity.Medium` in
  the block that teaches defaults, and `:60` states the runtime behaviour for it.
  A theta author copying that line gets a refusal whose text points at the binder.
- **The deferral chain terminates in the wrong answer.** The load-time
  compatibility check defers an enum-access default to invocation
  (`type-system.md:48`, deferral row c6), the invocation-time check refuses it,
  and the refusal is about representation rather than type. Both halves are
  individually defensible and the composition is not.
- **The workaround is to write the wire string, which discards the guarantee the
  spelling exists for.** `sev: 'Sev = "high"'` works today (measured). It is
  weaker in exactly the way `frontmatter-fields-a.md:71` says authors should not
  have to think about: the string is not checked against `Sev`'s variant set at
  load (deferral row c2 is the same shape with a bad value), and correctness now
  depends on the inbound pass 0172 wired at 0.97.0 restoring the tag rather than
  on the value having carried one all along. An author following the error
  message to the only thing that makes it stop trades a language-level value for
  a wire-level one, and nothing tells them so.
- **A model call is spent before the refusal.** The default is filled after the
  binder returns, so the invocation always costs one binder LLM turn before it
  can fail. The failure is deterministic and decidable from the theta's own
  frontmatter; the cost is paid every time.
- **It reaches every named-enum position at every depth.** Measured at the
  annotated field (`/sev`), inside a schema-typed default under both admitted
  object spellings (`/box/sev`), inside an array (`/sevs/0`) and inside a union
  arm (`Sev | null`). One enum-valued position anywhere in one default refuses
  the whole merged document.
- **It falsifies a sentence a closed report reasoned from.** 0174 §Fix (c)
  rejected the shared-seam route partly on "today no other site can be handed a
  boxed `String` … merged binder args", flagging it as a claim to measure. It is
  measured here and it is false. The rejection stands on its other ground and is
  not reopened, but a second boundary now needs the same collapse, and any later
  route that re-argues the seam should re-argue it against two sites rather than
  one.
- **Nothing witnesses the cell.** The hook has a `runBinder` witness, a
  leaf-level witness and a load-time companion gate, and none of the three names
  an enum type. The cell is unwitnessed in the direction that fails — the same
  posture 0174 was filed from, at the boundary 0174's own residual named.

## Fix

Not settled. Two candidate projection points on one path are pinned below with
their measured end states; the run selects one and states the evidence that
decided it. Both carry the constraints in (c).

### (a) Project the recovered default to wire form, at recovery or at the merge

Have `#recoverDeclaredDefaults` return `projectForValidation(evaluatePureExpression(...))`
(`production-theta-producer.ts:1308`), or apply the same collapse to
`field.defaultValue` inside `fillDefaultsAndRevalidate`'s fill loop
(`defaulting.ts:129`), so the merged `args` are wire-form throughout.

- **It makes the merged document homogeneous**, which is what the AJV step
  assumes and what `DefaultedField.defaultValue`'s own doc-comment already
  claims ("already lowered", `defaulting.ts:37`). The binder-supplied half is
  `JSON.parse`d model output; after this route the filled half is the same kind
  of thing.
- **The tag is restored downstream, measured.** The merged `args` reach
  `bindParamsInbound` (`inbound-boundary.ts:114`) via `paramBindingsFrom`
  (`theta-composition-producer.ts:105`), whose named-enum arm re-tags the wire
  string at `/sev` and re-brands a schema-typed object at `/box`:
  `isEnumValue` `true`, `valuesEqual` against a local `Sev.High` `true`,
  `schemaTagOf` `"Box"`, keys `["sev","who"]` (§Reproduction (e)). The end state
  is correct.
- **It relies on a restoration pass, which one spec sentence says is not
  needed.** `frontmatter-fields-a.md:71` says `Enum.Variant` defaults "preserve
  the runtime enum brand … without a separate restoration pass". Under this
  route the brand is destroyed and rebuilt. The observable end state still
  satisfies the sentence's *purpose* (the value is indistinguishable from a
  body-code `Sev.High`), and `runtime-value-model.md:37` separately says
  defaults "bypass the inbound translation pass" — which HEAD already does not
  do, since the merged `args` carry the defaults into that pass. A route here
  states its reading of both sentences rather than leaving it implicit, and
  either brings the two falsified code comments (`inbound-boundary.ts:109–112`,
  `wire-translation.ts:35–39`) into line or scopes them.
- **The tag's survival becomes conditional on a position the sidecar can
  address, and one legal position is not one.** `bindParamsInbound` re-tags only
  where a JSON Pointer names the position. Measured (§Reproduction (f)): a
  `sev: 'Sev | null = Sev.High'` default projected to its wire form binds as an
  **untagged string** — `isEnumValue` `false`, `valuesEqual` against a local
  `Sev.High` `false` — because an `anyOf` arm carries no data-space position
  (0172 face 2). The same default left as the original boxed value binds tagged.
  Under this route the report's loud refusal becomes a silent untagged bind for
  union-typed enum defaults — the class 0172 face 2 owns, and the exact trade
  0174's fix run measured and rejected for its own route (a). A route taking (a)
  states what it does about that cell.
- **It costs a walk per defaulted field**, bounded by the ceiling-#4 depth cap
  already enforced over the merged document (`defaulting.ts:139`).

### (b) Validate a projection of the merged document, merge the original

Compute `projectForValidation` over the merged record for the AJV call alone
(`defaulting.ts:151`), and return the original merged `args` — boxed carriers
and brands intact — as `FillDefaultsResult.args`. This is 0174's shipped route
(b), one seam over.

- **It changes no value anything downstream receives**, so the tag survives by
  pass-through rather than by rebuild: measured, the original boxed value comes
  out of `bindParamsInbound` as the **same reference**, still tagged
  (§Reproduction (e)). `frontmatter-fields-a.md:71`'s "without a separate
  restoration pass" stays literally true, and the union-typed default route (a)
  strips is unaffected: measured, the original carrier binds tagged at an
  `anyOf` position because nothing re-tags it and nothing needs to
  (§Reproduction (f)).
- **It reuses a shipped, already-witnessed mechanism.** `projectForValidation`
  (`wire-translation.ts:494`) is copy-on-change and returns the same reference
  wherever no descendant needed collapsing, so a merged document carrying no
  enum value anywhere reaches the seam unchanged. Its structural-identity
  property — key order, array shape, own keys including `__proto__` — was
  measured at the 0174 fix and pins that AJV `instancePath` addresses stay
  truthful.
- **It leaves a boxed `String` in the merged `args`, and one downstream reader
  cannot read it.** The BND-1 echo renders off `merged.args`
  (`production-theta-producer.ts:928`, the type derivation at `:955`) and
  `echoTypeFromValue`'s first test is `typeof value === "string"` (`:5698`),
  which a boxed carrier fails; the plain-object fallback then renders it from
  `Object.entries`. Measured: `sev={h, …}` rather than `sev=high`, and
  `box={{h, …}, …}` rather than `box={high, …}`. A route taking (b) adds the
  missing arm — `renderEchoValue` already has an `enum` case
  (`argument-echo.ts:175`) that `echoTypeFromValue` never mints — and corrects
  that function's doc-comment premise (`:5692–5694`) in the same commit.
- **It introduces two values where there was one**, at a seam whose current
  contract is "the merged args are what AJV saw". The code must make that legible
  or it becomes a trap for the next reader — the same caveat 0174 recorded for
  its own route (b).

### (c) Constraints every route carries

1. **The depth walk stays first.** `fillDefaultsAndRevalidate` runs
   `depthWalk(merged)` before AJV (`defaulting.ts:139`), which is CIO-3's
   walk-before-AJV ordering and enforcement point #4
   (`docs/spec_topics/schema-subset.md`, §"Depth Enforcement"). Any projection
   added here goes **after** the walk, so a hostile merged document is refused
   before anything copies it. `tests/defaulting-post-merge-classification.test.ts`
   and `tests/binder-post-merge-ajv-enforcement.test.ts` both pin that ordering.
2. **The inbound pass stays after AJV.** `runtime-value-model.md:34` fixes it,
   and 0172's face-1 fix landed the binder-`args` projection in that order.
   Projecting a value is not translating it: a route adds a step before or
   inside the `validate` call and does not move `paramBindingsFrom`.
3. **The load-time deferral is not touched.** Deferral row c6
   (`tests/params-default-type-compat.test.ts:452`) must keep loading silently.
   Refusing `Sev = Sev.A` at load would refuse a spelling
   `frontmatter-fields-a.md:60` admits, and `type-system.md:48` explicitly
   assigns the adjudication to the runtime check. The fix is at the check, not
   at the deferral.
4. **The echo is measured, whichever route lands.** Under (a) the echo renders
   from a wire string and needs nothing; under (b) it renders from a boxed
   carrier and reds as measured in §Reproduction (e). GOV-15's observable (c) is
   `theta-system-note` content, so the echo line is a governed observable and a
   route states what it does to it rather than discovering it.
   `tests/e2e-s5-binder-echo-emission.test.ts` is the cell that pins emission.
5. **GOV-15** (`docs/spec_topics/governance/source-language-stability.md:5`).
   No route refuses an input that succeeds today. What moves is a refusal
   becoming a success, on exactly the merged documents whose filled default
   carries a named-enum value: the annotated field, a named-enum field of a
   schema-typed default (both admitted object spellings), an array element, a
   union arm, and every nesting of those. The bare-wire-string spelling
   (`Sev = "high"`) binds today and must keep binding, with the same echo text
   and the same tagged body value.
6. **The subagent-root leg is out of frame and stays that way.** It fills no
   declared defaults (`#intakeSubagentRootParams`, `:2047`; the projection at
   `:2181`), and `fillDefaultsAndRevalidate` has one production caller. A route
   that reaches the child-side intake has widened past this report and into
   [0178](./0178-subagent-callee-nonbypass-params-unregistered-in-child.md).
7. **Test witness — unit, offline, provider-free.** The witness re-drives
   §Reproduction (a) through the production `runBinder` on the bug-0011 / e2e-s5
   pattern (real parser, real `AjvSchemaValidator`, in-memory `FileSystem` seam,
   scripted `ok` envelope, zero model turns): the enum-access default at the
   annotated field, inside both object spellings, inside an array and inside a
   union arm, asserting `bound: true`, the merged value, the echo text, and —
   through the same `bindParamsInbound` call production makes — that the bound
   value satisfies `valuesEqual` against a locally constructed variant and that
   a schema-typed default resolves under `schemaTagOf`. The union-arm cell is
   the one that separates the two routes (§Reproduction (f)) and asserts the tag
   there explicitly. §Reproduction (b)'s three controls are
   kept as the over-reach fence and assert UNCHANGED values, including the
   bare-wire-string default's echo text byte for byte. Deferral row c6's exact
   fixture is driven as a named cell, so the load-gate row and the invocation
   behaviour are pinned in one place. Each new assertion is proved both
   directions once — red with the projection neutralised, green with it
   restored.

### (d) Ordering

Nothing blocks this report from starting.
[0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) is closed and
its `projectForValidation` is in the tree;
[0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md) face
1 is shipped and this report reads it rather than moving it, so neither fix
changes the other's verdicts. A route taking (a) states its posture against 0172
face 2 (the union-typed default's `anyOf` position) rather than deciding it by
implementation.
[0178](./0178-subagent-callee-nonbypass-params-unregistered-in-child.md) is
independent: it owns the child-side registration refusal, and no route here
touches the child-side intake.

## Non-goals

- **0174's return boundary.** Fixed at 0.98.0; `#validateInvokeReturn` already
  validates a wire-form projection. This report changes a different gate and
  does not re-enter that one. `tests/invoke-return-enum-carrier-projection.test.ts`
  and `tests/invoke-prompt-cell-enum-return.test.ts` stay green untouched.
- **Changing the enum representation itself.** Replacing the boxed-`String`
  carrier would remove the `typeof` mismatch at its source and is **not this
  report's route**. Its blast radius is 0174 §Non-goals' enumeration, unchanged
  here: `valuesEqual`'s enum arm (`src/runtime/value.ts:494`, `:497–498`) and
  the cross-enum equality rule (`runtime-value-model.md:13`, `:22`);
  `privateBrandOf`'s shared posture over all three tags (`:186`, bug 0020's
  settled design); `translateInbound`'s re-tag arm and `isPlainObject`'s
  exclusion (`wire-translation.ts:248–254`, `:83`); and the `JSON.stringify`
  behaviour the enum row pins, on which the whole PIC-59 subagent leg depends.
  `src/runtime/value.ts` and `src/seams/schema-validator.ts` stay untouched.
- **Whether the load-time compatibility relation should resolve enum names.**
  Row c6 defers because the relation resolves against an empty environment.
  Making it resolve them would be a different report against a different gate,
  and it would not fix this one — a resolvable `Sev.High` is *compatible* with
  `Sev`, so the load check would still pass and the invocation check would still
  refuse.
- **The AJV-on-`args` row's wording.**
  `theta /<name>: argument binding produced invalid args — <ajv-summary>`
  (`determinism-cancellation-failure.md:52`) is the registered template, and
  whether a runtime-supplied default's refusal deserves a row of its own is a
  question about the taxonomy, not about this value. This report changes which
  inputs reach that row, not the row.
- **The 120-code-point note cap.** `SYSTEM_NOTE_CODEPOINT_CAP`
  (`src/binder/system-note.ts:38`) truncates the summary for longer slash names
  (measured, §Reproduction (a)). It applies to every binder note equally and is
  the specified behaviour.
- **Whether `params:` defaults should bypass the inbound pass at all.**
  `runtime-value-model.md:37` says they do; at HEAD the merged `args` carry them
  into `bindParamsInbound`, and for a bare-wire-string default the pass changes
  the value (§Reproduction (e)). That is a consequence of 0172's face-1 wiring
  and a question about that sentence, not about this refusal. It is recorded
  here as a §Fix constraint and as two falsified code comments in §Affects; a
  route may not rely on either comment, and if the sentence needs to move, that
  is a separate report.
- **The `invoke(...)` and `.theta`-callable argument paths.** They compute arity
  from `hasDefault` (`src/extension/production-composition.ts:1357`) and never
  construct a default's value: `defaultedFields` is read only by the binder
  envelope relaxation, the echo's `(default)` tag and this hook. Whatever those
  paths bind for an omitted defaulted argument is outside this report's
  boundary.

## Provenance

Filed from residual **R2** of the bug 0174 fix
(`.pi/tmp/fixes/0174-report.md` §"Residuals / notes" → "For the parent to file",
R2: "The same representation class at the binder defaults-merge AJV boundary,
unwitnessed"), which that fix's own `## Fix (0.98.0)` *Residuals* item 2 restates
and which its "Where the bug document turned out to be wrong or incomplete" item
1 names as the counterexample falsifying 0174 §Fix (c)'s "inert today" premise.
The 0174 run measured R2 at the seam and did not file it, per the fix-run rule
that a fix creates no bug documents.

**Re-derived at HEAD `a1eec82c` for this filing, not copied.** R2's bundle was
treated as a set of claims to check. What I checked and what I found:

- **R2's headline measurement reproduces exactly.** Its recorded classification
  for a default `Sev.High` under a `{sev: Sev}` params schema —
  `{"kind":"ajv_args","ajvSummary":"/sev must be equal to one of the allowed values; /sev must be string"}`
  — is byte-identical to the seam measurement in §Reproduction (d). R2 measured
  the seam only; §Reproduction (a) drives the same shape through the production
  `runBinder` end to end and records the caller-visible disposition R2 did not
  have: `{ bound: false }`, one binder model call, one `theta-system-note` row
  with `display: true` and `details.event` `{}`, and the note text at both the
  capped and uncapped lengths.
- **R2's citations, checked.** `#recoverDeclaredDefaults` →
  `fillDefaultsAndRevalidate` (`src/binder/defaulting.ts`) and the
  `lexical-environment.ts` → `makeEnumValue` chain read as cited; the precise
  lines are in §Affects. `runtime-value-model.md:37` carries the
  `params:`-defaults bypass sentence as cited.
  `tests/params-default-type-compat.test.ts:452` is row c6 verbatim
  (`["c6 (enum-access default)", "Sev = Sev.A"]`), and its `enum Sev { A, B }`
  is at `:209`. `tests/binder-post-merge-ajv-enforcement.test.ts` carries no
  enum-access-default row — checked by reading the file's five cells and by
  grep: it declares no `enum` and names no enum type.
- **One correction to R2's framing.** R2 records the value as reaching AJV
  because the merge "hands it un-projected into the merged args", which is
  right, and cites `runtime-value-model.md:37` as blessing the shape. `:37` is
  about the inbound-pass bypass; the sentences that actually bless
  `Enum.Variant` as a `params:` default and fix its invocation-time treatment
  are `docs/spec_topics/frontmatter/frontmatter-fields-a.md:60`, `:67` and
  `:71`, with `docs/spec_topics/type-system.md:48` licensing the deferral row
  c6 rests on. This document cites all five and treats `:37` as a §Fix
  constraint rather than as the blessing.
- **What R2 did not measure, measured here.** The three depth positions
  (`/box/sev` under both admitted object spellings, `/sevs/0`); the brand
  control (a `Plain { who: "w" }` default binds and carries `schemaTagOf`
  `"Plain"`, so brands are AJV-invisible at this boundary exactly as 0174
  measured at its own); the fill-if-absent control (an arg-supplied field never
  constructs its default and binds clean); the bare-wire-string control; the
  full end-state trace through `bindParamsInbound` for all three carriers; the
  union-typed default's divergence at an `anyOf` position; and the
  argument-echo rendering for a boxed versus a projected carrier.
- **The reach claim, verified rather than assumed.**
  `rg -n "fillDefaultsAndRevalidate" src/` returns the definition, one import
  and one call; `runBinder`'s own doc-comment states it "is only reached on the
  slash-invocation path (invoke/tool callers spawn callees directly)"
  (`production-theta-producer.ts:1319–1321`); `defaultedFields` is read at four
  sites, none of which is an invoke or child-side path
  (`rg -n "defaultedFields" src/`). The subagent-root leg's intake and
  projection (`:2047`, `:2181`) construct no default.
- **The corpus census and gate inventory, re-run at HEAD.** 34 committed
  `.theta` / `.thetalib` files, none declaring a named `enum`; across `tests/`
  the only enum-access `params:` default is deferral row c6, which is asserted
  at load and never invoked.
- **What is read from source rather than exercised**, marked as such in the
  text: `echoTypeFromValue` is module-private, so §Reproduction (e)'s echo lines
  are rendered through the exported `renderArgumentEcho` with the `EchoType`
  that function's object arm derives from the measured `Object.entries` of the
  boxed carrier; the branch it takes is fixed by the measured `typeof` and
  `Array.isArray` values, and §Fix (c)(4) records that a route must witness it
  rather than rely on the reading. 0178's child-side masking is read from that
  report and from `production-composition.ts:829–844`, not driven here.

Every `src/`, `tests/`, spec, reference and bug-doc citation above was read at
HEAD `a1eec82c`; volatile positions in
`src/extension/production-theta-producer.ts` (6288 lines) are named by symbol
beside their line numbers, per bug 0134's adjudication.

## Fix (0.103.0) — route (a) sub-variant a1: the recovered default is projected at recovery

**The route, and the measurement that settled it.** §Fix pinned two candidate
projection points and left the choice to the run. Their end states differed at
exactly one measured position — §Reproduction (f)'s union arm — and that
difference no longer exists. §Reproduction (f) was measured at `a1eec82c`
(v0.98.0); bug [0172](./0172-inbound-translation-pass-unperformed-at-three-boundaries.md)
face 2 landed at 0.102.0 (`ac4687db`) and threads the compiled-validator seam
into the binder-`args` inbound boundary. Re-measured at `9209f996` over the same
`sev: 'Sev | null = Sev.High'` fixture, through the real lowered document and the
real `AjvSchemaValidator`:

```
AJV, boxed carrier         : {"ok":false, /sev ×4}      AJV, projected : {"ok":true}
projected  WITH validator  : isEnumValue true   valuesEqual true
projected  NO   validator  : isEnumValue false  valuesEqual false
ORIGINAL   WITH validator  : isEnumValue true   valuesEqual true
```

The *no validator* row is §Reproduction (f)'s recorded divergence, reproduced
exactly — and it is no longer the production path. `paramBindingsFrom`
(`theta-composition-producer.ts:99`) is called with `deps.schemaValidator`
(`:417`); the production producer exposes that accessor
(`production-theta-producer.ts:718`) off `root.schemaValidator`; the shipped
composition root builds those deps (`production-composition.ts:652`) and hands
the same object to `composeThetaFixture` (`:1015`). Probed on the production
producer object: `deps.schemaValidator !== undefined`, on every reproduction row.
So a projected union-arm default binds **tagged** on the production path, and
route (a)'s only measured downside is gone.

Three further findings decided the rest:

1. **Route (b) reds a governed observable and route (a) does not.** Under (a)
   the BND-1 echo renders from a wire string with no render change at all —
   measured `Running /<name>: topic=hello, sev=high (default)`, the same text the
   bare-wire-string spelling produces today. Route (b) leaves a boxed carrier in
   the merged `args` and would need a new `echoTypeFromValue` enum arm plus the
   `renderEchoValue` reach (`argument-echo.ts:175`) — a second governed surface
   (GOV-15 observable (c)) for no end-state gain.
2. **Route (a) makes `DefaultedField.defaultValue`'s own contract true** rather
   than introducing a second representation at a seam whose contract is "the
   merged args are what AJV saw" — the caveat 0174 recorded against its own
   route (b).
3. **Sub-variant a1 (at recovery) over a2 (in the fill loop) discharges
   constraint (c)(1) structurally.** `src/binder/defaulting.ts` takes no
   executable change at all, so the ceiling-#4 depth walk cannot move and no
   projection ever copies a binder-influenced merged document. The value
   projected is the theta's own source-derived default.

- **What shipped:**
  - `src/extension/production-theta-producer.ts` — `#recoverDeclaredDefaults`
    pushes `projectForValidation(evaluatePureExpression(parsed, env))`. One
    executable line; `projectForValidation` was already imported for 0174's
    return gate. Its doc-comment states the projection and names the downstream
    boundary that re-establishes the tag. `echoTypeFromValue`'s doc-comment
    premise ("An enum value is a string at runtime") is replaced by the true one:
    the function reads the AJV-validated merged `args`, which are wire form
    throughout, so the `string` arm is right because the value IS a string —
    the boxed carrier does not reach it. No `EchoType` arm was minted and
    `src/render/argument-echo.ts` is byte-untouched.
  - `src/binder/defaulting.ts` — comment only. `DefaultedField.defaultValue`'s
    doc-comment now states the WIRE-form contract its sole producer honours,
    replacing "a literal-sublanguage form, already lowered" (§Affects records
    that as false at HEAD; it is true under this route).
  - `src/runtime/inbound-boundary.ts` and `src/runtime/wire-translation.ts` —
    comment only. The two falsified claims §Affects names
    ("Frontmatter `params:` DEFAULTS never arrive here" / "neither passes
    through `translateInbound`") are brought into line: a filled default DOES
    arrive, and for a wire-form default this pass is what re-tags it. Each
    paragraph names `runtime-value-model.md:37`'s surviving bypass sentence, and
    scopes reconciling it to a separate report per §Non-goals.
  - `tests/params-default-enum-access-merge.test.ts` — NEW, the offline witness
    (10 cells, §Fix (c)(7)).
  - `tests/live/live-production-acceptance.test.ts` — NEW cell 41, append-only.

- **GOV-15 flips, enumerated.** Refusal → success on exactly the merged documents
  whose filled default carries a named-enum value, each measured before and
  after: the annotated field (`/sev`), a named-enum field of a schema-typed
  default under both admitted object spellings (`/box/sev`, `Box { … }` and the
  bare-object literal), an array element (`/sevs/0`), and a union arm
  (`Sev | null`). Deferral row c6's own fixture (`p: 'Sev = Sev.A'` against
  `enum Sev { A, B }`) flips with them. **Nothing flips the other way.** Measured
  byte-identical before and after: the bare-wire-string default
  (`sev: 'Sev = "high"'` → `Running /<name>: topic=hello, sev=high (default)`),
  the fill-if-absent control (an arg-supplied `sev` → `sev=low`, no `(default)`
  tag, the default never constructed), the schema-brand control
  (`Plain = Plain { who: "w" }` → `plain={w, …} (default)`, `schemaTagOf`
  `"Plain"`), and the **value**-mismatch control (`sev: 'Sev = "nope"'` still
  refuses with the single clause `/sev must be equal to one of the allowed
  values`). The gate becomes representation-blind, not value-blind.

- **The echo, per constraint (c)(4).** Measured, not assumed, through the
  production note channel on every cell. Under this route it needs no change:
  the enum-access spelling now renders the text the bare-wire-string spelling has
  always rendered, and a schema-typed default renders `box={high, …}` where the
  boxed carrier would have rendered `box={{h, …}, …}` — a position that is a
  refusal today, so no shipped echo text moves.

- **Spec-sentence readings, stated rather than left implicit.** No spec sentence
  moved.
  - `frontmatter-fields-a.md:71` ("`Enum.Variant` defaults preserve the runtime
    enum brand … **without a separate restoration pass**") — the author-facing
    guarantee holds and is measured: the default reaches body scope
    indistinguishable from a body-code `Sev.High` (`isEnumValue` true,
    `valuesEqual` true at all four positions; `schemaTagOf` `"Box"` with keys
    `["sev","who"]`). No *separate* pass exists. The tag is re-established by the
    binder-`args` inbound boundary `runtime-value-model.md:34` already mandates
    over binder `args` — the same pass that already re-tagged the bare-wire-string
    spelling before this fix. The sentence describes what an author must know; it
    does not name an implementation route.
  - `runtime-value-model.md:37` (defaults "bypass the inbound translation pass")
    is at odds with HEAD independently of this fix — a bare-wire-string default
    was already carried into `bindParamsInbound` by the merged `args` and re-tagged
    there. §Non-goals assigns that sentence to a separate report; this fix does
    not move it, and the two code comments that restated it now say what the code
    does and name the divergence.

- **Gates** (verbatim):
  - witness — `npx vitest run tests/params-default-enum-access-merge.test.ts`
    → `Test Files 1 passed (1)` / `Tests 10 passed (10)`; at HEAD before the fix
    the same file ran `Tests 6 failed | 4 passed (10)`, each red carrying the
    AJV-on-`args` refusal (`theta /s1: argument binding produced invalid args —
    /sev must be equal to one of the allowed values; /sev must be string`).
  - full suite — `npm test` → `Test Files 307 passed (307)` /
    `Tests 5034 passed (5034)` (baseline 306 / 5024; +1 file, +10 cells).
  - `npm run typecheck` → clean. `npm run lint` → clean.
  - live — `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/live-production-acceptance.test.ts` → `Tests 41 passed (41)`;
    `… tests/live/acceptance/` → `Test Files 2 passed (2)` /
    `Tests 11 passed (11)`. `tests/fixtures/h7a/permitted-codes.json`
    byte-unchanged across the real H9a run (`a4a8da04…` before and after) — no
    new diagnostic code.

- **Review:** 2 rounds. Round 1 (`bug-fix-reviewer`, deep) — one non-blocking
  `prose` finding (two intra-file self-citations in `wire-translation.ts` off by
  one) plus one `prose` residual (floating "this fix" / "at HEAD" referents); no
  `correctness`, `fidelity` or `spec` finding; it re-derived route fidelity
  mechanically, checked all seven (c) constraints, and ran two redness probes of
  its own. One pre-review citation-only correction round preceded it, and two
  `bug-fix-fixer-light` rounds followed it (the first re-anchored the referents
  but grew `wire-translation.ts` by a line and re-staled all six self-citations;
  the second reflowed the paragraph back to the original line count, at which
  every citation resolves as written). Round 2 (`bug-fix-reviewer-fast`) —
  **CLEAN**, no findings, no escalation.

- **Verification:** `bug-fix-verifier` returned **SOLID**, zero findings.
  1. *The witness reds.* Unwrapping `projectForValidation` reds exactly cells
     1–5 and 10, each with the AJV-on-`args` signature, and leaves the four
     controls green; restored, `git hash-object` identical. Dropping
     `deps.schemaValidator` at `theta-composition-producer.ts:417` reds exactly
     cell 5 (the union arm) at its `isEnumValue` premise; restored,
     hash-identical to `HEAD`.
  2. *The full default suite is green* — 307 / 5034, run twice.
  3. *Live, run for real.* No shipped cell exercised an enum-access default
     (H9a's `acc-params-binder.theta` defaults a plain `number`), so cell 41 was
     added; H8a 41/41 and H9a 11/11 both green, and the new cell was proved
     red-able (fix neutralised → `theta /b181livedef: argument binding produced
     invalid args — /sev must be equal to one of the allowed values; /sev must…`,
     restored → green).
  4. *Lint and typecheck* clean before and after the additive cell. Every
     protected witness hash-verified byte-identical to `HEAD`.

- **Residuals:**
  1. **An unresolvable `Enum.Variant` default throws out of the recovery.**
     `sev: 'Sev = Sev.Missing'` never reaches the merge at all:
     `resolveEnumVariant` answers `undefined`, `evaluatePureExpression`'s `member`
     arm falls through to `evaluateMemberAccess(null, "Missing")` and raises
     `NullMemberAccessPanic: null member access: .Missing`, against
     `#recoverDeclaredDefaults`'s own doc-comment ("Recovery is best-effort …
     never throws"). Measured identically before and after this fix, so it is
     neither caused nor changed here, and it is out of §Fix's subject (a value the
     variant set does not contain, not a representation). Unfiled; a report of its
     own.
  2. **`runtime-value-model.md:37`'s bypass sentence.** §Non-goals already scopes
     it out; this run sharpens it. The divergence is now load-bearing rather than
     incidental: an enum-access default's tag is re-established BY the pass the
     sentence says defaults bypass. Both code comments that restated the sentence
     now name the divergence explicitly. Unfiled; a report of its own.
  3. **`renderEchoValue`'s `enum` case (`argument-echo.ts:175`) is still never
     minted.** `echoTypeFromValue` produces no `{ kind: "enum" }`, and under this
     route it correctly never needs to — the merged `args` carry no enum carrier.
     The case is unreachable from the binder echo. Recorded, not changed; the
     corrected doc-comment now says why.
  4. **Positional-citation drift.** `production-theta-producer.ts` grew 22 lines
     and `defaulting.ts` 7, so citations into them from other documents shifted.
     Bug [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
     do-not-chase class; disclosed, not chased. Self-citations INSIDE the four
     edited `src/` files and inside this fix's own witness WERE re-derived and
     each verified against its anchor line.

- **Discharge notes appended:** two, both append-only.
  [0174](./0174-typed-invoke-enum-return-validation-prompt-cell.md) — its
  `## Fix (0.98.0)` residual 2 (this report's origin) and its §Fix (c) "inert
  today" premise: the merge no longer hands AJV a boxed `String`, so the
  counterexample is discharged going forward.
  [0163](./0163-params-default-type-compat-unchecked-at-load.md) — deferral row
  c6 now terminates in an admission: `type-system.md:48`'s "the runtime AJV check
  is the safety net" is performed rather than merely reached.

- **Pinned dispositions / non-goals:** the enum carrier stays a boxed `String`
  (`src/runtime/value.ts` and `src/seams/schema-validator.ts` untouched); 0174's
  return boundary is untouched and its two witnesses are byte-identical; the
  load-time deferral is untouched and row c6 still loads silently; the
  AJV-on-`args` row's wording, the 120-code-point note cap, the subagent-root leg
  (`#intakeSubagentRootParams` fills no declared default;
  `fillDefaultsAndRevalidate` still has exactly one production caller) and the
  `invoke(...)` / `.theta`-callable argument paths are all unchanged.
