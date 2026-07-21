# Language and architecture

<!-- The cross-cutting NFR dispositions (Source-language stability, Runtime observability) are recorded in the Non-functional requirements section of overview-and-orientation.md#non-functional-requirements. -->

<a id="theta-1-0-non-goals-aggregator"></a>
### V1 non-goals

*Orientation aggregator (per [Governance — GOV-30](./governance.md)).* The consolidated theta 1.0 non-goals list — cross-cutting theta 1.0 scope decisions where theta 1.0 ships without a forward-compatibility seam (a future revision adding the disposition is not anticipated by theta 1.0 and will require a migration) — is owned by [Future Considerations — theta 1.0 non-goals](./future-considerations/model-changes-and-non-goals.md#theta-1-0-non-goals); the eight items, separated by `;` so that items whose inner punctuation includes commas and em-dashes remain visually distinguishable from the inter-item boundary, are: no per-theta sandbox or capability model; no formal source-language migration mechanism for major-version transitions; no non-Node JavaScript host support; no concurrent user sessions in the same host process; no reliance on a Pi extension-host stdio-capture facet — teardown-time `console.error` diagnostics are treated as best-effort, per [Future Considerations — No reliance on a Pi extension-host stdio-capture facet](./future-considerations/model-changes-and-non-goals.md#pi-stdio-capture-facet); no parallel-`invoke` surface; no parallel fan-out *to* prompt-mode `.theta` callees (a prompt-mode `.theta` callable cannot appear in another theta's `tools:` table at all — rejected at load time per [Parameters and Frontmatter — `tools`](./frontmatter/frontmatter-fields-a.md#tools) — so the model never sees one to fan out across, while Pi-host tools and subagent-mode `.theta` callees remain present in tool tables and may still be fanned out per [Tool Calls — Concurrency](./tool-calls.md#concurrency)); no admission cap on in-flight theta invocations. Two of these eight — no parallel-`invoke` surface and no parallel fan-out to prompt-mode `.theta` callees — were subsequently delivered in theta 1.1 by [RFC 0003 — `par for`](../rfcs/0003-parallel-fanout.md) as a backward-compatible minor requiring no migration (a `par for` body opens a parallel-children scope whose iterations may each `invoke(...)`, including to prompt-mode callees, per CTRL-4); they are retained in the list as historical theta-1.0 scope notes rather than standing requires-migration non-goals, and the without-a-seam framing above applies to the remaining six.

The seam-vs-non-goal distinction is stated in category 4 of the intro list on [Future Considerations](./future-considerations.md); the canonical surface-extension inventory is owned by [Future Considerations — Surface extensions (theta 1.0 leaves a seam)](./future-considerations/surface-extensions.md#surface-extensions-v1-leaves-a-seam) (e.g. per-call timeouts on queries / tool calls / invokes, the per-query overrides cascade).

### Reading order

Read these two topics first to understand the design:

- [Overview and Conceptual Model](./overview.md) — what a theta is, query-and-await, prompt vs. subagent mode.
- [Comparison with Existing Pi Features](./comparison.md) — theta vs. Pi `prompt` / `subagent`.

For the runtime's session-level contract — session shutdown, concurrency isolation, and per-invocation budgets — see [Session Model](./session-model-and-appendix.md#session-model), which forward-links the topic-page owner for each session-model obligation.

**Background (non-normative).** Skippable; explains design provenance, not requirements.

- [Influences](./influences.md) — what theta borrows from Rust, TypeScript, and what it doesn't.

---

## Language

Surface and semantics of the Theta language (shared by `.theta` and `.thetalib` files).

- [Lexical Structure](./lexical.md) — identifiers, keywords, comments, strings, numbers.
- [Type System](./type-system.md) — primitive, named, generic, union, literal, inline-object types.
  - [Schema Declarations](./schemas.md) — `schema X { ... }`, `schema X = ...`, `enum`, discriminated unions, recursion, wire-name renaming.
  - [Descriptions](./descriptions.md) — `///` doc comments, field separators.
  - [Schema Subset](./schema-subset.md) — JSON-Schema subset and lowering algorithm.
- [Parameters and Frontmatter](./frontmatter.md) — frontmatter fields, `params`, `tools`, `system`, `respond_repair`, template interpolation.
- [Query](./query.md) — `@`-templates, schema inference, respond-repair, `QueryError`.
- [Expression Sublanguage](./expressions.md) — supported forms, stdlib, operator precedence, grammar disambiguation, object/array construction, the `match` expression and pattern grammar, the `?` operator.
- [Bindings and Mutability](./bindings.md) — `let`, `let mut`, reassignment.
- [Control Flow](./control-flow.md) — `if`, `for`, `while`, `break`, `continue`, `par for` (parallel fan-out).
- [Errors and Results](./errors-and-results.md) — `Result`, terminal outcomes, runtime panics, no-rollback contract.
- [Return Statement](./return.md) — `return expr` rules.
- [Function Definitions](./functions.md) — `fn`, hoisting, tail-expression returns, `subagent fn` (inline subagent callables).
- [Tool Calls](./tool-calls.md) — `<name>(args)`, `CodeToolError`.
- [Invocation](./invocation.md) — `invoke(...)`, cross-mode matrix, invoke errors, cycle detection.
- [Imports](./imports.md) — `.thetalib` library files, `import`/`export`, cycles.

---

## Extension Architecture

How theta integrates with the Pi runtime.

- [Pi Extension Integration](./pi-integration.md) — overall extension shape and index of subtopics.
- [Discovery](./discovery.md) — discovery sources, priority, cross-format collisions.
- [Slash-Command Invocation](./slash-invocation.md) — prompt-mode `Err` formatting, no-params overflow, call-chain note.
- [Slash-Command Argument Binding](./binder.md) — LLM-driven binder: model, context, envelope, defaulting, echo, failure modes.
- [Cancellation](./cancellation.md) — `AbortSignal` rules.
- [Diagnostics](./diagnostics.md) — diagnostic shape, code-registry rules, placeholder rendering, normative code registry, multi-error reporting.
- <a id="concurrency-model"></a> **Concurrency model.** The mode-qualified isolation contract for concurrent theta invocations within a session — covering cancellation independence ([SM-7a](./session-model-and-appendix.md#sm-7a-cancellation-independence)), subagent-mode transcript and tool-table isolation ([SM-7b](./session-model-and-appendix.md#sm-7b-subagent-mode-isolation)), prompt-mode sequential execution ([SM-7c](./session-model-and-appendix.md#sm-7c-prompt-mode-sequential-execution)), the theta 1.0 no-cap / no-scheduler disposition ([SM-7d](./session-model-and-appendix.md#sm-7d-no-cap-no-scheduler)), and downward-only cancellation propagation ([SM-7e](./session-model-and-appendix.md#sm-7e-downward-only-cancellation)) — is owned by the [Session model — SM-7a … SM-7e](./session-model-and-appendix.md#sm-7-mode-qualified-concurrency) sub-units (with the per-invocation budget non-sharing rule owned by the sibling [SM-8](./session-model-and-appendix.md#sm-8-per-invocation-budget-non-sharing) sub-unit).

---
