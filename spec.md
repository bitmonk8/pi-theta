# pi-loom — Extension Specification

`pi-loom` is a [Pi Coding Agent](https://github.com/badlogic/pi-mono) extension that adds a domain-specific scripting language for prompts and agentic operations.

A `.loom` file interleaves code with literal text destined for the model. Loom evaluation appends turns to a conversation: the *caller's* current conversation in `prompt` mode, or a separate conversation in `subagent` mode that does not inherit the caller's transcript, system prompt, or tool set. Mode is selected per-loom by the required `mode:` frontmatter field — see [Parameters and Frontmatter](./spec_topics/frontmatter.md). Evaluation also produces a final value (the loom's last expression or `return expr`) consumed by `invoke` callers and propagated across the subagent boundary; looms do not write files.

Evaluation either succeeds (turns appended; final value available to programmatic callers) or fails — by returning `Err`, by panicking, or by being cancelled. In `prompt` mode, turns appended *before* the failure remain in the caller's conversation; the runtime performs no implicit rollback. See [Errors and Results](./spec_topics/errors-and-results.md), [Invocation from Pi](./spec_topics/slash-invocation.md), and [Diagnostics](./spec_topics/diagnostics.md) for the per-stage error surfaces and the partial-append contract. The full conceptual model is normative in [Overview](./spec_topics/overview.md) and the topic pages it links; this paragraph is informative orientation only.

A loom is stored in one of two file extensions that share a single grammar and type system. `.loom` files are invocable as slash commands (see [Invocation from Pi](./spec_topics/slash-invocation.md)); `.warp` files are library modules whose top level is restricted to a small set of declaration forms — see [Imports](./spec_topics/imports.md) for the normative list (including `enum` per [Schema Declarations](./spec_topics/schemas.md) and the `export … from` re-export form). `.warp` files are never directly invoked: slash invocation is prevented by construction (discovery scans `*.loom` only — see [Discovery](./spec_topics/discovery.md)); `invoke(...)` and `tools:` paths ending in `.warp` raise `loom/parse/invoke-non-loom-extension`; `import` paths ending in `.loom` raise `loom/parse/import-non-warp-extension`. See [Discovery — File-extension namespace](./spec_topics/discovery.md#file-extension-namespace) for the namespace-clearance note.

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
- [Discovery](./spec_topics/discovery.md) — discovery sources, priority, cross-format collisions.
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

**GOV-1.** Each spec page that carries normative obligations is assigned a stable per-page REQ-ID prefix (table below). [H6](./plan_topics/h6-req-ids.md) owns the initial pass that inserts `PREFIX-N` anchors into each page. The canonical anchor form is the inline `**PREFIX-N.**` marker (used by H6's grep, by V18s, and by all downstream tooling); the alternate `<a id="prefix-n"></a>` HTML form is permitted only where rendering constraints make the inline marker impractical, in which case both forms appear together on the same line.

**GOV-2.** Once H6 lands, the plan's coverage matrix in [`plan_topics/coverage-matrix.md`](./plan_topics/coverage-matrix.md) is keyed per REQ-ID, mapping each ID to its closing leaf, and the [V18s coverage-matrix closing gate](./plan_topics/v18-cancellation.md#v18s-coverage-matrix-closing-ci-gate) treats any unmapped REQ-ID as a CI failure. Until H6 closes, the spec-side REQ-ID set is empty, the matrix is section-keyed scaffolding, and the V18s diff is vacuously satisfied.

**GOV-3.** The REQ-ID extraction regex is `\b[A-Z]{3,4}-[0-9]+\b`, applied to non-narrative `spec_topics/*.md` files. Pure-narrative pages (`overview.md`, `glossary.md`, `influences.md`, `comparison.md`, `related-work.md`, `future-considerations.md`) are excluded from extraction. IDs are immutable: when a rule is split, the original ID retires and two new IDs appear; numbering never collapses to fill holes.

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
| `bindings.md` | `BNDS` |
| `control-flow.md` | `CTRL` |
| `errors-and-results.md` | `ERR` |
| `return.md` | `RET` |
| `functions.md` | `FN` |
| `tool-calls.md` | `TOOL` |
| `invocation.md` | `INV` |
| `imports.md` | `IMP` |
| `discovery.md` | `DISC` |
| `slash-invocation.md` | `SLSH` |
| `binder.md` | `BNDR` |
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
| `spec.md` (this appendix's GOV-N rules) | `GOV` |

The `GOV` row covers the governance rules in this appendix; per GOV-3, the extraction regex is applied only to `spec_topics/*.md`, so `GOV-N` IDs in `spec.md` are not consumed by the V18s coverage gate but are citable from plan leaves and from review tooling.

**GOV-4 (per-row invariant).** Existing rows in the prefix table above are immutable: once a page is assigned a prefix, that prefix never changes and is never reused for another page. The table is append-only. Introducing a new non-narrative page requires appending a new row whose prefix is *previously-unused* — meaning absent from both this table and the *Retired prefixes* sub-table below.

**GOV-5 (disjoint-prefix rule).** Each row's `Prefix` value is a complete identifier token, not a search prefix. Tooling that consumes REQ-IDs MUST anchor matches at a word boundary on both ends (`\b<PREFIX>-[0-9]+\b`); two prefixes that share a common substring (e.g. `BNDS` / `BNDR`) MUST NOT be treated as aliases or as one prefix-matching the other.

**GOV-6 (table-completeness invariant).** At every commit on `main`, the set of prefixes appearing in REQ-IDs across `spec_topics/*.md` is a subset of the union of (live prefix table, Retired prefixes sub-table). The V18s gate (per [`plan_topics/v18-cancellation.md`](./plan_topics/v18-cancellation.md)) enforces this.

**GOV-7 (mutation procedures).**

- **Add.** New page → append a row with a previously-unused prefix.
- **Rename.** Prefix follows the page; the row's Page column updates, the Prefix column does not. Existing in-page anchors are not rewritten.
- **Delete.** The row is moved from the live table to the Retired prefixes sub-table. The prefix MUST NOT be reused.
- **Merge.** The surviving page keeps its prefix; the absorbed page's prefix is moved to the Retired prefixes sub-table.
- **Narrative-to-normative promotion.** Replace the `(no IDs — narrative)` cell with a freshly allocated prefix in the same edit that introduces the first obligation.

**GOV-8 (REQ-ID lifecycle).**

- **Split.** When one rule splits into N rules, the original ID retires and N fresh IDs are appended at the page's tail.
- **Merge.** When N rules merge into one, all N source IDs retire and one fresh ID is appended at the page's tail.
- **Deletion.** Rule removed without replacement → ID retires; the prefix-position number MUST NOT be reused.
- **Pure rewording.** Typo fixes, sentence restructuring, link updates leave the ID unchanged. A change that alters which inputs are accepted, which outputs are produced, which diagnostics fire, or which invariants hold is substantive and MUST be modelled as a split, merge, or deletion-plus-add — never as an in-place edit.

All retirements (per GOV-7 *Delete* / *Merge* and per GOV-8 *Split* / *Merge* / *Deletion*) MUST be recorded:

- **Per-prefix retirements** appear in the *Retired prefixes* sub-table immediately below.
- **Per-ID retirements** appear in a trailing `## Retired REQ-IDs` section on each non-narrative page (skeleton inserted by [H6](./plan_topics/h6-req-ids.md)).

#### Retired prefixes

| Prefix | Formerly | Retired in |
|---|---|---|
| `BIND` | `binder.md` (transitional, post-`BIND` / `BNDG` split) | `7851d7c` |
| `BNDG` | `bindings.md` (transitional, post-`BIND` / `BNDG` split) | `7851d7c` |

The Retired prefixes sub-table is itself append-only — a retired prefix cannot be un-retired or reassigned. The `Retired in` column carries the commit SHA (or release tag) of the retiring change. A fourth `Reason` column MAY be added without breaking the GOV-6 gate.
