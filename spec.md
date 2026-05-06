# pi-loom — Extension Specification

`pi-loom` is a [Pi Coding Agent](https://github.com/badlogic/pi-mono) extension that adds a domain-specific scripting language for prompts and agentic operations.

A `.loom` file interleaves code with literal text destined for the model. Loom evaluation appends turns to a conversation: the *caller's* current conversation in `prompt` mode, or a separate conversation in `subagent` mode that does not inherit the caller's transcript, system prompt, or *ambient tool set* (the host Pi session's currently-active tools, distinct from the loom's own *callable set* — see [Glossary — `callable set`](./spec_topics/glossary.md)). Mode is selected per-loom by the required `mode:` frontmatter field — see [Parameters and Frontmatter](./spec_topics/frontmatter.md). Evaluation also produces a final value (the loom's last expression or `return expr`) consumed by `invoke` callers and propagated across the subagent boundary; looms do not write files.

Evaluation either succeeds (turns appended; final value available to programmatic callers) or fails — by returning `Err`, by panicking, or by being cancelled. In `prompt` mode, turns appended *before* the failure remain in the caller's conversation; the runtime performs no implicit rollback. See [Errors and Results](./spec_topics/errors-and-results.md), [Slash-Command Invocation](./spec_topics/slash-invocation.md), and [Diagnostics](./spec_topics/diagnostics.md) for the per-stage error surfaces and the partial-append contract. The full conceptual model is normative in [Overview](./spec_topics/overview.md) and the topic pages it links; this paragraph is informative orientation only.

A loom is stored in one of two file extensions that share a single grammar and type system. `.loom` files are invocable as slash commands (see [Slash-Command Invocation](./spec_topics/slash-invocation.md)); `.warp` files are library modules whose top level is restricted to a small set of declaration forms — see [Imports](./spec_topics/imports.md) for the normative list (including `enum` per [Schema Declarations](./spec_topics/schemas.md) and the `export … from` re-export form). `.warp` files are never directly invoked: slash invocation is prevented by construction (discovery scans `*.loom` only — see [Discovery](./spec_topics/discovery.md)); `invoke(...)` and `tools:` paths ending in `.warp` raise `loom/parse/invoke-non-loom-extension`; `import` paths ending in `.loom` raise `loom/parse/import-non-warp-extension`. See [Discovery — File-extension namespace](./spec_topics/discovery.md#file-extension-namespace) for the namespace-clearance note.

<!-- DO NOT inline the permitted-form list here; see imports.md. -->

Each topic page is authored to be self-contained: any rule it depends on from another topic must be either stated locally or referenced by a markdown link whose target is the specific REQ-ID anchor (`#prefix-n`) of the depended-upon rule. Where the depended-upon page is pure-narrative (no REQ-IDs per the appendix table), a section-level link to the relevant heading on that page suffices. An implementer MAY therefore restrict their reading to the topics listed under their plan leaf's **Spec** field, where a *plan leaf* is a terminal task in [`plan.md`](./plan.md) (leaf format defined in [`plan_topics/conventions.md`](./plan_topics/conventions.md#leaf-format)) and its **Spec** field is the list of `spec_topics/*.md` filenames the leaf implements. The **Spec** field is required to be closed under normative cross-link: any topic page cross-linked from a listed topic for a normative rule is itself listed.

---

## Orientation

### Prerequisites

**Pi SDK and capabilities.** The host is `@mariozechner/pi-coding-agent` at the version pinned by [Pi Integration Contract](./spec_topics/pi-integration-contract.md). The matching `pi-agent-core` / `pi-ai` / `pi-tui` minor is also required; `package.json` `peerDependencies` is the enforcement point. Loom depends on the following named SDK capabilities (each link points to the section that pins it):

- **Slash-command registration** — `pi.registerCommand` (per [Pi Integration Contract — Extension entry point](./spec_topics/pi-integration-contract.md)).
- **Prompt-mode conversation drive** — `pi.sendUserMessage` + `ExtensionCommandContext.waitForIdle` (per [Pi Integration Contract — Conversation drive — prompt mode](./spec_topics/pi-integration-contract.md)).
- **Subagent-mode isolated session** — `createAgentSession` returning a disposable `AgentSession` with private `SessionManager.inMemory(cwd)` transcript (per [Pi Integration Contract — Conversation drive — subagent mode](./spec_topics/pi-integration-contract.md) and [Pi Integration Contract — Subagent session lifecycle](./spec_topics/pi-integration-contract.md)).
- **Tool registration and gating** — `pi.registerTool` + `pi.setActiveTools` snapshot/restore (per [Pi Integration Contract — Tool-registration lifetime and visibility](./spec_topics/pi-integration-contract.md)).
- **Cancellation propagation** — Pi-supplied `AbortSignal` plumbed via `ctx.signal` (turn-side) and `execute(..., signal, ...)` (tool-side); the loom-side `AbortController` rule is in [Pi Integration Contract — Cancellation source](./spec_topics/pi-integration-contract.md) and [Cancellation](./spec_topics/cancellation.md).
- **Custom-message channel and renderer** — `pi.sendMessage({ customType: "loom-system-note", ... })` + `pi.registerMessageRenderer` (per [Pi Integration Contract — System notes](./spec_topics/pi-integration-contract.md)).
- **Binder LLM model** — A structured-output-capable model resolved via `ctx.modelRegistry`; non-bypass looms fail to load with `loom/load/binder-model-unresolved` if absent. Bypass cases (no-params, single-string with no default) skip the binder call.

Widening `peerDependencies` requires re-validating the surface inventory above against the new Pi minor before the range moves.

**Host runtime.** The loom runtime executes inside the Pi extension host process. The host is Node.js; the supported version range is `>=20.6.0` (matching `@mariozechner/pi-coding-agent`'s `engines.node` floor at the pinned peer-dep version). A Pi minor bump that widens or narrows that range requires re-validating the loom range in the same edit. The host's `AbortSignal` / `AbortController` types are Web-standard (the Node-bundled WHATWG implementation); the loom runtime treats them as a load-bearing SDK contract. The runtime value model assumes a JavaScript engine with IEEE-754 numbers, native `Map`/`Set`, native `JSON.stringify`, and `Object.is` semantics for primitive equality (see [Runtime Value Model](./spec_topics/runtime-value-model.md) and [Cancellation](./spec_topics/cancellation.md)).

### Scope

This subsection pins four cross-cutting V1 dispositions that no single topic page enumerates as a unit. The bullets are informative orientation: each one forward-links the topic page that owns the normative contract, and the V1 dispositions recorded here as scope disclaimers (trust boundary, source-language migration) are also recorded under [Future Considerations — Known V1 limitations (no seam expected)](./spec_topics/future-considerations.md).

- **Trust boundary.** V1 looms execute inside the Pi extension-host process at full host privilege. V1 imposes no loom-level sandbox: filesystem, network, and Pi-API access are bounded only by what Pi grants to extensions and by the per-loom `tools:` allowlist (see [Pi Integration Contract — Tool-registration lifetime and visibility](./spec_topics/pi-integration-contract.md)). A future per-loom capability model is not in V1; see [Future Considerations](./spec_topics/future-considerations.md).

- **Source-language stability.** A `.loom` or `.warp` file that loads cleanly under V1.0 is guaranteed to load and behave identically under every V1.x release. Substantive grammar or semantics changes follow the REQ-ID lifecycle in [`GOV-8`](./spec_topics/governance.md) (split / merge / deletion-plus-add, never in-place rewording), so the user-facing observable — V1.x stability — is what `GOV-8`'s change discipline produces. Migration across major versions is out of V1 scope; see [Future Considerations](./spec_topics/future-considerations.md).

- **Runtime observability.** Operator-facing runtime failure events are emitted on the Pi `loom-system-note` channel via the always-log set defined in [Pi Integration Contract — Runtime event channel](./spec_topics/pi-integration-contract.md). Diagnostics for parse / load / type / runtime-panic batches share the same channel under a disjoint `details` shape (see [Diagnostics](./spec_topics/diagnostics.md)). Aggregation, latency histograms, per-loom token reports, and a consumer-facing read API are deferred (see [Future Considerations — Richer runtime-event telemetry](./spec_topics/future-considerations.md)).

- **Hard runtime ceilings.** The complete V1 set of hard runtime ceilings is: `invoke`-chain nesting depth 32 ([Invocation — Invocation depth bound](./spec_topics/invocation.md)); `tool_loop.max_iterations` per query, default 25 ([Parameters and Frontmatter — `tool_loop`](./spec_topics/frontmatter.md)); at most 3 binder LLM calls per slash invocation ([Slash-Command Argument Binding — Failure modes](./spec_topics/binder.md)); JSON-document depth 5 against typed-query / tool-arg / `params` schemas ([Schema Subset](./spec_topics/schema-subset.md)). No additional implicit nesting, iteration, or recursion limit applies in V1. If a future V1 leaf introduces a new ceiling, this bullet and the new ceiling MUST move in the same edit.

### Reading order

Read these first to understand the design:

- [Overview and Conceptual Model](./spec_topics/overview.md) — what a loom is, query-and-await, prompt vs. subagent mode.
- [Influences](./spec_topics/influences.md) — what loom borrows from Rust, TypeScript, and what it doesn't.
- [Comparison with Existing Pi Features](./spec_topics/comparison.md) — loom vs. Pi `prompt` / `subagent`.

---

## Language

Surface and semantics of the Loom language (shared by `.loom` and `.warp` files).

- [Lexical Structure](./spec_topics/lexical.md) — identifiers, keywords, comments, strings, numbers.
- [Type System](./spec_topics/type-system.md) — primitive, named, generic, union, literal, inline-object types.
  - [Schema Declarations](./spec_topics/schemas.md) — `schema X { ... }`, `schema X = ...`, `enum`, discriminated unions, recursion, wire-name renaming.
  - [Descriptions](./spec_topics/descriptions.md) — `///` doc comments, field separators.
  - [Schema Subset](./spec_topics/schema-subset.md) — JSON-Schema subset and lowering algorithm.
- [Parameters and Frontmatter](./spec_topics/frontmatter.md) — frontmatter fields, `params`, `tools`, `system`, `respond_repair`, template interpolation.
- [Query](./spec_topics/query.md) — `@`-templates, schema inference, respond-repair, `QueryError`.
- [Expression Sublanguage](./spec_topics/expressions.md) — supported forms, stdlib, operator precedence, grammar disambiguation, object/array construction.
- [Bindings and Mutability](./spec_topics/bindings.md) — `let`, `let mut`, reassignment.
- [Control Flow](./spec_topics/control-flow.md) — `if`, `for`, `while`, `break`, `continue`.
- [Errors and Results](./spec_topics/errors-and-results.md) — `match`, pattern grammar, `Result`, `?`, runtime panics.
- [Return Statement](./spec_topics/return.md) — `return expr` rules.
- [Function Definitions](./spec_topics/functions.md) — `fn`, hoisting, tail-expression returns.
- [Tool Calls](./spec_topics/tool-calls.md) — `<name>(args)`, `CodeToolError`.
- [Invocation](./spec_topics/invocation.md) — `invoke(...)`, cross-mode matrix, invoke errors, cycle detection.
- [Imports](./spec_topics/imports.md) — `.warp` library files, `import`/`export`, cycles.

---

## Extension Architecture

How loom integrates with the Pi runtime.

- [Pi Extension Integration](./spec_topics/pi-integration.md) — overall extension shape and index of subtopics.
- [Discovery](./spec_topics/discovery.md) — discovery sources, priority, cross-format collisions.
- [Slash-Command Invocation](./spec_topics/slash-invocation.md) — prompt-mode `Err` formatting, no-params overflow, call-chain note.
- [Slash-Command Argument Binding](./spec_topics/binder.md) — LLM-driven binder: model, context, envelope, defaulting, echo, failure modes.
- [Cancellation](./spec_topics/cancellation.md) — `AbortSignal` rules.
- [Diagnostics](./spec_topics/diagnostics.md) — diagnostic shape, code-registry rules, placeholder rendering, normative code registry, multi-error reporting.

---

## Implementation Notes

Implementer-facing notes about the runtime and Pi SDK contract.

- [Implementation Notes](./spec_topics/implementation-notes.md) — parser contract, runtime behaviour, schema-validation contract, single-threaded execution.
- [Runtime Value Model](./spec_topics/runtime-value-model.md) — JS representation of loom values, equality, wire-name translation.
- [Pi Integration Contract](./spec_topics/pi-integration-contract.md) — the named `@mariozechner/pi-coding-agent` surface the runtime depends on.
- [Future Considerations](./spec_topics/future-considerations.md) — out-of-scope features.

---

## Appendix

- [Glossary](./spec_topics/glossary.md) — alphabetised list of coined terms with pointers to their canonical defining pages.
- [Grammar Appendix](./spec_topics/grammar.md) — normative productions for the literal sublanguage and the surface-syntax forms no single topic page owns.
- [Governance](./spec_topics/governance.md) — REQ-ID prefix table, retirement registry, and the GOV-1 through GOV-8 rules that govern REQ-ID coining, anchoring, retirement, and gating.
- [Related Work](./spec_topics/related-work.md) — orchestration-layer and inference-layer neighbours.
