# pi-loom — Extension Specification

`pi-loom` is a [Pi Coding Agent](https://github.com/badlogic/pi-mono) extension that adds a domain-specific scripting language for prompts and agentic operations.

A `.loom` file interleaves code with literal text destined for the model. Loom evaluation appends turns to a conversation: the *caller's* current conversation in `prompt` mode, or a separate conversation in `subagent` mode that does not inherit the caller's transcript, system prompt, or *ambient tool set* (the host Pi session's currently-active tools, distinct from the loom's own *callable set* — see [Glossary — `callable set`](./spec_topics/glossary.md)). Mode is selected per-loom by the required `mode:` frontmatter field — see [Parameters and Frontmatter](./spec_topics/frontmatter.md). Evaluation also produces a final value (the loom's last expression or `return expr`) consumed by `invoke` callers and propagated across the subagent boundary; looms do not write files.

Loom evaluation produces one of three terminal outcomes: it succeeds (turns appended; final value available to programmatic callers), it fails (by returning `Err`, by panicking, or by exhausting a runtime limit), or it is cancelled (per the `AbortSignal` plumbed through `ctx.signal`). In every case turns appended *before* the terminal event remain in the conversation the loom was driving — the caller's conversation in `prompt` mode, or the disposable subagent conversation in `subagent` mode — and the runtime performs no implicit rollback. See [Errors and Results](./spec_topics/errors-and-results.md) and [Diagnostics](./spec_topics/diagnostics.md) for the per-stage error surfaces and the partial-append contract; [Cancellation](./spec_topics/cancellation.md) is the normative source for cancellation semantics, with [Invocation from Pi](./spec_topics/slash-invocation.md) and [Pi Integration Contract — Cancellation source](./spec_topics/pi-integration-contract.md) covering the prompt-mode delivery path.

A loom is stored in one of two file extensions that share a single grammar and type system. `.loom` files are invocable as slash commands (see [Slash-Command Invocation](./spec_topics/slash-invocation.md)); `.warp` files are library modules whose top level is restricted to a small set of declaration forms — see [Imports](./spec_topics/imports.md) for the normative list (including `enum` per [Schema Declarations](./spec_topics/schemas.md) and the `export … from` re-export form). `.warp` files are never directly invoked: slash invocation is prevented by construction (discovery scans `*.loom` only — see [Discovery](./spec_topics/discovery.md)); `invoke(...)` and `tools:` paths ending in `.warp` raise `loom/parse/invoke-non-loom-extension`; `import` paths ending in `.loom` raise `loom/parse/import-non-warp-extension`. See [Discovery — File-extension namespace](./spec_topics/discovery.md#file-extension-namespace) for the namespace-clearance note.

<!-- DO NOT inline the permitted-form list here; see imports.md. -->

Each topic page is authored to be self-contained: any rule it depends on from another topic must be either stated locally or referenced by a markdown link whose target is the specific REQ-ID anchor (`#prefix-n`) of the depended-upon rule. Where the depended-upon page is pure-narrative (no REQ-IDs per the appendix table), a section-level link to the relevant heading on that page suffices. An implementer MAY therefore restrict their reading to the topics listed under their plan leaf's **Spec** field, where a *plan leaf* is a terminal task in [`plan.md`](./plan.md) (leaf format defined in [`plan_topics/conventions.md`](./plan_topics/conventions.md#leaf-format)) and its **Spec** field is the list of `spec_topics/*.md` filenames the leaf implements. The **Spec** field is required to be closed under normative cross-link: any topic page cross-linked from a listed topic for a normative rule is itself listed.

---

## Orientation

### Prerequisites

**Pi SDK and capabilities.** The host is `@mariozechner/pi-coding-agent` at the version pinned by [Pi Integration Contract](./spec_topics/pi-integration-contract.md). The `pi-agent-core`, `pi-ai`, and `pi-tui` packages MUST be present at the same minor-version line as the resolved `@mariozechner/pi-coding-agent` install (see [Pi Integration Contract — Host prerequisites — Pi SDK pin](./spec_topics/pi-integration-contract.md) for provenance). The extension MUST verify the seven enumerated SDK capabilities owned by [Pi Integration Contract — SDK capability inventory](./spec_topics/pi-integration-contract.md#sdk-capability-inventory), the Node version floor (Host runtime obligation 1), the `AbortSignal` / `AbortController` shape (Host runtime obligation 2), and the installed `@mariozechner/pi-coding-agent` version at extension-factory entry; on any mismatch it MUST refuse to register slash commands, tools, renderers, or flags, and MUST emit `loom/load/host-incompatible` (see [Diagnostics — `loom/load/*`](./spec_topics/diagnostics.md)) through the system-note fallback chain. `peerDependencies` declares the supported range, but install-time enforcement is package-manager-dependent (e.g. `npm install --engine-strict` is opt-in) and is non-load-bearing; the factory-entry probe is the single load-bearing check. The probe contract — the four pinned constants it consumes (Node floor, `AbortSignal` member list, capability list, peer-dep range), the `details.kind` discriminators it emits, and the registration-refusal rule — is owned by [Pi Integration Contract — Extension entry point](./spec_topics/pi-integration-contract.md) (step 0 "Capability probe"). The seven capabilities are anchored under [SDK capability inventory](./spec_topics/pi-integration-contract.md#sdk-capability-inventory); the bullets below name-link each item to its anchored obligation so plan leaves and tests cite a single normative source:

- **Slash-command registration** — see [Pi Integration Contract — SDK capability inventory item 1](./spec_topics/pi-integration-contract.md#sdk-cap-slash-command-registration).
- **Prompt-mode conversation drive** — see [Pi Integration Contract — SDK capability inventory item 2](./spec_topics/pi-integration-contract.md#sdk-cap-prompt-conversation-drive).
- **Subagent-mode isolated session** — see [Pi Integration Contract — SDK capability inventory item 3](./spec_topics/pi-integration-contract.md#sdk-cap-subagent-isolated-session).
- **Tool registration and gating** — see [Pi Integration Contract — SDK capability inventory item 4](./spec_topics/pi-integration-contract.md#sdk-cap-tool-registration-gating).
- **Cancellation propagation** — see [Pi Integration Contract — SDK capability inventory item 5](./spec_topics/pi-integration-contract.md#sdk-cap-cancellation-propagation).
- **Custom-message channel and renderer** — see [Pi Integration Contract — SDK capability inventory item 6](./spec_topics/pi-integration-contract.md#sdk-cap-custom-message-renderer).
- **Binder LLM model** — see [Pi Integration Contract — SDK capability inventory item 7](./spec_topics/pi-integration-contract.md#sdk-cap-binder-llm-model).

The re-validation obligation that gates widening `peerDependencies` against this surface is owned by [Pi Integration Contract — SDK capability inventory — Re-validation on `peerDependencies` widening](./spec_topics/pi-integration-contract.md#sdk-cap-peer-dep-revalidation).

**Host runtime.** The loom runtime executes inside the Pi extension host process under four host preconditions. They are addressable by ordinal — plan leaves and reviews MAY cite "Host runtime obligation N" — and the asymmetry of obligation 4 (a non-checked invariant) versus obligations 1–3 (preconditions enforced by the host or by call-site failure) is intentional.

1. **Node version floor.** Node `>=20.6.0`, matching `@mariozechner/pi-coding-agent`'s `engines.node` floor at the pinned peer-dep version. The literal `>=20.6.0` is a *floor*, not a range — there is no upper bound. A Pi minor bump that moves that floor requires updating the H1 `engines.node` literal-read assertion in the same edit and following [Pi Integration Contract — Pi version bump procedure](./spec_topics/pi-integration-contract.md#pi-version-bump-procedure), alongside the surface re-validation owned by [Pi Integration Contract — SDK capability inventory — Re-validation on `peerDependencies` widening](./spec_topics/pi-integration-contract.md#sdk-cap-peer-dep-revalidation). Violation is observable: the extension-factory capability probe (per [Pi Integration Contract — Extension entry point](./spec_topics/pi-integration-contract.md) step 0) compares `process.versions.node` against the floor and, on a sub-floor host, refuses every `pi.register*` call and emits `loom/load/host-incompatible` with `details.kind = "node-floor"`. The `package.json#engines.node` install-time check is package-manager-dependent and is **not** the enforcement point.

2. **Pi-supplied `AbortSignal` / `AbortController` shape.** The runtime requires the WHATWG `AbortSignal` and `AbortController` constructors (the Node-bundled implementation) plus the following named members: `signal.aborted`, `signal.reason`, `signal.throwIfAborted()`, `signal.addEventListener("abort", …)`, `AbortSignal.any([…])`, `AbortSignal.timeout(ms)`, and `AbortController.prototype.abort(reason?)`. This enumeration is the single source of truth the rest of the spec depends on; the runtime call sites that exercise each member are described in [Pi Integration Contract](./spec_topics/pi-integration-contract.md) (Host prerequisites #4 and Cancellation source) and [Cancellation](./spec_topics/cancellation.md). Violation is observable: the same factory-entry probe checks `typeof AbortController === "function"`, `typeof AbortSignal === "function"`, and the named static / instance members above by `typeof <member> === "function"` — and on a missing or non-function member refuses every `pi.register*` call and emits `loom/load/host-incompatible` with `details.kind = "abortsignal-shape"`.

3. **Pi SDK named-capability surface.** The seven SDK capabilities enumerated in [Pi Integration Contract — SDK capability inventory](./spec_topics/pi-integration-contract.md#sdk-capability-inventory) (cross-linked from **Pi SDK and capabilities** above) MUST be present in the host's `@mariozechner/pi-coding-agent` instance at extension-factory entry. The detection-and-failure contract is owned by [Pi Integration Contract — Extension entry point](./spec_topics/pi-integration-contract.md) step 0 "Capability probe": the probe checks each capability by `typeof <member> === "function"` (no arity, no return-shape sniffing) and additionally compares the installed `@mariozechner/pi-coding-agent` version (read from its `package.json`) against the pinned range; on a missing capability or out-of-range peer-dep version the probe refuses every `pi.register*` call and emits `loom/load/host-incompatible` with `details.kind = "sdk-capability-missing"` or `"peer-dep-out-of-range"` respectively.

4. **JavaScript engine value model.** The runtime value model assumes a JavaScript engine with IEEE-754 numbers, native `Map`/`Set`, native `JSON.stringify`, and `Object.is` semantics for primitive equality (see [Runtime Value Model](./spec_topics/runtime-value-model.md) and [Cancellation](./spec_topics/cancellation.md)). Behaviour is undefined if the host violates any of these assumptions; the runtime does not feature-detect, does not polyfill, and emits no diagnostic on violation. This is a non-checked invariant, in contrast to obligations 1–3.

### Scope

This subsection pins four cross-cutting V1 dispositions that no single topic page enumerates as a unit. The bullets are informative orientation: each one forward-links the topic page that owns the normative contract, and the V1 dispositions recorded here as scope disclaimers (trust boundary, source-language migration) are also recorded under [Future Considerations — Known V1 limitations (no seam expected)](./spec_topics/future-considerations.md).

- **Trust boundary.** V1 looms execute inside the Pi extension-host process at full host privilege. V1 imposes no loom-level sandbox: filesystem, network, and Pi-API access are bounded only by what Pi grants to extensions and by the per-loom `tools:` allowlist (see [Pi Integration Contract — Tool-registration lifetime and visibility](./spec_topics/pi-integration-contract.md)). A future per-loom capability model is not in V1; see [Future Considerations](./spec_topics/future-considerations.md).

- **Source-language stability.** A `.loom` or `.warp` file that loads cleanly under V1.0 is guaranteed to load and behave identically under every V1.x release. Substantive grammar or semantics changes follow the REQ-ID lifecycle in [`GOV-8`](./spec_topics/governance.md) (split / merge / deletion-plus-add, never in-place rewording), so the user-facing observable — V1.x stability — is what `GOV-8`'s change discipline produces. Migration across major versions is out of V1 scope; see [Future Considerations](./spec_topics/future-considerations.md).

- **Runtime observability.** Operator-facing runtime failure events are emitted on the Pi `loom-system-note` channel via the always-log set defined in [Pi Integration Contract — Runtime event channel](./spec_topics/pi-integration-contract.md). Diagnostics for parse / load / type / runtime-panic batches share the same channel under a disjoint `details` shape (see [Diagnostics](./spec_topics/diagnostics.md)). Aggregation, latency histograms, per-loom token reports, and a consumer-facing read API are deferred (see [Future Considerations — Richer runtime-event telemetry](./spec_topics/future-considerations.md)).

- **Hard runtime ceilings.** The complete V1 set of hard runtime ceilings is: `invoke`-chain nesting depth 32 ([Invocation — Invocation depth bound](./spec_topics/invocation.md)); `tool_loop.max_iterations` per query, default 25 ([Parameters and Frontmatter — `tool_loop`](./spec_topics/frontmatter.md)); at most 3 binder LLM calls per slash invocation ([Slash-Command Argument Binding — Failure modes](./spec_topics/binder.md)); JSON-document depth 5 against typed-query / tool-arg / `params` schemas ([Schema Subset](./spec_topics/schema-subset.md)). No additional implicit nesting, iteration, or recursion limit applies in V1. If a future V1 leaf introduces a new ceiling, this bullet and the new ceiling MUST move in the same edit.

### Reading order

Read these two topics first to understand the design:

- [Overview and Conceptual Model](./spec_topics/overview.md) — what a loom is, query-and-await, prompt vs. subagent mode.
- [Comparison with Existing Pi Features](./spec_topics/comparison.md) — loom vs. Pi `prompt` / `subagent`.

**Background (non-normative).** Skippable; explains design provenance, not requirements.

- [Influences](./spec_topics/influences.md) — what loom borrows from Rust, TypeScript, and what it doesn't.

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
