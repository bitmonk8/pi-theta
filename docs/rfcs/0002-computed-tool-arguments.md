# RFC 0002 — Computed field values in Pi-tool arguments

- **Status:** draft
- **Scope:** theta 1.x language surface (governed by
  `../spec_topics/governance/release-version-naming.md`)
- **Affects:** grammar (literal sublanguage carve-out), diagnostics, runtime
  tool dispatch

## Summary

Admit the full expression grammar for the *field values* of the single
bare-object argument of a Pi-tool call:

```theta
let path = base + "/findings/" + id + ".md"
let body = read({ path: path })?
```

Today this is a parse error (`theta/parse/tool-arg-not-literal`): the argument
is parsed by the [Theta literal sublanguage](../reference/grammar.md#theta-literal-sublanguage),
which excludes `let`-bound identifiers, operators, function calls, and `${...}`
interpolation. This RFC keeps the bare-object *shape* rule (the tool's
registered input schema supplies the type) and lifts only the *contents*
restriction. `params:` defaults — the other literal-sublanguage position — are
unchanged.

## Motivation

A tool call is the language's zero-cost side-effect channel: no model tokens,
no conversation turn, no transcript entry
([Tool Calls](../spec_topics/tool-calls.md) §"No conversation turn"). The
literal-only argument rule makes that channel unreachable for any argument
computed at runtime — anywhere in the call graph:

- Computed values cross `.theta` callable boundaries without restriction
  (`invoke(...)` and `.theta` callable arguments are already-typed expressions
  — [Invocation — Argument binding](../spec_topics/invocation.md#argument-binding)),
  but the callee faces the same literal-only rule at its own Pi-tool call
  sites. Forwarding computed data therefore never restores computed tool
  access; it only relocates the dead end.
- The one working route is `${...}` interpolation into an `@` query — a model
  turn. Every `read` of a discovered path, every `grep` of a computed pattern,
  every `bash` command assembled from runtime data costs a paid turn whose
  only job is to transcribe values the code already holds into a tool call.

For orchestration thetas this is the dominant cost cap. A driver that walks a
findings directory, reads each file, and dispatches per-finding work cannot do
the reads in code; it must route each one through the model. The work is
deterministic; the spend is not.

The restriction is also unjustified by the spec's own validation story. The
runtime already AJV-validates every Pi-tool argument against the tool's input
schema and surfaces mismatches as
`Err(CodeToolError { cause: "validation", ... })` — the spec states that a
Pi-tool argument type mismatch "is never a parse error"
([Tool Calls](../spec_topics/tool-calls.md) §"Argument shape"). Enforcement is
runtime-side today; computed field values change nothing about where
enforcement happens. The general bare-object-literal prohibition has a stated
rationale ("the type is unambiguous from the syntax alone",
[Expressions — Object construction](../spec_topics/expressions.md)); the
external tool schema satisfies it regardless of whether field values are
literals. No documented rationale covers the contents restriction, and no
future-considerations entry proposes it as a deliberate deferral.

## Proposal

Change the grammar of the single positional argument of a Pi-tool call from
the literal sublanguage to:

```
ToolArg    ::= "{" (ToolField ("," ToolField)* ","?)? "}"
ToolField  ::= Ident ":" Expr
```

- **Shape rule unchanged.** The argument remains a single bare object literal
  written inline at the call site. `read(args)` where `args` is a `let`-bound
  object remains rejected (see *Alternatives* for the follow-on that would
  admit it). Multi-argument forms remain `theta/parse/tool-arg-arity`.
- **Field values are full expressions**, including identifier references,
  operators, function calls, `?`, string interpolation, nested arrays and
  objects whose leaves are themselves expressions, and query results already
  bound via `let`.
- **Evaluation order.** Field-value expressions evaluate left-to-right in
  source order, at call time, before dispatch. A panic or an early-returning
  `?` inside a field expression follows ordinary expression semantics; the
  tool is not dispatched.
- **Validation unchanged.** The runtime AJV check against the tool's
  registered input schema remains the enforcement point, surfacing as
  `Err(CodeToolError { cause: "validation", ... })`. As a diagnostics
  enhancement — not required for soundness — the parser MAY emit a best-effort
  parse-time warning when a field expression's static type contradicts the
  tool's input schema mapped through the
  [schema subset](../reference/schema-subset.md).
- **Diagnostics.** `theta/parse/tool-arg-not-literal` is retired for Pi-tool
  call sites. `theta/parse/default-not-literal` (the `params:`-default arm of
  the literal sublanguage) is unaffected.
- **`params:` defaults stay literal-only.** Defaults evaluate at load time
  with no scope in view; there is nothing to compute against. Out of scope.

## Alternatives considered

- **Status quo: route computed arguments through a query.** Works, costs one
  model turn per computed call (or per batch), and reintroduces the
  transcription-error class the typed tool call avoids. This is the cost this
  RFC removes.
- **Whole-argument expression** (`read(args)` for a `let`-bound `args`).
  Requires constructing an object typed by an external, unnamed schema, which
  the named-constructor rule cannot express — there is no schema name to
  write. Admissible as a follow-on by defining the Pi-tool argument position
  as a type sink that supplies the schema (the same mechanism the
  [`array<T>` literal type-sink rule](../reference/grammar.md#arrayt-literal-type-sink-rule)
  uses). Deferred: field-level expressions cover the known cases without new
  sink machinery.
- **A dynamic `call(name, expr)` builtin.** Also lifts the restriction on the
  tool *name*, which this RFC deliberately does not touch: literal callee
  names preserve load-time callable-set resolution
  (`theta/load/unknown-tool`) and the parse-time arity check. Rejected.
- **Per-tool template sugar** (e.g. a `bash`-specific backtick form).
  Addresses one tool; the restriction is positional, not tool-specific.
  Rejected.

## Open questions

- Should the best-effort parse-time schema check ship with the change or land
  separately? If it ships, warning or error severity for a provable mismatch?
- Is `${...}` interpolation admitted only inside string-typed field values, or
  is a full-string field value of interpolated type checked like any other
  expression? (Proposed: the latter — interpolation is an ordinary string
  expression; no special casing.)
- Does the retirement of `theta/parse/tool-arg-not-literal` require a
  deprecation window under the 1.x versioning governance, or is removing a
  parse *rejection* (strictly widening the accepted grammar) additive by
  definition?
- Whether `.theta` callable call sites need any change. (Proposed: none —
  they already take full expressions positionally.)

## Prior art in this repository

- The rule this RFC lifts: [Tool Calls — Argument shape](../spec_topics/tool-calls.md),
  [Grammar — Theta literal sublanguage](../reference/grammar.md#theta-literal-sublanguage),
  [Expressions — Object construction](../spec_topics/expressions.md) (the two
  carve-outs).
- The runtime check that keeps enforcement sound:
  [Errors and results](../reference/errors-and-results.md)
  (`CodeToolError`, `cause: "validation"`).
- The asymmetry motivating the change:
  [Invocation — Argument binding](../spec_topics/invocation.md#argument-binding)
  (computed arguments already cross `.theta` boundaries).
- Static-type ↔ JSON-schema mapping for the optional parse-time check:
  [Schema subset](../reference/schema-subset.md).
