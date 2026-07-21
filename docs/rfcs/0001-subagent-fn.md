# RFC 0001 — `subagent fn`: in-file subagent callables

- **Status:** accepted
- **Scope:** theta 1.x language surface (governed by
  `../spec_topics/governance/release-version-naming.md`)
- **Affects:** grammar, type system, runtime dispatch, diagnostics

## Summary

Add a function form whose body evaluates in a fresh, isolated subagent session:

```theta
subagent fn step(objective: string) {
  @`Objective: ${objective}. Do the next task and report status.`
}
```

Calling `step(objective)` spawns a fresh subagent conversation, runs the body
there, validates the returned value, and hands it back to the caller — the same
boundary an `invoke("./step.theta", ...)` crosses today, without a second file.

## Motivation

A subagent session (a fresh, isolated conversation whose transcript is private and
discarded on return) can currently be reached in only two ways, both of which
target a separate `.theta` file by path: an `invoke("./child.theta", ...)`
expression, or a `.theta` path entry in `tools:`. There is no way to express a
subagent inline.

The consequence surfaces in the agent-loop pattern
([How to write an agent loop](../how-to/write-an-agent-loop.md)). Running each
iteration on a fresh context — the property that makes the pattern work — forces
the worker into its own file, because:

- Within one theta, every `@` query appends to the *same* conversation; a
  single-file loop accumulates one growing context instead of a fresh one per
  round.
- A `.thetalib` `fn` does not help: a query inside an imported `fn` runs against the
  *calling* theta's conversation, so it provides no isolation.

The two-file split (loop file plus worker file) is therefore not a stylistic
choice; it is the only way to get per-iteration isolation. For a short worker
this is friction with no compensating benefit, and it scatters a single logical
unit across two files.

## Proposal

Introduce a `subagent` modifier on the top-level `fn` form. A `subagent fn` is
identical to an ordinary `fn` in its parameter list, positional call form, and
inferred-and-validated return type; it differs in one respect: **its body
evaluates in a fresh subagent session** rather than in the caller's conversation.

```theta
---
description: Re-run a fresh-context step until the objective is met
mode: subagent
tools:
  - read
  - bash
---
subagent fn step(objective: string) {
  schema Progress { done: boolean, summary: string }
  let status: Progress = @`Objective: ${objective}

Inspect the project, do the single most important unfinished task toward the
objective, run the tests with bash, commit, and report whether it is now met.`?
  status
}

let mut round = 0
while round < 20 {
  round += 1
  let status = step(objective)?
  if status.done {
    return status.summary
  }
}
"stopped at the 20-round ceiling"
```

This reuses the existing `invoke` machinery — the isolation boundary, the typed
return, the `invoke`-depth ceiling, and the `InvokeCalleeError` /
`InvokeInfraError` surfaces — and reuses the existing `fn` machinery for
parameters, positional arguments, and return-type inference. The only genuinely
new element is the per-call session boundary in the middle of a file.

### Semantics

- **Isolation.** Each call to a `subagent fn` spawns a fresh, isolated session,
  private and discarded on return, exactly as an `invoke`d subagent-mode theta.
- **Arguments cross by value, explicitly.** Parameters are passed positionally, as
  with `fn` and `invoke`. There is no lexical capture of the enclosing scope
  (consistent with the language's existing decision that functions are not
  first-class and closures do not exist). Only values that can cross the session
  boundary are admissible as arguments — the same constraint `invoke` arguments
  already meet.
- **Return.** The return type is inferred from the body tail, as for `fn`, and
  validated at the boundary. An explicit return schema uses the same annotation
  the body already supports (a typed `let`/tail), so no `invoke<Type>` analogue is
  required.
- **Query targeting.** `@` queries in a `subagent fn` body target the spawned
  session, not the enclosing conversation. This is the central runtime change: the
  evaluator's current session switches on entry and restores on return.
- **Ceilings.** A `subagent fn` call is a countable frame under the depth-32
  `invoke` ceiling ([Hard ceilings](../reference/hard-ceilings.md)). A
  `subagent fn` cannot reference itself, so a single such function introduces no
  unbounded recursion.
- **Not discoverable.** A `subagent fn` is never slash-discoverable and never a
  `tools:` entry; it is reachable only by call from within its own file (or, when
  declared in a `.thetalib`, from an importer — see *Library helpers* below).
  Discovery, slash registration, and `.thetalib` import rules are otherwise
  unchanged.
- **Callable from `mode: prompt`.** A `subagent fn` may be called from a
  prompt-mode theta. This is exactly the `prompt → subagent` cell of the cross-mode
  invocation matrix ([Invocation — Cross-mode semantics](../spec_topics/invocation.md)):
  the spawned child is always a fresh isolated conversation and only its return
  value reaches the caller. The load-time rejection of prompt-mode *callees*
  (`theta/load/prompt-mode-callable`) does not apply — a `subagent fn` body is
  always a subagent session, so it is the safe direction, never the interleaved one.

### Session configuration

A `subagent fn`'s spawned session takes its configuration — `system`, `model`,
`tools` (callable set), `tool_loop`, `respond_repair` — from the enclosing theta by
default. An optional `with { … }` clause overrides any subset of those keys for
that function's session:

```theta
subagent fn step(objective: string) with { tools: [read, bash], system: "…" } {
  @`Objective: ${objective}. …`?
}
```

- **Default is inheritance.** With no `with` clause, the spawned session mirrors the
  enclosing theta's configuration; an unconfigured `subagent fn` behaves like its
  parent with a fresh conversation. This keeps the common case syntax-free.
- **`with { … }` overrides per key.** Keys named in the clause replace the inherited
  value; keys omitted still inherit. The clause is validated at load time against
  the same rules that govern the corresponding frontmatter fields, and reuses those
  fields' diagnostics rather than coining parallel codes.
- **`with { system: … }` is legitimate from a prompt-mode theta.** A prompt-mode
  theta cannot carry `system:` in its own frontmatter (`theta/parse/system-on-prompt-mode`)
  because it has no private conversation — but a `subagent fn` declared inside it
  *does* have a private spawned session, so setting its `system` prompt is
  well-defined and useful precisely where the enclosing theta cannot.

### Library helpers

The `subagent` modifier is admissible on a `.thetalib` `fn`, giving a shared,
properly isolated in-library helper. This is the `.thetalib` counterpart of the
existing rule that an `invoke` of a subagent-mode callee from a library function
"spawns a fresh isolated one" ([Imports](../spec_topics/imports.md)):

- **Queries target a fresh spawned session** regardless of which theta imported the
  helper. Isolation is the point, so the "which conversation" question has one
  unambiguous answer — unlike an ordinary `.thetalib` `fn`, whose queries run against
  the calling theta's conversation and therefore provide no isolation.
- **Inheritance resolves against the calling theta.** With no `with` clause, the
  spawned session inherits the *calling* theta's configuration — the same anchor as
  the existing "calling theta's conversation" rule for library functions.
- **`with { tools: [ … ] }` resolves against the calling theta's callable set.** A
  `.thetalib` has no frontmatter `tools:` declaration of its own, so tool names in a
  library helper's `with` clause must resolve against the calling theta's callable
  set; a name not present there is a load/runtime error through the existing
  callable-resolution channel.

## Diagnostics

A `subagent fn` body that fails to parse or type-check is a load-time error in the
enclosing file, reported through the existing `theta/load/callee-has-errors` code
rather than a new inline-specific code — a `subagent fn` is a callee with errors,
just an inline one. The diagnostic's message rendering handles the inline case,
where the "callee" is a function name in the same file rather than a separate
`.theta` path.

The self-reference ban (a `subagent fn` cannot reference itself) is likewise
enforced without a new code: because a `subagent fn` call is a countable `invoke`
frame, a self-reference is a length-1 invocation cycle and surfaces through the
existing `theta/load/invocation-cycle` code. The `with { … }` session-config clause
adds no code either — each key reuses the corresponding frontmatter field's
load-time diagnostics (with `theta/parse/system-on-prompt-mode` explicitly NOT
applying to a `with`-clause `system`, since that configures the function's own
spawned session). This RFC therefore introduces **no new diagnostic code** — the
corpus transcription records it against theta 1.2 by reuse only
([Functions — FN-6…FN-9](../spec_topics/functions.md#subagent-fn)).

## Prior art in this repository

- Isolation, typed return, and depth accounting:
  [Return a typed value across a subagent boundary](../how-to/return-a-typed-value-across-a-subagent-boundary.md),
  [Hard ceilings](../reference/hard-ceilings.md).
- The cross-mode invocation matrix and the `.thetalib` subagent-callee rule this RFC
  builds on: [Invocation](../spec_topics/invocation.md),
  [Imports](../spec_topics/imports.md).
- The pattern this RFC serves:
  [How to write an agent loop](../how-to/write-an-agent-loop.md).
- `fn` grammar and return-type inference: [Grammar](../reference/grammar.md),
  [Type system](../reference/type-system.md).
