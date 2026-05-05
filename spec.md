# pi-loom — Extension Specification

`pi-loom` is a [Pi Coding Agent](https://pi.dev) extension that introduces a purpose-built scripting language for authoring parameterized, programmatic templates that drive an LLM conversation. A `.loom` file interleaves ordinary code (variables, loops, conditionals, functions) with literal text destined for the model; evaluating a loom does not return a value or write a file — it appends turns to a conversation (the *caller's* current conversation in `prompt` mode, or a *fresh isolated* conversation in `subagent` mode). See [Overview](./spec_topics/overview.md) for the full conceptual model.

Loom code lives in two file extensions that share a single grammar and type system: `.loom` files are invocable as slash commands; `.warp` files are library modules — restricted to top-level `import`, `export`, `schema`, `enum`, and `fn` declarations — that `.loom` files import via `import { … } from "./x.warp"`. `.warp` files are never directly invoked. See [Imports](./spec_topics/imports.md) for the full rules.

The full specification is split into focused topic pages under [`spec_topics/`](./spec_topics/). Each topic page is authored to be self-contained: any rule it depends on from another topic must be either stated locally or explicitly cross-linked. An implementer MAY therefore restrict their reading to the topics listed under their plan leaf's **Spec** field. The implementation plan lives in [`plan.md`](./plan.md).

---

## Orientation

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
- [Parameters and Frontmatter](./spec_topics/frontmatter.md) — frontmatter fields, `params`, `tools`, `system`, `coercion`, template interpolation.
- [Query](./spec_topics/query.md) — `@`-templates, schema inference, coercion, `QueryError`.
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
- [Directory Convention](./spec_topics/discovery.md) — discovery sources, priority, cross-format collisions.
- [Invocation from Pi](./spec_topics/slash-invocation.md) — slash-command surface, prompt-mode `Err` formatting.
- [Slash-Command Argument Binding](./spec_topics/binder.md) — LLM-driven binder: model, context, envelope, defaulting, echo, failure modes.
- [Cancellation](./spec_topics/cancellation.md) — `AbortSignal` rules.
- [Diagnostics](./spec_topics/diagnostics.md) — diagnostic shape, code-registry rules, normative code registry, multi-error reporting.

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
- [Related Work](./spec_topics/related-work.md) — orchestration-layer and inference-layer neighbours.

### REQ-ID prefix table

Each spec page that carries normative obligations is assigned a stable per-page REQ-ID prefix; rules inside the page are numbered (`PREFIX-1`, `PREFIX-2`, …) inline as `**PREFIX-N.**` markers or as `<a id="prefix-n"></a>` anchors. The plan's coverage matrix maps each REQ-ID to its closing leaf, and the V18s gate (per [`plan_topics/v18-cancellation.md`](./plan_topics/v18-cancellation.md)) treats unmapped REQ-IDs as CI failures. IDs are immutable: when a rule is split, the original ID retires and two new IDs appear; numbering never collapses to fill holes.

| Page | Prefix |
|---|---|
| `lexical.md` | `LEX` |
| `type-system.md` | `TYPE` |
| `schemas.md` | `SCHM` |
| `descriptions.md` | `DESC` |
| `schema-subset.md` | `SUBS` |
| `frontmatter.md` | `FRNT` |
| `query.md` | `QRY` |
| `expressions.md` | `EXPR` |
| `bindings.md` | `BIND` &nbsp;→&nbsp; **BNDG** (to keep `BIND` for `binder.md`) |
| `control-flow.md` | `CTRL` |
| `errors-and-results.md` | `ERR` |
| `return.md` | `RET` |
| `functions.md` | `FN` |
| `tool-calls.md` | `TOOL` |
| `invocation.md` | `INV` |
| `imports.md` | `IMP` |
| `discovery.md` | `DISC` |
| `slash-invocation.md` | `SLSH` |
| `binder.md` | `BIND` |
| `cancellation.md` | `CNCL` |
| `diagnostics.md` | `DIAG` |
| `runtime-value-model.md` | `RVM` |
| `pi-integration-contract.md` | `PIC` |
| `implementation-notes.md` | `IMPL` |
| `pi-integration.md` | `PIE` |
| `grammar.md` | `GRAM` |
| `glossary.md` | (no IDs — narrative) |
| `overview.md` | (no IDs — narrative) |
| `influences.md` | (no IDs — narrative) |
| `comparison.md` | (no IDs — narrative) |
| `related-work.md` | (no IDs — narrative) |
| `future-considerations.md` | (no IDs — narrative) |

The `BIND` / `BNDG` split for `binder.md` and `bindings.md` is necessary because the two pages would otherwise collide on a three-letter prefix; both are short identifiers and downstream tooling can search either one. The prefix table itself is immutable — adding a new page requires picking a free prefix at first numbering and pinning it here in the same edit.
