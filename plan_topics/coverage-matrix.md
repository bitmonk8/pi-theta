# Spec coverage matrix

Every executable spec section maps to a closing leaf. The V18s gate (per [V18 — V18s](v18-cancellation.md)) enforces a stricter property in CI: every REQ-ID emitted by any spec page (per the prefix table in [`../spec.md`](../spec.md)) must have at least one mapping in this matrix. The current rows below are section-level scaffolding that pre-dates the REQ-ID assignment pass; rows below will be re-pivoted to per-REQ-ID granularity as Phase 12b assigns REQ-IDs page-by-page (see [Conventions — REQ-ID discipline](conventions.md)).

| Spec page | Closing leaf(s) |
|---|---|
| [Overview](../spec_topics/overview.md) | M |
| [Overview — Code and Model](../spec_topics/overview.md#code-and-model) | M, V5a, V6a |
| [Overview — Query-and-Await](../spec_topics/overview.md#query-and-await) | V5e, V6b |
| [Overview — Scope of a Loom File](../spec_topics/overview.md#scope-of-a-loom-file) | M, V12a |
| [Lexical Structure](../spec_topics/lexical.md) | V1a–V1e |
| [Type System](../spec_topics/type-system.md) | V2c, V4d, V10a, V10d, V11a |
| [Schema Declarations — object form](../spec_topics/schemas.md) | V4b |
| [Schema Declarations — type alias / union](../spec_topics/schemas.md) | V4c |
| [Schema Declarations — enum](../spec_topics/schemas.md) | V10a–V10c |
| [Schema Declarations — discriminated union](../spec_topics/schemas.md) | V11a–V11f |
| [Schema Declarations — recursion](../spec_topics/schemas.md) | V11g, V11h |
| [Schema Declarations — wire-name renaming](../spec_topics/schemas.md) | V13a–V13d |
| [Descriptions](../spec_topics/descriptions.md) | V13e (general), V10f (enums) |
| [Schema Subset](../spec_topics/schema-subset.md) | V4g, V11i |
| [Schema Subset — Lowering Algorithm](../spec_topics/schema-subset.md#lowering-algorithm) | V4b–V4i |
| [Parameters and Frontmatter — `params` and defaults](../spec_topics/frontmatter.md) | V3b, V16a |
| [Parameters and Frontmatter — `model`](../spec_topics/frontmatter.md) | V3a (recognised); applies per-query in V5e onward |
| [Parameters and Frontmatter — `tools`](../spec_topics/frontmatter.md) | V14a, V14b, V14s (resolution snapshot), V15e–V15g |
| [Parameters and Frontmatter — `system`](../spec_topics/frontmatter.md) | V12b, V12c |
| [Parameters and Frontmatter — `bind_*`](../spec_topics/frontmatter.md) | V16e–V16k |
| [Parameters and Frontmatter — `coercion`](../spec_topics/frontmatter.md) | V13f, V13g–V13j |
| [Parameters and Frontmatter — `tool_loop`](../spec_topics/frontmatter.md) | V13f, V6k |
| [Template Interpolation](../spec_topics/frontmatter.md#template-interpolation) | V5b |
| [Query — untyped](../spec_topics/query.md) | V5a, V5e, V5f, V5g |
| [Query — typed and inference](../spec_topics/query.md) | V6c–V6h |
| [Query — typed queries are tool-loop-shaped](../spec_topics/query.md) | V6i, V6l |
| [Query — tool-call loop bound](../spec_topics/query.md) | V6k |
| [Query — degenerate rendered templates](../spec_topics/query.md) | V5e (runtime short-circuit), V5c (parse warning) |
| [Query — coercion](../spec_topics/query.md) | V13g–V13j |
| [Query — failure modes (`QueryError`)](../spec_topics/query.md) | V5g, V5h (`ContextOverflowError` detection), V6i, V6k, V6j, V6m, V14r, V14f–V14i, V15l, V15m |
| [Expression Sublanguage](../spec_topics/expressions.md) | V2a–V2i, extended in V14c-a, V14c-b |
| [Operator precedence](../spec_topics/expressions.md#operator-precedence) | V2c |
| [Grammar disambiguation](../spec_topics/expressions.md#grammar-disambiguation) | V1e, V2 (struct-expr-in-scrutinee) |
| [Object construction, array construction, operator rules](../spec_topics/expressions.md#object-construction-array-construction-and-operator-rules) | V2c, V2h |
| [Bindings and Mutability](../spec_topics/bindings.md) | V2a, V2b |
| [Control Flow](../spec_topics/control-flow.md) | V8a–V8f |
| [Errors and Results — `match`, patterns](../spec_topics/errors-and-results.md) | V7a–V7j |
| [Errors and Results — `Result`, `?`](../spec_topics/errors-and-results.md) | V6a, V6b |
| [Errors and Results — runtime panics](../spec_topics/errors-and-results.md) | V7i, V18k, V18l, V18m, V18n |
| [Errors and Results — runtime panics — `loom/runtime/internal-error` (unexpected interpreter throw)](../spec_topics/errors-and-results.md) | V18m, V18n |
| [Diagnostics — `loom/runtime/system-note-delivery-failed` (system-note fallback chain)](../spec_topics/diagnostics.md) | V18h |
| [Diagnostics — `loom/runtime/registry-swap-failed` (watcher build-aside-then-publish swap)](../spec_topics/diagnostics.md) | V18f |
| [Return Statement](../spec_topics/return.md) | V8f, V9c, V9e |
| [Function Definitions](../spec_topics/functions.md) | V9a–V9f |
| [Tool Calls — Pi tools](../spec_topics/tool-calls.md) | V14a, V14b, V14c-a, V14c-b, V14e–V14j |
| [Tool Calls — registered loom callees](../spec_topics/tool-calls.md) | V15e–V15g |
| [Invocation](../spec_topics/invocation.md) | V15a–V15n |
| [Imports](../spec_topics/imports.md) | V17a–V17m |
| [Pi Extension Integration](../spec_topics/pi-integration.md) | M, V14k–V14q, V14t, V18f, V18h |
| [Directory Convention](../spec_topics/discovery.md) | V14k–V14q, V18r |
| [Invocation from Pi](../spec_topics/slash-invocation.md) | V16a–V16p, V18i |
| [Slash-Command Argument Binding — bypass](../spec_topics/binder.md) | V3c |
| [Slash-Command Argument Binding — full](../spec_topics/binder.md) | V16a–V16p |
| [Cancellation](../spec_topics/cancellation.md) | V18a–V18e, V18p, V18o |
| [Diagnostics](../spec_topics/diagnostics.md) | H3, V18j |
| [Comparison with Existing Pi Features](../spec_topics/comparison.md) | – |
| [Implementation Notes — Parser](../spec_topics/implementation-notes.md#parser) | V1a–V1e, refined per slice |
| [Implementation Notes — Runtime](../spec_topics/implementation-notes.md#runtime) | M, V5e, V12a, V14c-a, V15a, V18a–V18n |
| [Runtime Value Model](../spec_topics/runtime-value-model.md) | V2 (primitives/arrays/objects), V6a (Result), V10e (enum brand), V13b–V13d (wire-name) |
| [Pi Integration Contract](../spec_topics/pi-integration-contract.md) | M, V5h (provider error mapping), V6i (synthesised respond-tool shape), V12a, V14a–V14j (V14e: loom-callee `defineTool` shape), V14t (`resources_discover` subscription / `event.cwd` / `reason` / `{}` return), V18f, V18h |
| [Pi Integration Contract — Runtime event channel](../spec_topics/pi-integration-contract.md) | V18q |
| [Grammar Appendix — Loom literal sublanguage](../spec_topics/grammar.md#loom-literal-sublanguage) | V16a, V14c-b |
| [Grammar Appendix — `let` form](../spec_topics/grammar.md#let-form) | V2a |
| [Grammar Appendix — type grammar](../spec_topics/grammar.md#type-grammar) | V2a, V3b, V4b–V4f |
| [Grammar Appendix — `match` arm body](../spec_topics/grammar.md#match-arm-body) | V7a |
| [Grammar Appendix — `schema X by <field>`](../spec_topics/grammar.md#schema-x-by-field) | V4b, V11d |
| [Grammar Appendix — `///` placement](../spec_topics/grammar.md#-placement) | V13e, V9a, V10f |
| [Grammar Appendix — newline continuation](../spec_topics/grammar.md#newline-continuation) | V1e |
| [Grammar Appendix — `array<T>` literal type-sink rule](../spec_topics/grammar.md#arrayt-literal-type-sink-rule) | V2h, V8b |
| [Future Considerations](../spec_topics/future-considerations.md) | – (out of scope) |
| [Related Work](../spec_topics/related-work.md) | – |

If, when V18s closes, any executable spec REQ-ID lacks a matrix mapping, the plan is incomplete — add the missing leaf or fold it into V18 before declaring V1.0. The CI check is mechanical (`grep` / `comm`); the matrix is the closed source of truth.
