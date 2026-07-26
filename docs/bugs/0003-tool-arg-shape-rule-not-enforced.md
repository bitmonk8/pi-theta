# Bug 0003 — Whole-object Pi-tool argument dispatches with dropped args instead of the documented parse rejection

- **Status:** open
- **Kind:** defect — the parse-time shape rule `theta/parse/tool-arg-not-object-literal`
  is documented and implemented but never wired, and the runtime silently lowers the
  unrejected form to empty arguments.
- **Affected:** `src/runtime/tool-call.ts` (the shape check, dead in production),
  `src/runtime/statement-executor.ts` `preEvaluateToolArgs`,
  `src/extension/production-theta-producer.ts` `lowerToolCallParams`.
- **Observed at:** `0.12.0`, host Pi `0.82.1`, Windows.

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
