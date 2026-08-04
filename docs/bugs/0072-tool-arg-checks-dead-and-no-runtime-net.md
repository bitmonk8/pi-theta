# Bug 0072 — `checkToolCallArguments` has no `src/` caller, so `theta/parse/tool-arg-arity`, `-schema-conflict` and `-type-mismatch` are unreachable: a multi-argument Pi-tool call is misdiagnosed as `theta/parse/bare-object-literal` at both argument positions, `read({ path: 123 })` loads clean, and no runtime check replaces the ones that never fire

- **Status:** fixed (0.65.0).
- **Kind:** defect — three registered parse codes are documented, implemented,
  and never wired; and the runtime AJV check `tool-calls.md` names as the safety
  net that the parse-time disjointness check "front-runs" does not exist on the
  code-side Pi-tool path.
- **Related:**
  - 0003 (fixed, 0.16.0) — same dead function. Its fix deliberately re-emitted
    the *shape* arm from `parseThetaDocument` instead of calling
    `checkToolCallArguments`, and recorded `theta/parse/tool-arg-arity` as
    "which remains unwired (out of this bug's scope)". This report is that
    recorded residual plus the two checks 0003 did not name, and adds the
    runtime half. The relationship mirrors 0016's to 0003's other residual.
  - 0050 (`theta/parse/fn-arg-type-mismatch` unreachable, `checkFnArgCompat` has
    no caller) — same class, sibling emitter.
  - 03 in this batch (`.theta`-callable call arity unchecked) — the other half
    of the arity story, with a different emitter (`checkInvokeArity`).
- **Affected:**
  - `src/runtime/tool-call.ts:187` (`checkToolCallArguments` — no `src/` caller;
    emission sites at `:201` arity, `:256` type-mismatch, `:283` schema-conflict),
  - `src/parser/theta-document.ts:5122–5126` (the comment recording the
    deliberate non-call and the word "UNWIRED"), `:5127–5135` and `:4845` (the
    `bare-object-literal` arm that fires instead),
  - `src/extension/production-theta-producer.ts:318–332` (`PiToolDispatch` —
    the dispatch record carries `toolName` + optional `execute` and no
    `parameters`, so no schema is available at the dispatch site),
  - `src/extension/production-theta-producer.ts:2765–2789`
    (`#resolveToolCall` — the depth walk is the only pre-dispatch check),
  - `src/runtime/tool-call.ts:601–621` (`enforceCodeToolArgDepth` — the sole
    construction site of `CodeToolError { cause: "validation" }` in `src/`).
- **Observed at:** `0.52.0` (`d06daae3`), Windows. Offline, through the shipped
  production load path (`discoverAndComposeFixtures`).

## Summary

`checkToolCallArguments` implements three of the four parse-time tool-argument
rules (`tool-arg-arity`, `tool-arg-type-mismatch`, `tool-arg-schema-conflict`);
the fourth (`tool-arg-not-object-literal`) was re-implemented in the parser by
bug 0003's fix. The function has no caller in `src/` — only tests invoke it — so
those three codes cannot fire against any input.

Two consequences are observable:

1. **The multi-argument Pi-tool call is rejected under the wrong rule.**
   `read({ path: "a" }, { path: "b" })` draws two
   `theta/parse/bare-object-literal` diagnostics — one per argument — whose
   message tells the author to name a schema. The specified code
   (`theta/parse/tool-arg-arity`, "Pi tools take exactly one input object; merge
   the arguments") never appears.
2. **Argument type checking is absent at both phases.**
   `read({ path: 123 })` (a provably-disjoint field type) and
   `read({ nosuchfield: "a" })` load with zero diagnostics, and there is no
   theta-side AJV step before dispatch to catch them either. The
   `CodeToolError { cause: "validation" }` outcome the spec designates for
   input-schema failures is constructed at exactly one site in `src/` — the
   depth-ceiling breach — so an ordinary schema violation cannot produce it.
   A `.theta`-callable argument type mismatch (`typedcallee(123)` against
   `params: x: string`) is likewise silent.

## Reproduction

Offline, against the shipped composition root
(`tests/production-tools-load-resolution.test.ts` harness). Planted under
`<workspace>/.pi/theta/`; all Pi-tool cells carry `mode: prompt` / `tools: read`.

| Cell | Body | Registered? | Diagnostics |
|---|---|---|---|
| `ctlok` (control) | `read({ path: "a" })?` | yes | none |
| `multiarg` | `read({ path: "a" }, { path: "b" })?` | **no** | `:5:14 theta/parse/bare-object-literal` **and** `:5:29 theta/parse/bare-object-literal` — "bare object literal not permitted in this position; name the schema (Schema { ... })" |
| `multiarg2` | `read({ path: "a" }, "b")?` | **no** | `:5:14 theta/parse/bare-object-literal` (same message) |
| `disjoint` | `read({ path: 123 })?` | **yes** | **none** |
| `unknownfield` | `read({ nosuchfield: "a" })?` | **yes** | **none** |
| `calleemismatch` | `typedcallee(123)?` with `tools: - ./typedcallee.theta`, callee `params: x: string` | **yes** | **none** |

Verbatim run output:

```
REGISTERED: ["calleearity","calleemismatch","ctlok","disjoint","typedcallee","unknownfield"]
NOTIFICATIONS: ["bare object literal not permitted in this position; name the schema (Schema { ... })",
                "bare object literal not permitted in this position; name the schema (Schema { ... })",
                "bare object literal not permitted in this position; name the schema (Schema { ... })"]
```

Neither `theta/parse/tool-arg-arity`, `theta/parse/tool-arg-schema-conflict`, nor
`theta/parse/tool-arg-type-mismatch` appears for any cell.

Runtime half (no probe needed — structural): the dispatch record handed to the
call site carries no schema, so nothing at the dispatch site *can* validate:

```ts
// src/extension/production-theta-producer.ts:318
export interface PiToolDispatch {
  readonly toolName: string;
  execute?(toolCallId: string, params: unknown, signal: AbortSignal): Promise<AgentToolResultEnvelope>;
}
```

and `#resolveToolCall` (`:2765–2789`) performs exactly one pre-dispatch
check — `enforceCodeToolArgDepth` — before handing `params` to `execute()`.
`enforceCodeToolArgDepth` (`src/runtime/tool-call.ts:601`) is the only `src/`
site that constructs `CodeToolError { cause: "validation" }` (`:620`).

Corroborating live observation already in the corpus: bug 0003's §Reproduction
records an extension-tool input-schema failure surfacing as
`Err(CodeToolError { cause: "execution" })` carrying the *host's* validation
text ("Validation failed for tool \"finding_store\" … Received arguments: {}") —
i.e. the host's rejection is relayed through the execution arm, not the
validation arm.

## Expected behaviour

- `docs/spec_topics/tool-calls.md` §"Argument shape": "A multi-argument form
  (`read({...}, {...})`) is `theta/parse/tool-arg-arity` **regardless of the
  argument shapes**." The registry row
  (`docs/spec_topics/diagnostics/code-registry-parse.md:50`) names the same
  example verbatim as its Trigger, with Message `Pi tool '<name>' takes a single
  object argument; got <count>` and Hint "Pi tools take exactly one input
  object; merge the arguments."
- Same page, §"Provable-disjointness check (parse time)": "The parser emits an
  *error*-severity `theta/parse/tool-arg-schema-conflict` diagnostic when, and
  only when, a field-value expression's static type is **provably disjoint** from
  the tool's registered input-schema type for that field". `path: 123` (integer
  literal into `read`'s string `path`) is the paradigm case: disjoint under the
  schema subset, no `format`/`pattern`/refinement/union escape hatch.
- Same page: "a Pi-tool argument that does not match the tool's input schema is,
  in general, never a parse error — it is caught by **the runtime AJV check** and
  surfaces at runtime as `Err(CodeToolError { cause: "validation", ... })`".
  `docs/spec_topics/errors-and-results/queryerror-variants.md` defines that cause
  as "arguments failed input-schema validation".
- Same page, on the `.theta`-callable arm: "an argument that does not type-check
  against the callee's `params:` surfaces as
  `theta/parse/tool-arg-type-mismatch` when the callee is statically resolvable"
  — `./typedcallee.theta` named by a literal `tools:` entry is statically
  resolvable by `invocation.md` §Static resolution.
- The soundness argument the spec gives for the disjointness check —
  "a provable disjointness guarantees the runtime AJV check would reject the same
  value, so the parse error only front-runs a certain
  `Err(CodeToolError { cause: "validation", ... })`" — presupposes the runtime
  check exists.

## Actual behaviour / root cause

`checkToolCallArguments` (`src/runtime/tool-call.ts:187`) is complete: arity at
`:201`, shape at `:231`, `.theta` type mismatch at `:256`, provable disjointness
at `:283` (with `computeToolArgSchemaConflict` doing the real static-type ×
schema-subset computation). It has no caller in `src/`.

The parser's own comment records the decision and its consequence
(`src/parser/theta-document.ts:5122–5126`):

> Emission mirrors the SHAPE arm of `checkToolCallArguments`
> (../runtime/tool-call.ts) rather than calling it — that check's
> arity→shape→type ordering would drag the **UNWIRED**
> `theta/parse/tool-arg-arity` code into scope.

With arity unwired, a multi-argument call is judged by the bare-object-literal
carve-out instead. That carve-out is scoped to a **sole** bare-object argument
(`:5127`: "for a SOLE bare-object argument whose callee is NOT (lexically) an
unshadowed Pi tool"), so a two-argument call falls outside it at *every* object
position and each one is reported (`:4845`). The result is a rejection with the
right severity, the wrong code, the wrong count of diagnostics, and a Hint
("name the schema (Schema { ... })") that describes a repair which does not apply
— naming the schema on both arguments leaves the arity violation untouched.

For the type checks there is no substitute emitter anywhere: the callable-set
snapshot does carry the tool's `parameters` at load
(`frontmatter-fields-a.md` §`tools`: "Each resolved entry carries the tool's
`parameters` schema (enough for the RFC-0002 argument/field disjointness check
…)"), but that schema is not threaded to either the parse walk or the dispatch
record, so both the parse-time and runtime consumers of it are absent.

## Why it matters

- **A wrong-typed or unknown-field Pi-tool argument is accepted by theta and
  handed to the host tool.** The disposition then depends entirely on the tool:
  one that validates turns it into `cause: "execution"` (misattributed, and
  discovered only at run time, possibly inside a loop), and one that does not —
  a tool for which the malformed object is still an executable input — performs a
  wrong effectful call. Nothing in the runtime prevents that today; this is the
  hazard bug 0003 §Why it matters raised for dropped args, unresolved for
  wrong-typed ones.
- **The closed `CodeToolError.cause` enum is not honest.** `validation` is
  reachable only from a depth-6 argument; every other input-schema failure
  arrives as `execution`. An author writing
  `match … { CodeToolError { cause: "validation" } => … }` to catch argument
  mistakes catches only depth breaches.
- **The multi-argument diagnostic misdirects.** The author is told to name a
  schema; the fix is to merge the arguments. Two diagnostics for one mistake
  also breaks the one-mistake/one-diagnostic expectation the registry row sets.
- **RFC 0002's headline static check has never run in production.** The
  disjointness check is the one parse-time type guarantee the Pi-tool arm has,
  and its "sound because it front-runs a certain runtime rejection" argument
  rests on a runtime check that is not there.

## Non-goals

- Relitigating the shape rule (`tool-arg-not-object-literal`) or bug 0016's
  shadowing gate — both wired and correct.
- `.theta`-callable *arity* (report 03 in this batch), whose emitter is
  `checkInvokeArity`, not this function.
- Widening `CodeToolError.cause` — the enum is closed by spec and the missing
  behaviour is producing its existing `validation` member, not adding one.
- The model-driven tool-call loop's argument validation, which is host-side and
  out of scope here.

## Fix

Not yet decided. The two halves are separable and have different costs.

**Parse half.** Options:

1. Call `checkToolCallArguments` from `checkLexicalCallSites`
   (`src/parser/theta-document.ts:5146`), which already resolves every call site
   lexically and knows which callees are unshadowed Pi tools. Cost: the
   function's documented arity→shape→type ordering must be reconciled with the
   parser's existing shape emission so one call site cannot draw both codes, and
   the `bare-object-literal` carve-out must be re-scoped so a rejected
   multi-argument call draws the arity code alone rather than the current
   per-argument bare-object diagnostics.
2. Emit arity directly from the parser (mirroring what bug 0003 did for shape)
   and leave the type checks unwired. Cheapest, closes the misdiagnosis, leaves
   the RFC-0002 check dead — and leaves the same "implemented but unreachable"
   condition that produced this report.

Option 1 is the only one that discharges the registry rows; it additionally
needs the tool's `parameters` schema and the callee's `params:` counts threaded
into the parse walk, which today has neither (the same plumbing report 03
needs — the two fixes should be sequenced together).

**Runtime half.** The constraint is that the schema must reach the dispatch
site: `PiToolDispatch` carries none today, while the frozen callable-set
snapshot does. Any fix must (a) validate the constructed `params` object against
the resolved tool's `parameters` *after* the depth walk and *before* `execute()`
(CIO-3 pins depth-walk-before-AJV), (b) surface a failure as
`Err(CodeToolError { cause: "validation" })` without dispatching, and (c) not
double-report against the host's own validation for extension tools reached
through the PIC-64 ladder, where the host loop validates independently and its
rejection currently arrives as `isError` →
`cause: "execution"` (`production-theta-producer.ts:2931`).

## Fix (0.65.0)

Both halves shipped. §Fix read "Not yet decided" on route and settled on
constraints; the parse half took **Option 1** (the doc's own reasoning rejects
Option 2 as leaving the "implemented but unreachable" condition that produced
this report), and the runtime half honours all three of its (a)/(b)/(c)
constraints. All three registered codes now fire from ordinary author source.

### What shipped

- `src/parser/theta-document.ts` — `checkLexicalCallSites`'s lexical
  call-site walk calls `checkToolCallArguments` for the arity arm, and the
  `bare-object-literal` carve-out is re-scoped from the sole argument to every
  direct call argument (§Fix parse half, both stated costs).
- `src/extension/invoke-static-checks.ts` — `theta/parse/tool-arg-type-mismatch`
  folded into bug 0071's existing `.theta`-callable loop (arity-then-type), and
  `theta/parse/tool-arg-schema-conflict` as a third loop over the SAME shared
  call-site collection; plus the `collectProvableArgTypes` soundness gate.
- `src/extension/production-composition.ts` — threads the host built-in's
  registered `parameters` onto the frozen snapshot entry, and widens the callee
  reader with each `params:` field's verbatim declared type source.
- `src/extension/production-theta-producer.ts` — `PiToolDispatch` carries the
  snapshot-pinned `parameters`; `#checkPiToolArgSchema` runs the pre-dispatch
  AJV step inside `#resolveToolCall`.
- `src/runtime/tool-call.ts` — `buildCodeToolArgSchemaViolation` constructs the
  `Err(CodeToolError { cause: "validation" })` carrier beside
  `enforceCodeToolArgDepth`, so both code-side `validation` producers share one
  owning module.
- `src/runtime/tool-call-execute.ts` — `CodeSideToolCall.argSchemaViolation` and
  the `arg-schema-error` outcome arm, short-circuiting before the dispatch race.
- `src/runtime/effectful-statement-host.ts` — routes the new arm exactly as
  `arg-depth-error`.
- `src/parser/static-type-inference.ts` — `BOOLEAN_BINARY_OPS` exported so the
  arm collector and `#typeBinary` share one operator definition (no behaviour
  change).
- `docs/spec_topics/diagnostics/code-registry-parse.md`,
  `docs/spec_topics/expressions.md`, `docs/reference/grammar.md` — the DIAG-2
  Trigger-scope reconciliation (below). `docs/reference/diagnostics.md` needed
  no edit: no Message string moved, and that page mirrors Message only.

### Parse-half ordering reconciliation (§Fix cost (i))

One call site cannot draw both codes, by three mechanisms in force together:

1. **`argumentSource` is omitted** at the parser's call into
   `checkToolCallArguments`, so that function's own shape arm — gated on
   `argumentSource !== undefined` — is structurally unreachable from the
   parser. The parser keeps bug 0003's AST-based shape emission, which
   `isBareObjectLiteral` cannot express, holding message / severity / hint
   byte-identical to the shared arm's per DIAG-4.
2. **The two arms are an `if`/`else` on positional count** — arity owns `> 1`,
   the shape rule owns `<= 1` — so they are disjoint by construction rather
   than by two independent conditions that could both hold.
3. **Arity (parse) strictly precedes the type checks (compose).** An
   error-severity parse diagnostic drops the theta in `parseDiscoveredTheta`
   before `runComposePass` reaches the static-check passes, so a
   multi-argument call never also attracts `tool-arg-schema-conflict`.

The `.theta`-callable surface's own arity-before-type ordering is a different
mechanism, because both of its codes are compose-time: an explicit `continue`
when `checkInvokeArity` produced any diagnostic (invocation.md §Argument arity;
bug 0071 constraint 5).

### The re-scoped `bare-object-literal` carve-out (§Fix cost (ii))

The split between the structural and lexical walks stays by POSITION, widened
from the sole argument to every direct call argument: the structural walk
(`walkExpr` `case "call"`) suppresses the check for every direct argument
unconditionally, and the callee-aware lexical walk owns emission for all of
them. Under a Pi-tool callee, `> 1` arguments draw `theta/parse/tool-arg-arity`
alone and `=== 1` keeps the shape rule; under any other callee, every direct
bare-object argument draws `theta/parse/bare-object-literal` as before. A bare
object NESTED inside an argument is not a direct argument and keeps its own
rejection at its own range.

**The one existing observable this changed** is the one §Fix authorises: a
multi-argument Pi-tool call drew per-argument `theta/parse/bare-object-literal`
and now draws `theta/parse/tool-arg-arity` alone —
`docs/spec_topics/tool-calls.md` §"Argument shape": "A multi-argument form
(`read({...}, {...})`) is `theta/parse/tool-arg-arity` **regardless of the
argument shapes**." **No existing test asserted the old observable**, so no
existing cell was re-pinned; every bug-0003 and bug-0016 cell is
byte-untouched, and the whole preserved surface is re-pinned positively as
cells C1–C9 of `tests/tool-arg-parse-checks.test.ts` (non-Pi-tool sole and
two-argument bare objects at exact ranges, the shadowed two-argument call's
`shadowed-callable-call` + 2 x `bare-object-literal`, zero-argument, both
bug-0003 shape shapes, the nested-inside-the-legal-argument position, and an
`invoke(...)` argument). One superseded PROSE claim, not a test: bug 0003's
own §Fix (0.16.0) recorded "A multi-argument call whose first argument is
non-object fires the shape code alone" — cell B3 pins the replacement, and a
discharge note is appended to that document.

### DIAG-2 Trigger-scope reconciliation

No new code is registered (all three already were), but re-scoping WHICH code
fires for a multi-argument call is a Trigger-scope change, landed in the same
commit across all three pages that stated the sole-argument scoping:

- `code-registry-parse.md`, `theta/parse/bare-object-literal` Trigger —
  "single argument of a Pi-tool call" to "a direct argument of a Pi-tool call".
- `expressions.md` §"Object construction" carve-out 2 — retitled to the direct
  argument, naming `theta/parse/tool-arg-arity` for the multi-argument form and
  keeping the nested-object position outside the carve-out.
- `docs/reference/grammar.md` — the "two carve-outs" bullet, same scoping.

`theta/parse/tool-arg-arity`'s Trigger already named the multi-argument form
and needed no edit; `theta/parse/tool-arg-not-object-literal`'s Trigger became
strictly more accurate, since the shape arm is now `=== 1`-scoped. Placeholder
closure reuses existing sub-rules only — `<name>`, `<count>`, `<field>`,
`<expected>`, `<actual>`, with the union `<actual>` rendering covered by
placeholder-rendering-a.md category 1's "unions joined by ` | `". The closed
category-3 `<construct>` token table is untouched. H9a's permitted-code list is
untouched, decided by the real H9a run (below), not by assumption.

### Runtime half — how (a), (b), (c) are discharged

- **(a) after the depth walk, before `execute()`.** `#resolveToolCall` computes
  `argSchemaViolation` only when `enforceCodeToolArgDepth` raised no breach, and
  `runCodeSideToolCall` checks `argDepthBreach` first — CIO-3's
  depth-walk-before-AJV holds at both the producer and the consumer. Pinned by
  cell E3: a depth-6 argument that ALSO violates the schema reports the depth
  breach.
- **(b) `Err(CodeToolError { cause: "validation" })` without dispatching.** The
  new `argSchemaViolation` carrier and `arg-schema-error` outcome arm return
  before the dispatch race, so `dispatch()` is never called and `committed` is
  empty; `effectful-statement-host.ts` surfaces the `Err` as the expression's
  value exactly as the depth arm does. The existing `argDepthBreach` /
  `arg-depth-error` identities were deliberately NOT renamed. Cells E1, E2.
- **(c) no double-report against the host's own PIC-64 validation.** By
  construction rather than by a second check: the AJV step is pre-dispatch and
  short-circuits, so for an execute-less extension entry the PIC-64 ladder is
  never entered, the host loop never validates the same value, and its `isError`
  to `cause: "execution"` arm is never reached. The check emits no diagnostic —
  the only surface is the theta-visible `Err`. Cell E4 witnesses it as an
  observable: exactly one `Err(cause: "validation")`, ZERO `hostLoopDispatch`
  invocations, ZERO diagnostics. An execute-less entry that registers no
  `parameters` still routes to the ladder unchanged (E6, E7).

### Where the tool `parameters` schema is threaded from

The frozen callable-set snapshot already carried it for EXTENSION tools
(`resolveRegistryExtensionTool`); the host BUILT-IN half was the gap —
`builtinToolDefinition`'s return type narrowed the real `ToolDefinition` to
`{ execute }`, so `resolvePiTool` forwarded only `{ toolName, execute }`. The
chain now runs: the Pi SDK `ToolDefinition` to `builtinToolDefinition`
(widened) to `resolvePiTool` (forwards `parameters`) to `CallableSetDeps`
to `resolveCallableSet` to the frozen `CallableSetSnapshot.entries`. It is read
at two places, both off the same entry: at compose time by the schema-conflict
loop, and at dispatch time through `#resolvePiToolForTheta`'s existing cast to
`PiToolDispatch`, which was widened with `readonly parameters?: unknown` — so
widening the interface IS the threading, with no new plumbing at the dispatch
site. Witnessed by cell D2, which deep-equals the SDK factory's own
`parameters` rather than a transcription.

### Soundness — two erasure paths closed, both found in review

`StaticTypeInferencePass.#commonType` erases a sibling arm by two mechanisms,
and both made the disjointness arm reject values AJV accepts (which
`tool-calls.md` §"Provable-disjointness check (parse time)" forbids
absolutely: the check "never rejects a program the runtime AJV check would
accept"). Review round 1 found the **unknown-blessing** path
(`read({ path: flag ? 1 : p })`, `p` a string, un-registered claiming
"provably disjoint … got integer"); round 2 found the **incompatible-fallback**
path (`return common ?? candidates[0]`, so `read({ path: flag ? 1 : "a" })`
did the same with no unknown anywhere). Both are reachable only through
`ternary`, because the V20c layer checks `match` arms, array literals and
mixed `+`/ordering operands but has no common-type check over ternary
branches.

The shipped answer stops consulting `#commonType` for these two arms
altogether: `collectProvableArgTypes` returns the flat SET of value-contributing
arm types whose union IS the expression's runtime value-type set — literals,
both `parseUnary` synthetic-null-left shapes, the result-fixed boolean
operators, ternary branches, `match` arm bodies, `try` operands and arithmetic
operands, under an exhaustive `switch` with no `default` so a new `Expr` member
is a compile error. The Pi-tool arm renders that set as a deduplicated
` | `-joined union, which is exactly the input `subsetKinds`' documented
"an unrepresentable arm makes the whole union unprovable" rule was written
for; the `.theta`-callable arm requires EVERY arm type to be `incompatible`.

Review round 3 found a third, unrelated unsoundness on the expected side: the
callee's `params:` annotation was resolved through the CALLER's `TypeEnv`, so a
caller-local homonym decided a verdict about the callee's contract
(`schema Conf = string` in the caller vs `schema Conf = integer` in the callee
un-registered a call the child's own validation accepts). That one
`checkCompatible` consults an honestly-empty null-prototype `TypeEnv`, so a
named expected type defers while primitive and structural decisions — which
consult no environment — still fire.

### Witness inventory

- `tests/tool-arg-parse-checks.test.ts` (new, 21 cells) — A1–A3 the three
  registry Message templates read through `parseRegistry` / `registryMessage`
  (DIAG-4); B1–B5 the arity re-scope with exact call ranges and `<count>`;
  C1–C9 the preserved bare-object / shape / shadowing observables; C10–C11 the
  `par for` tightening (below); D1–D2 a JSON-Schema `type` ARRAY rendering as a
  union of its members, both arms honoured.
- `tests/tool-arg-runtime-schema-validation.test.ts` (new, 9 cells) — D1–D2 the
  schema threading; E1, E2 wrong-typed and missing-required through the real
  `#resolveToolCall`; E3 the CIO-3 ordering; E4 constraint (c); E5–E7 the
  dispatch control and both fail-open directions.
- `tests/production-tools-load-resolution.test.ts` (additive, `1075 / 0`) —
  six new `describe`s over the production load path: the schema-conflict and
  type-mismatch rejections with their registry Messages and their unprovable /
  intersecting / unknown-field controls, arity-before-type, the two erasure
  paths in both arm orders at both a string and a numeric field, the
  still-firing all-literal composites and the union rendering, and the
  callee-namespace homonym pair in both divergence directions. The file's
  additive-only invariant (0 deletions) has now held through 0069, 0070, 0071
  and 0072.

### Reproduction re-derived, before and after

§Reproduction's citations were taken at `0.52.0` (`d06daae3`) and re-derived at
the fix baseline `f8364db1` (0.64.0): every registered / diagnostic VERDICT
reproduced exactly; the only drift was diagnostic COLUMNS (the doc's fixture
carried different leading text). After the fix: `ctlok` unchanged; `multiarg`
and `multiarg2` draw exactly one `theta/parse/tool-arg-arity` and zero
`bare-object-literal`; `disjoint` un-registers with
`theta/parse/tool-arg-schema-conflict`; `calleemismatch` un-registers with
`theta/parse/tool-arg-type-mismatch`; `unknownfield` still LOADS — the parse
arm has no schema type for an unknown field name, which is correct per the
row's own Trigger — and its runtime disposition, driven end-to-end through the
real production-resolved `read` schema, is
`Err(CodeToolError { cause: "validation", message: "must have required property 'path'" })`
with the real `execute()` never invoked.

### Gates

- Witness run: `tests/tool-arg-parse-checks.test.ts`,
  `tests/tool-arg-runtime-schema-validation.test.ts`,
  `tests/production-tools-load-resolution.test.ts` — 14 cells RED at
  `f8364db1` on their own primary assertions, all green after.
- Full default suite: `npm test` — `Test Files 257 passed (257)`,
  `Tests 3700 passed (3700)` (baseline 255 / 3643; +2 files, +57 tests).
- Typecheck: `npx tsc -p tsconfig.json --noEmit` — exit 0, no output.
- Lint: `npm run lint` — exit 0, no output.
- Live: H8a `tests/live/live-production-acceptance.test.ts` 9/9; H9a
  `tests/live/acceptance/` 11/11 (one unrelated stochastic red on area (b), a
  live-model sentinel refusal, green on isolated retry and on a clean full
  re-run). H9a area (f) `/acc-code-tool-loop` — which drives
  `read({ path: "acc-code-tool-loop.theta" })` through a genuinely spawned `pi`
  binary — passed on both runs, exercising both new checks live: the
  schema-conflict arm standing down on a schema-valid single argument, and the
  new pre-dispatch AJV step accepting it.
- PERMITTED-CODES: **no append**, decided by the real H9a run.
  `tests/fixtures/h7a/permitted-codes.json` is byte-unchanged. Every
  `tools:`-carrying and Pi-tool-calling fixture under `tests/live/` was
  enumerated: the nine H9a shared-corpus fixtures (only
  `acc-code-tool-loop.theta` carries `tools:`, a bare `- read` whose sole call
  is single-argument and schema-valid), the load-refusal file's three inline
  fixtures (no `tools:`, and outside the gate by its own header), the two
  hardening probe files that reach `read` only through model-driven `tool_use`
  (both new checks are code-side only), the hardening file whose `path` is a
  `+`-chain over bare identifiers (unprovable at every level), and H8a's
  bug-0070/0071 cells (arity gates out type on the wrong-arity cell; the
  correct-arity control type-checks cleanly).

### Review

Four rounds, converged clean; three blockers, each a genuine defect.

1. `bug-fix-reviewer` — `defects-found`. F1 correctness: the disjointness arm
   rejected values AJV accepts via `#commonType`'s unknown-blessing erasure.
   F2 spec: the re-scoped Trigger contradicted `expressions.md`. F3 house-rule:
   53 comment citations to an uncommitted orchestration file. One finding
   refuted with a spec anchor (a message length cap), three verified sound.
2. `bug-fix-reviewer` — `defects-found`. `#commonType`'s SECOND erasure path.
   Repaired by replacing the round-1 boolean gate with the arm collector; the
   round's own two residuals were closed in the same pass.
3. `bug-fix-reviewer` — `defects-found`. Cross-file name capture on the
   expected side.
4. `bug-fix-reviewer` — `clean`.

### Verification

`bug-fix-verifier` — SOLID; all four obligations discharged with quoted
evidence.

- Witness: each of the five observables neutralised INDEPENDENTLY, each
  redding a distinct non-empty cell set (arity 6, the bare-object re-scope 5,
  type-mismatch 5, schema-conflict 8, the runtime AJV step 3); both soundness
  repairs likewise (the collector 6, the empty callee env exactly the one
  homonym cell). Every restore blob-hash verified, and the final `git diff`
  byte-identical to the pre-verification snapshot.
- Default suite: 257 files / 3700 tests green.
- Live: both suites run for real; area (f) exercises the fixed path end to end.
- Lint and typecheck: exit 0.

### Residuals

1. **The type arms fire on non-numeric operands of `-`, `*`, `/`, `%`.**
   `read({ path: "a", offset: true * true })` un-registers with "expected
   number, got boolean" while the runtime coerces the value to `1` and the
   pre-dispatch AJV step accepts it. Non-blocking on three grounds: the source
   is spec-invalid (`expressions.md` §"Other arithmetic": those operators
   "accept only numeric operands"), the verdict is the established static-type
   model's rather than this fix's — the shipped
   `theta/parse/let-rhs-type-mismatch` gives the byte-same judgement on the
   same expression — and the class cannot arise from a spec-valid program. Root
   cause is the missing A5/A6-sibling operand check for non-`+` arithmetic,
   which is a separate rule.
2. **A pre-existing engine collision extended to a new site.** A `member`
   access types as a nominal reference to the FIELD name, so a schema whose
   field name collides with a type name can produce a wrong verdict. The
   shipped annotated-`let` check false-positives identically
   (`let s: string = h.Foo` renders "expected string, got Foo"), so this is the
   established engine semantic reaching one more site, not a defect of this
   fix; the Pi-tool arm is immune (`subsetKinds` admits only the five reserved
   primitive spellings). Same family as bug 0050.
3. **The structural walk has no `par for` arm.** A bare object at a
   NON-direct position inside a `par for` body / iterand / `max` operand is
   still unchecked. Pre-existing; this fix neither closes nor widens it.
4. **Two defensive branches are unwitnessed by the full-pass files.**
   `#checkPiToolArgSchema`'s validator-seam-absence arm — production-unreachable
   because `createRuntimeRoot` requires the seam, and present so that the 21
   pre-existing partial `RuntimeRoot` doubles degrade to the no-check path
   instead of throwing — and the `arity.fields[i] === undefined` guard in the
   type loop. Same family as bug 0071's residual 1 and bug 0070's residual 1.
5. **A behaviour tightening outside §Reproduction, deliberately pinned.**
   Inside a `par for` body a multi-argument NON-Pi-tool call (`f({a},{b})`)
   previously drew nothing — the structural walk never traversed `par for`
   (residual 3) and the old lexical arm required exactly one argument — and now
   draws one `bare-object-literal` per direct bare-object argument, consistent
   with the top level. Cells C10 and C11 pin it. Same class as bug 0071's
   residual 7.
6. **`resolveCalleeArity` remains uncached**, so a callee is re-read and
   re-parsed once per call site; the type check inherits that read unchanged.
   Bug 0071's residual 4, restated because this fix widened what the read
   returns without changing when it happens.

### Discharge notes appended

`docs/bugs/0003-tool-arg-shape-rule-not-enforced.md` — its §Fix (0.16.0)
recorded `theta/parse/tool-arg-arity` as "unwired (out of this bug's scope)"
and stated that a multi-argument call whose first argument is non-object fires
the shape code alone. Both are discharged and superseded here.

### Pinned dispositions / non-goals

- The shape rule (`theta/parse/tool-arg-not-object-literal`) and bug 0016's
  shadowing gate are untouched; every one of their cells is byte-unchanged.
- `CodeToolError.cause` is not widened — the fix produces the existing
  `validation` member.
- The model-driven tool-call loop's argument validation stays host-side.
- `argDepthBreach` and the `arg-depth-error` outcome kind keep their identities.
- An unknown FIELD NAME is out of the parse arm's reach by the row's own
  Trigger ("provably disjoint from the tool's registered input-schema type FOR
  THAT FIELD"); the runtime half owns it.
- `buildCodeToolArgSchemaViolation`'s message is deliberately uncapped: the
  4096-byte cap is scoped by `host-interfaces-core.md` to the `execute()`-throw
  lowering, and both capped siblings carry `cause: "execution"`.
- `.theta`-callable containment at load stays open and unowned here (bug 0110).
- Bug 0050 (`checkFnArgCompat` has no caller) is the sibling emitter of this
  same class and was not touched. What a 0050 fix should reuse: the call-site
  boundary is `checkLexicalCallSites` in `src/parser/theta-document.ts` for a
  parse-only rule, and `checkInvokeStaticResolution` in
  `src/extension/invoke-static-checks.ts` for anything needing the frozen
  `tools:` snapshot; a plain `fn` argument slot needs neither, so its natural
  home is the type layer beside the shipped `let`-RHS check. The transferable
  lesson is the soundness one: any new emission built on
  `StaticTypeInferencePass` must not trust `#commonType`'s reduction of a
  composite — `collectProvableArgTypes` is the reusable arm collector, and both
  of its erasure-path witnesses are in
  `tests/production-tools-load-resolution.test.ts`.

## Provenance

- Spec measured against: `docs/spec_topics/tool-calls.md` §"Argument shape",
  §"Provable-disjointness check (parse time)", §"Failures";
  `docs/spec_topics/errors-and-results/queryerror-variants.md` (`CodeToolError`
  cause enum); `docs/spec_topics/diagnostics/code-registry-parse.md:50, 52, 114`
  (the three rows) and the `docs/reference/diagnostics.md:96` mirror;
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md` §`tools` (resolved
  entries carry `parameters`);
  `docs/rfcs/0002-computed-tool-arguments.md`.
- Implementation: `src/runtime/tool-call.ts` (`checkToolCallArguments`,
  `enforceCodeToolArgDepth`), `src/parser/theta-document.ts`
  (`checkLexicalCallSites`, `bareObjectLiteralDiagnostic`),
  `src/extension/production-theta-producer.ts` (`PiToolDispatch`,
  `#resolveToolCall`, the PIC-64 ladder `isError` arm).
- Evidence: offline production-load matrix (this report §Reproduction) run at
  `d06daae3` via a scratch vitest on the
  `tests/production-tools-load-resolution.test.ts` harness; scratch deleted.
  Live corroboration of the misattributed cause is bug 0003's own recorded
  repro (`docs/bugs/0003-tool-arg-shape-rule-not-enforced.md` §Reproduction).
