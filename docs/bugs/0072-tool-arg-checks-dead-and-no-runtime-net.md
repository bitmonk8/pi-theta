# Bug 0072 — `checkToolCallArguments` has no `src/` caller, so `theta/parse/tool-arg-arity`, `-schema-conflict` and `-type-mismatch` are unreachable: a multi-argument Pi-tool call is misdiagnosed as `theta/parse/bare-object-literal` at both argument positions, `read({ path: 123 })` loads clean, and no runtime check replaces the ones that never fire

- **Status:** open.
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
