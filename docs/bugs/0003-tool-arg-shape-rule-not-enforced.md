# Bug 0003 — Whole-object Pi-tool argument dispatches with dropped args instead of the documented parse rejection

- **Status:** fixed (0.16.0). Option 1 adopted — the shape rule now fires from
  `parseThetaDocument` (an AST walk equivalent to wiring `checkToolCallArguments`;
  see below for why the walk emits directly), and both runtime lowerings treat a
  non-object first argument as a loud internal defect instead of degrading to
  `{}`.
- **Kind:** defect — the parse-time shape rule `theta/parse/tool-arg-not-object-literal`
  is documented and implemented but never wired, and the runtime silently lowers the
  unrejected form to empty arguments.
- **Affected:** `src/runtime/tool-call.ts` (the shape check, dead in production),
  `src/runtime/statement-executor.ts` `preEvaluateToolArgs`,
  `src/extension/production-theta-producer.ts` `lowerToolCallParams`.
- **Observed at:** `0.12.0`, host Pi `0.82.1`, Windows.

## Fix (0.16.0)

Option 1, in both halves. **Behaviour-tightening:** source that previously
parsed and dispatched with dropped args (`read(args)`, `read("x")`,
`read(mk())`, `read(a.b)`) now fails at parse time. The named
schema-constructor form `read(Args { … })` now also fails at parse, but its
pre-fix behaviour differed: both lowerings lowered ANY object node's fields
regardless of `typeName`, so it dispatched WITH its ctor fields (never `{}`).

**Parse gate** — `parseThetaDocument` (`src/parser/theta-document.ts`) gained a
body walk (`checkPiToolArgShapes`, the `checkUnknownIdentifiers` /
`walkIdentBlock` structure) that emits the registered
`theta/parse/tool-arg-not-object-literal` (error severity, DIAG-4 message with
the tool name substituted, range on the offending ARGUMENT node) for every call
site whose callee resolves to a frontmatter-`tools:` **Pi tool** and whose first
argument exists but is not an inline bare object literal. `.theta`-path entries
are excluded (their calls route through the invoke trampoline and legally take a
whole value — `sentiment(text)`); zero-argument calls stay accepted (the rule
constrains an argument that exists); resolution mirrors the unknown-identifier
walk's lexical model, so whole-file declarations (`fn`/`schema`/`enum`/
import/export/`params:` names — `fn`/import collisions are separately
load-rejected by `theta/load/tool-name-collision`), `let` bindings, loop
variables, `match`-arm bindings, and `fn` parameters shadow the tool name
rather than misfire. The walk emits directly — byte-identical code / severity /
message / hint to `checkToolCallArguments`'s shape arm — instead of calling that
function: its documented arity→shape→type ordering would route a multi-argument
call onto `theta/parse/tool-arg-arity`, which remains unwired (out of this
bug's scope), and its `argumentSource` contract is source-text-based where the
walk owns AST nodes. A multi-argument call whose first argument is non-object
fires the shape code alone.

**Belt-and-braces (runtime)** — both lowerings now throw
`PiToolArgShapeDefectError` (`src/runtime/tool-call.ts`, the
`ThetaFnArityError` / `ToolReturnShapeDefectError` pattern, surfacing as
`theta/runtime/internal-error`) instead of silently degrading:
`preEvaluateToolArgs` (`src/runtime/statement-executor.ts`; after the
`.theta`-callable skip, so the invoke path is untouched) and
`lowerToolCallParams` (`src/extension/production-theta-producer.ts`). The belt
covers **non-object AST nodes** only — both lowerings key on
`first.kind !== "object"` and accept any object node including a named
constructor — so a future parse-gate gap on the named-ctor form would dispatch
its ctor fields rather than throw; for non-object nodes, failing loudly keeps
any gate gap from arg-dropping. Known residual: a lexically shadowed tool name
(`let read = "x"` … `read(args)?`) skips the parse walk by design yet still
dispatches as the Pi tool at runtime (classification is callable-set-only) and
lands on the defect throw — fail-loud, strictly better than the pre-fix silent
`{}` dispatch. Zero-argument calls keep lowering to `{}` on both paths.

Pinned by `tests/tool-arg-shape-enforcement.test.ts` (18 cells: the bug-doc
repro, statement/string/call/member/named-ctor argument shapes with exact
ranges, RFC 0002 computed-field and zero-arg controls, both runtime lowerings'
defect throws and their object-literal / zero-arg / `.theta`-callable
controls).

### Discharge note — bug 0072 (0.65.0)

Two clauses of the record above are discharged and superseded by the 0072 fix
(`docs/bugs/0072-tool-arg-checks-dead-and-no-runtime-net.md` §Fix (0.65.0)):

- **`theta/parse/tool-arg-arity` is no longer unwired.** This record left it
  "unwired (out of this bug's scope)" as the reason the shape arm was re-emitted
  from the parser rather than reached through `checkToolCallArguments`. That
  function is now called from `checkLexicalCallSites` for the arity arm, so all
  three of its previously unreachable codes fire. The shape emission stays
  exactly where this fix put it — the shared function's shape arm is gated on an
  `argumentSource` the parser never supplies (it owns AST nodes, not source
  text), so the two remain byte-identical by DIAG-4 rather than by sharing code.
- **"A multi-argument call whose first argument is non-object fires the shape
  code alone" no longer holds.** Such a call now draws
  `theta/parse/tool-arg-arity` alone, on the authority of
  `docs/spec_topics/tool-calls.md` §"Argument shape" — a multi-argument form "is
  `theta/parse/tool-arg-arity` **regardless of the argument shapes**". The arity
  and shape arms are disjoint by positional count (`> 1` and `<= 1`), so one call
  site can never draw both. Pinned by cell B3 of
  `tests/tool-arg-parse-checks.test.ts`.

Everything else in this record stands: the single-argument shape rule, its exact
argument ranges, the zero-argument acceptance, the named-constructor arm and
both runtime belt-and-braces throws are untouched, and every one of this bug's
18 cells is byte-unchanged.

## Summary

RFC 0002 kept one shape rule on Pi-tool arguments: the single positional argument
must be written inline as a bare object literal. Passing a `let`-bound value whole
(`read(args)`) is specified to fail at parse time with
`theta/parse/tool-arg-not-object-literal`.

On 0.12.0 the rejection never fires. The call parses, loads, and **dispatches with
empty arguments `{}`** — the author's argument object is silently dropped. The tool
then fails at its own input validation or execution, so no fabricated success is
observed, but the failure is late, misattributed to the tool, and depends entirely
on the tool refusing `{}`.

## Reproduction

Both verified live (a registered theta, executed under `pi -p`).

Extension tool — dispatches `{}`, fails at the tool's AJV:

```theta
---
mode: prompt
tools:
  - finding_store
---
schema NegArgs { op: string, findingsDir: string }
let args = NegArgs { op: "validate", findingsDir: "findings" }
let res = finding_store(args)?
res
```

`--mode json` event capture shows the host-loop dispatch carrying `"args": {}` and
the tool result `Validation failed for tool "finding_store": - op: must have
required properties op, findingsDir · Received arguments: {}` → 
`Err(CodeToolError { cause: "execution" })`.

Built-in — executes with the argument fields absent:

```theta
---
mode: prompt
tools:
  - read
---
schema Args { path: string }
let args = Args { path: "smoke.theta" }
let res = read(args)?
@`got: ${res}`?
```

`read` executes with `path: undefined` and fails inside the tool:
`theta /neg-builtin returned Err: tool read call failed (execution) — Cannot read
properties of undefined (reading 'replace')`.

The parse-lint harness (`parseThetaDocument`) reports **no diagnostic** for either
file.

## Expected behaviour (what the spec says)

- `docs/reference/grammar.md` §"Pi-tool argument grammar": the argument must be
  written inline as a bare object literal; a `let`-bound object passed
  positionally (`read(args)`) does not satisfy `ToolArg`.
- `docs/reference/diagnostics.md` registers
  `theta/parse/tool-arg-not-object-literal` as error-severity, parse phase, with
  the message "Pi tool '<name>' argument must be written inline as a bare object
  literal { ... }; a let-bound value cannot supply the field shape". The parse
  code registry (`docs/spec_topics/diagnostics/code-registry-parse.md`) names
  `read(args)` with a `let`-bound value as the triggering case.
- RFC 0002 §Proposal "Shape rule unchanged".

## Actual behaviour

No parse diagnostic. At runtime, two independent lowering paths both degrade the
non-object-literal argument to empty params:

- `preEvaluateToolArgs` (`src/runtime/statement-executor.ts`): when
  `expr.args[0].kind !== "object"` it returns `{ ok: true, args: undefined }`
  ("host lowers arguments on its ordinary path") — no diagnostic, no error.
- `lowerToolCallParams` (`src/extension/production-theta-producer.ts:3031`): the
  ordinary path; when `first.kind !== "object"` it **returns `{}`**.

The dispatch then proceeds with `{}` on both the built-in `execute` path and the
PIC-64 host-loop path.

## Root cause

The shape check exists in `src/runtime/tool-call.ts` but is gated on an input
field no caller supplies:

```ts
if (
  input.calleeKind === "pi-tool" &&
  input.argumentSource !== undefined &&      // ← never true in production
  !isBareObjectLiteral(input.argumentSource)
) {
  return [ { code: "theta/parse/tool-arg-not-object-literal", … } ];
}
```

`argumentSource` is declared optional on the input record and referenced nowhere
else in `src/`. The containing function, `checkToolCallArguments`, has no `src/`
caller at all — only the unit tests invoke it, threading `argumentSource`
directly — so the diagnostic is dead code in production. With the front gate
absent, the two runtime lowerings above become the de-facto behaviour.

## Why it matters

- **Args are silently dropped.** The failure surfaces as the *tool's* error, at
  run time, possibly deep inside a loop — not as the author's parse error at the
  call site.
- **Safety depends on the tool.** A tool for which `{}` is itself a valid,
  effectful input would execute a wrong call rather than fail. Nothing in the
  runtime prevents that today.
- The rule is load-bearing for RFC 0002's design (the inline literal is what lets
  the tool's registered schema supply field names and the disjointness check run);
  an unenforced rule invites authored code that breaks later when enforcement
  lands.

## Options

1. **Wire the existing check** (recommended): introduce a parse/load-time call
   to `checkToolCallArguments` (none exists today), populating `argumentSource`
   (or passing the argument's AST kind), so
   `theta/parse/tool-arg-not-object-literal` fires as documented. Belt-and-braces:
   make `lowerToolCallParams` / `preEvaluateToolArgs` treat a non-object first
   argument as a defect (throw to the `theta/runtime/internal-error` surface)
   rather than lowering to `{}`, so any future gap fails loudly instead of
   arg-dropping.
2. Runtime-only enforcement: keep parse silent, surface
   `Err(CodeToolError { cause: "validation" })` naming the shape violation before
   dispatch. Weaker (misses the documented parse phase) but removes the
   arg-dropping hazard.

Option 1 restores the documented contract; the diagnostic text and registry entry
already exist.

## Non-goals

- Relaxing the shape rule (admitting `read(args)`) — that is RFC territory
  (RFC 0002 §Alternatives records it as a deferred follow-on) and orthogonal to
  enforcing the current contract.

## Discharge note (bug 0303, 0.291.0)

One class this belt used to misattribute is now unreachable: an imported
`.thetalib` `fn` calling a private same-lib sibling (or reading a same-lib
`enum`, or using the lib's own import) used to fall off the user-`fn` path
into the tool-call lowering and die in this belt naming the SIBLING as an
unshaped Pi tool (e.g. `internal defect: Pi tool 'helper' …`), a parse gate
blamed for a gap that was never its fault (0101 §Non-goals recorded the same
misattribution for the unbound-name class). As of 0.291.0,
[bug 0303](./0303-imported-fn-body-resolves-in-caller-scope.md) resolves such
lib-internal names in the declaring module's environment, so they take the
user-`fn` path and never reach this belt. The belt's message text is
unchanged (0303 non-goal); only the lib-internal-name class no longer lands
in it.

## Provenance

- Spec measured against: `docs/reference/grammar.md` §"Pi-tool argument grammar",
  `docs/reference/diagnostics.md` (`theta/parse/tool-arg-not-object-literal` row),
  `docs/spec_topics/diagnostics/code-registry-parse.md` (same row, `read(args)`
  example), `docs/rfcs/0002-computed-tool-arguments.md` §Proposal.
- Implementation: `src/runtime/tool-call.ts` (gated check),
  `src/runtime/statement-executor.ts` `preEvaluateToolArgs`,
  `src/extension/production-theta-producer.ts` `lowerToolCallParams`.
- Found during the pi-config theta-migration Phase-0 verification (spike (b-neg),
  `pi-config` repo `docs/theta-migration/phase0-spikes/README.md`), 0.12.0.
