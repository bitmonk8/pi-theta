# pi-loom — Consolidated Spec Review

_Generated: 2026-05-06T18:09:51Z_
_41 findings retained, 30 dropped (14 NITs removed in this triage pass), 0 persistent failures_

---

## spec.md — Opening Paragraphs (Preamble)

---

# "Looms do not write files" — preamble assertion contradicts the trust-boundary bullet

**Original heading:** "Looms do not write files" — scope ambiguous, conflicts with trust boundary
**Kind:** implementability, completeness, traceability

## Finding

The preamble of `spec.md` (line 5) ends with the bare assertion "looms do not write files." The same sentence appears verbatim in `spec_topics/overview.md` (line 7). Forty lines later, the Scope → Trust boundary bullet (`spec.md` line 45) states that V1 imposes no loom-level sandbox and that "filesystem, network, and Pi-API access are bounded only by what Pi grants to extensions and by the per-loom `tools:` allowlist." The same disposition is reaffirmed in `spec_topics/future-considerations.md` line 89.

These two statements are not obviously compatible. An implementer can read "looms do not write files" two ways:

1. The loom *language* exposes no file-writing primitive. File writes are still possible whenever an allowlisted tool performs them — the loom orchestrates the call, but the file-touching code lives in the tool. Under this reading the trust-boundary bullet is consistent: filesystem access really is bounded only by Pi grants and the `tools:` allowlist.
2. The runtime enforces a prohibition on file writes regardless of which tools the loom calls. Under this reading the runtime would have to inspect or wrap tool effects, and the trust-boundary bullet is wrong.

Reading 2 is unimplementable without an effect system the spec does not describe, but it is the literal reading of the preamble sentence. The result: a conformance-test author could plausibly write a test that fails an allowlisted `write_file` tool call, and a reviewer would have no spec citation to reject that test with. The preamble carries the same informative tone as the surrounding orientation prose, but this particular sentence is doing normative work — it bounds what `pi-loom` can do — and that work is currently delivered by an unanchored, ambiguous one-liner.

## Spec Documents

- `spec.md` — Opening Paragraphs (Preamble) (edited)
- `spec.md` — Orientation → Scope → Trust boundary (read-only; the forward-link target)
- `spec_topics/overview.md` — Overview (edited; carries the duplicate sentence)
- `spec_topics/future-considerations.md` — Known V1 limitations (read-only; corroborates the trust-boundary disposition)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The "looms do not write files" claim is a scope statement, not a checked invariant. No plan leaf adds a write-blocking guard, and `grep`s of `plan.md` and `plan_topics/` for `write file`, `sandbox`, and `trust boundary` find no acceptance criteria that depend on this wording. The fix is editorial.

## Consequence

**Severity:** low

Two reasonable implementers will not diverge on runtime behaviour — the trust-boundary bullet is unambiguous and a reviewer who notices the conflict will pick the consistent reading. The risk is downstream: a conformance test or a future spec edit could entrench the wrong reading, and the orientation paragraph that introduces the language to new readers gives a misleading first impression of the threat model.

## Solution Space

**Shape:** single

### Recommendation

Replace the preamble sentence "looms do not write files" with a phrasing that names the language as the constrained surface and forward-links the trust-boundary bullet that owns the broader disposition. Apply the same edit to the duplicate sentence in `spec_topics/overview.md` so the two pages stay in lock-step.

Suggested wording for the preamble (`spec.md` line 5, last sentence):

> Evaluation also produces a final value (the loom's last expression or `return expr`) consumed by `invoke` callers and propagated across the subagent boundary. The loom language itself has no file-writing, network, or process-spawning primitive; any such effect occurs only via tools the loom explicitly allowlists in `tools:`, bounded by Pi's extension permissions (see [Scope — Trust boundary](#scope)).

For `spec_topics/overview.md` line 7, the equivalent edit replaces "Looms do not write files." with "The loom language itself has no file-writing, network, or process-spawning primitive; effects of those kinds occur only through allowlisted tools (see [Trust boundary](../spec.md#scope))."

Edge cases the editor must watch:

- Do not weaken the statement to "looms typically do not write files" — the language genuinely has no such primitive, and the sentence loses its scoping value if it becomes hedged.
- Keep the sentence positioned as an *outputs* clarification (it currently sits next to "produces a final value … consumed by `invoke` callers"). Moving it into the trust-boundary bullet would lose the orienting effect for first-time readers.
- The phrase "no file-writing primitive" should not be read as forbidding filesystem reads. The runtime itself reads files via the `FileSystem` seam during discovery and `import` resolution; that is not a loom-language effect and is unaffected by this edit.
- If the related finding "Preamble obligations have no REQ-IDs and cannot be individually cited" is also actioned, the rewritten sentence becomes a candidate for an `EVAL-N` REQ-ID — coordinate with that fix so the obligation is anchored once, not twice.

## Related Findings

- "Preamble obligations have no REQ-IDs and cannot be individually cited" — co-resolve (explicitly cites "looms do not write files" as one of the un-IDed obligations; the rewritten sentence should land with a REQ-ID if that finding is actioned)
- "No-sandbox normative rule sits in an 'informative' unIDed bullet" — decision-dependency (the trust-boundary bullet this finding forward-links to has its own framing problem; the forward-link target may itself be re-styled before this fix lands)
- "Pi privilege model undefined; allowlist enforceability as security boundary unverified" — same-cluster (also concerns the trust-boundary bullet but resolves independently — that finding is about whether the allowlist is enforceable, not about whether the preamble describes it correctly)
- "Four distinct obligations in one unIDed bullet" — same-cluster (concerns the same Trust-boundary bullet's structure; resolves independently of the preamble wording)

---

# Preamble's "final value" claim is unqualified for failure paths and silent on empty-tail bodies

**Original heading:** Final value on non-success outcomes and empty-tail cases unspecified
**Kind:** completeness, implementability, error-model

## Finding

The `spec.md` preamble asserts that loom evaluation "produces a final value (the loom's last expression or `return expr`) consumed by `invoke` callers and propagated across the subagent boundary." The trichotomy paragraph immediately below names three outcomes (success, failure, cancelled) but the "final value" claim is qualified only for the success branch and only forward-links to `errors-and-results.md` / `cancellation.md` / `invocation.md` for the *partial-append* contract — not for the question the sentence raises directly: what does an `invoke` caller actually see in place of a final value when the callee fails or is cancelled?

The downstream pages do answer this — `errors-and-results.md` defines `InvokeInfraError` (`reason: "panic" | "load_failure" | "parse_failure" | "validation" | "internal_error"`) and `InvokeCalleeError` (wraps a returned `Err`); `cancellation.md` defines `Err(QueryError { kind: "cancelled" })` and the `invoke_callee_error` chaining rule; `invocation.md` ties `loom/runtime/invoke-depth-exceeded` to the `panic` arm — but the preamble's "final value" sentence neither concedes that no final value flows on these paths nor links to the topic pages where the substitute envelopes are defined. A first-time reader reasonably concludes that some sentinel value (`null`? `undefined`? the partial tail expression?) is delivered to `invoke` on failure.

The second half of the gap is not covered anywhere downstream. `functions.md` says a loom's return type is "the type of its tail expression, wrapped in `Result<T, QueryError>` if any `?` appears." It does not say what happens when the body has no tail expression — when the last form is a `let` binding, a `for` loop, an `if` statement (the statement form, not the ternary), an assignment, a bare `break` / `continue` inside a loop, or when the file is purely literal text with no code. Several plausible inputs have no defined inferred return type and therefore no defined final value:

- A loom whose body is `let x = compute()` and nothing else.
- A loom whose body is a single `for` / `while` driving queries for side effect.
- A pure-prose loom with no expression statements at all (only the literal-text emissions the preamble itself describes as one of the two outputs).

`functions.md`'s "void return type" paragraph covers the case where `void` is *declared explicitly* — tail-expression value discarded silently, bare `return` legal — but it does not say whether `void` is *inferred* when no tail expression exists, nor what untyped `invoke(...)` and typed `invoke<Schema>(...)` observe in either reading. Untyped `invoke(...)` discards the child's value and returns `Ok(null)` regardless, so it papers over the gap; typed `invoke<Schema>(...)` against an empty-tail callee is genuinely undefined — the runtime AJV step needs *some* value to validate, and the spec does not name it.

## Spec Documents

- `spec.md` — Preamble (the "final value" / trichotomy paragraphs) (edited)
- `spec_topics/functions.md` — Loom return type / void return type (edited)
- `spec_topics/return.md` — bare `return` rule (read-only; the existing `bare-return-in-non-void` rule constrains the option space)
- `spec_topics/errors-and-results.md` — `InvokeInfraError` / `InvokeCalleeError` definitions (read-only; target of forward-links)
- `spec_topics/cancellation.md` — `Err(QueryError { kind: "cancelled" })` surface (read-only; target of forward-links)
- `spec_topics/invocation.md` — typed-vs-untyped invoke return contract (option-dependent — only edited if Option B's typed-invoke-against-void-callee rule is added here rather than in `functions.md`)
- `spec_topics/grammar.md` — block-expression production `"{" Stmt* Expr "}"` requires a tail `Expr` (option-dependent — Option A would relax this for the loom-top-level and `void`-typed-fn cases by adding an alternate production; Option B would not)
- `spec_topics/diagnostics.md` — registry (option-dependent — Option A adds a new `loom/parse/missing-tail-expression` row; Option B adds nothing)

## Plan Impact

**Phases:** MVP, Vertical V9, Vertical V12, Vertical V15

**Leaves (implementation order):**

- M — MVP slash-command `/hello` loom (modified — the MVP's tiny `/hello` body is the first place the empty-tail rule is exercised; depending on the option chosen, M either ships with an explicit tail expression or relies on the implicit-`null`/inferred-`void` rule)
- V9c — Tail-expression return (modified — must define behaviour when there is no tail expression: parse error vs. inferred `void`)
- V9e — `void` return type (modified — clarifies relationship between explicit `void` declaration and any implicit-`void` inference rule)
- V12e — Subagent return value propagation (modified — parent's `Result<T, QueryError>` shape needs a defined `T` for empty-tail subagent callees)
- V15b — Untyped `invoke` returns `Result<null, QueryError>` (read-only / both — already returns `Ok(null)` so the empty-tail callee is benign here, but the leaf becomes the cited authority for "untyped invoke is the safe form against any callee shape")
- V15c — Typed `invoke<Schema>` with AJV validation (modified — must define what value flows into AJV when the callee has no tail expression; under Option A the parse error fires upstream and this leaf is unaffected; under Option B the leaf adds a test for `invoke<null>("./empty-tail.loom")` succeeding and `invoke<NonNull>(...)` failing AJV)

## Consequence

**Severity:** high

Two implementers reading the preamble and `functions.md` will diverge on two observable surfaces. First, the framing of the "final value" sentence will lead one implementer to synthesise a sentinel `null` final value on the failure paths (because the prose promises a final value unconditionally) while another correctly delivers only the `Result::Err` envelope; tests that round-trip through `invoke` will disagree on whether `Err` arms ever carry a value. Second, an empty-tail loom will parse-error in one implementation, return `Ok(null)` in another, and panic in a third — with corresponding divergence in `invoke<Schema>` AJV behaviour. Both surfaces are reachable from author code on day one of MVP.

## Solution Space

**Shape:** multiple

The two halves of this finding admit independent fixes; the option blocks below pair the natural choices for each half.

### Option A — Strict tail-expression requirement; preamble forward-links for failure surfaces

Approach. Spec out the failure-surface half by forward-linking from the preamble; spec out the empty-tail half by making absence of a tail expression a parse error.

Spec edits.

- `spec.md` preamble: replace "Evaluation also produces a final value (the loom's last expression or `return expr`) consumed by `invoke` callers and propagated across the subagent boundary; looms do not write files." with two sentences. The first restates the final-value claim and qualifies it: "On the success outcome only, evaluation produces a final value (the loom's last expression or `return expr`) consumed by `invoke` callers and propagated across the subagent boundary; failure and cancellation outcomes deliver no final value, only the `Result::Err` envelope defined in [Errors and Results — `QueryError` variants](./spec_topics/errors-and-results.md#queryerror-variants) and [Cancellation](./spec_topics/cancellation.md)." The second keeps the "looms do not write files" clause unchanged.
- `spec_topics/functions.md` "Loom return type" paragraph: append "A body with no tail expression — the last form is a statement (`let`, `for`, `while`, `if` statement form, assignment, `break`, `continue`, expression-statement of `void` type) — is `loom/parse/missing-tail-expression` unless the function or loom declares an explicit `void` return type, in which case the body is accepted and no value is produced. A `.loom` file with no top-level expression statements at all is treated identically to an explicit `void` declaration: literal-text-only looms parse, infer `void`, and produce no final value."
- `spec_topics/diagnostics.md`: add `loom/parse/missing-tail-expression` to the registry with message template `"function/loom body has no tail expression and no explicit void return type"`.
- `spec_topics/grammar.md`: leave the `BlockExpr ::= "{" Stmt* Expr "}"` production as-is (it already requires a trailing `Expr`); add a sibling `VoidBlockBody ::= Stmt*` production reachable only from `FnDecl` bodies whose declared return type is `void` and from the top level of a literal-text-only loom.

Pros. The "final value" sentence becomes precise in both directions. The parse-time error catches the empty-tail mistake at the earliest possible point. `invoke<Schema>` against an empty-tail callee never reaches AJV — the parent's load pass surfaces the error as `loom/load/callee-has-errors` per the existing `invocation.md` mechanism.

Cons. Adds a new diagnostic code and a new grammar production. Forces the MVP `/hello` loom and any side-effect-only loom to terminate with a stub tail expression (e.g. `null`) unless the author writes `void` explicitly — slight authoring friction for the most-common "loom that drives turns and returns nothing" case.

Risks. The literal-text-only carve-out in `functions.md` is a special case — it must be tested explicitly so that `## /hello\nHello, world!` parses without a `loom/parse/missing-tail-expression`. If the carve-out is forgotten, every pure-prose loom breaks.

### Option B — Implicit `null` return when no tail expression; preamble forward-links for failure surfaces

Approach. Same preamble fix as Option A; for the empty-tail half, define the inferred return type of a body with no tail expression as `null` (the literal type, not `void`) and the final value as the `null` literal.

Spec edits.

- `spec.md` preamble: identical to Option A.
- `spec_topics/functions.md` "Loom return type" paragraph: append "A body with no tail expression — the last form is a statement, or there are no expression statements at all — has inferred return type `null` and produces the literal `null` as its final value. An explicit `void` return type still discards any tail expression value silently and is the only way to signal that the function or loom intentionally produces no value; absence of a tail expression on its own does not imply `void`."
- `spec_topics/invocation.md` "Typed return": append "An empty-tail callee's inferred return type `null` participates in the static-resolution compatibility check normally — `invoke<null>(...)` is accepted, `invoke<Schema>(...)` for any non-`null`-compatible `Schema` is `loom/parse/invoke-return-type-mismatch` when statically resolvable, and the runtime AJV check rejects the literal `null` against any non-nullable `Schema` otherwise."
- No diagnostic-registry or grammar additions.

Pros. No new diagnostic code, no new grammar production. The MVP `/hello` loom and every side-effect-only loom parses without authoring friction. Untyped `invoke(...)` against an empty-tail callee already returns `Ok(null)` per V15b, so untyped callers see no behaviour change. Typed `invoke<null>(...)` becomes the clean way to invoke a side-effect-only callee.

Cons. Conflates two semantically distinct authorial intents — "I forgot the tail expression" and "this loom intentionally produces nothing" — into the same `null` value. Authors who want the parse-time safety net Option A provides must declare `void` explicitly. The compatibility-check rule for `invoke<Schema>` against a `null`-typed callee depends on the type system's `null ⊑ T` rules, which `type-system.md` already defines but which must be cross-linked here.

Risks. The implicit `null` return interacts with `?` operator inference: V9d says a body with `?` infers `Result<_, QueryError>` from the tail-expression's `Ok` payload. If there is no tail expression, V9d must treat the inferred payload as `null`, yielding `Result<null, QueryError>`. This needs an explicit sub-clause in `functions.md`.

### Recommendation

Adopt Option B. The implicit-`null` rule preserves the most-common authoring shape (drive turns, return nothing) without adding a diagnostic or grammar production, lines up with V15b's already-defined `Ok(null)` for untyped invoke, and keeps the runtime value model honest — `null` is a first-class Loom value with a literal type, while `void` already has a documented "explicitly declared, silently discarded" role that should not be expanded by inference. The preamble fix (one rewritten sentence with two forward-links) is identical under either option and is independent.

Edge cases the implementer must watch:

- The `?` operator's inference (V9d) on an empty-tail body: the inferred return type is `Result<null, QueryError>`, not `Result<void, QueryError>`.
- `invoke<Schema>(...)` against an empty-tail subagent callee (V12e + V15c): the subagent returns the literal `null` and AJV rejects it against any non-nullable `Schema` with `Err(InvokeInfraError { reason: "validation", ... })`. This must be covered by a V15c test.
- A loom whose body is a single `let` binding *with* `?` on the right-hand side (`let x = @"…"?`): the `?` early-returns `Err(QueryError)` on failure, but on success the `let` is the last form — the implicit-`null` rule applies, and the loom returns `Ok(null)` regardless of the bound value. This is the same trap Rust's `let` has and is best caught by linting, not by the language rule.
- The literal-text-only loom (no expression statements at all): the implicit-`null` rule covers this without a special case.

## Related Findings

- "Terminal outcomes trichotomy excludes load-time failures" — same-cluster (the preamble's failure-outcome story is incomplete in two distinct directions; the trichotomy fix and this finding's preamble forward-link are independent edits to adjacent sentences)
- ""Runtime limit exhaustion" not cross-linked to the ceilings enumeration" — co-resolve (the forward-link from the preamble proposed under either option above is the same edit that fixes this neighbour)
- "Failure-cause → caller-surface mapping absent for panic and limit-exceeded" — co-resolve (the failure-surface half of this finding is the preamble-side restatement of that finding's caller-surface mapping; one preamble edit citing `errors-and-results.md` discharges both)
- "Cancellation outcome lacks caller-surface contract" — co-resolve (same preamble forward-link; the cancellation surface is one of the three the preamble must concede no final value flows through)
- ""Looms do not write files" — scope ambiguous, conflicts with trust boundary" — same-cluster (touches the same preamble sentence; the rewrite proposed under either option above must preserve or coordinate with that finding's reword)

---

# Preamble trichotomy reads as exhaustive but excludes load-time failures

**Original heading:** Terminal outcomes trichotomy excludes load-time failures
**Kind:** error-model

## Finding

`spec.md`'s preamble (paragraph beginning "Loom evaluation produces one of three terminal outcomes: …") presents success / fail / cancelled as the complete result space. The clause is technically scoped to "Loom evaluation" — i.e. once evaluation has begun — but the preamble nowhere states that scope, nor that an entire class of failures bypasses evaluation altogether and is observed through a different surface.

Concretely, the following load-time codes are defined in `spec_topics/diagnostics.md` and `spec_topics/pi-integration-contract.md` but live outside the trichotomy: `loom/load/host-incompatible`, `loom/load/binder-model-unresolved`, `loom/load/binder-model-strict-capability-unknown`, `loom/load/missing-mode`, `loom/load/unknown-mode-value`, `loom/load/invoke-path-escape`, `loom/load/case-collision`, `loom/load/non-canonical-extension`, `loom/load/extension-bootstrap-failed`, `loom/load/invalid-encoding`, every `loom/parse/*` row, and the type-checker's batched `loom/parse/*` (phase = type) emissions. None of these reach evaluation; none deliver a final value; none can be cancelled. A reader who internalises only the preamble does not know that.

The omission compounds with the adjacent gap that the preamble also does not name the channel through which a load-time failure surfaces (`pi.sendMessage` with `customType: "loom-system-note"`, per `spec_topics/diagnostics.md`'s persistent-diagnostics block) or what `invoke` callers observe when they target a loom that fails to load (which is itself a separate concern owned by `spec_topics/invocation.md`'s `reason: "load_failure"` `InvokeError`).

## Spec Documents

- `spec.md` — preamble, paragraph 4 ("Loom evaluation produces one of three terminal outcomes…") (edited)
- `spec_topics/diagnostics.md` — `loom/load/*` registry rows and persistent-diagnostics channel (read-only)
- `spec_topics/pi-integration-contract.md` — Step 0 capability probe and `loom/load/host-incompatible` emission contract (read-only)
- `spec_topics/binder.md` — `loom/load/binder-model-unresolved` emission (read-only)
- `spec_topics/errors-and-results.md` — `InvokeError { reason: "load_failure" }` for callee-not-loadable case (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — the fix is editorial in `spec.md`'s preamble. The load-time codes themselves are already implemented and tested by H4 (`loom/load/extension-bootstrap-failed`, `host-incompatible`), V3 (`missing-mode`, `unknown-mode-value`), V15 (`invoke-path-escape`, `InvokeError.reason: "load_failure"`), V16 (`binder-model-unresolved`, `binder-model-strict-capability-unknown`), and V18 (watcher / settings-change `loom/load/*` codes); none of those leaves' acceptance criteria change because of the preamble clarification.

## Consequence

**Severity:** low

A reader who treats the trichotomy as exhaustive will mis-model the failure surface and will look for "where does `host-incompatible` fit into success / fail / cancelled?" without finding an answer. Two implementers can still converge — diagnostics.md and pi-integration-contract.md pin the load-time codes precisely — but the preamble misleads on first read and forces the reader to reconstruct the boundary from disjoint pages.

## Solution Space

**Shape:** single

### Recommendation

Append one sentence to the trichotomy paragraph in `spec.md` (immediately before the "See [Errors and Results] …" cross-link sentence):

> Failures that occur **before** evaluation begins — host-incompatibility detected by the capability probe, lex / parse / type batches, frontmatter rejection, binder-model resolution failure, `tools:` resolution failure, watcher-time reload failures — are *not* evaluation outcomes. They surface per [Diagnostics](./spec_topics/diagnostics.md) on the `loom-system-note` channel, never produce appended turns or a final value, and are not subject to cancellation. The success / fail / cancelled trichotomy above applies only once evaluation has begun.

Edge cases the implementer / reviewer must keep in mind when applying this:

- Do not enumerate the specific `loom/load/*` codes inline — that list belongs to the diagnostics registry and would duplicate it. The forward-link to `diagnostics.md` is sufficient.
- The added sentence must not contradict the parallel `InvokeError { reason: "load_failure" }` path in `spec_topics/errors-and-results.md`, which is what an `invoke` caller observes when its *callee* fails to load. That path is an evaluation-time failure of the *caller* (the caller's evaluation produced an `Err`), even though the *callee*'s failure was load-time. The sentence above describes the callee's surface; it does not need to repeat the caller's surface.
- Keep the addition under [Governance — GOV-12](./spec_topics/governance.md): this paragraph is an aggregator over per-page contracts, so any future load-time code added by a vertical leaf must update its owner page; the preamble sentence stays stable because it forward-links rather than enumerates.

## Related Findings

- "Final value on non-success outcomes and empty-tail cases unspecified" — co-resolve (same paragraph; both want a per-outcome surface map; a single rewrite of the trichotomy paragraph fixes both)
- "Failure-cause → caller-surface mapping absent for panic and limit-exceeded" — co-resolve (same paragraph; the surface-mapping sentence the related finding wants pairs naturally with the load-vs-evaluation boundary sentence proposed here)
- "Cancellation outcome lacks caller-surface contract" — co-resolve (same paragraph; cancellation surface should be added in the same edit)
- "'Runtime limit exhaustion' not cross-linked to the ceilings enumeration" — same-cluster (same paragraph, but the fix is an internal cross-link rather than a new sentence; resolves independently)
- "External side-effect compensation on failure / cancellation unspecified" — same-cluster (same paragraph's "no implicit rollback" clause; resolves independently)
- "Per-turn atomicity assumption for partial-append contract is implicit" — same-cluster (same paragraph's partial-append claim; resolves independently)
- "Preamble obligations have no REQ-IDs and cannot be individually cited" — decision-dependency (any new sentence added to the preamble inherits the same REQ-ID gap; the umbrella REQ-ID decision constrains how this fix is anchored)

---

# Preamble's "exhausting a runtime limit" lacks a forward-link to the ceilings enumeration and elides per-ceiling failure class

**Original heading:** "Runtime limit exhaustion" not cross-linked to the ceilings enumeration
**Kind:** completeness, error-model

## Finding

The second preamble paragraph (`spec.md` line 7) lists "exhausting a runtime limit" as one of three internal failure modes that produce the **fail** terminal outcome, alongside `Err` return and panic. It is the only one of the three that has no forward-link, and it is the only one whose surface differs across the limits it nominally covers. The Scope → Hard runtime ceilings bullet four lines later (`spec.md` line 51) enumerates exactly four V1 ceilings — `invoke`-chain depth 32, `tool_loop.max_iterations` 25, ≤ 3 binder LLM calls per slash invocation, JSON-document depth 5 — but the preamble does not point at it.

A reader of the preamble cannot tell which of the four ceilings the phrase "exhausting a runtime limit" actually refers to, and the elision is load-bearing: the four ceilings do not share a failure class. Walking the topic pages establishes:

- **`invoke`-chain depth 32** is a panic (`loom/runtime/invoke-depth-exceeded`, `errors-and-results.md` line 61). It is the only one of the four that fits the preamble's "fail" bucket via the panic path.
- **`tool_loop.max_iterations`** surfaces as `Err(QueryError { kind: "tool_loop_exhausted", ... })` (`errors-and-results.md` line 95, `query.md` line 201). It is *recoverable* — it reaches loom code as a `Result::Err` value, never aborts evaluation, and never auto-classifies the loom as having "failed" unless the author leaves the `Err` un-`match`ed.
- **Binder ≤ 3 LLM calls per slash invocation** never reaches the loom at all. Binder failures are load-time and surface as system notes (`binder.md` line 237 onward — "binder failures are runtime-handled and surface as system notes ... never as `Result` values to loom code"). The loom does not start. By the trichotomy this is not an evaluation outcome.
- **JSON-document depth 5** surfaces as `ValidationError` with `schema_keyword: "maxDepth"` at four sites (`schema-subset.md` lines 22 and 40–48). Like the tool-loop cap it is recoverable via `match`.

So the preamble's single phrase covers one panic (terminating), two recoverable `QueryError` variants, and one load-time event that never produces an evaluation outcome at all. The forward-link is missing, the cross-classification is undocumented at the orientation layer, and the implication that all four collapse to the same "fail" terminal outcome is wrong for three of the four.

## Spec Documents

- `spec.md` — Opening Paragraphs (preamble line 7) (edited)
- `spec.md` — Orientation → Scope → Hard runtime ceilings (line 51) (edited)
- `spec_topics/errors-and-results.md` — Runtime panics, QueryError variants (read-only)
- `spec_topics/query.md` — Tool-call loop bound, Failure modes (read-only)
- `spec_topics/binder.md` — Failure modes (read-only)
- `spec_topics/schema-subset.md` — Depth Enforcement (read-only)
- `spec_topics/invocation.md` — Invocation depth bound (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The classification this finding asks the preamble to surface is already implemented per-ceiling — V6k (`tool_loop` cap → `ToolLoopExhaustedError`), V11i (JSON-depth walk → `ValidationIssue { schema_keyword: "maxDepth" }`), V16k (binder ≤ 3 retries → system note), V18o (invoke-depth panic). No leaf's acceptance criteria change; the edit is to spec prose only. None of these leaves are blocked on the preamble wording.

## Consequence

**Severity:** low

A first-time reader of the preamble forms the incorrect mental model that all four V1 ceilings produce the same terminal "fail" outcome, and only learns otherwise by walking four topic pages. Implementers do not get this wrong because each ceiling's owner page is unambiguous, but reviewers and authors reading the spec top-down will routinely conflate the four classes — which is exactly what the surrounding section of the consolidated review keeps re-discovering.

## Solution Space

**Shape:** single

### Recommendation

In `spec.md`'s second preamble paragraph, replace the bare phrase "by exhausting a runtime limit" with a forward-link to the Hard runtime ceilings bullet, and split the orientation claim so the failure class of each ceiling is named where the ceilings are enumerated rather than at the preamble.

Concrete edits:

1. **Preamble (line 7).** Reword the failure clause to: "it fails (by returning `Err`, by panicking, or by exhausting a hard runtime ceiling — see [Hard runtime ceilings](#hard-runtime-ceilings) for the enumeration and the per-ceiling failure class)". Anchor the Scope bullet (`<a id="hard-runtime-ceilings"></a>`) so the link resolves. Drop the implication that "exhausting a runtime limit" is a single uniform failure path.

2. **Hard runtime ceilings bullet (line 51).** After the existing enumeration, append a one-sentence per-ceiling classification line (or a four-row mini-table) naming the surface each ceiling produces — using the existing topic-page links as the normative anchors, not restating semantics:

   - `invoke`-chain depth 32 → **panic** (`loom/runtime/invoke-depth-exceeded`); see [Errors and Results — Runtime panics](./spec_topics/errors-and-results.md).
   - `tool_loop.max_iterations` → **`Err(QueryError)`** with `kind: "tool_loop_exhausted"`; recoverable in loom code; see [Errors and Results — `ToolLoopExhaustedError`](./spec_topics/errors-and-results.md) and [Query — Tool-call loop bound](./spec_topics/query.md).
   - ≤ 3 binder LLM calls per slash invocation → **load-time system note**; the loom does not start and no evaluation outcome is produced; see [Slash-Command Argument Binding — Failure modes](./spec_topics/binder.md).
   - JSON-document depth 5 → **`ValidationError`** with `schema_keyword: "maxDepth"`; recoverable; see [Schema Subset — Depth Enforcement](./spec_topics/schema-subset.md#depth-enforcement).

3. **Trichotomy alignment.** Add one half-sentence to the per-ceiling classification: "Of the four V1 ceilings, only `invoke`-chain depth produces a `fail` terminal outcome through the panic path; `tool_loop` exhaustion and JSON-depth violations are recoverable `Err` values; the binder cap fires before evaluation begins and is governed by the load-time surfaces in [Diagnostics](./spec_topics/diagnostics.md), not by the success / fail / cancelled trichotomy." This same edit also resolves the related "Terminal outcomes trichotomy excludes load-time failures" finding at the binder-cap row.

Edge cases the implementer should not regress:

- The runtime-defect surface for unexpected interpreter exceptions (`errors-and-results.md` line 63 onward) is *not* a runtime ceiling and must not be folded into the new classification table.
- Future V1 leaves that introduce a new ceiling already update this bullet under the GOV-12 aggregator-vs-source convention; the new classification rows must be maintained alongside the ceiling list under the same convention. Add a one-clause reminder to that effect or rely on the existing GOV-12 parenthetical, as the editor prefers.

## Related Findings

- "Failure-cause → caller-surface mapping absent for panic and limit-exceeded" — co-resolve (the per-ceiling classification table this finding requests is exactly what the caller-surface mapping for the limit-exceeded class needs to anchor against)
- "Terminal outcomes trichotomy excludes load-time failures" — co-resolve (the binder-cap row of the proposed classification is the same exclusion that finding asks to call out)
- "Final value on non-success outcomes and empty-tail cases unspecified" — same-cluster (also touches the preamble's "fail" branch, but its concern is the final-value contract per outcome rather than per-ceiling classification)
- "Diagnostic codes for ceiling breaches not enumerated at the index level" — co-resolve (the per-ceiling table proposed here aggregates the four diagnostic codes that finding asks to surface at the index)
- "Four ceilings in one bullet — cannot be individually cited or tested" — same-cluster (atomising the bullet for citation/IDs is orthogonal to adding a failure-class column, but both edits land in the same bullet)
- "Binder-call ceiling counting rule for retries unspecified" — same-cluster (touches the same bullet but resolves independently — a counting rule for "one binder call" is separate from the classification of the cap as a load-time failure)
- "JSON-document depth counting convention ambiguous" — same-cluster (same bullet, independent question — counting basis vs. failure class)

---

# Preamble enumerates three internal failure causes without a per-surface mapping

**Original heading:** Failure-cause → caller-surface mapping absent for panic and limit-exceeded
**Kind:** error-model, completeness

## Finding

The preamble lists three internal failure causes that can terminate evaluation — author-returned `Err`, panic, and "exhausting a runtime limit" — but it does not name what each cause delivers to each of the three observation paths a real implementer must wire up: an `invoke` parent (programmatic), a slash-command caller (user-facing), and the operator listening on `loom-system-note` (operational telemetry). The contracts do exist on topic pages, but they are scattered across at least four files and split by routing class rather than by cause. An implementer reading the preamble has no single anchor that says "for cause X, see surface mapping Y, Z, W."

The "limit-exceeded" portion is the worse half of the gap. The preamble groups all four hard ceilings ([Hard runtime ceilings] bullet) under a single phrase, but the four ceilings actually fan out into three distinct routing classes:

- `invoke`-chain depth → panic class (`loom/runtime/invoke-depth-exceeded`, surfaced per [Errors and Results — Runtime panics](../spec_topics/errors-and-results.md));
- `tool_loop.max_iterations` → `Err` class (`ToolLoopExhaustedError`, in the always-log set per [Pi Integration Contract — Runtime event channel](../spec_topics/pi-integration-contract.md));
- JSON-document depth 5 → `Err` class (`ValidationError` with `cause: "schema_validation"`, `ValidationIssue.schema_keyword: "maxDepth"`, *not* in the always-log set);
- binder LLM-call cap (3 per slash invocation) → slash-time class, owned by [Slash-Command Argument Binding — Failure modes](../spec_topics/binder.md), never enters the loom-runtime cause taxonomy at all.

Nothing in the preamble — or anywhere else in the spec — gathers these four onto a single surface map. The panic half is in better shape (`errors-and-results.md` does map the panic cause to slash, invoke parent, and — implicitly via the same `loom-system-note` carrying `details.diagnostics`, per PIC group B — the operator), but the preamble forward-link is missing, so a reader who starts at the cause enumeration has no signpost.

## Spec Documents

- `spec.md` — Opening Paragraphs (Preamble), three-cause enumeration (edited)
- `spec_topics/errors-and-results.md` — Runtime panics section (read-only)
- `spec_topics/slash-invocation.md` — Top-level `Err` per-`kind` table (read-only)
- `spec_topics/pi-integration-contract.md` — Runtime event channel, group A / group B partition (read-only)
- `spec_topics/invocation.md` — Invocation depth bound, Failures (read-only)
- `spec_topics/binder.md` — Failure-mode templates, retry-budget rule (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The fix is preamble orientation only. The underlying surface contracts are already pinned in their owner pages and already covered by V7i, V18k–V18n, V18p, V18q (panic and always-log paths) and by V6n, V13b-class leaves (tool-loop / validation `Err` paths). No leaf's Tests / Ships-when changes; no leaf is blocked by the resolution.

## Consequence

**Severity:** low

A two-implementer divergence is unlikely on the *contracts* themselves — they are pinned. The cost is reader-side: anyone using `spec.md` as the navigational entry point (per [Governance — GOV-12](../spec_topics/governance.md), the intended use of aggregator paragraphs) has to re-discover the cause-to-surface matrix by reading at least four topic pages. The "limit-exceeded" lumping is the higher-risk half — a reader can plausibly miss that the four ceilings split into three routing classes and assume a single uniform surface (e.g. that all four panic, or that all four are recoverable `Err`s).

## Solution Space

**Shape:** single

### Recommendation

Append a single forward-link paragraph to the preamble's three-cause enumeration that names, for each cause, the canonical surface-mapping anchor on the relevant topic page. No new normative content; pure GOV-12 aggregator orientation.

Concretely, after the sentence ending "…or it is cancelled (per the `AbortSignal` plumbed through `ctx.signal`)" and before "In every case turns appended *before*…", insert:

> Per-cause surfaces are owned by the relevant topic pages: an author-returned `Err` reaches an `invoke` parent as the corresponding `QueryError` variant per [Invocation — Failures](./spec_topics/invocation.md), a slash caller as the per-`kind` row in [Slash-Command Invocation — Top-level `Err` in prompt mode](./spec_topics/slash-invocation.md), and the operator as a runtime event when the variant is in the always-log set per [Pi Integration Contract — Runtime event channel](./spec_topics/pi-integration-contract.md). A panic reaches all three observers via [Errors and Results — Runtime panics](./spec_topics/errors-and-results.md) (`InvokeInfraError { reason: "panic" }` to the parent; `"loom /<name> aborted: <message>"` to the slash caller; the same `loom-system-note` carrying `details: { diagnostics: [Diagnostic] }` to the operator, per PIC group B). "Exhausting a runtime limit" is *not* a single routing class: of the four ceilings under [Scope — Hard runtime ceilings] below, `invoke`-chain depth is a panic ([Invocation — Invocation depth bound](./spec_topics/invocation.md)), `tool_loop.max_iterations` and the JSON-depth ceiling surface as `QueryError` variants (`ToolLoopExhaustedError`, `ValidationError`) per their owner pages, and the binder LLM-call cap fails at slash-binding time per [Slash-Command Argument Binding — Failure modes](./spec_topics/binder.md). Cancellation is owned by [Cancellation](./spec_topics/cancellation.md).

Edge cases for the implementer of this edit:

- The paragraph is informative under GOV-12; do not introduce any normative wording. Every clause must terminate in a topic-page link, and the obligation must already exist on the linked page.
- Do not inline a cause × surface table — that would create a second source of truth subject to drift. The forward-link prose form is GOV-12-compliant; a table is not.
- This edit is the natural carrier for the co-resolved findings listed below; if the author of the fix combines them, the same paragraph can also forward-link the cancellation surfaces (one extra clause) and the load-time-failure carve-out (one extra clause), satisfying all four findings in one commit.
- The "Cancellation is owned by …" trailing clause is intentional: the next finding ("Cancellation outcome lacks caller-surface contract") wants the same forward-link treatment for cancellation, and dropping that clause here would force a near-duplicate sentence later.

## Related Findings

- "Final value on non-success outcomes and empty-tail cases unspecified" — co-resolve (the same forward-link paragraph carries the per-cause final-value rule by linking to the same `errors-and-results.md` / `slash-invocation.md` / PIC anchors)
- "Terminal outcomes trichotomy excludes load-time failures" — same-cluster (touches the same preamble enumeration but resolves with a separate "load-time failures are not evaluation outcomes" sentence)
- "'Runtime limit exhaustion' not cross-linked to the ceilings enumeration" — co-resolve (the recommended paragraph above is the cross-link the predecessor finding asks for, plus the routing-class fan-out)
- "Cancellation outcome lacks caller-surface contract" — co-resolve (the recommended paragraph already closes with the `Cancellation` forward-link clause; the next finding can extend it to name the `cancelled` `QueryError` variant, the slash row, and the absence of an always-log entry)

---

# Preamble's "no implicit rollback" is silent on external side effects, cancellation, and enumeration

**Original heading:** External side-effect compensation on failure / cancellation unspecified
**Kind:** error-model

## Finding

The preamble's terminal-outcome paragraph in `spec.md` says "the runtime performs no implicit rollback" but the surrounding clause scopes that statement to *appended turns*: "turns appended *before* the terminal event remain in the conversation … and the runtime performs no implicit rollback." External side effects produced by tool calls before the terminal event — filesystem writes, network calls, calls into Pi-side services, sub-loom side effects — are not mentioned in the preamble at all.

The normative coverage on `spec_topics/errors-and-results.md` ("**No rollback.**" paragraph) closes part of this gap: it states that "Tool calls that have already returned, queries already appended to the conversation, and `invoke` children that have already run remain final on early return or abort," and that authors who need compensation must run it explicitly via `match`. But three sub-questions remain unanswered anywhere in the spec:

1. **Cancellation is not in the "No rollback" enumeration.** The paragraph names `?` early-return and panic as the no-rollback triggers; it does not say cancellation behaves the same way. Cancellation can land mid-tool-call (per `cancellation.md` Race semantics) and the partial side effect is left as-is — but that is implicit, not stated.
2. **External side-effect surfaces are not named.** The paragraph speaks of "tool calls that have already returned," which covers external effects only by inference. An implementer reading the preamble in isolation could plausibly believe the contract is narrower than it is.
3. **Enumeration of completed side effects to the caller / operator is not addressed.** A panic or cancellation envelope to an `invoke` parent does not list which tool calls completed before the terminal event; nor does the operator-facing `loom-system-note` channel emit a per-tool-call completion event (tool calls do not appear in the conversation transcript per `tool-calls.md`). This is the de facto behaviour but it is nowhere explicit, and idempotency / compensation guidance for loom authors hangs on it.

## Spec Documents

- `spec.md` — Opening Paragraphs (Preamble), terminal-outcome paragraph (edited)
- `spec_topics/errors-and-results.md` — "No rollback." paragraph (edited)
- `spec_topics/cancellation.md` — Race semantics, Surfacing (read-only; the cancellation-leaves-side-effects-final invariant lives implicitly here)
- `spec_topics/tool-calls.md` — "No conversation turn" paragraph (read-only; basis for "tool-call completion is not transcript-visible")
- `spec_topics/pi-integration-contract.md` — Runtime event channel / always-log set (read-only; basis for "tool-call completion is not in the always-log set")
- `spec_topics/future-considerations.md` — Known V1 limitations (option-dependent; the suggested forward-link target if the spec wants to flag idempotency-helpers as a recognised follow-up)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — the fix is documentation-only and does not change any observable runtime contract that an existing leaf tests. V13j ("Respond-repair preserves tool-call side effects") sits adjacent to this surface but its acceptance criteria are unchanged: the no-enumeration / no-compensation invariant has no positive test that would need to be added (it is a null assertion: nothing is emitted, nothing is enumerated). If a coverage-matrix row for "Errors and Results — No rollback" is desired, that is a coverage-matrix edit, not a new leaf.

## Consequence

**Severity:** low

A reasonable implementer is unlikely to invent an implicit transactional layer or a completed-side-effect enumeration channel — both would be substantial unspecified surface area, easy to recognise as out-of-scope. The risk is downstream: loom authors and reviewers reading the preamble in isolation may misjudge what guarantees the runtime offers (for example, assuming a panic in a multi-step file-mutating loom triggers some operator-visible "here is what completed" notice), and write tools or callers that depend on a property the runtime never promised.

## Solution Space

**Shape:** single

### Recommendation

Extend `spec_topics/errors-and-results.md`'s **No rollback.** paragraph to be the canonical statement of the contract, then narrow the preamble to a forward-link.

Concretely:

1. **In `spec_topics/errors-and-results.md`'s "No rollback." paragraph**, add cancellation to the trigger list and add an explicit external-side-effects-and-no-enumeration sentence. Suggested wording (insert after the existing first sentence):

   > Cancellation behaves the same way: a tool call, query, or `invoke` child whose signal aborts mid-execution leaves any external side effect already produced (filesystem writes, network requests, calls into Pi-side services, sub-loom mutations) in place; the runtime does not roll back, compensate, or enumerate completed side effects to the caller or to the operator. Tool-call completion is not transcript-visible (see [Tool Calls — No conversation turn](./tool-calls.md)) and is not in the [always-log set](./pi-integration-contract.md#runtime-event-channel), so a panic-, cancellation-, or `?`-driven terminal event surfaces only the failure envelope — not a manifest of what completed before it. Idempotency and compensation are the loom author's responsibility.

   Keep the existing "Loom has no implicit transactional layer; authors who need compensating actions must `match` …" sentence; the addition is a scope and enumeration clarification, not a replacement.

2. **In `spec.md`'s preamble terminal-outcome paragraph**, replace the present "and the runtime performs no implicit rollback" clause with a forward-link that scopes correctly:

   > … remain in the conversation the loom was driving — the caller's conversation in `prompt` mode, or the disposable subagent conversation in `subagent` mode. The runtime performs no implicit rollback of either appended turns or external tool-call side effects, and does not enumerate completed side effects to the caller or operator; see [Errors and Results — No rollback](./spec_topics/errors-and-results.md) for the full contract.

3. **No `Future Considerations` edit is required.** The page already serves as the catch-all for deferred facilities; an explicit "no idempotency-helper API in V1" entry is optional and would not change implementer behaviour.

Edge cases the implementer must watch:

- The cancellation-leaves-side-effects-final claim must be consistent with `cancellation.md`'s Race semantics: an in-flight tool call that returns `Ok(v)` between the abort firing and the next checkpoint keeps its `Ok(v)` (and any side effect it produced); only at the next checkpoint does cancellation surface as `Err`. The wording above is consistent with that, but a reviewer should re-read both pages together.
- The "not in the always-log set" claim must be checked against the latest `pi-integration-contract.md` runtime-event channel enumeration; if a tool-call-completion event has been added to the always-log set since this finding was written, the wording needs adjustment.
- The new sentence introduces no new diagnostic code, no new `loom-system-note` event, and no new `QueryError` field — it is purely a closure of an underspecified contract.

## Related Findings

- "Cancellation outcome lacks caller-surface contract" — same-cluster (both are preamble terminal-outcome gaps; resolve in one editing pass over the same paragraph but answer distinct questions — caller-surface mapping vs. side-effect enumeration)
- "Failure-cause → caller-surface mapping absent for panic and limit-exceeded" — same-cluster (sibling preamble gap; the caller-surface mapping it requests and the side-effect-enumeration negative this finding requests are complementary halves of "what does the caller actually see on terminal failure?")
- "Runtime limit exhaustion not cross-linked to the ceilings enumeration" — same-cluster (same preamble paragraph; independent fix)

---

# Preamble names `ctx.signal` without introducing `ctx`

**Original heading:** `ctx.signal` referenced but `ctx` is never defined on this page
**Kind:** assumptions, implementability

## Finding

The preamble paragraph in `spec.md` describes the cancellation outcome as "cancelled (per the `AbortSignal` plumbed through `ctx.signal`)". This is the document's first and only mention of `ctx`; the surrounding text never establishes that loom entry points receive an `ExtensionCommandContext`, never says `ctx.signal` is a Pi-supplied member (not a runtime-owned signal), and provides no forward-link to where the `ctx` shape is owned.

The detail is also misleading on its own terms. The canonical wiring is documented in `spec_topics/cancellation.md` and `spec_topics/pi-integration-contract.md`: the runtime constructs a fresh `loomAbort` per invocation and uses `loomAbort.signal` — *not* `ctx.signal` — as the single source of truth that downstream components observe. A reader who takes the preamble at face value will reach for `ctx.signal` directly when implementing the interpreter loop, the binder cancellation check, or the tool-call forwarding, and will produce the wrong wiring.

The preamble already forward-links the next sentence to `[Cancellation]` and `[Pi Integration Contract — Cancellation source]`, both of which carry the correct wiring. The `ctx.signal` parenthetical is the only piece of preamble text that contradicts those owners.

## Spec Documents

- `spec.md` — Opening Paragraphs (Preamble), terminal-outcomes sentence (edited)
- `spec_topics/cancellation.md` — Signal source (read-only; canonical wiring)
- `spec_topics/pi-integration-contract.md` — `Cancellation source`, `ExtensionContext (member surface loom touches)` (read-only; canonical `ctx` shape)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

The fix is editorial: it removes a misleading parenthetical from the preamble and (optionally) adds a cross-link to existing owner pages. No leaf's acceptance criteria, test expectations, or sequencing change. V18 (cancellation) and V14 (tool calls) already test against `loomAbort.signal` per the canonical pages and are unaffected.

## Consequence

**Severity:** medium

A first-time reader of `spec.md` is told the cancellation signal is `ctx.signal`, contradicting the cancellation owner page that designates `loomAbort.signal` as the single source of truth. The risk is a misimplementation that wires interpreter / binder / tool-call cancellation directly to `ctx.signal`, bypassing the per-invocation `AbortController` the cancellation contract requires. The damage is bounded because the canonical pages are correct and the leaves implementing cancellation cite them, not the preamble.

## Solution Space

**Shape:** single

### Recommendation

In `spec.md`, change the parenthetical "(per the `AbortSignal` plumbed through `ctx.signal`)" to "(per the runtime's `AbortSignal` — see [Cancellation](./spec_topics/cancellation.md))". The preamble keeps its narrative reference to cancellation but no longer names a specific member of an undefined object, and the existing forward-links in the following sentence (to `[Cancellation]` and `[Pi Integration Contract — Cancellation source]`) remain the normative source for both the `loomAbort` wiring and the `ctx.signal` SDK precondition.

Edge cases the implementer must watch:

- Do *not* substitute `loomAbort.signal` for `ctx.signal` in the preamble. The preamble is informative; naming the per-invocation controller there duplicates a normative obligation that already lives on `cancellation.md` and creates a second site that must be kept in sync on any future renaming.
- The preamble's existing forward-link to `[Pi Integration Contract — Cancellation source]` already covers the SDK-side `ctx.signal` precondition, so no additional link to the `ExtensionContext` interface anchor is required.
- This fix touches only the preamble; do not propagate the rewording to any other site that references `ctx.signal` as the SDK-supplied entry-point signal — those references (in `cancellation.md`, `pi-integration-contract.md`, `binder.md`) are correct and load-bearing.

## Related Findings

- "Cancellation outcome lacks caller-surface contract" — same-cluster (same preamble sentence; resolves independently — that finding adds caller-surface mapping, this one removes a misleading wiring detail)
- "Final value on non-success outcomes and empty-tail cases unspecified" — same-cluster (same preamble paragraph; independent fix)
- "Preamble obligations have no REQ-IDs and cannot be individually cited" — same-cluster (cross-cutting preamble organisation; independent fix)

---

# Subagent isolation enumeration in the preamble has no closure or canonical anchor

**Original heading:** Subagent isolation list is stated but not bounded
**Kind:** completeness, assumptions

## Finding

The preamble in `spec.md` (paragraph 2) characterises subagent-mode isolation by listing three items the spawned conversation does *not* inherit from the caller: transcript, system prompt, and *ambient tool set* (with the parenthetical pointing at the Glossary for `callable set`). The list is presented without a closure clause and without a forward-link to a canonical isolation surface. A reader cannot tell whether the three items are exhaustive, illustrative, or merely the most-cited examples.

The forward-link path that does exist — *Pi Integration Contract — Subagent-mode isolated session* (`#sdk-cap-subagent-isolated-session`) — lands on capability item 3, which restates only the transcript-privacy guarantee in terms of `SessionManager.inMemory(cwd)`. The page's actual isolation contract is spread across three other sections (`Conversation drive — subagent mode`, `Subagent session lifecycle`, the `ExtensionCommandContext` override table under `ctx`-shape), and it implicitly contains both an inheritance side (the loom's frontmatter `system:`, `model`, lowered `customTools`, and the parent's `cwd` / `modelRegistry` via the forwarded `ExtensionCommandContext`) and a non-inheritance side (Pi's default built-in tools, parent transcript, parent's per-invocation `loomAbort`). No anchored enumeration exists that an implementer can cite.

The implementer-visible consequence is decision drift on items the preamble simply does not name: model selection (loom frontmatter, not caller's resolved model), credentials (per parent `ctx.modelRegistry`), cancellation lineage (`loomAbort` is per-invocation, not the parent's), cumulative token/cost budgets (none — sibling invocations are independent), and the caller's `params` / variable bindings (not inherited; the subagent has its own bound `params` only). Each can be derived correctly by reading the full PIC, but the spec orientation that authors and reviewers actually trust offers no closure that would force them to do so.

## Spec Documents

- `spec.md` — Opening paragraphs (preamble, paragraph 2 — the parenthetical that names the three non-inherited items) (edited)
- `spec_topics/pi-integration-contract.md` — `Conversation drive — subagent mode`, `Subagent session lifecycle`, `ExtensionCommandContext` override table, `SDK capability inventory item 3` (option-dependent: read-only if a single closure clause forward-links into existing prose; edited if a new anchored "Subagent state-isolation matrix" section is added here)
- `spec_topics/overview.md` — `Scope of a Loom File` (read-only — the V12d `Spec.` field cites this as the canonical isolation page; option-dependent if the canonical enumeration moves here instead of PIC)
- `spec_topics/glossary.md` — `callable set` entry (read-only — the existing forward-link target from the preamble parenthetical)
- `spec_topics/frontmatter.md` — `mode:`, `system:`, `model:` field rows (read-only — defines what the spawned session reads from frontmatter rather than from the caller)

## Plan Impact

**Phases:** Vertical V12, Vertical V14

**Leaves (implementation order):**

- V12a — `mode: subagent` accepted; AgentSession spawn — (modified)
- V12d — Subagent transcript discard — (modified)
- V14j — `tools: []` ≡ absent `tools:` — (modified)

(V12a already asserts the tool-registration / active-tools non-leakage onto the parent session; V12d already asserts transcript privacy; V14j asserts ambient-Pi-tool non-inheritance. Each gains one or more additional assertions when the canonical enumeration names items not currently tested — at minimum: the spawned session's `loomAbort` is distinct from the parent's `AbortController`; the spawned session's `params` table is empty unless explicitly threaded; the spawned session's `system:` / `model` come from frontmatter rather than from the parent's resolved values. The exact assertion delta is `option-dependent` on which non-inherited items the chosen closure enumerates.)

## Consequence

**Severity:** low

The behaviour the runtime ships will be correct because the per-mode wiring in PIC's `Conversation drive — subagent mode` mechanically enforces it (explicit `tools: []` allowlist, `SessionManager.inMemory(cwd)`, fresh per-invocation `loomAbort`). The cost is that the spec preamble — the page authors and reviewers cite when reasoning about isolation — under-specifies what "isolated" means, and the named forward-link target addresses only one of the three preamble items. A future widening (e.g., adding a `model:` override on the spawn call, or threading caller `params` through a new mechanism) cannot be reviewed against the preamble at all; it has to be argued against scattered PIC prose.

## Solution Space

**Shape:** multiple

### Option A — One-sentence closure in the preamble, forward-link to PIC

**Approach.** Append one sentence to the preamble parenthetical: "This enumeration is exhaustive; the spawned subagent inherits no other caller state. The full state-isolation contract — including which loom-side state (`system:`, `model`, lowered `customTools`) the spawned session does inherit, and how `cwd` / `modelRegistry` are forwarded through the override table — is owned by [Pi Integration Contract — Conversation drive — subagent mode](./spec_topics/pi-integration-contract.md) and the `ExtensionCommandContext` override table on the same page." Replace the existing forward-link target (which currently points at capability item 3 and addresses only the transcript) with a link to the `Conversation drive — subagent mode` section.

**Spec edits.**
- `spec.md` paragraph 2: add the closure sentence; redirect the existing `#sdk-cap-subagent-isolated-session` link to a section anchor on `Conversation drive — subagent mode`.
- `spec_topics/pi-integration-contract.md`: add an explicit `<a id>` on the `Conversation drive — subagent mode` heading so the new link target is stable.

**Pros.** Minimal surface change; preserves the preamble's informative tone; respects the existing decomposition that puts normative content in PIC.

**Cons.** The "exhaustive" claim is asserted in informative prose with no anchored target enumerating each non-inherited item. A reader who follows the link still has to synthesise the enumeration from three PIC sections.

**Risks.** Future additions to the inheritance set (e.g., a `model:` override) require the author to remember to update both the PIC sections *and* the preamble's closure phrasing; without an anchored matrix, drift between the two is easy.

### Option B — Anchored "Subagent state-isolation matrix" section in PIC; preamble forward-links to it

**Approach.** Add a new subsection to `spec_topics/pi-integration-contract.md` titled `Subagent state-isolation matrix` with an `<a id="subagent-state-isolation-matrix">` anchor, sited adjacent to `Conversation drive — subagent mode`. The section contains a two-column table:

- **Inherited from the loom** — `system:` (with `${param}` interpolation), `model` (resolved from frontmatter), lowered `customTools` (the loom's callable set), captured `params` (load-time per-invocation values), `ctx.cwd` / `ctx.modelRegistry` / `ctx.getContextUsage` (forwarded through the override table — cite the existing table row).
- **Not inherited from the caller** — caller's transcript, caller's system prompt, ambient Pi tool set (Pi's default built-ins suppressed by the explicit `tools` allowlist), caller's `loomAbort` controller (each invocation gets a fresh one), caller's `params` / variable bindings, caller's `withActiveTools` snapshot scope.

The preamble's parenthetical is rewritten to: "…does not inherit the caller's transcript, system prompt, or ambient tool set; the full state-isolation matrix — what the spawned session inherits from the loom and what it isolates from the caller — is owned by [Pi Integration Contract — Subagent state-isolation matrix](./spec_topics/pi-integration-contract.md#subagent-state-isolation-matrix)." The existing Glossary `callable set` link stays as a separate aside on the term.

**Spec edits.**
- `spec.md` paragraph 2: rewrite the parenthetical as above; replace the `#sdk-cap-subagent-isolated-session` link with `#subagent-state-isolation-matrix`.
- `spec_topics/pi-integration-contract.md`: insert the new subsection with the two-column matrix.
- `spec_topics/overview.md` (`Scope of a Loom File`): add a one-line forward-link to the new matrix so V12d's `Spec.` citation also resolves to it.

**Pros.** Single anchored enumeration; future additions edit one table; reviewers writing tests can cite individual rows. Closes the implementer-decision gap on every item the original finding names.

**Cons.** Larger edit; introduces a new normative surface that must be maintained against every PIC change to subagent wiring. The preamble parenthetical grows past one sentence.

**Risks.** Once the matrix is anchored as normative, V12a / V12d / V14j tests must enumerate every row (otherwise the matrix has assertions the implementation does not verify). The plan-impact delta in V12 grows accordingly.

### Recommendation

**Option B.** A single anchored matrix is the only artifact that makes the preamble's "isolation" claim verifiable: the existing PIC prose under `Conversation drive — subagent mode` already encodes most of the inheritance side (the `system:` / `customTools` / `model` sentence) and most of the non-inheritance side (the `tools: []` allowlist enforcement, the in-memory `SessionManager`), but never as a closed enumeration. Promoting it to a table both surfaces the closure and forces V12a / V12d / V14j to assert each row mechanically.

Edge cases the implementer must watch:

- The matrix MUST distinguish *inherited from the loom's frontmatter* (system, model, customTools, params) from *forwarded from the caller's `ExtensionCommandContext`* (cwd, modelRegistry, getContextUsage) — those are two different mechanisms (PIC's `system:` interpolation rule vs. the override table's "non-overridden members" forwarding rule), and conflating them in a single "inherited" column will mis-cue an implementer reviewing whether `ctx.cwd` should be per-subagent overridable.
- The matrix MUST name `loomAbort` explicitly as not-inherited and forward-link to `Cancellation — Signal source`. The preamble's existing `ctx.signal` mention (flagged by a sibling preamble finding) sits adjacent to this question and a reader who treats the two as the same signal will mis-implement nested-subagent cancellation.
- The matrix should call out the *caller's* `params` and bound variables explicitly — the spec elsewhere never says "subagents do not inherit the caller's local bindings" because it does not need to (the subagent runs a different loom file with its own `params`), but explicit absence in the matrix prevents an implementer from inventing a "shared params" bridge as a future widening dressed up as a bug fix.
- Re-reviews of V12a / V12d / V14j acceptance criteria must be triggered when the matrix lands; otherwise the spec asserts isolation rows the plan does not test.

## Related Findings

- "`ctx.signal` referenced but `ctx` is never defined on this page" — same-cluster (same preamble paragraph; both are forward-link / closure deficiencies on subagent-adjacent terminology, but resolve via different edits — one anchors `ctx`-shape, the other anchors the isolation matrix)
- "Default callable set when `tools:` is absent or empty is unspecified" — decision-dependency (the matrix's "ambient Pi tool set — not inherited" row presupposes the default-callable-set rule; the other finding's resolution must land first or the matrix row is undefined)
- "Final value on non-success outcomes and empty-tail cases unspecified" — same-cluster (sibling preamble finding on the subagent-boundary `invoke` return; both are completeness gaps in the same paragraph)
- "Single-tenant assumption (one Pi session per host process) is implicit" — same-cluster (touches the singular-caller framing the preamble inherits; the matrix does not need to resolve it but should not silently re-assume single-tenancy in its row phrasing)

---

# Partial-append contract is described in turn-grain terms; mid-stream fragment behaviour is not forward-linked

**Original heading:** Per-turn atomicity assumption for partial-append contract is implicit
**Kind:** assumptions

## Finding

The preamble of `spec.md` and the **No rollback** paragraph of `spec_topics/errors-and-results.md` both state the post-failure conversation contract in turn-grain terminology — "turns appended *before* the terminal event remain in the conversation," "queries already appended to the conversation … remain final." Neither paragraph addresses the mid-flight case: what happens to a query whose assistant turn was *being streamed* into the transcript when an abort, panic, `?`-early-return, or limit-exhaustion fired.

The substantive answer exists, but only on `spec_topics/slash-invocation.md` (in the **User-visible streaming** edge-case bullets): "the streamed prefix stays in the transcript (Pi's behaviour) and the `loom-system-note` describing the failure is appended after, not interleaved" and, for cancellation, "whatever partial text Pi has already rendered remains visible; partial output is not rolled back." `pi-integration-contract.md` reinforces this implicitly — the loom only resumes after `ctx.waitForIdle()` resolves on `agent_end`, so the loom-grain notion of "an appended query" is end-of-turn, while the user-grain stream lives on a separate timeline.

The result is a load-bearing rule (the no-rollback contract covers partially-streamed assistant text, not just completed turns) that an implementer or reviewer following the preamble's own forward-links — to `errors-and-results.md` and `diagnostics.md` — will not encounter. The rule is correct everywhere it is stated, but the reader has to know to look elsewhere. The original review's prescription ("state per-turn atomicity") inverts the actual contract; the gap is forward-linking, not a missing guarantee.

## Spec Documents

- `spec.md` — Opening Paragraphs (Preamble), the "no implicit rollback" sentence (edited)
- `spec_topics/errors-and-results.md` — **No rollback** paragraph (edited)
- `spec_topics/slash-invocation.md` — **User-visible streaming** edge-case bullets (read-only; canonical site)
- `spec_topics/cancellation.md` — **Race semantics** and **Surfacing** (read-only; supports reading)
- `spec_topics/pi-integration-contract.md` — Conversation drive — prompt mode, `waitForIdle` resolution rule (read-only; supports reading)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — the existing leaves already encode the partial-fragment behaviour where it is observable. M (slash-invocation streaming partial), V5e (prompt-mode driver, `waitForIdle` semantics), and V18a–V18e (cancellation checkpoints) all test the runtime side; their tests do not change under any of the candidate edits below. The fix is purely an editorial cross-link in two prose paragraphs.

## Consequence

**Severity:** low

A reader who consults only the preamble plus its named forward-links (`errors-and-results.md`, `diagnostics.md`) for the "what survives a terminal event" contract will infer that the unit of survival is a completed turn, and may be surprised by a streamed assistant prefix that remains visible after a cancellation or `?`-early-return. The runtime behaviour is fully specified in `slash-invocation.md`, so an implementer will not produce a wrong system; a reviewer triaging a bug report ("the assistant text is half-finished after my loom failed") will simply spend longer locating the governing rule.

## Solution Space

**Shape:** single

### Recommendation

Tighten the cross-linking, not the contract. Two coordinated edits:

1. In `spec.md` preamble, where the existing sentence reads "turns appended *before* the terminal event remain in the conversation … and the runtime performs no implicit rollback. See [Errors and Results] and [Diagnostics] for the per-stage error surfaces and the partial-append contract", append the user-visible streaming forward-link: " — the rule covers both fully-appended turns and any partial assistant text Pi has already streamed at the point of failure; see [Slash-Command Invocation — User-visible streaming](./spec_topics/slash-invocation.md) for the prompt-mode rendering of streamed partials and accompanying system notes."

2. In `spec_topics/errors-and-results.md` **No rollback** paragraph, after the existing sentence "Tool calls that have already returned, queries already appended to the conversation, and `invoke` children that have already run remain final on early return or abort", insert one sentence: "A query whose assistant turn was *streaming* at the point of `?`-early-return, panic, or cancellation is treated identically: any prefix Pi has already rendered into the transcript stays visible, and the failure system note is appended after the prefix rather than interleaved (see [Slash-Command Invocation — User-visible streaming](./slash-invocation.md))."

Edge cases the implementer must preserve:

- Subagent mode is exempt by construction — the transcript is private to the spawned `AgentSession` and discarded on `dispose()`, so streamed partials never reach an observer. The new sentences should not bind subagent mode to a user-visible-prefix obligation it cannot violate.
- The streamed prefix is Pi's behaviour, not loom's — neither the preamble edit nor the `errors-and-results.md` edit should imply the runtime *causes* the prefix to remain, only that the no-rollback contract does not retract it.
- Do not rephrase the contract as a "per-turn atomicity guarantee" (the original suggested fix); the actual contract is the opposite — Pi delivery is non-atomic and loom does not roll back what was delivered.

## Related Findings

- "External side-effect compensation on failure / cancellation unspecified" — same-cluster (both tighten the no-rollback contract in different directions; that finding scopes external side effects, this one scopes streamed conversational fragments)
- "Cancellation outcome lacks caller-surface contract" — same-cluster (cancellation is one of the terminal events whose mid-stream fragment handling this finding clarifies)
- "Preamble obligations have no REQ-IDs and cannot be individually cited" — co-resolve (the partial-append contract is one of the un-IDed obligations that finding enumerates; once REQ-IDed, the cross-link recommended here becomes a stable anchor target)
- "Failure-cause → caller-surface mapping absent for panic and limit-exceeded" — same-cluster (touches the same preamble paragraph; the panic/limit-surface mapping and the streamed-fragment forward-link can land in one editorial pass)

---

# Several preamble obligations have no canonical REQ-ID home

**Original heading:** Preamble obligations have no REQ-IDs and cannot be individually cited
**Kind:** traceability

## Finding

`spec.md`'s pre-`## Orientation` preamble (the second and third paragraphs) carries six normative-sounding claims:

1. "Looms do not write files."
2. "Evaluation also produces a final value (the loom's last expression or `return expr`) consumed by `invoke` callers and propagated across the subagent boundary."
3. The trichotomy of terminal outcomes: succeed / fail / cancelled.
4. "Turns appended *before* the terminal event remain in the conversation the loom was driving."
5. "The runtime performs no implicit rollback."
6. The "partial-append contract" referenced by name in the same forward-link.

Per [Governance — GOV-12](spec_topics/governance.md), `spec.md` itself carries no REQ-ID prefix and every obligation it states must be owned by a topic page that gets a `**PREFIX-N.**` anchor under [GOV-1](spec_topics/governance.md). Tracing each claim:

- Claims 1 and 2 live verbatim in `spec_topics/overview.md`, which the prefix table marks `(no IDs — narrative)`. Per GOV-3, narrative pages are excluded from REQ-ID extraction by design and cannot host an anchor; H6 will not visit them. So these two normative claims have no anchorable home today.
- Claim 5 ("no implicit rollback") is owned by the **No rollback.** paragraph in `spec_topics/errors-and-results.md`. H6 will assign it an `ERR-N`. This part is fine.
- Claims 3 (the three-outcome model), 4 (turns appended before the terminal event remain), and 6 (the "partial-append contract") are not stated as unified obligations on any topic page. Their constituents are scattered: `errors-and-results.md` "**No rollback.**" covers the `?` / panic side, `cancellation.md` "**Race semantics.**" + the last paragraph of "**Granularity.**" cover the cancel side, but no topic page enumerates the three terminal outcomes as a closed set or names the "partial-append contract" as a single rule. `spec.md` introduces both names (the trichotomy and the contract) and forward-links to a fan of pages, but no individual REQ-ID will ever resolve them.

The consequence is that a reviewer or implementer who wants to cite "the partial-append contract" or "the three-outcome terminal model" must paraphrase the spec.md prose by location. After H6, the coverage matrix is keyed per REQ-ID; an obligation that has no REQ-ID has no row and no closing leaf, and the V18s coverage-closing gate cannot witness it.

## Spec Documents

- `spec.md` — preamble paragraphs 2–3, immediately above `## Orientation` (edited)
- `spec_topics/overview.md` — paragraph 2 ("Looms do not write files"; "final value … consumed by programmatic callers"); `### Scope of a loom file` (option-dependent: edited if obligations relocate, read-only if a new owner page is created)
- `spec_topics/errors-and-results.md` — `**No rollback.**` paragraph (already owns claim 5; option-dependent for hosting a new "partial-append contract" / "terminal outcomes" rule)
- `spec_topics/cancellation.md` — `**Race semantics.**` and the trailing paragraph of `**Granularity.**` (read-only; their content is part of what the partial-append contract refers to)
- `spec_topics/governance.md` — GOV-1, GOV-3, GOV-7 *Narrative-to-normative promotion*, GOV-12 (read-only; the rules that constrain the fix)
- `plan_topics/h6-req-ids.md` — `**Adds.**` clause that retargets `spec.md`'s outbound cross-references to specific `#prefix-n` anchors (option-dependent: the retarget list grows by whatever new IDs the fix mints)
- `plan_topics/coverage-matrix.md` — rows currently keyed against `Overview` headings (option-dependent: re-keyed under the new owner if obligations relocate)

## Plan Impact

**Phases:** Horizontal, MVP, Vertical V12

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified) — must anchor the new REQ-IDs and retarget `spec.md`'s preamble cross-links to them; the existing "rewrite each cross-reference in `spec.md`'s introduction" clause already scopes this kind of retarget but currently lists no `#prefix-n` targets for the preamble paragraphs.
- Ma — Minimal lexer + parser for prompt-mode no-params loom — (modified if obligations relocate) — Spec field cites `Overview`; if "looms do not write files" / "final value" move to a non-narrative page, the Spec field gains that page under GOV-11 closure (overview itself is narrative so it does not currently trigger closure).
- Mb — Minimal runtime + slash registration + two-root discovery + no-params overflow note — (modified if obligations relocate) — same reasoning as Ma.
- V12a — `mode: subagent` accepted; AgentSession spawn — (modified if obligations relocate) — cites `Overview — Scope of a Loom File`; the "final value propagated across the subagent boundary" claim is operative for V12.
- V12d — (cites `Overview — Scope of a Loom File`) — (modified if obligations relocate)
- V12e — Subagent return value propagation — (modified if obligations relocate) — directly implements the "final value consumed by `invoke` callers and propagated across the subagent boundary" claim.

## Consequence

**Severity:** high

Two implementers can disagree on what counts as a "partial-append contract" violation or as the boundary of the "three terminal outcomes" if no single topic-page rule defines either. After H6 closes, the coverage-closing gate iterates per REQ-ID; obligations stranded in `spec.md` prose or in narrative pages have no row and no closing leaf, so no V1 leaf will ever assert them as a conformance test. The unified concepts the preamble names — the trichotomy and the partial-append contract — silently cease to exist as enforceable rules.

## Solution Space

**Shape:** multiple

### Option A — Relocate stranded obligations into existing non-narrative owners

**Approach.** Move each currently-narrative or currently-unanchored claim into the smallest existing non-narrative topic page that already owns adjacent content, then rewrite the `spec.md` preamble bullets to forward-link to the new `#prefix-n` anchors.

**Spec edits.**
- Move "looms do not write files" out of `overview.md` paragraph 2 and into `spec_topics/implementation-notes.md` (or `spec_topics/pi-integration-contract.md` under the runtime-side-effects discussion). It becomes `IMPL-N` (or `PIC-N`) with one sentence.
- Move "evaluation produces a final value … consumed by `invoke` callers and propagated across the subagent boundary" into `spec_topics/invocation.md` and `spec_topics/functions.md` (the "Loom return type" section already exists per V12e's Spec field). It becomes one or two `INV-N` / `FN-N` IDs.
- Add a new `**ERR-N. Terminal outcomes.**` paragraph to `spec_topics/errors-and-results.md` enumerating the three outcomes (succeed / fail / cancelled) as a closed set, with forward-links to the per-outcome surfacing rules (the existing `**No rollback.**` paragraph, the `cancellation.md` race rules, the panic-routing paragraph).
- Add a sibling `**ERR-N+1. Partial-append contract.**` paragraph naming the contract and stating that turns appended before the terminal event remain in the driven conversation regardless of which outcome fires. Cross-link the constituent rules in `errors-and-results.md` and `cancellation.md` rather than restating them.
- Rewrite `spec.md` preamble paragraphs 2–3 to be pure orientation prose with forward-links to the new anchors, preserving the existing GOV-12 lock-step discipline.
- The narrative pages (`overview.md`) stop carrying the relocated sentences; their narrative role is not changed.

**Pros.**
- No structural change to the prefix table; no new prefix to allocate.
- Each new ID lands in a page whose existing leaves already touch it (Ma/Mb already cite `errors-and-results.md` indirectly via downstream leaves; V12e already cites `functions.md`).
- GOV-12 stays intact: `spec.md` remains informative, every obligation has a topic-page home.

**Cons.**
- Distributes claims across three or four pages; reviewers must follow forward-links to reconstruct the unified contracts.
- The "Terminal outcomes" and "Partial-append contract" rules in `errors-and-results.md` are heavy on cross-links and light on local content, which reads slightly out of character against the rest of that page.

**Risks.**
- Movement of normative content out of `overview.md` is a substantive edit per GOV-8 — it must be done before H6 so H6 sees the final text. If H6 lands first and assigns no IDs to these claims, the corpus has to re-run the GOV-8 split-or-deletion-plus-add discipline retroactively.

### Option B — Promote a dedicated owner page for the loom evaluation model

**Approach.** Create a new non-narrative topic page (working title `spec_topics/evaluation-model.md`) that owns the unified "three terminal outcomes" model, the "partial-append contract", "looms do not write files", and "final value consumed by callers" as `EVAL-N` IDs. Rewrite the `spec.md` preamble to be pure forward-links, and demote `overview.md`'s claims to narrative restatement.

**Spec edits.**
- Add a new row to the prefix table in `spec_topics/governance.md` per GOV-7 *Add*: `evaluation-model.md` → `EVAL` (or another four-letter token absent from both live and retired sub-tables).
- Author `spec_topics/evaluation-model.md` with five or six rules: `EVAL-1` "no file writes"; `EVAL-2` "final value definition and propagation"; `EVAL-3` "three terminal outcomes (closed set)"; `EVAL-4` "partial-append contract"; `EVAL-5` cross-link table to the per-outcome surfacing pages.
- Trim `overview.md` so the relocated sentences are now non-normative paraphrase, or remove them and let the page link to `evaluation-model.md`.
- Rewrite `spec.md` preamble to forward-link `EVAL-1` … `EVAL-4` directly.
- Update `plan_topics/h6-req-ids.md`'s `**Spec.**` field to add `evaluation-model.md`, and add the `EVAL` prefix to the V18s prefix-table parser's expected union.
- Update the leaves citing `Overview — Scope of a Loom File` (V12a, V12d, V12e, plus Ma/Mb where relevant) to also cite `evaluation-model.md` per GOV-11 closure.

**Pros.**
- The unified contracts (trichotomy, partial-append) live in one place under a stable identifier; reviewers can cite `EVAL-3` and `EVAL-4` directly.
- Future related obligations (e.g. the load-time fourth outcome flagged by the "Terminal outcomes trichotomy excludes load-time failures" finding) have an obvious home.
- The page is named in plan-leaf Spec fields, so GOV-11 closure carries it transitively.

**Cons.**
- Adds a new prefix and a new spec page — bigger structural edit than Option A.
- Some claims (`EVAL-1` "no file writes") are one-liners that don't really earn a dedicated page.
- Risk of overlap with existing pages: `EVAL-2` ("final value") restates content already in `functions.md` (Loom return type) and `invocation.md`; the relationship needs careful cross-linking to avoid redundancy that GOV-8 would later treat as substantive on edit.

**Risks.**
- Allocating a new prefix is permanent (GOV-4); the page can never be deleted-and-re-added with the same prefix.
- If the new page is mostly cross-link tables, reviewers may find the indirection annoying.

### Recommendation

Take Option A. The four stranded claims have natural existing homes (`implementation-notes.md` for "no file writes"; `invocation.md` / `functions.md` for the final-value claim; `errors-and-results.md` for the trichotomy and partial-append contract), and Option A avoids minting a new prefix that GOV-4 makes permanent. Land Option A's spec edits *before* H6 so H6 sees the final normative surface and assigns the new IDs in its single anchor pass. Edge cases the implementer must watch:

- The relocation of "looms do not write files" and the "final value" claim from `overview.md` is substantive per GOV-8 — even though the bytes move rather than change, the rules' canonical source location changes and review must treat each as a deletion-on-`overview.md` (no-op there since `overview.md` carries no IDs) plus an add on the new owner.
- After relocation, H6's `**Adds.**` clause that retargets `spec.md`'s outbound cross-references must be extended to the preamble paragraphs (currently only the third paragraph's `discovery.md#file-extension-namespace` link is named explicitly).
- GOV-11 closure now pulls the new owner pages into Ma/Mb/V12a/V12d/V12e Spec fields. Walk the closure and update each leaf's Spec field in the same commit that relocates the rules.
- `plan_topics/coverage-matrix.md` rows currently keyed against `Overview` headings (`Mb, V12a` under "Overview — Scope of a Loom File"; `Ma, Mb, V5a, V6a` under "Overview — Code and Model") need re-keying under the new owners during H6's matrix re-pivot.

## Related Findings

- "Four distinct obligations in one unIDed bullet" — same-cluster (same structural pattern: a `spec.md` aggregator-style bullet bundles obligations that no individual REQ-ID can resolve)
- "Three obligations conflated in one unIDed bullet" — same-cluster (same pattern)
- "Four ceilings in one bullet — cannot be individually cited or tested" — same-cluster (same pattern, on the hard-runtime-ceilings list)
- "No-sandbox normative rule sits in an 'informative' unIDed bullet" — same-cluster (normative content stranded in a bullet GOV-12 declares informative)
- "Terminal outcomes trichotomy excludes load-time failures" — decision-dependency (whichever owner page hosts the trichotomy must decide at the same time whether to extend the closed set to four outcomes; resolving this finding fixes the anchor that the trichotomy finding then edits)
- "Per-turn atomicity assumption for partial-append contract is implicit" — decision-dependency (the new "Partial-append contract" rule is the natural place to state the atomicity premise; co-resolution is cleanest)
- "Final value on non-success outcomes and empty-tail cases unspecified" — decision-dependency (the relocated "final value" rule is the natural place to specify the non-success and empty-tail cases)
- "Cancellation outcome lacks caller-surface contract" — decision-dependency (the trichotomy rule's cancel arm forward-links to the cancellation surface; the two land cleanly in one commit)
- "Failure-cause → caller-surface mapping absent for panic and limit-exceeded" — same-cluster (touches the same fail-arm of the trichotomy but resolves on a different page)

## spec.md — Orientation → Prerequisites → Pi SDK and capabilities

---

# `typebox` peer-dependency range violates Pi's bundled-package convention

**Original heading:** `typebox` peer-dependency range conflicts with Pi package conventions
**Kind:** doc-alignment-broad

## Finding

`package.json` declares `"typebox": "^1.1.24"` in `peerDependencies`. Pi's own packaging documentation (`@mariozechner/pi-coding-agent/docs/packages.md`, *Dependencies* section) is unambiguous about the rule for the five Pi-bundled packages — `@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, and `typebox`: "list them in `peerDependencies` with a `"*"` range and do not bundle them." The four `@mariozechner/*` entries are deliberately pinned to `^0.72.1` — `pi-integration-contract.md` justifies that deviation explicitly (lock-step minor across the four, install-time error under non-deduplicating package managers, H1 literal-read test as the gate). No analogous justification exists for the `typebox` pin: the only `typebox` consumer in the spec is `Type.Unsafe<unknown>(...)` (PIC §"Tool definition shape" and V6 typed-query response wiring), an API that has been stable across the TypeBox 0.x → 1.x line, and the H1 `peerDependencies` literal-read test (per `plan_topics/h1-scaffold.md`) does not assert anything about the `typebox` entry — only the four `@mariozechner/*` ones.

The result is an unjustified, untested deviation from a documented Pi convention. A user installing pi-loom under a strict peer-dep package manager (pnpm, npm v7+) where the host has resolved `typebox` to a different major (Pi may bump its bundled `typebox` independently of its own minor) will get a peer-dep warning or hard install failure that loom did nothing to earn. The four-package lock-step rationale does not transfer: `typebox` ships with Pi but is not part of `pi-mono`'s synchronized release train, so a `^1.1.24` pin can drift relative to whatever Pi ships at any time without a Pi minor bump.

## Spec Documents

- `package.json` — `peerDependencies` block (edited)
- `spec_topics/pi-integration-contract.md` — *Host prerequisites — Pi SDK pin* and *Tool definition shape* (`Type.Unsafe` reference) (edited)
- `plan_topics/h1-scaffold.md` — `peerDependencies` literal-read test (edited)
- `C:\Users\thomasa\AppData\Roaming\npm\node_modules\@mariozechner\pi-coding-agent\docs\packages.md` — *Dependencies* (read-only)
- `spec.md` — Orientation → Prerequisites → Pi SDK and capabilities (read-only)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)

## Consequence

**Severity:** high

Under a strict peer-dep resolver (pnpm, npm v7+), a host whose Pi installation has bumped its bundled `typebox` to a 2.x line will refuse to install pi-loom or surface a hard peer-dep error, despite the runtime needing only the long-stable `Type.Unsafe` surface. The deviation from documented Pi convention is also unaccompanied by any literal-read test, so a future contributor cannot tell whether the `^1.1.24` pin was deliberate or an accident, and silent drift is undetectable.

## Solution Space

**Shape:** single

### Recommendation

Change the `typebox` entry in `package.json` `peerDependencies` from `"^1.1.24"` to `"*"` to match the documented Pi bundled-package convention. Add a one-sentence note to `spec_topics/pi-integration-contract.md` (under *Host prerequisites — Pi SDK pin* or a new sibling bullet) that explicitly distinguishes the two regimes:

> The four `@mariozechner/*` packages are pinned to `^0.72.1` per the lock-step rule above. `typebox` is the fifth Pi-bundled package the loom runtime imports (only `Type.Unsafe`, per *Tool definition shape* below); per Pi's bundled-package convention (`@mariozechner/pi-coding-agent` `docs/packages.md` — *Dependencies*) it MUST be declared as `"typebox": "*"` so the host's bundled version wins. The runtime depends only on `Type.Unsafe`, which is stable across the TypeBox 0.x → 1.x line; no version pin is warranted.

Extend the H1 `peerDependencies` literal-read test (`plan_topics/h1-scaffold.md`, the second bullet under "literal-read") to assert `peerDependencies["typebox"] === "*"` and that the entry is present, so the deviation cannot silently regress to a versioned pin in a future leaf. Implementer edge cases:

- Do **not** add `typebox` to the four-entry `^0.72.1` group — the lock-step assertion must continue to test only the four `@mariozechner/*` entries against `^0.72.1`; `typebox` gets its own one-line assertion against the literal `"*"`.
- Do **not** fold `typebox` into the `peer-dep-range` pinned-constants entry consumed by the capability probe (PIC §Step 0 (d)) — that constant is the Pi SDK range and is asserted only against the four `@mariozechner/*` entries. The probe does not check `typebox` at all and should not start.
- The `Type.Unsafe` import line in V6 (typed-query response) and V14 (tool registration) does not change; only the `package.json` range and the spec/test wording move.

## Related Findings

- "`semver` declared as a production dependency in spec but absent from `package.json`" — same-cluster (both surface `package.json`-vs-spec drift in the dependency declarations; resolved by independent edits)
- "`peerDependencies` role unclear: \"non-load-bearing\" jargon and mandatory-field status unspecified" — co-resolve (the recommended PIC clarification on bundled-package convention naturally subsumes the non-load-bearing/mandatory-field clarification this finding asks for)
- "\"Riding along transitively at the same minor-version line\" is ambiguous" — same-cluster (both touch the spec.md Pi-SDK-pin orientation prose; the typebox note belongs in PIC, the riding-along clarification belongs in spec.md, but both audits should be done together)

---

# `peerDependencies` orientation prose uses undefined "non-load-bearing" jargon and obscures whether the field itself is required

**Original heading:** `peerDependencies` role unclear: "non-load-bearing" jargon and mandatory-field status unspecified
**Kind:** clarity, implementability, assumptions

## Finding

The Pi-SDK orientation paragraph in `spec.md` (Orientation → Prerequisites → Pi SDK and capabilities) says: "install-time `peerDependencies` enforcement is package-manager-dependent and is non-load-bearing." The phrase "non-load-bearing" is used here without definition. Elsewhere on the same page it has a different referent (the capability probe is described as "the single load-bearing check"), and on `spec_topics/pi-integration-contract.md` "non-load-bearing" qualifies *behaviour outside the V1 contract surface* and *unused `ExtensionContext` members*. A first-time reader cannot tell from `spec.md` alone whether the term means "optional", "best-effort", "not relied upon for runtime safety", or "package-managers do not reliably enforce it".

The actual semantics — that loom does not depend on the package manager catching a peer-dep mismatch because pnpm/yarn/npm differ on whether they refuse the install — is recoverable only by reading the PIC *Pi SDK pin* paragraph, which also makes clear that the field's *declaration* is mandatory ("Loom's `peerDependencies` block declares all four packages as belt-and-braces; the redundancy is intentional", and the H1 `peerDependencies` literal-read test asserts all four entries are present). `spec.md` orientation never surfaces that distinction — between "the field is required to be declared" and "the package-manager-side enforcement of that declaration is unreliable" — so a reader skimming only the orientation could plausibly conclude the field itself is dispensable.

The fix is small and local to one informative sentence; the underlying H1 mechanical gate is not affected.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Pi SDK and capabilities (edited)
- `spec_topics/pi-integration-contract.md` — preamble; Host prerequisites item 1 (Pi SDK pin) (read-only — already defines the mandatory-field rule and the install-time gate semantics)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. `H1` already pins both the `peerDependencies` literal-read test and the SDK surface-inventory test against the same anchor texts in `spec.md` and `pi-integration-contract.md`; the rewording suggested below preserves the section heading those tests cite, so no acceptance criterion moves.

## Consequence

**Severity:** low

A careful implementer who follows the forward-link to PIC reaches the correct conclusion (the four `peerDependencies` entries are mandatory, the package-manager enforcement is best-effort), and the H1 literal-read test catches any mistake regardless. A skimming reader of `spec.md` alone could misread "non-load-bearing" as "optional" and either omit the field or pin it to the wrong range, but the build gate would refuse the result.

## Solution Space

**Shape:** multiple

### Option A — Inline the meaning, keep the orientation mention

**Approach.** Replace the "non-load-bearing" phrase with one self-contained sentence that names what loom does and does not rely on, then continue forward-linking ownership to PIC.

**Spec edits.**
- In `spec.md` (Orientation → Prerequisites → Pi SDK and capabilities), replace
  > "install-time `peerDependencies` enforcement is package-manager-dependent and is non-load-bearing."
  with
  > "Declaration of all four `peerDependencies` entries is mandatory and gated by the H1 literal-read test owned by [Pi Integration Contract — Host prerequisites — Pi SDK pin]; the runtime does not, however, rely on the package manager actually refusing a mismatched install (npm/pnpm/yarn behaviour differs), so the capability probe at extension-factory entry is the single load-bearing check."
- No edits to `spec_topics/pi-integration-contract.md`.

**Pros.** Reader of `spec.md` alone gets the correct mental model in one sentence. The orientation paragraph keeps its existing contour (mention `peerDependencies` once, forward-link ownership). No anchor renames; H1 anchors still resolve.

**Cons.** Adds one sentence to a paragraph already flagged elsewhere in this review for length and meta-annotation cruft.

**Risks.** None — purely additive prose; tests unchanged.

### Option B — Drop the `peerDependencies` qualifier from `spec.md`, let PIC own it

**Approach.** Remove the "install-time enforcement is non-load-bearing" half-sentence from `spec.md` entirely. The orientation paragraph already names "the `peerDependencies` build-time gate" and forward-links to PIC for ownership; the install-time/build-time distinction is a PIC-level concern.

**Spec edits.**
- In `spec.md` (same paragraph), delete
  > "; install-time `peerDependencies` enforcement is package-manager-dependent and is non-load-bearing"
  leaving
  > "At extension-factory entry the runtime runs the capability probe owned by [Pi Integration Contract — Step 0 (Capability probe)], which is the single load-bearing check."
- In `spec_topics/pi-integration-contract.md` (Host prerequisites item 1 — Pi SDK pin), confirm the existing belt-and-braces sentence already explains both the mandatory-declaration rule and the package-manager-dependence; if it does not also use the words "load-bearing" / "non-load-bearing", leave it alone — the term is now used consistently across the spec to mean "outside the V1 contract surface".

**Pros.** Eliminates the only spec.md use of "non-load-bearing" that doesn't match the term's other uses. Shortens an over-long orientation paragraph. PIC already carries the full story.

**Cons.** Loses the orientation-level cue that the package-manager-side enforcement is unreliable; readers who never click through to PIC won't see it.

**Risks.** None — the deleted clause is informative, and the H1 literal-read test, the PIC-owned mandatory-declaration rule, and the capability probe are all unaffected.

### Recommendation

Take **Option B**. The orientation paragraph's job is to point at owners, not to qualify their rules; the deleted half-sentence is the only place in the spec where "non-load-bearing" carries a sense ("install-time enforcement is unreliable") different from its other two uses ("behaviour outside the V1 contract surface", "members loom doesn't touch"), and pruning it restores the term's consistency. Edge cases for the implementer: (i) keep the section heading "Pi SDK and capabilities" verbatim — H1's `peerDependencies` literal-read test cites it as the anchor for the literal value; (ii) leave PIC item 1's belt-and-braces sentence intact — it is the canonical statement that all four entries MUST be declared.

## Related Findings

- "`typebox` peer-dependency range conflicts with Pi package conventions" — same-cluster (touches the same `peerDependencies` block, separate question about `typebox`'s pin shape).
- "`semver` declared as a production dependency in spec but absent from `package.json`" — same-cluster (same Prerequisites paragraph; resolves independently).
- ""Riding along transitively at the same minor-version line" is ambiguous" — co-resolve (same orientation paragraph, same edit pass; both fixes are clarifications to the Pi-SDK-and-capabilities sentence).
- "Seven SDK capabilities listed by label only — no probe shape or factory-entry semantics" — same-cluster (same paragraph, separate clarity issue).
- "Meta-annotation labels ("Orientation; this paragraph is informative") are editorial cruft" — co-resolve (same paragraph; the recommended pruning here is consistent with that finding's pruning).

---

# "Riding along transitively at the same minor-version line" is misleading orientation prose

**Original heading:** "Riding along transitively at the same minor-version line" is ambiguous
**Kind:** clarity, assumptions

## Finding

The Pi-SDK orientation sentence in `spec.md` reads:

> The host is `@mariozechner/pi-coding-agent`, with `pi-agent-core`, `pi-ai`, and `pi-tui` riding along transitively at the same minor-version line.

Two distinct readings are possible: (a) the three sibling packages are pinned in lock-step alongside `pi-coding-agent` (an obligation loom enforces); (b) they happen to land on the same minor merely because they are transitive dependencies of `pi-coding-agent` (a passive observation, no obligation). The intended reading is (a), but the chosen wording — "riding along transitively" — actively pushes the reader toward (b).

The pushback is not just stylistic. `pi-integration-contract.md` § Pi SDK pin and the project's own `package.json` make the load-bearing rule explicit: all four packages are independently declared in `peerDependencies` at the **same literal `^0.72.1` range** ("Loom's `peerDependencies` block declares all four packages as belt-and-braces; the redundancy is intentional"). They are direct peer-deps, not transitive resolutions. The H1 `peerDependencies` literal-read test exists precisely to keep the four entries identical. Calling the three siblings "transitive" in the orientation paragraph mis-describes the very contract the test enforces.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Pi SDK and capabilities (edited)
- `spec_topics/pi-integration-contract.md` — Host prerequisites #1 (Pi SDK pin) (read-only — owns the lock-step rule)
- `package.json` — `peerDependencies` block (read-only — confirms all four are direct peers)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The change is a prose tightening of an `informative` orientation paragraph that carries no MUSTs. The load-bearing rule and its mechanical gate (H1 `peerDependencies` literal-read test, H1 SDK surface-inventory test) already live in PIC and `plan_topics/h1-scaffold.md` and require no edit; their acceptance criteria are unchanged.

## Consequence

**Severity:** low

A reviewer who skims only `spec.md` may take away the wrong mental model — believing the three siblings are passive resolutions rather than independently declared peer-deps subject to the lock-step rule and the H1 literal-read gate. This invites questions like "why is `pi-ai` in our `peerDependencies` at all?" and erodes the belt-and-braces rationale recorded in PIC. No runtime behaviour is at stake; the wording quietly misrepresents a contract whose mechanical enforcement is correctly specified elsewhere.

## Solution Space

**Shape:** single

### Recommendation

Replace the orientation sentence in `spec.md` § Orientation → Prerequisites → Pi SDK and capabilities with wording that names the lock-step rule and its owner explicitly, e.g.:

> The host is `@mariozechner/pi-coding-agent`. The runtime additionally pins `pi-agent-core`, `pi-ai`, and `pi-tui` as direct `peerDependencies` at the same `^X.Y.Z` minor-version line as `pi-coding-agent`; the lock-step rule and the rationale for declaring all four explicitly (belt-and-braces against package managers that do not auto-deduplicate transitive peer-dep ranges) are owned by [Pi Integration Contract — Host prerequisites — Pi SDK pin](./spec_topics/pi-integration-contract.md).

Edge cases for the editor:

- Drop the word "transitively" entirely — it is the active source of the (b) reading and is factually wrong about loom's declaration.
- Keep the forward-link to PIC's Pi-SDK-pin anchor; the orientation paragraph must remain a pure name-link with no MUSTs of its own (consistent with the rest of the prerequisite block).
- Do not restate the literal `^0.72.1` here — PIC owns the literal; the H1 surface-inventory test asserts there is exactly one source of truth for the constant.

## Related Findings

- "`peerDependencies` role unclear: \"non-load-bearing\" jargon and mandatory-field status unspecified" — co-resolve (same orientation paragraph; both fixes can land in one edit that rewrites the SDK-pin sentence and the `peerDependencies` enforcement sentence together)
- "`typebox` peer-dependency range conflicts with Pi package conventions" — same-cluster (same `peerDependencies` block in `package.json`, but a separate question about the `typebox` entry's range; resolves independently)
- "Meta-annotation labels (\"Orientation; this paragraph is informative\") are editorial cruft" — same-cluster (touches the same paragraph's framing; a rewrite could remove the italic label in the same pass)
- "Seven SDK capabilities listed by label only — no probe shape or factory-entry semantics" — same-cluster (adjacent bullets in the same prerequisite block; independent fix)
- "Binder LLM model availability assumed but never stated as a precondition" — same-cluster (item 7 of the same bullet list; independent fix)

## spec.md — Orientation → Prerequisites → Host runtime

---

# Obligation 4 generalises to "JavaScript engine" while the rest of the runtime is pinned to Node

**Original heading:** Node.js–only assumption contradicts "JavaScript engine" generalization in obligation 4
**Kind:** assumptions

## Finding

The Host runtime preamble lists four obligations. Obligation 1 pins Node `>=20.6.0` (matching `pi-coding-agent`'s `engines.node`), and the operative probe in `pi-integration-contract.md` Step 0(a) reads `process.versions.node` — a Node-only call with no portable equivalent. Obligation 4 then widens the scope to "a JavaScript engine with IEEE-754 numbers, native `Map`/`Set`, native `JSON.stringify`, and `Object.is` semantics," with no statement of which engines are in scope. The two obligations describe the same engine but use incompatible noun phrases.

The widened phrasing creates a real ambiguity. A reader who treats obligation 4 literally can ask whether Bun, Deno, Node-compatible browser embeds, or vendored embedded-JS hosts are supported runtimes for `.loom` evaluation. Nothing in `spec.md`, `pi-integration-contract.md`, `runtime-value-model.md`, or `future-considerations.md` resolves this question. In practice the answer is "Node only" — the capability probe is unportable, the SDK pin transitively pins Node, and `future-considerations.md` records related deferrals — but no single sentence says it.

(The same paragraph contains a sub-complaint about obligation 2 not citing the Pi API that supplies the WHATWG `AbortSignal`. That citation already exists at `pi-integration-contract.md` line 10 — "Pi delivers an `AbortSignal` to every extension entry point loom uses … the Web-standard `AbortSignal` / `AbortController` shape (the Node-bundled WHATWG implementation) is a fixed-shape SDK precondition" — and obligation 2 forward-links to Step 0(b). That sub-complaint is not the issue here.)

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Host runtime (preamble + obligation 4) (edited)
- `spec_topics/pi-integration-contract.md` — Step 0(a) Node floor and the preamble that already classifies obligation 4 as a "non-checked invariant by design" (read-only)
- `spec_topics/runtime-value-model.md` — JS-value-mapping table whose semantics obligation 4 underwrites (read-only)
- `spec_topics/future-considerations.md` — Known V1 limitations list (option-dependent: a one-line "Bun/Deno/browser-embed support is not in V1" entry is appropriate if the recommendation is taken)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The H1a literal-read tests anchor `engines.node === ">=20.6.0"` and the SDK surface inventory at fixed citation paths in `spec.md` and `pi-integration-contract.md`; tightening obligation 4's wording does not move those anchors or change any acceptance criterion.

## Consequence

**Severity:** high

Two reasonable implementers can read obligation 4 differently: one treats "JavaScript engine" as descriptive (Node, by inheritance from obligation 1) and ships a Node-only build; another treats it as normative scope and invests in Bun/Deno compatibility (or refuses to use Node-conditional APIs in code paths the spec leaves unconstrained). The runtime ships either too narrow or too wide a compatibility envelope depending on which reading wins. The ambiguity is invisible at H1 because the literal-read tests never exercise non-Node engines.

## Solution Space

**Shape:** single

### Recommendation

Rewrite obligation 4 in `spec.md` to (a) drop the "a JavaScript engine" framing and (b) name Node explicitly, inheriting the floor from obligation 1. Concretely:

> **JavaScript value-model assumptions.** The runtime value model relies on the Node JavaScript engine (per obligation 1) providing IEEE-754 `number`s, native `Map` / `Set`, native `JSON.stringify`, and `Object.is` semantics for primitive equality. Behaviour is undefined if the host violates any of these assumptions; the runtime does not feature-detect, does not polyfill, and emits no diagnostic on violation. This is a non-checked invariant, in contrast to obligations 1–3.

Add one sentence to the Host runtime preamble immediately after the "four host preconditions" sentence, stating V1 scope explicitly:

> V1 targets the Node JavaScript engine exclusively. Bun, Deno, browser embeds, and other JavaScript hosts are out of V1 scope; the Step 0(a) probe is Node-specific (`process.versions.node`) and refuses to load on any host where that property is absent or unparseable as a `semver` version.

Add a corresponding one-line entry under `spec_topics/future-considerations.md` "Known V1 limitations (no seam expected)":

> **No non-Node JavaScript host support.** V1 binds to Node exclusively (via `process.versions.node` in the Step 0(a) probe and via Pi's `engines.node` floor). Bun, Deno, and browser-embed hosts are not anticipated by V1 and would require a probe re-design before being added.

Edge cases the implementer must watch:

- The Step 0(a) self-failure clause (`pi-integration-contract.md` line 65) already routes `process.versions` evaluation throws to `kind: "probe-failed"`, which covers the "host without `process.versions.node`" case correctly. No change needed there.
- Do **not** change the literal `engines.node === ">=20.6.0"` or the Step 0(a) `process.versions.node` semantics. The H1a literal-read tests assert these and the recommendation does not move either anchor.
- The phrase "non-checked invariant" should remain, so the `pi-integration-contract.md` Step 0 preamble's cross-reference ("Host runtime obligation 4 (the JavaScript engine value model) is a non-checked invariant by design and is **not** probed") still resolves cleanly. If obligation 4's heading is renamed (e.g. to "JavaScript value-model assumptions"), update that PIC cross-reference in the same edit.

## Related Findings

- "Obligation 4 contradicts its own 'no normative weight' preamble" — co-resolve (any rewrite of obligation 4 should also assign a stable REQ-ID or remove the "no normative weight" disclaimer)
- "Obligation 4 'undefined behaviour' manifestations unbounded" — same-cluster (touches the same paragraph but resolves independently — bounding the failure modes is orthogonal to naming the engine)
- "Obligation 4 misplaced — belongs in implementation notes or runtime value model" — decision-dependency (if obligation 4 is moved out of `spec.md`, the "V1 targets Node only" sentence still belongs in the Host runtime preamble, not at the new home of obligation 4)
- "'A small set of named members' is a vague quantifier" — same-cluster (also touches the Host runtime obligations but addresses obligation 2's enumeration, not obligation 4)

---

# Host runtime obligation 4 carries unowned normative content, violating GOV-12

**Original heading:** Obligation 4 contradicts its own "no normative weight" preamble
**Kind:** implementability, traceability

## Finding

`spec.md` §Orientation → Prerequisites → Host runtime opens with a preamble stating that obligations 1–3 "carry only orientation context and forward-link" to Pi Integration Contract Step 0, and that "the ordinal labels are kept for citation continuity … but no longer carry normative weight on this page." Obligations 1, 2, and 3 honour that contract: each is a single sentence whose substantive content is delegated to PIC by an explicit forward-link.

Obligation 4 does not. It asserts three negative prohibitions found nowhere else in the spec — "the runtime does not feature-detect, does not polyfill, and emits no diagnostic on violation" — plus the open-ended consequence "Behaviour is undefined if the host violates any of these assumptions." The forward-links it offers (`runtime-value-model.md`, `cancellation.md`) describe the assumed value model but never state the prohibitions or the undefined-behaviour disposition. The preamble's carve-out — "Obligation 4 (the JavaScript engine value model) is a non-checked invariant by design" — explains *why* obligation 4 is shaped differently from 1–3, but it does not authorise spec.md to be the home of normative content.

This violates [`governance.md` GOV-12](../../../../spec_topics/governance.md), which states that `spec.md` is informative orientation and "every normative obligation it appears to state is owned by a topic page that `spec.md` forward-links to." An implementer exercising the GOV-10 reading-scope right (reading only the topic pages listed in their plan leaf's `**Spec**` field) cannot reach the prohibitions, because no topic page owns them. Two reasonable implementers reading `runtime-value-model.md` alone could legitimately add a defensive `Object.is`/`Map`-presence probe and emit a diagnostic on failure — directly contradicting obligation 4 — without violating any topic page they read.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Host runtime preamble + obligation 4 bullet (edited)
- `spec_topics/runtime-value-model.md` — new "non-checked invariant" subsection holding the moved prohibitions (option-dependent)
- `spec_topics/implementation-notes.md` — alternative target for the moved prohibitions (option-dependent)
- `spec_topics/governance.md` — GOV-12 establishes the rule being violated (read-only)
- `spec_topics/cancellation.md` — currently forward-linked from obligation 4 but does not own its content (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. Obligation 4 is, by the preamble's own carve-out, a non-checked invariant — no plan leaf tests for it, no leaf depends on it, and a `grep` of `plan.md` and `plan_topics/` for `obligation 4`, `JavaScript engine`, `non-checked invariant`, and `feature-detect.*polyfill` returns no hits. The fix is a pure spec edit (move-and-forward-link) with no plan-leaf consequence under any of the options below.

## Consequence

**Severity:** high

An implementer reading `runtime-value-model.md` alone (the page obligation 4 forward-links to) will not encounter the "do not feature-detect / do not polyfill / do not emit diagnostic" prohibitions. They could plausibly add a defensive runtime probe — e.g. asserting `Map`'s presence at extension entry and emitting `loom/load/host-incompatible` on absence — and produce a runtime that contradicts the spec while passing every topic-page-derived test. The prohibitions are also genuinely useful: a future leaf considering "should we surface a friendlier error when `Object.is(NaN, NaN)` returns false?" needs to find the answer somewhere normative.

## Solution Space

**Shape:** multiple

### Option A — Move the prohibitions into `runtime-value-model.md`

**Approach.** Add a new subsection at the tail of `spec_topics/runtime-value-model.md` (e.g. **"Non-checked invariant."**) that owns the four assumptions (IEEE-754 numbers, native `Map`/`Set`, native `JSON.stringify`, `Object.is` for primitive equality), the three prohibitions (no feature-detect, no polyfill, no diagnostic), and the undefined-behaviour disposition. Demote `spec.md` obligation 4 to the same orientation-only shape as obligations 1–3: one sentence that names the obligation and forward-links to the new subsection.

**Spec edits.**
- `spec.md` obligation 4 becomes: "**JavaScript engine value model.** *Orientation; the operative rule lives in [Runtime Value Model — Non-checked invariant](./spec_topics/runtime-value-model.md#non-checked-invariant).* The runtime's value model assumes a JavaScript engine; the assumption is a non-checked invariant. The four assumed primitives, the no-feature-detect / no-polyfill / no-diagnostic prohibitions, and the undefined-behaviour disposition are anchored at that section."
- `spec_topics/runtime-value-model.md` gains the new subsection at the tail, with an explicit anchor (`<a id="non-checked-invariant"></a>`) so the spec.md link target is stable.
- The Host runtime preamble in `spec.md` can drop the "Obligation 4 … is a non-checked invariant by design" carve-out: with the move done, all four obligations are uniformly orientation-only and the preamble simplifies to the same statement that already covers obligations 1–3.

**Pros.** Topical fit is exact — the assumptions are about the value model, and `runtime-value-model.md` already enumerates IEEE-754, `Object.is`, and the primitive set. GOV-12 holds without amendment. The Host runtime preamble simplifies. H6 will mint a REQ-ID for the new paragraph under the existing `RVM` prefix (or whatever prefix governance assigns to that page) without special-casing.

**Cons.** The page currently has no "non-checked invariants" framing; adding one introduces a small new shape on the page. The assumption set spans both value-model concerns and `cancellation.md` concerns (cancellation references `AbortSignal` semantics, which depends on the engine's promise/microtask model), so a future reader might expect a parallel cancellation-side note.

**Risks.** Low. The move is mechanical; the new subsection's content is already drafted in the current bullet 4.

### Option B — Move the prohibitions into `implementation-notes.md`

**Approach.** Same shape as Option A, but the new subsection lives under `implementation-notes.md` (probably under the existing `## Runtime` heading or as a new sibling), framed as an implementer-facing assumption rather than a value-model property.

**Spec edits.**
- `spec.md` obligation 4 forward-links to `implementation-notes.md` instead.
- `implementation-notes.md` gains a new subsection.

**Pros.** Matches the original finding's framing of obligation 4 as an "implementation-layer assumption." `implementation-notes.md` is the natural home for things the implementer must know but no end-user-visible obligation depends on.

**Cons.** Topically weaker than Option A: the four assumptions are *value-model* assumptions (the value-model rules in `runtime-value-model.md` only hold given those assumptions), not implementation tactics. Splitting the assumption from its dependent rules across two pages costs a hop for any reader.

**Risks.** Low.

### Option C — Promote `spec.md` to carry a REQ-ID prefix

**Approach.** Allocate a `HOST` (or similar) REQ-ID prefix to `spec.md`, retire the GOV-12 carve-out that makes spec.md aggregator-only, and assign `HOST-1` … `HOST-4` to the four Host-runtime obligations (and corresponding IDs to the Scope and Pi-SDK aggregator paragraphs). Obligation 4 keeps its current content as `HOST-4`.

**Pros.** Solves the "where does this obligation live" question by letting it live in spec.md. No move.

**Cons.** Requires editing `governance.md` GOV-12 (a load-bearing convention) and possibly GOV-3's prefix table. Reverses the deliberate decision recorded in GOV-12 that spec.md is informative. Affects every other aggregator paragraph in spec.md (Scope, Prerequisites, etc.) and would force REQ-ID minting across all of them. Disproportionate to the local defect.

**Risks.** Medium-high — touches governance rules that other parts of the spec lean on.

### Recommendation

Take **Option A**. The assumptions in obligation 4 are value-model assumptions; the page that owns the value-model rules is the natural owner. The mechanical edit is small (one new tail subsection in `runtime-value-model.md`, one bullet rewrite in `spec.md`), it discharges the GOV-12 violation cleanly, and it lets the Host runtime preamble drop its special-case carve-out for obligation 4, giving all four bullets a uniform orientation-only shape.

Edge cases the editor must watch:
- The new subsection's anchor (`#non-checked-invariant` or similar) MUST match the link target in the rewritten spec.md bullet — anchor drift will break the forward-link silently.
- The `cancellation.md` cross-reference currently in obligation 4 should be preserved on the new subsection if cancellation depends on the engine assumption, or dropped if it does not. Decide explicitly; do not lose the link.
- The subsection title must signal "this is an unchecked assumption" so a reader scanning `runtime-value-model.md` does not mistake it for a checked invariant the runtime polices.
- Any subsequent finding that proposes adding a feature-detect or diagnostic for the JS-engine value model now has a single normative paragraph to argue against, rather than an orphaned bullet in spec.md.

## Related Findings

- "Obligation 4 misplaced — belongs in implementation notes or runtime value model" — co-resolve (the same move discharges both findings; that finding's preferred destinations are exactly Options A and B above).
- "Obligation 4 'undefined behaviour' manifestations unbounded" — decision-dependency (the proposed clarification of how violations manifest must land at whichever page Option A/B/C selects as the owning home).
- "Node.js–only assumption contradicts 'JavaScript engine' generalization in obligation 4" — same-cluster (touches obligation 4's framing but is about the Node-vs-JS-engine scope question, not about ownership; resolves independently).
- "Meta-annotation labels (\"Orientation; this paragraph is informative\") are editorial cruft" — same-cluster (touches the orientation-labelling regime obligation 4 lives within; if the labels are removed, the rewritten obligation 4 should not carry one).

---

# Obligation 4's "undefined behaviour" leaves the always-log set's terminal-event guarantee vacuous

**Original heading:** Obligation 4 "undefined behaviour" manifestations unbounded
**Kind:** error-model

## Finding

`spec.md` Host runtime obligation 4 declares the JavaScript engine value model (IEEE-754 numbers, native `Map`/`Set`, native `JSON.stringify`, `Object.is` primitive equality) a non-checked invariant: "Behaviour is undefined if the host violates any of these assumptions; the runtime does not feature-detect, does not polyfill, and emits no diagnostic on violation." The manifestation surface is therefore unbounded — a violating host can produce silent value corruption that propagates into appended turns, an unhandled host-process exception, or a panic with a misleading message originating far from the actual violation site.

This collides with the always-log contract in `spec_topics/pi-integration-contract.md` ("Runtime event channel"), which guarantees that every member of the always-log set emits a structured note through `loom-system-note` exactly once per occurrence. Operators reading that contract will reasonably treat a missing terminal event as a runtime defect; under an obligation-4 violation, no emission is guaranteed (a corrupted `Map` may simply lose the in-flight failure record; a host throw inside the emission helper may bypass it entirely). The contract does not currently flag this carve-out, and `loom/runtime/internal-error` — which already absorbs unanticipated interpreter throws and would catch *some* obligation-4 manifestations as a side effect — is not cross-linked from obligation 4 either.

The result: operators have no spec-level cue to distinguish "no terminal event because the loom never failed" from "no terminal event because the host violated an unchecked invariant." Both the prose around obligation 4 and the always-log set's preamble need to acknowledge that the guarantee is contingent on obligation 4 holding.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Host runtime (obligation 4) (edited)
- `spec_topics/pi-integration-contract.md` — Runtime event channel / always-log set preamble (edited)
- `spec_topics/runtime-value-model.md` — top of page (edited; one-liner cross-link)
- `spec_topics/errors-and-results.md` — Runtime panics / runtime-defect surface (read-only; existing `loom/runtime/internal-error` is the partial-coverage surface to reference)
- `spec_topics/diagnostics.md` — `loom/runtime/internal-error` registry row (read-only)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H1 — Scaffold / SDK surface-inventory test — (read-only; confirms obligation 4 is not probed and need not be tested by H1, but the new clause should not invent a new pinned surface)
- V18m — Panic routing: slash-command surface — (read-only; existing `loom/runtime/internal-error` test is the partial-coverage anchor the new clause cross-links)
- V18q — Runtime event channel and always-log emission — (modified; the leaf's "Adds" prose and Tests must explicitly note that the always-log guarantee is conditional on obligation 4 holding, and tests MUST NOT assert emission under synthesised obligation-4 violations — currently V18q's exactly-once contract is stated unconditionally)

## Consequence

**Severity:** low

Operators relying on the always-log set as a complete failure-record will silently mis-attribute obligation-4 violations to runtime defects, or worse, miss them entirely. Implementers writing V18q tests against the unconditional "exactly-once" contract may also be surprised when integration with a non-conformant host produces zero or duplicate emissions. The runtime itself behaves correctly under the design; the gap is purely in the operator-facing contract's edge-case framing.

## Solution Space

**Shape:** single

### Recommendation

Add a single normative carve-out to the always-log set's preamble in `spec_topics/pi-integration-contract.md` ("Runtime event channel"), and a matching one-line forward-reference at the end of `spec.md` obligation 4. Concretely:

1. **In `spec_topics/pi-integration-contract.md`** — append to the "Runtime event channel" preamble paragraph (the one starting "A subset of `QueryError` failures…"):

   > The exactly-once emission guarantee assumes [Host runtime obligation 4](../spec.md#orientation) (the JavaScript engine value model) holds. Under an obligation-4 violation, emission may be silently dropped (e.g. a corrupted `Map` loses the dedup key), duplicated, or skipped entirely (e.g. a `pi.sendMessage` host throw bypasses the helper); some manifestations land on `loom/runtime/internal-error` via the runtime-defect surface in [Errors and Results — Runtime panics](./errors-and-results.md), but silent value corruption has no observable signal. Operators MUST treat a missing terminal event as one of: (a) the loom did not fail, (b) the loom failed with a kind not in the always-log set, (c) an obligation-4 violation. There is no in-band signal that distinguishes (a) from (c).

2. **In `spec.md` obligation 4** — append one sentence after "…and emits no diagnostic on violation":

   > Violations may manifest as silent value corruption, runtime panics with arbitrary messages, or unhandled host-process exceptions; the runtime makes no guarantee about which, and no entry of the always-log set is guaranteed to fire on a violation (see [Pi Integration Contract — Runtime event channel](./spec_topics/pi-integration-contract.md)).

3. **In `spec_topics/runtime-value-model.md`** — add one sentence at the top of the page, before the value-representation table:

   > Every rule on this page is contingent on [Host runtime obligation 4](../spec.md#orientation) (non-checked); a host that violates it produces undefined behaviour with no in-band signal.

4. **In `plan_topics/v18-cancellation.md` V18q** — extend the `Adds.` prose to read "…assumes obligation 4 holds; tests MUST NOT synthesise obligation-4 violations and assert on emission shape."

Edge cases the implementer must watch:
- Do not introduce a probe for obligation 4 — the spec is explicit that this is a non-checked invariant, and Object.is / IEEE-754 / `Map` semantics are not finitely probable in the way Step 0 (a)–(c) are.
- Do not retitle `loom/runtime/internal-error` as an "obligation-4 surface"; it is the runtime-defect surface that *happens* to absorb some obligation-4 manifestations as throws. The cross-reference is best-effort, not a contract.
- Keep the new clause in PIC's Runtime event channel section, not in `runtime-value-model.md` — the always-log preamble is the document that asserts the contract being qualified, and qualifications belong adjacent to the assertions they qualify.

## Related Findings

- "Obligation 4 misplaced — belongs in implementation notes or runtime value model" — decision-dependency (if obligation 4 moves to `runtime-value-model.md` or `implementation-notes.md`, the cross-link from PIC's Runtime event channel preamble must point at the new home; the carve-out clause itself stays in PIC either way)
- "Obligation 4 contradicts its own 'no normative weight' preamble" — same-cluster (both touch the normative status of obligation 4; if a stable REQ-ID like `HOST-4` is assigned, both clauses cite it instead of the ordinal "obligation 4")
- "Node.js–only assumption contradicts 'JavaScript engine' generalization in obligation 4" — same-cluster (also rooted in obligation 4 but resolves independently — engine-scope ≠ manifestation-bound)

---

# Obligation 4 belongs in the runtime value model, not the host-runtime aggregator

**Original heading:** Obligation 4 misplaced — belongs in implementation notes or runtime value model
**Kind:** placement

## Finding

The "Host runtime" aggregator in `spec.md` (Orientation → Prerequisites) groups four bullets under a single rubric, yet bullet 4 is structurally unlike its siblings. Obligations 1–3 (Node version floor, `AbortSignal`/`AbortController` shape, Pi SDK named-capability surface) are all *operator-observable host preconditions*: each forward-links to [Pi Integration Contract — Step 0 (Capability probe)](../spec_topics/pi-integration-contract.md#entry-capability-probe), each has a `details.kind` discriminator, and each emits `loom/load/host-incompatible` on detected absence. Obligation 4 ("JavaScript engine value model") asserts an unchecked invariant about IEEE-754 numbers, native `Map`/`Set`, native `JSON.stringify`, and `Object.is` semantics. There is no probe, no diagnostic, and no refusal path — the aggregator preamble itself concedes obligation 4 "is a non-checked invariant by design."

The substantive content of bullet 4 — what the value model actually assumes about the engine — already has a natural home in [Runtime Value Model](../spec_topics/runtime-value-model.md), which already cites IEEE-754 division semantics, `Object.is`-based primitive equality, and `JSON.stringify` of enum values. The aggregator carries a duplicate, less-detailed restatement that is not a host *precondition* in the operational sense the section title implies. Co-locating it with the three checked obligations causes implementers and reviewers to misread the surface: a reader scanning the four bullets reasonably expects four parallel detection / refusal contracts.

The placement also forces a contradiction the aggregator preamble tries to paper over with the "ordinal labels are kept for citation continuity but no longer carry normative weight on this page" carve-out — a carve-out that would not be needed if the value-model assumption lived where the rest of the value model lives.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Host runtime (edited; delete bullet 4, revise the preamble's "four host preconditions" framing to three, replace bullet 4 with a single forward-link sentence)
- `spec_topics/runtime-value-model.md` — new top-level subsection "JavaScript engine assumptions" (edited; receives the migrated content)
- `spec_topics/governance.md` — GOV-12 (edited; the lock-step enumeration explicitly cites "the four Host runtime obligations" and must be updated to three when the migration lands)
- `spec_topics/implementation-notes.md` — Runtime (read-only; consulted to confirm it is not the right home — that page covers parser/runtime mechanics, not value semantics)
- `spec_topics/cancellation.md` — (read-only; bullet 4 currently cross-links here for `AbortSignal` semantics, but those are already obligation 2's territory; verify nothing breaks when bullet 4 is removed)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

(Obligation 4 is explicitly a non-checked invariant. No leaf in `plan.md` or `plan_topics/` anchors on it; H1's `engines.node` literal-read test pins obligation 1 only. The migration is a documentation move with no test or code consequence.)

## Consequence

**Severity:** low

Implementers can ship a correct runtime regardless of where bullet 4 lives — there is nothing to detect or refuse. The cost is reviewer and reader friction: the bullet's presence in a list of operator-observable preconditions invites repeated review-time challenges ("why is this not probed?", "what diagnostic fires?"), and the preamble's normative-weight carve-out exists primarily to defend the placement. Three of the four sibling findings on this same heading in the source review are downstream of the misplacement.

## Solution Space

**Shape:** single

### Recommendation

Move the substantive content of obligation 4 into a new top-level subsection of `spec_topics/runtime-value-model.md` titled **"JavaScript engine assumptions"** (placed immediately after the existing equality / wire-name material, before any sub-anchors that other pages already link to — verify with `grep -rn 'runtime-value-model.md#' spec_topics/ plan_topics/ plan.md` before choosing the exact insertion point so existing fragment links remain valid). The migrated subsection states the four engine assumptions verbatim (IEEE-754 numbers, native `Map`/`Set`, native `JSON.stringify`, `Object.is`-based primitive equality), the unchecked-invariant disposition, and the no-feature-detect / no-polyfill / no-diagnostic clauses.

In `spec.md`:

- Delete bullet 4 outright.
- Revise the Host-runtime preamble: change "under four host preconditions" to "under three host preconditions" and remove the sentence beginning "Obligation 4 (the JavaScript engine value model) is a non-checked invariant by design." The "ordinal labels are kept for citation continuity … but no longer carry normative weight on this page" carve-out can be deleted as well — with bullet 4 gone, the remaining three bullets are uniformly orientation-around-PIC and the carve-out has no remaining work to do.
- Append one new sentence at the end of the preamble: *"Engine-level value-model assumptions (IEEE-754, native `Map`/`Set`, native `JSON.stringify`, `Object.is` equality) are not host preconditions in the probed sense; see [Runtime Value Model — JavaScript engine assumptions](./spec_topics/runtime-value-model.md#javascript-engine-assumptions)."*

In `spec_topics/governance.md` GOV-12: change "the four Host runtime obligations" to "the three Host runtime obligations" in the aggregator-enumeration sentence. This is the same commit per GOV-12's own lock-step rule.

Edge cases the implementer must watch:

- Any page (notably the source review file itself) that cites "Host runtime obligation 4" by ordinal becomes a dangling reference. Run `grep -rn 'obligation 4\|Host runtime obligation' spec.md spec_topics/ plan.md plan_topics/` and update each hit to the new anchor; review files under `docs/reviews/` are historical artefacts and MUST NOT be edited.
- The new anchor must use a stable slug. Use the GitHub-style slug `javascript-engine-assumptions` and assert it via the same `grep` after the edit.
- The `cancellation.md` cross-link currently bundled into bullet 4 has no surviving anchor; verify by `grep -n 'cancellation' spec_topics/runtime-value-model.md` whether the migrated subsection needs to retain the cross-link, and drop it if cancellation has no value-model claim of its own.

## Related Findings

- "Node.js–only assumption contradicts \"JavaScript engine\" generalization in obligation 4" — co-resolve (the migrated subsection in `runtime-value-model.md` is the natural place to disambiguate Node-specific vs. generic-JS assumptions; resolving placement first reframes that finding as "name the engines this contract applies to")
- "Obligation 4 contradicts its own \"no normative weight\" preamble" — co-resolve (the recommended preamble revision here deletes the contradictory carve-out as a side effect; once bullet 4 is gone, the preamble no longer needs to disclaim its own ordinal labels)
- "Obligation 4 \"undefined behaviour\" manifestations unbounded" — decision-dependency (the "undefined behaviour" clause must follow obligation 4 to its new home; the unboundedness fix can then be drafted in `runtime-value-model.md` rather than wedged into the host-runtime aggregator)

## spec.md — Orientation → Scope → Source-language stability

---

# Source-language stability bullet conflates four clarity problems

**Original heading:** Vague modals, contradictory tone, and ambiguous pronoun — all in the same requirement
**Kind:** clarity, assumptions

## Finding

The Source-language stability bullet at `spec.md:47` packs four distinct comprehension defects into a single sentence that opens the bullet:

1. **Vague modal.** "A `.loom` or `.warp` file that loads cleanly under V1.0 *is intended to* load and behave identically under every V1.x release." `is intended to` is not one of the RFC-2119 modals the rest of the spec uses (`MUST`, `SHOULD`, `MAY`). A reviewer cannot tell whether this is a normative obligation, a non-normative aspiration, or commentary; that distinction matters because the next clause then describes the absence of any test for it.

2. **Internal contradiction.** "Equivalence … is a release-process aspiration *enforced* by review, not by a fixture suite." An aspiration that is enforced is no longer an aspiration — it is a release criterion verified manually. The wording leaves it unclear whether failing the manual review blocks the release.

3. **Ambiguous referent.** "V1.0 ships *without* a mechanical regression gate for **this property**." `this property` could mean "loads cleanly," "loads-and-behaves-identically," or "behaves identically given that it loads cleanly." Each interpretation describes a different gate.

4. **Unspecified observables.** "Behave identically" is never decomposed. The spec elsewhere distinguishes return values, diagnostic batches, ordered system-note codes, content strings, timing, and token counts. A reviewer auditing equivalence between two V1.x releases has no anchor for which of those count.

The remaining sentences in the bullet (GOV-8 lifecycle prose, deferred-conformance-suite detail, `SHOULD NOT re-raise` reviewer directive) compound the readability problem but are the subject of separate findings; this finding is scoped to the lead sentence and the equivalence claim it makes.

## Spec Documents

- `spec.md` — Orientation → Scope → Source-language stability bullet (edited)
- `spec_topics/governance.md` — GOV-8 REQ-ID lifecycle (read-only; cited by the bullet)
- `spec_topics/future-considerations.md` — Known V1 limitations → "No formal source-language migration mechanism" (read-only; mirrors the equivalence claim and back-links to this bullet)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. Source-language stability is a release-governance statement; no leaf implements it, no leaf tests it (the bullet itself disclaims a mechanical gate), and no leaf is blocked by its rewording. `grep -rn 'source-language stability\|behave identically\|equivalence' plan.md plan_topics/` returns zero hits.

## Consequence

**Severity:** low

Two reviewers comparing a V1.0 build to a V1.x candidate would reasonably disagree on what `behave identically` covers (return values only? plus diagnostic codes? plus token counts?) and on whether a divergence is grounds to block the release. No implementer action is blocked, but the manual review process the bullet relies on is itself underspecified.

## Solution Space

**Shape:** single

### Recommendation

Replace the lead clause and equivalence-scope clause of the Source-language stability bullet with normatively-modalled prose that names the observables explicitly and the exclusions explicitly. Suggested wording:

> **Source-language stability.** A `.loom` or `.warp` file that loads cleanly under V1.0 **SHOULD** load under every V1.x release and produce, for any given input, identical (a) return values, (b) ordered diagnostic-code sequences, and (c) `loom-system-note` content strings. Wall-clock timing, token counts, and log-line volume are explicitly excluded from the equivalence claim. V1.0 ships without an automated equivalence gate; conformance is a release-time responsibility verified by reviewer inspection of the diff against the prior V1.x release. […remaining sentences about GOV-8, the reviewer directive, and the deferred conformance suite are the subjects of their own findings and should be addressed in concert.]

Edge cases the implementer must watch:

- The `SHOULD` is deliberate. `MUST` would imply a blocking mechanical gate that V1.0 does not have; `MAY` would be too weak to give downstream consumers any planning value. The release-time-review clause is what makes the `SHOULD` actionable.
- The (a)/(b)/(c) enumeration must use the same vocabulary as the deferred conformance fixture suite described later in the bullet so the manual gate today and the mechanical gate later test the same property. If the conformance-suite forward-link is rewritten (per the sibling cruft finding), the observables list MUST stay verbatim across both sites.
- The exclusions list (timing, token counts, log volume) is intentionally absolute. Any future leaf that would need to assert equivalence on one of those observables (e.g. a token-budget regression test) is out of scope of source-language stability and belongs under a separate guarantee.
- The `intended to` phrasing must be removed wherever it appears, including the back-link in `spec_topics/future-considerations.md` line 92's surrounding paragraph if it inherits the same modal.

## Related Findings

- "No mechanical regression gate — source-language stability is untestable" — decision-dependency (the modal chosen here — `SHOULD` vs. `MUST` — determines whether a frozen-corpus fixture suite is required or merely advisory; resolve this finding first)
- "Reviewer SHOULD NOT directive belongs in governance, not in spec body" — co-resolve (the recommended rewrite drops the reviewer-facing sentence)
- "GOV-8 bookkeeping description is editorial cruft" — co-resolve (the rewrite excises the GOV-8 bookkeeping prose from the same bullet)
- "Future conformance suite detail too verbose inline" — co-resolve (the rewrite reduces the deferred-suite paragraph to a forward-link)
- "Four distinct obligations in one unIDed bullet" — same-cluster (splitting the bullet into REQ-IDed atoms is complementary to clarifying its language; either ordering works, but doing both in one edit is cheaper)

---

# Source-language stability bullet conflates four obligations under one unidentified marker

**Original heading:** Four distinct obligations in one unIDed bullet
**Kind:** traceability

## Finding

The `Source-language stability` bullet under [`spec.md` — Orientation → Scope](../../../../spec.md#scope) packs four independently-verifiable obligations into a single un-anchored prose paragraph:

1. **A behavioural compatibility promise** — V1.x releases load and behave identically on V1.0-clean source.
2. **A scope disclaimer** — V1.0 ships without a mechanical regression gate for that promise.
3. **A bookkeeping rule** — `GOV-8`'s REQ-ID lifecycle (split / merge / deletion-plus-add) is the discipline that keeps substantive edits visible to release review, and is *not* a behaviour-equivalence proof.
4. **A reviewer directive** — reviews of `spec.md` SHOULD NOT re-raise the absence of a mechanical gate as a V1.0 correctness finding.

Each is independently true-or-false and independently citable. A reviewer who agrees with (1) but objects to (2) — or who treats (4) as overreach — has no per-obligation handle to point at; the bullet has no REQ-ID and no sub-anchor. Worse, three of the four obligations are *already* canonically owned elsewhere — (2) and (4) by the GOV-8 scope note in [`spec_topics/governance.md`](../../../../spec_topics/governance.md), and the long-term migration framing of (1) by [`spec_topics/future-considerations.md` — No formal source-language migration mechanism](../../../../spec_topics/future-considerations.md). The spec.md bullet restates them as one undifferentiated paragraph rather than enumerating forward-links to the owning anchors, contrary to the GOV-12 aggregator pattern that governs the other three Scope bullets.

The defect is traceability and authority-of-source: a reviewer cannot record a partial pass/fail, and edits to the canonical owners (governance.md, future-considerations.md) drift silently against the aggregator paragraph because there is nothing structural to align against.

## Spec Documents

- `spec.md` — Orientation → Scope → Source-language stability (edited)
- `spec_topics/governance.md` — GOV-8 + scope note, GOV-12, REQ-ID prefix table (edited)
- `spec_topics/future-considerations.md` — "No formal source-language migration mechanism for major-version transitions" (edited)
- `plan_topics/h6-req-ids.md` — REQ-ID anchor pass (read-only; informs whether new IDs land mechanically)

## Plan Impact

**Phases:** Horizontal

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)

H6 is the leaf that mints `GOV-N` anchors on `governance.md`. Splitting the GOV-8 scope note into two or three discrete IDed obligations (so reviewers can cite obligations 2–4 individually) falls within H6's pass; the leaf already enumerates what counts as a "normative obligation" per page. No other plan leaf changes — the spec.md aggregator itself acquires no IDs (per GOV-12) and no leaf currently has acceptance criteria that grep this bullet.

## Consequence

**Severity:** low

Implementers can ship V1 unaffected — the bullet expresses intent, not runtime behaviour. The cost is paid by the spec corpus's own review and maintenance loop: reviewers cannot record per-obligation pass/fail, GOV-12 lock-step drift is undetectable because there is nothing structural to align against, and a future spec edit that wants to retire (4) (the reviewer directive) without disturbing (1)–(3) cannot do so cleanly.

## Solution Space

**Shape:** single

### Recommendation

Reduce the `Source-language stability` bullet in `spec.md` to a GOV-12-shaped aggregator: one short sentence stating the V1.x-equivalence intent, followed by forward-links to the owning anchors. Move the substance to those owners and assign per-obligation IDs there.

Concretely:

1. **In `spec_topics/governance.md`** — promote the existing non-normative *Scope note* under GOV-8 into one or two normative items with discrete IDs (numbering follows the dense-per-page rule of GOV-1). Suggested split:
   - **`GOV-N` (no V1.0 mechanical gate).** "V1.0 ships without a mechanical regression gate for V1.x source-language equivalence; equivalence between two V1.x releases is a release-process aspiration enforced by review. A conformance fixture suite is a recognised post-V1.0 follow-up; see [Future Considerations](./future-considerations.md)."
   - **`GOV-N+1` (review posture).** "Reviews of `spec.md` SHOULD NOT cite GOV-8 as a substitute for the gate above and SHOULD NOT re-raise its absence as a V1.0 correctness finding."

2. **In `spec_topics/future-considerations.md`** — keep the existing "No formal source-language migration mechanism…" entry as the home for obligation (1)'s long-term framing; ensure its body explicitly states the V1.x compatibility promise (currently it does, in the second sentence). No new ID needed — the page is `(no IDs — narrative)` per the prefix table and a section-level anchor satisfies GOV-9.

3. **In `spec.md`** — replace the existing bullet with:

   > **Source-language stability.** A `.loom` or `.warp` file that loads cleanly under V1.0 SHOULD load and behave identically under every V1.x release. The V1.0 review-vs-mechanical-gate posture is owned by [Governance — `GOV-N` / `GOV-N+1`](./spec_topics/governance.md); the long-term migration framing and the deferred conformance fixture suite are owned by [Future Considerations — No formal source-language migration mechanism](./spec_topics/future-considerations.md). Migration across major versions is out of V1 scope.

   This shape mirrors the other three Scope bullets (each is a one-sentence claim plus forward-links) and brings the paragraph into conformance with GOV-12.

**Edge cases for the implementer:**

- Do **not** mint a `COMPAT-N` prefix in `spec.md` itself — GOV-12 forbids `spec.md` from carrying any per-page REQ-ID. The IDs land on `governance.md` (and future-considerations.md if it is later promoted out of narrative status, which is *not* required by this fix).
- Land the `governance.md` GOV-8 scope-note promotion and the `spec.md` rewrite in the **same commit** — under GOV-12 the aggregator and its sources move in lock-step.
- The H6 anchor pass already inserts `GOV-N` markers in dense order; the new IDs simply append to the existing GOV-1..GOV-12 sequence, and this finding's commit is what introduces them (it predates H6 in the project's editorial timeline only if scheduled before H6 closes, otherwise H6 picks them up automatically).
- Verify the V18s prefix-table parser still passes after the promotion: `governance.md`'s row in the prefix table already carries the `GOV` prefix, so adding GOV-13 / GOV-14 introduces no new prefix and no V18s gate moves.

## Related Findings

- "Vague modals, contradictory tone, and ambiguous pronoun — all in the same requirement" — co-resolve (clarifying the modals is part of the same rewrite)
- "No mechanical regression gate — source-language stability is untestable" — co-resolve (the no-gate disclaimer becomes its own GOV-N item)
- "Reviewer SHOULD NOT directive belongs in governance, not in spec body" — co-resolve (this is exactly the (4)→governance move)
- "GOV-8 bookkeeping description is editorial cruft" — co-resolve (the GOV-8 cross-reference disappears from the spec.md bullet entirely)
- "Future conformance suite detail too verbose inline" — co-resolve (the conformance-suite sentence collapses into a forward-link)

## spec.md — Orientation → Scope → Trust boundary

---

# Trust-boundary bullet mis-frames Pi's privilege grant and the `tools:` allowlist

**Original heading:** Pi privilege model undefined; allowlist enforceability as security boundary unverified
**Kind:** assumptions

## Finding

The Scope → Trust boundary bullet in `spec.md` (line 45) makes two claims that, taken at face value, overstate the security guarantees V1 actually offers.

First, "filesystem, network, and Pi-API access are bounded only by what Pi grants to extensions" implies Pi enforces a per-extension privilege grant (sandbox, capability scoping, or similar). The bullet cites no Pi document or contract for this grant, and the [Pi Integration Contract](spec_topics/pi-integration-contract.md) describes Pi extensions running inside the host Node process with no in-process isolation surface — `pi.registerTool`, `pi.setActiveTools`, `createAgentSession`, and the file-watcher callbacks all execute at full host-process privilege. If there is no Pi-side privilege boundary, "bounded only by what Pi grants" is a no-op clause that reads as a security guarantee.

Second, the same bullet treats the per-loom `tools:` allowlist as a trust-boundary element ("bounded only by … the per-loom `tools:` allowlist"). The allowlist is a configuration knob declaring which callables the loom's *model* sees during query tool-call loops, enforced mechanically per-mode by [PIC — Tool-registration lifetime and visibility](spec_topics/pi-integration-contract.md) (subagent: explicit `tools` array on `createAgentSession`; prompt: snapshot/restore around `pi.setActiveTools`). That is a real invariant, but it constrains the model's reach, not the host process: a loom that declares `tools: [bash]` exposes the full host shell to the model. Treating the allowlist as a security boundary in the trust-boundary bullet — without forward-linking to the PIC mediation rule, and without distinguishing "the model cannot call X" from "X cannot reach the host" — invites the reader to conclude that V1 sandboxes loom code, which it does not.

The companion entry under [Future Considerations — No per-loom sandbox or capability model](spec_topics/future-considerations.md) repeats the same framing, so the gap propagates.

## Spec Documents

- `spec.md` — Orientation → Scope → Trust boundary (edited)
- `spec_topics/future-considerations.md` — Known V1 limitations → No per-loom sandbox or capability model (edited)
- `spec_topics/pi-integration-contract.md` — Tool-registration lifetime and visibility (read-only; the mediation invariant the rewritten bullet should forward-link)
- `spec_topics/frontmatter.md` — `tools:` (read-only; "ambient tools are not inherited" invariant the rewritten bullet should forward-link)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. V14d (per-mode `tools:` wiring) and V14j (`tools: []` ≡ absent; ambient-not-inherited) already encode the mediation invariant mechanically; their acceptance criteria do not change. The fix is narrative re-framing in `spec.md` plus a forward-link, not a mechanism change.

## Consequence

**Severity:** medium

V1 deliberately ships without a loom-level sandbox, so no observer behaviour is wrong. The risk is that operators, security reviewers, and downstream extension authors read the trust-boundary bullet as promising a Pi-enforced per-extension boundary and an allowlist-as-sandbox, and deploy looms (or grant Pi extension permissions) on that mistaken model. The mismatch surfaces only when a loom declares a high-privilege callable like `bash` and the operator assumed the allowlist contained the blast radius.

## Solution Space

**Shape:** single

### Recommendation

Rewrite the Scope → Trust boundary bullet in `spec.md` to (a) state the privilege model unambiguously and (b) move the allowlist out of the trust-boundary framing. Concrete edit:

> **Trust boundary.** V1 looms execute inside the Pi extension-host process at full Node host-process privilege. V1 imposes no loom-level sandbox: filesystem, network, and Pi-API access available to loom code and to its declared callables are exactly those available to any Pi extension running in the same process — Pi exposes no per-extension privilege scoping that the runtime can rely on as a security boundary. The per-loom `tools:` allowlist is a configuration knob over the *model's* reachable callable set, not a host-process sandbox: it is enforced mechanically by the per-mode wiring rule in [Pi Integration Contract — Tool-registration lifetime and visibility](spec_topics/pi-integration-contract.md) (subagent mode: explicit `tools` array on `createAgentSession`; prompt mode: `pi.setActiveTools` snapshot/restore around each query), and the "ambient Pi tools are not inherited" invariant in [Parameters and Frontmatter — `tools`](spec_topics/frontmatter.md) follows from the same wiring. A loom that declares a high-privilege callable (e.g. `bash`) exposes the full underlying capability of that callable to its model. A future per-loom capability model is **out of scope for V1**; see [Future Considerations](spec_topics/future-considerations.md).

Then mirror the privilege-model statement in `future-considerations.md` (drop "bounded only by Pi's own extension permissions" — replace with "Pi exposes no per-extension privilege scoping in V1; loom code runs at full host-process privilege"), and keep the allowlist mention there as a configuration note rather than a bound.

Edge cases the implementer must watch:

- The forward-link to PIC's "Tool-registration lifetime and visibility" must remain stable across the `tools` / `callable set` terminology cleanup tracked elsewhere in this review — the section heading is the link target, not a glossary term.
- Do not promise a Pi-side privilege grant by inference. If a future Pi version adds extension permission scoping, that is a Pi Integration Contract update (and a re-validation gate per `sdk-cap-peer-dep-revalidation`), not a V1 spec edit.
- The companion finding "No-sandbox normative rule sits in an 'informative' unIDed bullet" wants this same bullet to carry a REQ-ID; that REQ-ID assignment must apply to the rewritten text, not the current text.

## Related Findings

- "No-sandbox normative rule sits in an 'informative' unIDed bullet" — co-resolve (same bullet; the rewrite must carry the REQ-ID that finding requires)
- "'A future per-loom capability model is not in V1' conflates non-existence with deferral" — co-resolve (same bullet; the recommended rewrite folds in the "out of scope for V1" framing)
- "Default callable set when `tools:` is absent or empty is unspecified" — same-cluster (same bullet; the rewrite forward-links the frontmatter rule that already specifies the default, closing the gap from the trust-boundary side)
- "Error surface for Pi-side access denials unspecified" — same-cluster (same bullet; the rewrite makes Pi's lack of a privilege boundary explicit, which informs how denials should be framed)
- "'Looms do not write files' — scope ambiguous, conflicts with trust boundary" — decision-dependency (the rewritten privilege-model statement is the anchor that "looms do not write files" must be reconciled against)
- "`callable set` vs `tools: allowlist` — two names for one concept" — co-resolve (the rewrite explicitly distinguishes "allowlist as configuration knob over the callable set" from "allowlist as security boundary," advancing the terminology cleanup)

---

# Trust-boundary scope sentence promises a "future" capability model that future-considerations.md disclaims

**Original heading:** "A future per-loom capability model is not in V1" conflates non-existence with deferral
**Kind:** clarity

## Finding

The Trust-boundary bullet in `spec.md` §Orientation → Scope closes with: *"A future per-loom capability model is not in V1; see [Future Considerations]."* Read literally, "future … model is not in V1" presupposes the existence of a planned-but-deferred capability model and says only that V1 does not contain it — i.e. it reads as a soft commitment that some V2 will ship one.

That reading contradicts the page being forward-linked. `spec_topics/future-considerations.md` §"Known V1 limitations (no seam expected)" says: *"A future per-loom capability model **is not anticipated by V1 and will require a migration**."* The owning page explicitly disclaims any V1-side promise that one is coming, and classifies the absence as a known limitation with no expected seam — not a deferred feature.

The two sentences are also a forward-link pair (the orientation bullet is informative; the future-considerations bullet is the recorded-at target), so the wording mismatch is locally inconsistent in addition to being ambiguous on its own.

## Spec Documents

- `spec.md` — Orientation → Scope → Trust boundary (edited)
- `spec_topics/future-considerations.md` — Known V1 limitations (no seam expected) (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None

(The Trust-boundary bullet is informative orientation prose with no REQ-ID; `future-considerations.md` is a pure-narrative page excluded from the coverage matrix and from the H6 REQ-ID anchor pass. No leaf currently owns either text.)

## Consequence

**Severity:** low

A reader of the orientation bullet alone walks away believing V1 has soft-committed to a future capability model, then encounters the opposite stance on the page they are forward-linked to. The mismatch is unlikely to mislead an implementer into wrong code, but it weakens the scope disclaimer's load-bearing function: the bullet is meant to be one of four cross-cutting V1 dispositions a reviewer can rely on without reading the topic page.

## Solution Space

**Shape:** single

### Recommendation

In `spec.md` §Orientation → Scope, replace the trailing sentence of the Trust-boundary bullet with wording that matches `future-considerations.md`'s stance:

> A per-loom capability model is **out of scope for V1** and is not anticipated by V1; introducing one would require a migration. See [Future Considerations](./spec_topics/future-considerations.md).

Notes for the implementer:

- Keep the forward link target unchanged — it already points at the section that owns the disclaimer.
- Do not edit `future-considerations.md`; its phrasing is the authority and is already correct. The fix is one-directional: align `spec.md` to `future-considerations.md`.
- Do not introduce a REQ-ID here. The bullet is informative orientation by design (the section header note marks all four cross-cutting bullets as informative). REQ-ID assignment for the no-sandbox guarantee is a separate finding's concern.
- Preserve the parenthetical link to `pi-integration-contract.md` earlier in the same bullet; only the trailing capability-model sentence changes.

## Related Findings

- "Pi privilege model undefined; allowlist enforceability as security boundary unverified" — same-cluster (same Trust-boundary bullet, different concern: privilege model rather than wording of the capability-model disclaimer)
- "No-sandbox normative rule sits in an "informative" unIDed bullet" — same-cluster (same bullet; that finding asks whether the no-sandbox guarantee should be normative with a REQ-ID, which is orthogonal to fixing the capability-model wording)
- "Default callable set when `tools:` is absent or empty is unspecified" — same-cluster (same bullet, different gap)
- "Error surface for Pi-side access denials unspecified" — same-cluster (same bullet, different gap)

---

# `spec.md` Trust-boundary bullet asserts the no-sandbox guarantee with no citable owner

**Original heading:** No-sandbox normative rule sits in an "informative" unIDed bullet
**Kind:** traceability, placement

## Finding

The Trust-boundary bullet under `spec.md` → Scope reads "V1 imposes no loom-level sandbox: filesystem, network, and Pi-API access are bounded only by what Pi grants to extensions and by the per-loom `tools:` allowlist." Per `spec_topics/governance.md` GOV-12, every `spec.md` aggregator paragraph is informative orientation and the normative obligation it appears to state must be owned by a topic page that the bullet forward-links to. The bullet honours that pattern for the `tools:` allowlist half of the sentence — it links to `pi-integration-contract.md` → *Tool-registration lifetime and visibility*, where the "ambient Pi tools NOT inherited" invariant is normatively pinned alongside the explicit-allowlist mechanism that enforces it.

The no-sandbox half of the sentence has no comparable owner. The only downstream record is `future-considerations.md` → *Known V1 limitations (no seam expected)* → "**No per-loom sandbox or capability model.**" That page is registered `(no IDs — narrative)` in the GOV-3 prefix table, so the bullet carries no `**PREFIX-N.**` anchor a reviewer could cite, no row in `plan_topics/coverage-matrix.md`, and no closing leaf the V18s coverage-matrix gate can witness. Compounding the gap, the spec.md bullet's link to `future-considerations.md` is page-level rather than section-level — even GOV-9's narrative-page allowance for section-level cross-links is not exercised. A future V1.x release that quietly interposed a sandbox or privilege-mediation layer would violate the disclaimer, but the violation could not be cited against any anchored requirement.

The "this paragraph is informative" framing combined with the absence of an anchored normative owner is the actual defect — not the use of one bullet to cover several items, and not GOV-12 itself, which is the design the rest of the corpus deliberately follows.

## Spec Documents

- `spec.md` — Scope → Trust boundary (edited)
- `spec_topics/future-considerations.md` — Known V1 limitations (no seam expected) → "No per-loom sandbox or capability model" (edited)
- `spec_topics/pi-integration-contract.md` — Tool-registration lifetime and visibility (option-dependent)
- `spec_topics/governance.md` — GOV-3 prefix table, GOV-9, GOV-12 (read-only)
- `plan_topics/coverage-matrix.md` — Pi Integration Contract row (option-dependent)

## Plan Impact

**Phases:** Horizontal, Vertical V12, Vertical V14, Vertical V18

**Leaves (implementation order):**

- H4 — Pi extension shell — (option-dependent; candidate closing leaf for a promoted PIC-N rule under Option A — already maps to *Tool-registration lifetime and visibility* in the coverage matrix)
- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (option-dependent; under Option A the new PIC-N anchor is inserted by H6's pass and the coverage-matrix row is rewritten)
- V12a — Subagent mode — (option-dependent; co-closer for a promoted PIC-N rule)
- V14a–V14j — Tool calls and discovery — (option-dependent; co-closers for a promoted PIC-N rule, since the `tools:` allowlist enforcement lives here)
- V18s — Coverage-matrix closing CI gate — (option-dependent; under Option A V18s witnesses the new row; under Option B nothing changes)

## Consequence

**Severity:** low

A future loom-runtime change that interposed access mediation beyond the declared `tools:` allowlist would violate the disclaimer, but no V18s gate would catch it and no test fixture would regress. The substantive runtime invariant (the explicit allowlist suppresses Pi's default built-ins; ambient tools are not inherited) is independently anchored under `pi-integration-contract.md` and is exercisable through the V14 leaves, so the gap is in the standalone "no sandbox" guarantee — a reviewer-facing traceability defect rather than a correctness one.

## Solution Space

**Shape:** multiple

### Option A — Promote the no-sandbox guarantee to a PIC-N rule under *Tool-registration lifetime and visibility*

**Approach.** Add a normative paragraph to `spec_topics/pi-integration-contract.md` → *Tool-registration lifetime and visibility* (numbered as the next free `PIC-N` per H6's anchor pass, or inserted with the dual-form anchor if the new rule lands before H6) of the form: "The runtime interposes no privilege layer between loom code and the Pi extension host. Loom-side filesystem, network, and Pi-API access are bounded only by Pi's extension-host grants and by the per-loom `tools:` allowlist whose enforcement is specified above. The runtime MUST NOT introduce additional access channels (sandbox, capability filter, mediated proxy) in any V1.x release; widening or narrowing this rule is a major-version concern." Replace the spec.md Trust-boundary bullet's "V1 imposes no loom-level sandbox" sentence with a forward-link to the new `#pic-n` anchor, beside the existing `tools:`-allowlist link. Trim `future-considerations.md` → "No per-loom sandbox or capability model" to a back-reference to the same anchor (it currently duplicates the same claim).

**Spec edits.**
- `spec_topics/pi-integration-contract.md`: insert one `**PIC-N.**`-anchored paragraph in the *Tool-registration lifetime and visibility* subsection (post-H6 form: inline marker; pre-H6: prose paragraph that H6 will then anchor).
- `spec.md`: rewrite the Trust-boundary bullet to forward-link both halves of its sentence to anchored topic-page rules, dropping the page-level link to `future-considerations.md`.
- `spec_topics/future-considerations.md`: shorten the "No per-loom sandbox or capability model" bullet to a one-line back-reference to the new PIC anchor, preserving the *Recorded at* line.
- `plan_topics/coverage-matrix.md`: post-H6, the new PIC-N appears as its own row mapping to {H4, V12a, V14a–V14j} (the existing closing-leaf set for *Tool-registration lifetime and visibility*); pre-H6, no matrix change.

**Pros.**
- Brings the no-sandbox guarantee into the same governance regime as the rest of the runtime contract: anchored REQ-ID, coverage-matrix row, V18s closure check.
- Reviewers and future contributors get a single citable identifier for "the runtime adds no extra mediation."
- Clarifies that the rule is a runtime obligation, not just a roadmap disclaimer.

**Cons.**
- The paragraph is partly duplicative of the existing "ambient Pi tools NOT inherited" invariant; readers must distinguish "the allowlist enforces what tools the model sees" (existing) from "the runtime interposes nothing else" (new).
- "MUST NOT introduce additional access channels" is hard to test positively; closure under V18s is satisfied by the existing V14 allowlist tests rather than by a dedicated negative-assertion fixture.

**Risks.**
- If the rule is phrased too broadly ("no privilege layer of any kind") it could conflict with future hygiene seams (e.g. a wall-clock deadline injector). Phrase it narrowly around access channels, not behaviour.

### Option B — Keep the rule narrative; tighten the spec.md cross-link to a section anchor

**Approach.** Accept that "V1 ships no sandbox" is a non-feature scope disclaimer of the same shape as "no major-version migration mechanism" — both correctly live as narrative bullets in `future-considerations.md`. Add an HTML section anchor (e.g. `<a id="known-v1-no-sandbox"></a>`) immediately above the existing `**No per-loom sandbox or capability model.**` bullet in `future-considerations.md`. Tighten the spec.md Trust-boundary bullet's link from `./spec_topics/future-considerations.md` to `./spec_topics/future-considerations.md#known-v1-no-sandbox`, satisfying GOV-9's section-level-link requirement for narrative-page cross-references. No REQ-ID, no coverage-matrix row, no V18s gate change.

**Spec edits.**
- `spec_topics/future-considerations.md`: insert one `<a id="…"></a>` anchor above the existing bullet.
- `spec.md`: rewrite the bullet's `[Future Considerations]` link target to include the section fragment.

**Pros.**
- Minimal edit. Respects the deliberate corpus design that V1 non-features are narrative scope disclaimers.
- Avoids inventing a positive runtime obligation whose only test would be "no extra fixture exists."
- Symmetric with the parallel `future-considerations.md` bullet for source-language migration, which is also narrative.

**Cons.**
- Leaves the no-sandbox guarantee uncitable from coverage-matrix and unobservable to V18s; a future regression would still slip past CI.
- "GOV-9 satisfied" is a weak bar — the cross-link is hygienic but the rule still lacks a stable identifier a reviewer can quote in a finding or test name.

**Risks.**
- Locks in the narrative-page status; later promotion to a normative rule then has to argue against the choice made here, with the GOV-7 *Narrative-to-normative promotion* procedure as the cost.

### Recommendation

Option A. The runtime's no-extra-mediation invariant is a substantive promise about V1.x behaviour — not just a roadmap note — and the corpus already routes substantive promises through anchored REQ-IDs. The natural home is `pi-integration-contract.md` → *Tool-registration lifetime and visibility*, which already owns the adjacent "ambient Pi tools NOT inherited" invariant; the closing-leaf set in `plan_topics/coverage-matrix.md` (H4, V12a, V14a–V14j) is the same set that exercises the allowlist mechanism, so V18s closure costs nothing additional. Edge cases for the implementer: (i) phrase the new paragraph as a *channel* obligation ("no additional access channels") rather than a *behaviour* obligation ("never sandbox") so future hygiene seams (deadline injection, observability hooks) are not retroactively forbidden; (ii) ensure the spec.md bullet rewrite preserves both forward-links — to the existing allowlist rule and to the new PIC-N — so neither half of the original sentence loses its owner; (iii) when shortening the `future-considerations.md` bullet to a back-reference, keep the *Recorded at* line so the bidirectional cross-reference remains visible.

## Related Findings

- "Pi privilege model undefined; allowlist enforceability as security boundary unverified" — same-cluster (same Trust-boundary bullet; complementary concern about whether the allowlist is in fact mediated by the runtime)
- ""A future per-loom capability model is not in V1" conflates non-existence with deferral" — same-cluster (same bullet, separate clarity defect on the second half of the same sentence)
- "Default callable set when `tools:` is absent or empty is unspecified" — same-cluster (same bullet; touches the `tools:` allowlist semantics that Option A's PIC-N rule cites)
- "Error surface for Pi-side access denials unspecified" — same-cluster (same bullet; failure-shape gap that any PIC-N edit should at least cross-link)
- "Four distinct obligations in one unIDed bullet" — same-cluster (same `spec.md` Scope section, sibling traceability defect on the source-language-stability bullet; the GOV-12 framing argued here applies symmetrically)
- "Preamble obligations have no REQ-IDs and cannot be individually cited" — same-cluster (same general traceability pattern applied to the Prerequisites preamble)

---

# Trust-boundary bullet names what is bounded but not how denials surface

**Original heading:** Error surface for Pi-side access denials unspecified
**Kind:** error-model

## Finding

The trust-boundary bullet in `spec.md` Orientation → Scope states that filesystem, network, and Pi-API access are bounded by what Pi grants to extensions and by the per-loom `tools:` allowlist, but says nothing about the **observable failure shape** when one of those bounds is hit at runtime (e.g. an `EACCES` from the host, a permission revoked between calls, a Pi-API rate-limit response, or a future sandbox boundary). A reader of the orientation page is left to guess whether such denials surface as a `QueryError` variant, as a runtime panic, as a silent empty value, or never reach loom code at all.

The mechanism is in fact already pinned in the topic pages — every external resource a loom touches reaches Pi through a tool call, and tool execution failures surface as `Err(QueryError { kind: "code_tool", cause: "execution", ... })` per [Tool Calls — Failures](./spec_topics/tool-calls.md) and the lowering rule in [Pi Integration Contract — Tool execution from loom code](./spec_topics/pi-integration-contract.md). What is missing is a one-sentence forward link from the orientation bullet to that surface, so that a reviewer auditing the trust boundary can confirm "denial is observable, not silent" without having to chase the topic pages and reconstruct the chain themselves. The orientation bullets explicitly promise to forward-link the topic page that owns the normative contract for each disposition; this bullet honours the bound side of that promise but not the failure-shape side.

The original framing's mention of "`Err` propagated through `invoke` (sub-loom paths)" is misleading: sub-loom invocation is loom-to-loom, not loom-to-host-resource. A sub-loom that hits a Pi-side denial sees a `CodeToolError` itself; only its `?`-propagation to the parent surfaces as `InvokeCalleeError { inner: CodeToolError }`. The denial site is always a tool call, regardless of nesting.

## Spec Documents

- `spec.md` — Orientation → Scope → Trust boundary (edited)
- `spec_topics/tool-calls.md` — Failures (read-only)
- `spec_topics/pi-integration-contract.md` — Tool execution from loom code (read-only)
- `spec_topics/errors-and-results.md` — `CodeToolError` schema (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The fix is an orientation-bullet edit that forward-links to surfaces already pinned by V14g (`CodeToolError` `execution` cause). No leaf's tests or acceptance criteria change.

## Consequence

**Severity:** low

A reviewer auditing the trust-boundary disposition cannot confirm the failure-observability invariant from the orientation page alone; they must navigate to two topic pages to reconstruct the answer. Implementation behaviour is unaffected — V14g already pins `CodeToolError { cause: "execution" }` for `execute()` throws and `isError: true` returns, which is the channel every Pi-side resource denial flows through. The cost is reviewer time and a small documentation completeness gap, not divergent implementations.

## Solution Space

**Shape:** single

### Recommendation

Append a forward-link sentence to the trust-boundary bullet in `spec.md` Orientation → Scope, in the same informative-orientation register the rest of the bullet uses:

> Host-side denials of filesystem, network, or Pi-API access reach loom code through the tool that issued the request: a thrown or `isError: true` return is mapped to `Err(QueryError { kind: "code_tool", cause: "execution", ... })` per [Tool Calls — Failures](./spec_topics/tool-calls.md) and [Pi Integration Contract — Tool execution from loom code](./spec_topics/pi-integration-contract.md#tool-execution-from-loom-code). Silent success on denial is forbidden.

Edge cases the editor must keep correct:

- Do **not** mention `invoke(...)` as a denial site. `invoke` is loom-to-loom; only the underlying tool call inside the callee sees a denial. A parent that observes `InvokeCalleeError { inner: CodeToolError }` is observing a propagated denial, not a denial that happened at the `invoke` boundary.
- Do **not** widen this orientation bullet to enumerate `CodeToolError` field shapes — those belong on `errors-and-results.md` (schema) and `tool-calls.md` (when each variant fires). The bullet's job is to point at the surface, not to restate it.
- Do **not** introduce a REQ-ID for this addition. The bullet is *informative orientation* per the section header; the normative contract lives in the linked topic pages. (If the sibling finding "No-sandbox normative rule sits in an 'informative' unIDed bullet" is resolved by reclassifying the bullet, this addition can be folded into that reclassification in the same edit.)
- The `tool-calls.md` link is already an existing target; the `pi-integration-contract.md#tool-execution-from-loom-code` anchor must be added to that page's heading if not already present (it is currently a bold paragraph header without an explicit anchor).

## Related Findings

- "Pi privilege model undefined; allowlist enforceability as security boundary unverified" — same-cluster (same trust-boundary bullet; addresses the *bound* side, this finding addresses the *failure-shape* side)
- "No-sandbox normative rule sits in an 'informative' unIDed bullet" — decision-dependency (if the bullet is reclassified as normative with a REQ-ID, this addition is folded into the same edit)
- "Default callable set when `tools:` is absent or empty is unspecified" — same-cluster (adjacent gap in the same bullet; resolves independently)
- "A future per-loom capability model is not in V1 conflates non-existence with deferral" — same-cluster (same bullet; resolves independently)
- "Failure-cause → caller-surface mapping absent for panic and limit-exceeded" — same-cluster (analogous gap on a different orientation bullet — failure-shape orientation missing for panics and ceiling breaches)

## spec.md — Orientation → Scope → Runtime observability

---

# "operator" and "always-log set" used as terms-of-art without glossary anchors

**Original heading:** "Operator-facing" undefined; "always-log set" undefined with no glossary entry
**Kind:** clarity, naming

## Finding

The Runtime-observability bullet in `spec.md` (Orientation → Scope) leans on two terms that the spec treats as load-bearing vocabulary but never grounds:

- *operator* — used as a modifier ("operator-facing runtime failure events") and recurs unmodified across `spec_topics/pi-integration-contract.md` ("the channel is operator-facing", "an operator can manually restore via Pi's `/tools` interface", "user/operator-initiated"). It is never defined. Plausible referents include the human running the Pi TUI, an SRE / log consumer, a programmatic `invoke` caller, or whoever authored the `.loom`. The choice matters because the channel's `display: true / false` policy and the Pi Integration Contract's "channel is operator-facing" sentence both pivot on who the channel is *for*.
- *always-log set* — introduced in the same `spec.md` bullet without italics, bold, or any "term of art" markup. It IS defined further on (`spec_topics/pi-integration-contract.md` line 291, **bold** at the defining site), and the bullet's forward-link points to the right section, but a reader at first encounter has no signal that this is a coined term rather than a casual phrase. Worse, the term is absent from `spec_topics/glossary.md`, which holds entries for `callable set`, `binder`, `respond_repair`, `loom-side name` / `wire name`, etc. — so a reader who consults the index built for exactly this purpose finds nothing and is left to grep.

Both gaps are minor on their own but they sit on the channel that V18q tests are written against, and the V18q acceptance criteria reference "the always-log set" as if it were stable shared vocabulary. A reader new to the spec who tries to decide what "display: false when the user/operator initiated" means in `spec_topics/pi-integration-contract.md` cannot ground the disambiguation in any normative definition.

## Spec Documents

- `spec_topics/glossary.md` — entry list (edited)
- `spec.md` — Orientation → Scope → Runtime observability bullet (edited)
- `spec_topics/pi-integration-contract.md` — Runtime event channel; System notes (edited)
- `spec_topics/diagnostics.md` — read-only (uses "operator" indirectly through channel rendering)
- `spec_topics/future-considerations.md` — read-only (cross-link target)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H4 — Extension shell (`loom-system-note` channel + renderer + `sendSystemNote` helper) — (modified)
- V18q — Runtime event channel and always-log emission — (modified)

(Both leaves use "always-log set" verbatim in their `Tests`/`Adds` text and assume the term is settled. They do not need behavioural changes; they pick up whatever wording the glossary entry settles on.)

## Consequence

**Severity:** low

Two reasonable implementers will not produce divergent runtime behaviour — the channel name, the payload shape, and the `display` flag rules are pinned elsewhere. The cost is review friction and downstream documentation drift: each subsequent reader (and each follow-up review pass) re-litigates "what does operator mean here" and "is `always-log set` a term I missed", which the glossary exists precisely to short-circuit.

## Solution Space

**Shape:** single

### Recommendation

Add two `spec_topics/glossary.md` entries and tighten one `spec.md` sentence.

1. **Glossary — `always-log set`.** Add an entry in alphabetical position (between ``.loom` callable` and `loom (file unit)`):

   > **always-log set** — The closed subset of `QueryError` `kind` values whose runtime occurrence emits exactly one `loom-system-note` event regardless of whether the author matched the `Err`, propagated it via `?`, or discarded it via `let _ =`. The set partitions into group A (routed via `details: { event: RuntimeEvent }`) and group B (routed via `details: { diagnostics: Diagnostic[] }`). The members are enumerated, and the four exclusions (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`) justified, on the canonical page. See: [Pi Integration Contract — Runtime event channel](./pi-integration-contract.md).

2. **Glossary — `operator`.** Add a parallel entry:

   > **operator** — The human running the Pi TUI session that hosts the loom extension. Distinct from the *author* (who wrote the `.loom`), the *caller* (which may be another loom via `invoke(...)` or a Pi prompt-mode user turn), and any downstream log consumer. Spec prose calling a surface "operator-facing" means the surface is rendered into the active TUI session via the `loom-system-note` channel under `display: true`, where the operator can read it without leaving the session. Surfaces emitted under `display: false` are still on the operator's channel but not rendered into their transcript by default. See: [Pi Integration Contract — System notes](./pi-integration-contract.md), [Pi Integration Contract — Runtime event channel](./pi-integration-contract.md).

3. **`spec.md` Orientation → Scope → Runtime observability bullet.** Italicise both terms at first use to mark them as coined and add a glossary forward-link in the same sentence:

   > **Runtime observability.** *Operator*-facing runtime failure events are emitted on the Pi `loom-system-note` channel via the *always-log set* (see [Glossary](./spec_topics/glossary.md)) defined in [Pi Integration Contract — Runtime event channel](./spec_topics/pi-integration-contract.md). …

Edge cases for the implementer:

- The `operator` definition must not contradict `spec_topics/pi-integration-contract.md`'s `display: false` cases, where events are still on the channel but not surfaced in the transcript. The proposed wording handles this by saying surfaces are *rendered into the transcript* under `display: true` and *still on the operator's channel* under `display: false`.
- The `always-log set` definition must not enumerate the members in the glossary entry — that enumeration is canonical only on `pi-integration-contract.md`, and duplicating it would force coupled edits whenever the set changes (currently impossible by spec but a hazard for future revisions). Keep the glossary entry to the *concept* and let the canonical page hold the membership.
- Both entries explicitly name the canonical page in their `See:` line, matching the discipline established by `callable set`.

## Related Findings

- "Three obligations conflated in one unIDed bullet" — same-cluster (same Runtime-observability bullet; that finding splits the bullet into IDed obligations, this one defines the vocabulary the obligations use)
- "Observability bullet misplaced — belongs in a Non-Functional Requirements section" — same-cluster (same bullet, different concern)
- "`loom-system-note` channel assumed registered via capability item 6 — not stated" — same-cluster (same bullet)
- "Discarded-query `Err` always-log emission: contradiction between query.md and pi-integration-contract.md" — decision-dependency (a glossary entry pinning the always-log set's discard semantics constrains how that contradiction is resolved)
- "`callable set` vs `tools: allowlist` — two names for one concept" — same-cluster (same glossary discipline)
- "system-note codes" terminology does not match channel or diagnostic terminology" — same-cluster (terminology hygiene around the same channel)

## spec.md — Orientation → Scope → Hard runtime ceilings

---

# Hard runtime ceilings bullet promises completeness it does not deliver

**Original heading:** Wall-clock, memory, and token bounds absent — "complete V1 set" claim overstated
**Kind:** completeness

## Finding

The Hard runtime ceilings bullet in `spec.md` opens with "the complete V1 set of hard runtime ceilings is" and closes with "No additional implicit nesting, iteration, or recursion limit applies in V1." The four ceilings actually enumerated (invoke depth, `tool_loop.max_iterations`, binder-call cap, JSON-document depth) all measure structural counts — call-stack depth, loop turns, tree depth. The closing foreclosure clause likewise restricts itself to "nesting, iteration, or recursion." Resource and time-domain bounds are not in the enumeration and not in the foreclosure: wall-clock per evaluation, per-query response-token cap, cumulative-token budget per invocation tree, runtime-value memory ceilings (string length, array length, total heap), and host-language stack depth within a single loom (distinct from the 32-level invoke-chain depth).

The asymmetry is load-bearing because the bullet self-describes as exhaustive. Other places in the spec do foreclose individual resource bounds — `cancellation.md` rejects `timeout:` at all four sites and `future-considerations.md` lists per-call timeouts and pre-flight token-count checks as deferred — but a reader auditing for "what runtime limits exist in V1?" reads only this aggregator and concludes the answer is the four listed. Two implementers who instead fill the gap defensively (one installs a 30-second wall-clock guard, another caps string concatenation at 1 MiB) ship divergent runtimes that both pass conformance, because no leaf tests the *absence* of those bounds.

The fix is to bring the foreclosure clause's scope up to match the bullet's stated completeness: extend "no additional implicit nesting, iteration, or recursion limit" to also exclude wall-clock, memory, response-token, and host-stack-depth bounds, with forward links to the deferral anchors that already exist (`cancellation.md` for timeouts, `future-considerations.md` for the token pre-flight check) and a note for the bounds with no current deferral entry.

## Spec Documents

- `spec.md` — Orientation → Scope → Hard runtime ceilings bullet (edited)
- `spec_topics/cancellation.md` — V1-deferred per-call timeouts (read-only)
- `spec_topics/future-considerations.md` — Surface extensions list (read-only; receives a new entry only if option B is chosen)
- `spec_topics/invocation.md` — Invocation depth bound (read-only; cited as the existing host-stack-vs-invoke-depth distinction)
- `spec_topics/query.md` — `ContextOverflowError` and the open options struct (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The change is editorial enrichment of an aggregator bullet under [Governance — GOV-12](spec_topics/governance.md). The four V1 ceiling implementations (V15l for invoke depth, V6r for `tool_loop`, V16-series for binder calls, V4-series for schema depth) are unchanged. V18o already codifies the "no per-call timeout in V1" decision via parse-rejection of `timeout:` at all four sites; its scope, tests, and Ships-when are unchanged by the spec edit. No leaf is blocked or modified.

## Consequence

**Severity:** medium

The four enumerated ceilings still match what the implementing leaves test, so a strictly-following implementer ships a correct V1 runtime. The risk is divergent defensive additions: an implementer reading the bullet who notices the gap and decides to install a wall-clock or memory guard "to be safe" produces a runtime that rejects programs the spec accepts, with no fixture suite to flag the divergence. Adjacent findings on this same bullet (counting conventions, retry-vs-call rule, code-enumeration) compound the operability gap.

## Solution Space

**Shape:** single

### Recommendation

Replace the bullet's foreclosure clause with a scope that matches the "complete V1 set" claim. Concretely, change

> No additional implicit nesting, iteration, or recursion limit applies in V1.

to

> No additional V1 runtime ceiling applies — in particular, V1 imposes no wall-clock timeout per query / tool-call / invoke (deferred per [Cancellation — Per-call timeouts](./spec_topics/cancellation.md) and [Future Considerations — Per-call timeouts](./spec_topics/future-considerations.md); enforced at parse time by rejecting any `timeout:` field), no per-query response-token cap or cumulative-token budget (the only token-domain failure surface in V1 is provider-detected `ContextOverflowError` per [Errors and Results](./spec_topics/errors-and-results.md); a pre-flight token-count check is deferred per [Future Considerations](./spec_topics/future-considerations.md)), no runtime-value memory ceiling (string length, array length, and total heap are bounded only by the host process), and no host-language stack-depth ceiling within a single loom invocation distinct from the 32-level invoke-chain bound (per [Invocation — Invocation depth bound](./spec_topics/invocation.md)).

Edge cases the implementer must watch:

- The host-stack-depth point is the load-bearing one. The 32-level invoke-chain cap counts `invoke` frames specifically; a single loom function with deep recursion or a very long expression chain has no V1-imposed bound. Stating this explicitly prevents a defensive implementer from synthesising a "max expression depth" or "max function-call depth" check that no leaf tests.
- Memory ceilings include array/string growth from interpreter operations as well as accumulated runtime values; the foreclosure must not be misread as forbidding the *host process* from running out of memory — the host's OOM is observable as an unexpected interpreter throw and is already routed through the V18n `loom/runtime/internal-error` path.
- The token-domain wording must distinguish "no V1 bound" (response-token cap, cumulative-token budget) from "provider-driven detection only" (`ContextOverflowError`). Conflating them would suggest V1 has no token-aware behaviour at all.
- A future leaf that adds any of these bounds becomes a GOV-12 lock-step edit per the bullet's existing "future V1 leaf … updates this bullet and the new ceiling's owner page in the same commit" clause; the enriched foreclosure does not weaken that contract.

## Related Findings

- "JSON-document depth counting convention ambiguous" — same-cluster (same Hard runtime ceilings bullet; resolves independently)
- "Binder-call ceiling counting rule for retries unspecified" — same-cluster (same bullet; independent fix)
- "Diagnostic codes for ceiling breaches not enumerated at the index level" — co-resolve (the suggested fix to that finding adds a per-ceiling failure-code line right where the foreclosure clause sits; the two edits land in the same paragraph and should be authored together)
- "Four ceilings in one bullet — cannot be individually cited or tested" — decision-dependency (if that finding's split into CEIL-1..CEIL-4 atomic entries is adopted, the foreclosure clause this finding rewrites must be re-authored as a separate CEIL-5-shaped "no other V1 ceiling" entry rather than a trailing sentence)
- "Numeric ceilings misplaced — belong in a Non-Functional Requirements section" — decision-dependency (if the bullet relocates to a Non-Functional Requirements section, the foreclosure language moves with it; the wording itself is unchanged)
- "\"By editorial convention\" undefined; editorial-convention parenthetical is cruft" — same-cluster (touches the parenthetical at the end of the same bullet; resolves independently)

---

# Hard runtime ceilings index does not name each ceiling's failure surface

**Original heading:** Diagnostic codes for ceiling breaches not enumerated at the index level
**Kind:** error-model

## Finding

The Hard runtime ceilings bullet in `spec.md` enumerates four numeric caps (invoke-chain depth 32; `tool_loop.max_iterations` default 25; at most 3 binder LLM calls per slash invocation; JSON-document depth 5) but does not state, at the index, what an implementer is required to emit when each cap is breached. A reader auditing error coverage must visit four topic pages to find out — and on visiting them discovers that the four ceilings do not share a single failure surface:

- **`invoke`-chain depth 32** surfaces as a runtime panic carrying the diagnostic `code` `loom/runtime/invoke-depth-exceeded` (`spec_topics/invocation.md` — *Invocation depth bound*; with the cross-process surface mapping in `spec_topics/errors-and-results.md`).
- **`tool_loop.max_iterations`** surfaces as `Err(QueryError { kind: "tool_loop_exhausted", … })` — a `kind` discriminator on the typed error, not a `loom/runtime/...` diagnostic code (`spec_topics/frontmatter.md` — *`tool_loop`*; cross-checked at `spec_topics/query.md`).
- **3 binder LLM calls per slash invocation** has no diagnostic code at all: the budget exhaustion is rendered as a free-form `loom-system-note` string drawn from the failure-mode templates in `spec_topics/binder.md` (the loom never starts; there is nothing for loom code to observe).
- **JSON-document depth 5** surfaces as a validation failure carrying `schema_keyword: "maxDepth"` and the canonical message `"JSON document depth exceeds 5"`, which then takes the boundary-appropriate shape (`QueryError { kind: "validation", cause: "schema_validation" }` at the typed-query response boundary; analogous variants at the model-driven and code-driven tool-arg boundaries; `spec_topics/schema-subset.md` — *Depth Enforcement*).

Two consequences flow from the index's silence. First, an implementer who reasons by analogy from the only ceiling they happen to look up will guess wrong about the others — the natural assumption that all four emit `loom/runtime/<cap>-exceeded` codes is contradicted by three of the four. Second, the bullet's "complete V1 set" framing creates a tacit (and unverifiable) promise that no ceiling fails silently; without an enumeration of the four surfaces at the index, that promise has no anchor against which a conformance checker — or a reviewer — can verify it.

## Spec Documents

- `spec.md` — Scope → Hard runtime ceilings bullet (edited)
- `spec_topics/invocation.md` — Invocation depth bound (read-only)
- `spec_topics/frontmatter.md` — `tool_loop` (read-only)
- `spec_topics/binder.md` — Failure-mode templates (read-only)
- `spec_topics/schema-subset.md` — Depth Enforcement (read-only)
- `spec_topics/errors-and-results.md` — `QueryError`, panic-routing rules (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The four ceilings' implementing leaves (V4f / V11i for the depth walk; V6i and the `tool_loop` leaf in V6 for `tool_loop_exhausted`; V16/V18p for the binder retry budget and cancellation; V18s for `invoke-depth-exceeded`) already pin the failure surface at each origin. The fix here is purely an editorial change to the `spec.md` aggregator bullet — adding a forward-pointer enumeration that mirrors what those leaves already test. No leaf's *Tests* or *Ships when* changes; no leaf is blocked.

## Consequence

**Severity:** high

Two reasonable implementers will diverge on the failure surface for at least one ceiling — most likely the binder cap (no code, system-note only) or the depth cap (validation-shaped, not panic-shaped) — because the index advertises uniformity that the topic pages do not deliver. Reviewers cannot verify the "no ceiling fails silently" claim without chasing four cross-references; conformance fixtures cannot be written against the index alone.

## Solution Space

**Shape:** single

### Recommendation

After the four-ceiling enumeration in `spec.md`'s Hard runtime ceilings bullet, append a sentence (or a four-row sub-list) that names each ceiling's failure surface verbatim, citing the owning topic page. Use the topic pages' existing wording — do not coin new codes or shapes. Suggested form:

> Each ceiling has a distinct, observable failure surface; no ceiling fails silently. (1) `invoke`-chain depth 32 — runtime panic with diagnostic `code` `loom/runtime/invoke-depth-exceeded`, routed per [Errors and Results](./spec_topics/errors-and-results.md). (2) `tool_loop.max_iterations` — `Err(QueryError { kind: "tool_loop_exhausted", … })` per [Parameters and Frontmatter — `tool_loop`](./spec_topics/frontmatter.md). (3) Binder-call cap (3) — operator-facing `loom-system-note` rendered from the failure-mode templates in [Slash-Command Argument Binding](./spec_topics/binder.md); the loom does not start and no `Result` is observable to loom code. (4) JSON-document depth 5 — validation failure carrying `schema_keyword: "maxDepth"` at every validation boundary per [Schema Subset — Depth Enforcement](./spec_topics/schema-subset.md), shaped as `QueryError { kind: "validation", cause: "schema_validation", … }` for typed queries and analogously at the tool-arg boundaries.

Edge cases the implementer must respect:

- Do not invent symmetric `loom/runtime/<cap>-exceeded` codes for the three caps that currently have none. Three of the four surfaces are deliberately asymmetric (panic vs. typed `Err.kind` vs. system-note vs. `validation` failure) and the topic pages are the source of truth.
- Keep this index addition strictly a forward-pointer. Behavioural detail (retry budgets, depth-walk short-circuit semantics, panic-routing) stays on the topic pages; the aggregator must not paraphrase normative behaviour or it becomes a second source of truth subject to drift.
- Resolving the sibling finding *"Four ceilings in one bullet — cannot be individually cited or tested"* (which proposes splitting the aggregator into four anchored sub-bullets) makes this enumeration land naturally as a one-line surface annotation per sub-bullet rather than a trailing summary sentence. Coordinate the two edits.

## Related Findings

- "Failure-cause → caller-surface mapping absent for panic and limit-exceeded" — co-resolve (the same surface enumeration satisfies both findings; the limit-exceeded mapping it requests is a strict subset of what this finding asks for at the ceilings index)
- "\"Runtime limit exhaustion\" not cross-linked to the ceilings enumeration" — co-resolve (the proposed forward-pointer is the natural place for the preamble's "exhausting a runtime limit" cross-link to land)
- "Four ceilings in one bullet — cannot be individually cited or tested" — decision-dependency (splitting the bullet into four anchored entries changes the syntactic form of this fix from a trailing summary to per-entry surface annotations)
- "Wall-clock, memory, and token bounds absent — \"complete V1 set\" claim overstated" — same-cluster (both findings tighten the aggregator's "complete V1 set" promise; they touch the same bullet but resolve along independent axes — completeness vs. failure-surface enumeration)
- "Binder-call ceiling counting rule for retries unspecified" — same-cluster (both touch the binder-cap row but address orthogonal gaps: counting basis vs. failure-surface naming)
- "JSON-document depth counting convention ambiguous" — same-cluster (both touch the depth-cap row but address orthogonal gaps: counting basis vs. failure-surface naming)

## spec.md — Language index / .warp permitted forms

---

# `.warp` permitted-form list: inline enumeration contradicts in-page DO-NOT-inline directive

**Original heading:** Inline five-form list contradicts the HTML comment that forbids inlining it
**Kind:** implementability, cruft

## Finding

`spec.md` line 9 introduces the `.warp` extension with a parenthetical that inlines the permitted top-level forms — "(currently five: `import`, `export`, `fn`, `schema`, `enum`)" — and links to [Imports — Permitted top-level forms](../spec_topics/imports.md#permitted-top-level-forms) as the canonical owner. Two lines below, on line 11, a maintenance comment reads `<!-- DO NOT inline the permitted-form list here; see imports.md. -->`. The page therefore both inlines the list and instructs editors not to.

The contradiction is not just cosmetic. The HTML comment exists to prevent the exact drift the parenthetical now invites: if `imports.md` ever adds a sixth permitted form, the inline `(currently five: …)` enumeration in `spec.md` becomes silently wrong, and the directive that was meant to guard against this is sitting two lines below the violation. A reviewer enforcing the comment would delete the parenthetical; a reviewer extending the parenthetical would delete the comment. Neither path is signposted as the intended one, so the page is locally inconsistent about which source is authoritative.

A related context point: `spec_topics/governance.md` GOV-12 already establishes a "lock-step aggregator" convention for `spec.md` paragraphs that mirror closed sets owned by topic pages, and lists four such aggregators (the Scope bullets, the Pi SDK capabilities list, the four Host runtime obligations, and the four-item hard-runtime-ceilings list). The `.warp` permitted-form parenthetical fits that pattern but is not enumerated under GOV-12; the in-line HTML comment appears to predate GOV-12 and has not been reconciled with it.

## Spec Documents

- `spec.md` — Language index / `.warp` extension paragraph (lines 9–11) (edited)
- `spec_topics/imports.md` — `<a id="permitted-top-level-forms">` anchor and the bullet listing the five forms (read-only)
- `spec_topics/governance.md` — GOV-12 aggregator enumeration (option-dependent: edited under Option B, read-only under Option A)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. `V17a` (`.warp` files parse with body restriction) restates the same five permitted forms, but its acceptance criteria already cite `imports.md` as the spec source and are unaffected by an editorial fix in `spec.md`. No leaf is blocked or modified.

## Consequence

**Severity:** low

A future PR that extends the canonical permitted-form list in `imports.md` will leave the `spec.md` parenthetical silently stale, which is precisely the failure mode the HTML comment was placed to prevent. Two reasonable editors confronted with the contradiction today will resolve it in opposite directions (delete the parenthetical vs. delete the comment), neither knowing which direction the spec author intended.

## Solution Space

**Shape:** multiple

### Option A — Honour the comment; remove the inline enumeration

**Approach.** Delete the parenthetical "(currently five: `import`, `export`, `fn`, `schema`, `enum`)" from `spec.md` line 9. Leave the HTML comment in place as the maintenance directive. The `imports.md` link remains the only path to the list.

**Spec edits.**
- `spec.md` line 9: change "…enumerated in [Imports — Permitted top-level forms](./spec_topics/imports.md#permitted-top-level-forms) (currently five: `import`, `export`, `fn`, `schema`, `enum`)." to "…enumerated in [Imports — Permitted top-level forms](./spec_topics/imports.md#permitted-top-level-forms)."

**Pros.**
- Smallest possible edit; touches one file, one line.
- Honours the original authorial intent encoded in the HTML comment.
- Makes drift impossible: there is no inline list to fall out of sync.

**Cons.**
- Loses orientation value — a reader scanning `spec.md` no longer sees the size or shape of the permitted set without clicking through.
- Diverges from the broader `spec.md` aggregator pattern, which inlines closed sets (Pi SDK capabilities, Host runtime obligations, hard ceilings) for orientation and relies on GOV-12 to keep them honest.

**Risks.** None material.

### Option B — Promote to a GOV-12 aggregator; delete the comment

**Approach.** Treat the parenthetical as a GOV-12 aggregator paragraph, mirroring the existing four. Add the permitted-form list to GOV-12's enumeration of aggregators. Delete the HTML comment, which is now superseded by GOV-12's lock-step convention. Optionally annotate the parenthetical with the same `*Orientation aggregator (per [Governance — GOV-12](./spec_topics/governance.md)).*` marker that the Host-runtime and hard-ceilings paragraphs already carry.

**Spec edits.**
- `spec.md` line 9: keep the parenthetical; optionally tag it as a GOV-12 aggregator inline.
- `spec.md` line 11: delete the `<!-- DO NOT inline the permitted-form list here; see imports.md. -->` comment.
- `spec_topics/governance.md` GOV-12: extend the parenthetical "(currently: the four Scope bullets, the Pi SDK and capabilities bullet list, the four Host runtime obligations, and the four-item hard-runtime-ceilings list)" to also name the `.warp` permitted-top-level-forms list.

**Pros.**
- Consistent with the rest of `spec.md`'s established aggregator pattern.
- Preserves orientation value at the index level.
- Resolves the contradiction in the GOV-12 direction the page already trends in.

**Cons.**
- Touches three locations across two files instead of one.
- Adds another item to GOV-12's already-long aggregator enumeration; each new aggregator slightly raises the cost of GOV-12 review discipline.

**Risks.** Editors who do not read GOV-12 may still update one side without the other; GOV-12 explicitly notes that drift is a documentation defect with no V18s gate, so the maintenance burden is real but already accepted policy elsewhere on the page.

### Recommendation

**Option B.** `spec.md` is structured as an orientation page that inlines closed sets owned by topic pages, and GOV-12 is the canonical home for the lock-step convention that keeps those inlines honest. The `.warp` permitted-form parenthetical fits that pattern; the HTML comment is leftover guidance from before GOV-12 existed. Promoting the list to a GOV-12 aggregator preserves the orientation value, removes the local contradiction, and pulls the maintenance rule into the single canonical place GOV-12 declares for it. The implementer fixing this should make all three edits (spec.md parenthetical tag, spec.md comment deletion, governance.md GOV-12 enumeration) in a single commit so GOV-12 itself does not drift.

## Related Findings

- "'By editorial convention' undefined; editorial-convention parenthetical is cruft" — same-cluster (both touch the GOV-12 lock-step aggregator pattern in `spec.md`)
- "Four ceilings in one bullet — cannot be individually cited or tested" — same-cluster (another GOV-12 aggregator paragraph in `spec.md` with separate quality issues)
- "Wall-clock, memory, and token bounds absent — 'complete V1 set' claim overstated" — same-cluster (same hard-runtime-ceilings aggregator)

## spec.md — Naming and Terminology (cross-cutting)

---

# Trust-boundary bullet uses `tools:` allowlist instead of mandated `callable set`

**Original heading:** `callable set` vs `tools: allowlist` — two names for one concept
**Kind:** naming

## Finding

`spec.md` introduces `callable set` as the canonical term for the per-loom resolved tool list, italicising it on first use and forward-linking to [Glossary — `callable set`](./spec_topics/glossary.md). The glossary entry then issues a normative directive: *"Authors and implementers MUST use the term `callable set` (or, with an explicit scoping modifier, `frontmatter callable set` / `loom's declared callable set`) for the per-loom resolved tool list."* It enumerates a deprecation list of bare-phrase synonyms (`tools: set`, `tool set`, `loom's tools`, `available tools`) and explains the rationale: those phrases erode the no-inheritance invariant that distinguishes the callable set from the host's *ambient tool set*.

The Trust-boundary bullet in `spec.md` § Scope (line 45) violates this MUST in the very page that establishes it. It reads "the per-loom `tools:` allowlist" — a synonym the glossary did not name explicitly but that lands in exactly the same prose-erosion bucket the deprecation list targets. A reader who arrives at the bullet without first visiting the glossary cannot tell whether `callable set` (intro paragraph) and `tools:` allowlist (Trust boundary) are the same concept, two views of one concept, or two distinct things. The intro paragraph already does the disambiguation work against `ambient tool set`; the Trust-boundary bullet undoes that work three paragraphs later.

The cost is small per occurrence but compounds: GOV-12 lock-step bullets in `spec.md` are the surface most likely to be quoted in downstream design docs, and shipping `tools:` allowlist there guarantees the deprecated phrasing propagates. Fixing it is a single sentence rewrite.

## Spec Documents

- `spec.md` — § Orientation → Scope → Trust-boundary bullet (edited)
- `spec_topics/glossary.md` — `callable set` entry (read-only; supplies the normative MUST)
- `spec_topics/pi-integration-contract.md` — Tool-registration lifetime and visibility (read-only; the bullet's forward-link target)
- `spec_topics/frontmatter.md` — `tools:` field (read-only; confirms the frontmatter spelling)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The fix is a one-sentence spec edit. No plan leaf's acceptance criteria changes; `v14-tool-calls.md` already uses `callable set` correctly when describing the runtime behaviour, and no leaf depends on the Trust-boundary bullet's specific wording.

## Consequence

**Severity:** low

`spec.md` self-contradicts its own MUST on the term `callable set`, which weakens the glossary's authority for every downstream reader and every future reviewer. No implementation diverges, but the next person editing the Scope section now has a precedent for ignoring the glossary's deprecation list.

## Solution Space

**Shape:** single

### Recommendation

Rewrite the Trust-boundary bullet's sandbox sentence to use `callable set` and parenthesise `tools:` as the field that declares it. Concretely, replace:

> ...bounded only by what Pi grants to extensions and by the per-loom `tools:` allowlist (see [Pi Integration Contract — Tool-registration lifetime and visibility](./spec_topics/pi-integration-contract.md)).

with:

> ...bounded only by what Pi grants to extensions and by the loom's declared *callable set* (the entries listed under the `tools:` frontmatter field; see [Pi Integration Contract — Tool-registration lifetime and visibility](./spec_topics/pi-integration-contract.md)).

Edge cases for the implementer:

- Keep the italics on `callable set` consistent with the intro paragraph's first-use convention.
- Do **not** add a second forward-link to the glossary here; the intro paragraph already carries it, and a second link would invite drift.
- Audit the rest of `spec.md` for the deprecated bare phrases before closing — the search `grep -n "tool set\|tools: set\|loom's tools\|available tools\|tools: allowlist" spec.md` should return no spec-prose hits. (The `ambient tool set` phrase is the one legitimate bare-phrase use and must be preserved.)
- The glossary entry itself does not list `tools: allowlist` in its deprecation enumeration. Consider extending that list in a follow-up edit so future reviewers catch this synonym automatically; that is a separate change to `glossary.md` and is out of scope for this finding.

## Related Findings

- "`respond_repair` (underscore) vs `respond-repair` (hyphen) inconsistency" — same-cluster (sibling naming-consistency finding in the same Naming and Terminology section; resolves independently)
- "\"Implementation Notes\" section and its first child link share the same string" — same-cluster (sibling naming-consistency finding; independent fix)
- "\"system-note codes\" terminology does not match channel or diagnostic terminology" — same-cluster (sibling naming-consistency finding; independent fix)
- "`factory-probable` — undefined compound adjective" — same-cluster (sibling naming-consistency finding; independent fix)

## spec.md — Whole document (cross-cutting assumptions)

---

# Spec corpus has no CI gate for Markdown anchor (`#fragment`) targets

**Original heading:** No CI validation of spec.md cross-links / anchors
**Kind:** assumptions

## Finding

`spec.md` is a thin aggregator whose body is dominated by intra-corpus Markdown links into `spec_topics/*.md`, and roughly half of those links carry `#fragment` suffixes (`#entry-capability-probe`, `#sdk-cap-binder-llm-model`, `#sdk-capability-inventory`, `#file-extension-namespace`, `#pi-version-bump-procedure`, …). The same pattern recurs throughout `spec_topics/` itself — for example `binder.md`, `governance.md`, `invocation.md`, and `pi-integration-contract.md` all link into each other by anchor. None of these `#fragment` targets is mechanically checked.

`plan_topics/v18-cancellation.md` (V18s — Coverage-matrix closing CI gate) lands eight CI sub-gates over the spec corpus, including a *Plan-link gate* that resolves `(../spec_topics/<page>.md…)` references from `plan.md` and `plan_topics/**.md`. That gate explicitly disclaims fragment validation: *"The gate's scope is the file portion of the URL only; broken `#anchor` fragments are out of scope (separate hygiene concern)."* No other gate fills the gap, in either direction (spec-internal, or plan→spec).

The exposure compounds at H6. `plan_topics/h6-req-ids.md` rewrites every `spec.md` cross-reference whose target is a non-narrative page so the link resolves to a `#prefix-n` REQ-ID anchor (the namespace-clearance link being the worked example), and `governance.md` GOV-9 then *requires* every cross-page normative reference across the spec corpus to take that `#prefix-n` form. After H6, the corpus moves from a few dozen hand-curated `#section-slug` links to several hundred machine-generated `#prefix-n` links, all of whose stability is asserted by GOV-1 (anchor-form normativity) and GOV-7 (rename procedure) but verified by no automated check. A future GOV-7 *Rename* or a routine heading edit that shifts a GitHub auto-fragment can silently break dozens of inbound links without any signal at PR time.

## Spec Documents

- `spec.md` — aggregator body, Orientation / Language / Extension Architecture / Implementation Notes / Appendix link tables (read-only)
- `spec_topics/governance.md` — GOV-1, GOV-7, GOV-9 (read-only)
- `spec_topics/pi-integration-contract.md` — anchor targets cited from `spec.md` and from `binder.md` (read-only)

## Plan Impact

**Phases:** Horizontal, Vertical V18

**Leaves (implementation order):**

- H6 — REQ-ID anchor insertion and coverage-matrix re-pivot — (modified)
- V18s — Coverage-matrix closing CI gate — (modified)

## Consequence

**Severity:** low

Broken anchors degrade silently: navigation from `spec.md` lands at the top of the target file rather than the cited rule, and reviewers chasing GOV-9 cross-links may cite a rule that no longer exists at that anchor without noticing. Once H6 has rewritten the aggregator to `#prefix-n` form, a single GOV-7 *Rename* or heading-text edit can break tens of links in one commit with no PR signal. Implementers can still ship correct behaviour from a corpus with rotted anchors — hence advisory rather than correctness — but the cost rises sharply post-H6.

## Solution Space

**Shape:** single

### Recommendation

Extend V18s with a ninth sub-gate, *Spec-anchor gate*, sibling to the existing *Plan-link gate*:

- **Scope.** Every Markdown link of the form `[…](<path>.md#<fragment>)` appearing in `spec.md` and in `spec_topics/**.md`, where `<path>` resolves under `spec_topics/` (intra-corpus only — external URLs and bare-file links are out of scope; the latter are already covered by the file-portion check that the existing Plan-link gate's logic should be generalised over the spec corpus too).
- **Resolution rule.** A `#fragment` resolves if either (a) the target file contains a literal `<a id="<fragment>"></a>` HTML anchor (per GOV-1's dual-form clause), or (b) the GitHub-flavoured-Markdown auto-slug of some ATX heading (`#`, `##`, …) on the target page equals `<fragment>`. The slug rule is GFM's: lowercase, runs of non-alphanumerics → single hyphen, leading/trailing hyphens stripped; collisions disambiguate by appending `-1`, `-2`, …. Document the slug rule in the gate's source so a future Markdown-renderer change is traceable.
- **Failure surface.** Match the V18s house style: one stderr line per unresolved fragment in the form `<source-path>:<lineno>: spec-anchor: <link-text> → <target-path>#<fragment> (no anchor or heading)`, primary-key sort by `(source-path, lineno)`, exit `1` on any failure, byte-identical output across two consecutive runs.
- **Baseline.** Empty diff over the present-day corpus (the gate is added in the same commit that brings the present corpus into compliance, if any links currently rot — verify with `grep -rohE '\[.*?\]\(\.\./?spec_topics/[a-z0-9-]+\.md#[^)]+\)' spec.md spec_topics/` and resolve any hits before merging).
- **Acceptance tests** (added to V18s's `Tests.` bullet, alongside the seven existing-gate fixtures): a fixture that renames a heading on a target page without sweeping the inbound `#fragment` link flips the check; the same edit *with* a corresponding link sweep passes; a fixture that mentions `spec_topics/foo.md#bar` inside fenced code or quoted prose does not flip (URL-shape restriction, mirroring the Plan-link gate); a fixture that points `#prefix-n` at a page whose `## Retired REQ-IDs` section lists that ID flips with a message naming the retirement (this is the GOV-9 + GOV-8 interaction).
- **H6 co-edit.** H6 currently rewrites `spec.md`'s outbound links to `#prefix-n` form. Update its `Adds.` bullet to require that the rewrite leave the V18s Spec-anchor gate green at the moment H6 lands — i.e. the rewrite is a complete pass, not a partial one followed by V18s catch-up. This makes H6 the first leaf whose **Ships when** condition implicitly cites the new gate.

Edge cases the implementer must watch:

- The `spec.md` aggregator currently links to non-anchored sections of pure-narrative pages (e.g. `glossary.md`, `future-considerations.md`); GFM-auto-slug resolution covers those without requiring `<a id>` insertion.
- The V18s gate's Plan-link gate's URL regex restricts to `(../spec_topics/...)`. The new gate must use a slightly different regex (`(<relative-path-to-spec_topics>/<kebab>.md#<fragment>)`) because intra-`spec_topics/` links use `(./other.md#…)` not `(../spec_topics/other.md#…)`. Two sibling regexes is cleaner than one shared one.
- Extension-side `<a id="…"></a>` anchors that appear in `spec.md` itself (e.g. `<a id="symlink-resolution-hardening"></a>` inside `future-considerations.md`) must be matched by the literal-anchor rule, not the heading-slug rule, because they sit on body lines.

## Related Findings

- "Provider error mapping MUST re-validate on upgrade — no CI gate" — same-cluster (sibling CI-gate gap; different surface — fixture suite gating, not anchor hygiene)
- "Seed-field mapping MUST re-validate on upgrade — no CI gate" — same-cluster (same shape as the provider-error finding; both close by extending V18s or the Pi version-bump procedure)

---

# Single-active-session model is asserted only by example, never as an orientation invariant

**Original heading:** Single-tenant assumption (one Pi session per host process) is implicit
**Kind:** assumptions

## Finding

Throughout `spec.md` and the topic pages, language about Pi state is uniformly singular: "the *caller's* current conversation," "the host Pi session's currently-active tools," "the user session," "the user's session." Nowhere does the spec state the foundational invariant these phrases rely on — that a Pi extension instance is bound to **exactly one active user session at a time**, and that a session swap (`new` / `resume` / `fork` / `switchSession`) tears the extension instance down and re-binds a fresh one. An implementer who has not internalised Pi's extension lifecycle reads "the user session" and cannot tell whether `pi-loom` may at some point need to disambiguate between concurrently-live sessions in the same host process (it does not) or whether per-session keying of caches, watchers, and the `ActiveInvocationRegistry` is required (it is not — extension-instance scope already gives per-session scope).

The spec does carry the consequences of this invariant in scattered places: `pi-integration-contract.md` calls the `ActiveInvocationRegistry` "extension-instance-scoped"; the `session_shutdown` step pins the four reasons (`quit | reload | new | resume | fork`) under which the runtime is torn down; `future-considerations.md` documents `Mid-loom user-session replacement` as a post-V1 seam against the same invariant; `pi-integration-contract.md` warns that the global `pi.on("agent_end", …)` event "fires for every `AgentSession` in the process (the user shell session and any concurrent subagent-mode sessions) with no per-session origin marker" — implicitly asserting "one user shell session." But the *premise* is only ever conveyed by example. A reader cannot grep for it.

This is purely an orientation gap — concurrent loom invocations within one session are well-specified (parallel tool calls spawning sibling subagent `AgentSession`s, the `ActiveInvocationRegistry`, snapshot/restore of the active tool set, per-invocation `loomAbort`). The missing sentence is at the layer above: *one extension instance ↔ one active user session ↔ one host process at any moment*, with replacement mediated by `session_shutdown` + factory re-load.

## Spec Documents

- `spec.md` — Orientation → Prerequisites → Host runtime (edited)
- `spec_topics/pi-integration-contract.md` — Extension entry point, `ActiveInvocationRegistry`, Conversation drive — prompt mode (read-only)
- `spec_topics/future-considerations.md` — Mid-loom user-session replacement (read-only)
- `spec_topics/glossary.md` — candidate home for an `extension instance` / `Pi session` glossary entry (option-dependent)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None — the gap is purely orientational; no leaf's `Tests` or `Ships when` change. Implementers of H4 (`session_shutdown` handler), the `ActiveInvocationRegistry` (Mb / V18 leaves), and prompt-mode driver leaves already encode the single-active-session model correctly via Pi's lifecycle events. Adding the orientation sentence does not move any acceptance criterion.

## Consequence

**Severity:** low

A reader of `spec.md` cannot determine from the orientation pages alone whether `pi-loom` must contend with concurrent user sessions in one process. The truth is reachable by reading `pi-integration-contract.md`'s `session_shutdown` reasons table and noticing that all four reasons are session-replacement events, but that is a multi-page inference. Implementers may either over-engineer (per-session keying that Pi's lifecycle already provides) or under-engineer (assume singularity without naming it, then break a future seam quietly). Neither outcome is wrong-on-arrival, but both waste review cycles.

## Solution Space

**Shape:** single

### Recommendation

Add one sentence to `spec.md` → Orientation → Prerequisites → Host runtime, immediately after the "executes inside the Pi extension host process under four host preconditions" clause:

> *Session model.* A Pi extension instance is bound to exactly one active user session at a time. A session swap (`new` / `resume` / `fork` / `switchSession`) tears the extension instance down via `session_shutdown` and re-binds a fresh instance against the new session — see [Pi Integration Contract — Extension entry point](./spec_topics/pi-integration-contract.md). Concurrent loom invocations within a session (parallel tool calls, sibling subagent sessions) are first-class and addressed by the `ActiveInvocationRegistry` and the per-invocation `loomAbort`; concurrent *user sessions* in the same host process are out of scope for V1 because Pi does not support them.

The sentence MUST distinguish the two concurrencies: (a) concurrent loom invocations in one session — *supported and specified* — vs. (b) concurrent user sessions in one host process — *not a Pi capability, hence not a `pi-loom` concern*. Folding them together would mis-state the runtime's actual concurrency surface.

Edge cases for the implementer to watch when wording this:
- The bullet is orientation only; it MUST NOT introduce a new normative obligation that would conflict with the operative session-lifecycle rules already pinned in `pi-integration-contract.md`. Use forward-link discipline per `GOV-12`.
- The phrase "extension instance" should pick up the same lexicon `pi-integration-contract.md` already uses (`extension-instance-scoped`); a glossary entry under `spec_topics/glossary.md` for *extension instance* is optional but cheap and would let other pages cite the term without re-defining it.
- Avoid the term "single-tenant" in the spec text — it leaks SaaS vocabulary that does not match Pi's local-process model; "single active session per extension instance" is the precise framing.

## Related Findings

- "Capability probe internal exceptions not handled" — same-cluster (both touch the Host runtime / Prerequisites orientation block but resolve independently).
- "Extension factory lifecycle not defined on this page" — co-resolve (the same Host runtime orientation paragraph is the natural home for both the factory-lifecycle forward-link and the single-active-session sentence; one editing pass settles both).
- "`Per-turn atomicity assumption for partial-append contract is implicit`" — same-cluster (another implicit-assumption finding about Pi session behaviour; resolution is independent but the same `assumptions` lens flagged both).

## spec_topics/ — Cross-cutting

---

# Normative spec pages name plan-leaf identifiers as enforcement gates

**Original heading:** Normative spec pages cite plan documents as enforcement gates — spec/plan boundary conflated
**Kind:** scope

## Finding

Several normative spec pages thread plan-leaf identifiers (`H1`, `H2`, `H6`, `V16o`, `V18s`) and `plan_topics/*.md` cross-links into their prose, framing those plan artefacts as the gates that enforce spec obligations. `spec_topics/binder.md` does this once (the H1 SDK surface-inventory test "as the mechanical gate that fails until the binder paragraph here and the loom `peerDependencies` literals have been updated together"). `spec_topics/pi-integration-contract.md` does it repeatedly across the SDK-pin, capability-probe, registry-swap, Clock-seam, and Pi-version-bump-procedure paragraphs (six `plan_topics/h1-scaffold.md` and `plan_topics/h2-di-skeleton.md` links plus several un-linked `H1` / `H2` mentions). `spec_topics/governance.md` does it for the V18s coverage-matrix CI gate, the H6 anchor pass, and seven other `plan_topics/v18-cancellation.md` and `plan_topics/h6-req-ids.md` references. `spec_topics/implementation-notes.md` does it twice with un-linked "H2 DI seams" / "H2 ships a grep-test" phrasing.

The cross-references conflate two distinct categories that `plan_topics/conventions.md` and `governance.md` GOV-10/GOV-12 elsewhere keep separate. An implementing agent reading the spec encounters "the H1 SDK surface-inventory test is the mechanical gate that fails until..." and cannot tell whether `H1` names (i) a runtime obligation the loom code must satisfy at startup, (ii) a build-time obligation the loom package must produce, or (iii) a CI test owned by a separate plan leaf they are not implementing. The information needed to disambiguate lives one click away in `plan_topics/h1-scaffold.md` — outside the reading scope GOV-10 explicitly grants the implementer.

The deeper issue is directionality: spec pages currently *depend on* plan-leaf identifiers as load-bearing nouns. That inverts the documented relationship — `plan_topics/conventions.md` defines plan leaves as terminal tasks whose **Spec** field cites spec pages, and `governance.md` GOV-12 frames `spec.md` itself as informative orientation around topic pages. Spec text should describe the observable property under test ("a build-time literal-read assertion verifies the four `peerDependencies` ranges are aligned"); naming which plan leaf ships that assertion belongs in the plan corpus.

## Spec Documents

- `spec_topics/binder.md` — Strict-capability requirement (edited)
- `spec_topics/pi-integration-contract.md` — Host prerequisites, Capability probe, Extension entry point, Clock seam, Pi version bump procedure (edited)
- `spec_topics/governance.md` — header paragraph, GOV-1, GOV-2, GOV-4, GOV-6, GOV-7 (Rename / Merge), GOV-9 (edited)
- `spec_topics/implementation-notes.md` — Schema validation, Clock (edited)
- `spec.md` — Aggregator paragraphs (read-only; needed to confirm GOV-12 lock-step is preserved)
- `plan_topics/conventions.md` — leaf format, Spec field rule (read-only)
- `plan_topics/h1-scaffold.md` — destination of currently-named H1 references (read-only)
- `plan_topics/h2-di-skeleton.md` — destination of currently-named H2 references (read-only)
- `plan_topics/h6-req-ids.md` — destination of currently-named H6 references (read-only)
- `plan_topics/v18-cancellation.md` — destination of currently-named V18s references (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The fix is confined to spec-page prose. H1, H2, H6, V18s, and V16o leaves continue to ship the same tests and gates against the same observable properties; their **Spec** fields and acceptance criteria do not change. The plan-corpus → spec direction (leaves cite topic pages) is preserved; only the spec → plan back-references are removed or restructured.

## Consequence

**Severity:** low

An implementing agent working a non-horizontal leaf (say, V8) under GOV-10's reading scope cannot tell whether the spec sentences they encounter naming `H1` or `H2` describe runtime behaviour they must produce, build-time artefacts another leaf owns, or CI gates they can ignore. They will either over-read into plan pages outside their scope or under-implement against requirements they misclassified as someone else's CI obligation. No two implementers will diverge on observable runtime behaviour because of this — the named tests still exist and still gate merges — so the impact is confusion and reading-scope inflation, not divergent implementations.

## Solution Space

**Shape:** multiple

### Option A — Strip plan-leaf names; describe the property under test

**Approach.** Rewrite every spec sentence that names a plan leaf or links to `plan_topics/` so it describes the observable property and the *category* of enforcement (build-time literal-read assertion, CI grep gate, runtime probe, etc.) without naming the leaf that owns it. The plan corpus continues to forward-link to spec pages via leaf **Spec** fields; the spec stops back-linking.

**Spec edits.**
- `pi-integration-contract.md` Host prerequisites — replace "the H1 `peerDependencies` literal-read test and the H1 SDK surface-inventory test (per [`h1-scaffold.md`](../plan_topics/h1-scaffold.md)) are the mechanical gates that fail the build" with "a build-time literal-read assertion against `package.json#peerDependencies` and a build-time SDK surface-inventory assertion against the imported `@mariozechner/pi-coding-agent` namespace fail the build until the procedure has been completed".
- Same page, Capability probe pinned-constants paragraphs — drop "that the H1 surface-inventory test also consumes"; replace with "and consumed by the build-time surface-inventory assertion".
- Same page, Pi version bump procedure (steps 2–5 and the artefact paragraph) — replace each `(per [`h1-scaffold.md`](../plan_topics/h1-scaffold.md))` parenthetical with the assertion's name only ("the SDK surface-inventory assertion", "the `peerDependencies` literal-read assertion", "the `engines.node` literal-read assertion").
- Same page, Clock seam — replace "(per H2's DI skeleton — see ...)" with "(per the runtime's DI skeleton — see ...)" and drop the `plan_topics/h2-di-skeleton.md` link.
- `binder.md` strict-capability paragraph — replace "with the H1 SDK surface-inventory test (per [`h1-scaffold.md`](../plan_topics/h1-scaffold.md)) as the mechanical gate" with "with the build-time SDK surface-inventory assertion as the mechanical gate".
- `governance.md` — replace each `[V18s coverage-matrix closing CI gate](../plan_topics/v18-cancellation.md...)` with `the coverage-matrix closing CI gate (specified in the plan corpus)`; replace each `[H6](../plan_topics/h6-req-ids.md)` with `the initial REQ-ID anchor pass (specified in the plan corpus)`; same treatment for the GOV-7 Rename / Merge V18s plan-link gate references.
- `implementation-notes.md` Schema validation and Clock bullets — replace "the H2 DI seams" with "the runtime's DI seams" and "H2 ships a grep-test that enforces this" with "a build-time grep-test enforces this".

**Pros.** Cleanest separation; makes the reading-scope rule (GOV-10) actually achievable; spec stops embedding plan-leaf identifiers as load-bearing nouns; aligns with GOV-12's framing of spec aggregator paragraphs.

**Cons.** Loses traceability: a reader who *does* want to know which leaf owns a given gate must navigate via the plan's coverage matrix or the leaf's **Spec** field rather than following an inline link. Adds prose churn across four pages.

**Risks.** Inconsistent application — easy to miss un-linked occurrences (`H1` / `H2` / `V16o` mentioned by acronym only). Mitigation: a single grep pass for `\bH[1-6]\b|\bV[0-9]+[a-z]?\b|plan_topics/` across `spec_topics/*.md` after the edit, with each remaining hit either justified or removed.

### Option B — Add a structural marker that flags every spec→plan reference

**Approach.** Keep the inline links but tag every spec→plan cross-reference with a consistent marker so an implementing agent can scan for and skip them. For example, prefix the parenthetical with a fixed phrase like "*(plan corpus: ...)*" and a footnote in `governance.md` (a new GOV-13) declaring that `plan_topics/*.md` references in spec prose are non-load-bearing forward links to the plan leaf that ships the test, never additional spec obligations.

**Spec edits.**
- New `governance.md` rule (GOV-13 or appended to GOV-12): "`plan_topics/*.md` cross-references appearing in `spec_topics/*.md` paragraphs are *plan corpus pointers*. They identify which plan leaf ships the test or build-time gate that closes the spec obligation in the surrounding paragraph; they do NOT add a spec obligation. Implementing agents within their GOV-10 reading scope MAY ignore them."
- Mechanical sweep across the four affected pages converting every `(per [\`<file>\`](../plan_topics/<file>))` to `(*plan corpus:* [\`<file>\`](../plan_topics/<file>))` and every un-linked `H1` / `H2` / `V18s` to `(*plan corpus:* H1)` etc., or to a parenthetical link.

**Pros.** Preserves traceability; minimal prose surgery; one new governance rule does the heavy lifting for every existing reference and any future one.

**Cons.** Markers are easy to miss in dense paragraphs (binder.md and pi-integration-contract.md already cram many sub-clauses into single sentences); leaves the directionality inversion in place; GOV-13 is itself a meta-rule about how to read spec prose, growing the governance surface.

**Risks.** Marker drift — without a CI gate the convention erodes; GOV-13 would have to ship with a grep gate that flags un-marked `plan_topics/` links in spec pages, which is more tooling for a problem Option A solves with prose alone.

### Option C — Hybrid: strip in narrative paragraphs, keep in version-bump procedure

**Approach.** Apply Option A (strip plan-leaf names) to every spec page *except* the `Pi version bump procedure` subsection of `pi-integration-contract.md`, where the subsection is itself a contributor checklist that legitimately spans both spec and plan corpora and benefits from inline navigation. In that subsection only, retain the `plan_topics/h1-scaffold.md` links but introduce a one-line opener: "*This subsection is a contributor checklist; the `plan_topics/` links below identify the plan leaves that own the cited build-time assertions.*"

**Spec edits.** Same as Option A everywhere, plus the one-line opener at the top of `Pi version bump procedure`. The five steps inside the subsection retain their existing `plan_topics/h1-scaffold.md` parentheticals.

**Pros.** Preserves the most useful inline navigation (the bump procedure is the one place where a contributor genuinely needs to bounce between spec and plan in a single workflow); strips the rest cleanly; recognises that the bump-procedure subsection is contributor-facing rather than implementer-facing.

**Cons.** Introduces a special case the editor must remember; weakens the governance argument that spec pages should not name plan leaves.

**Risks.** Other contributor-facing subsections (e.g. governance's GOV-7 lifecycle bullets) might claim the same exemption, eroding the rule by precedent.

### Recommendation

Option C. Apply Option A's strip across `binder.md`, `governance.md`, `implementation-notes.md`, and the non-procedure paragraphs of `pi-integration-contract.md`; retain `plan_topics/h1-scaffold.md` links inside the `Pi version bump procedure` subsection with a one-line opener that flags it as a contributor checklist spanning both corpora. Edge cases the implementer must watch:

1. The fix is a grep-and-rewrite pass; after editing, run `grep -rnE '\bH[1-6]\b|\bV[0-9]+[a-z]?\b|plan_topics/' spec_topics/ spec.md` and confirm every remaining hit is either inside the bump-procedure subsection or a glossary-style mention (`spec.md`'s reference to plan corpus structure, if any).
2. The `V16o` reference in `binder.md`'s strict-capability paragraph ("the failure-mode template per V16o") is structurally identical to the `H1` references and should be stripped the same way — replace with "the failure-mode template (see [Errors and Results](./errors-and-results.md))" or whichever topic page owns the failure-mode template.
3. `governance.md` GOV-2 currently says `plan_topics/v18-cancellation.md` is "the normative source for the gate's failure surface (exit code, per-offence message format, accumulation semantics, and output stream)". Stripping the link removes a normative pointer; replace it with "The plan corpus is the normative source for the gate's failure surface" rather than dropping the sentence entirely, since GOV-2 deliberately delegates the failure surface out of the spec.
4. The grep gate for the `Date.now` / `performance.now` ban currently described in both `pi-integration-contract.md` and `implementation-notes.md` as "H2 ships a grep-test" should be re-described as "a build-time grep-test enforces this" in both places — the wording must match, or future readers will hunt for the discrepancy.
5. Run the same grep against `spec.md` itself; the orientation block currently has no `plan_topics/` links but the lock-step convention (GOV-12) means any future addition to `spec.md` aggregator paragraphs would have to follow the same rule.

## Related Findings

- "Governance page lacks 'not for implementing agents' signal" — co-resolve (both fix the same underlying spec/plan/scope conflation; Option C above and the governance-page opener line should land in the same edit pass)
- "V1 seam requirements indistinguishable from functional requirements" — same-cluster (both are about scanability of normative paragraphs by an implementing agent within their GOV-10 reading scope; resolve independently with consistent callout patterns)
- "'H1' acronym unexpanded and unlinked" — co-resolve (the un-linked `H1` mentions that finding flags are precisely the references Option A/C strips; the same grep pass closes both)
- "Reviewer SHOULD NOT directive belongs in governance, not in spec body" — same-cluster (both are instances of cross-corpus directives leaking into the wrong corpus; resolve independently)

---

# V1 seam requirements look like functional requirements

**Original heading:** V1 seam requirements indistinguishable from functional requirements
**Kind:** scope

## Finding

Several normative spec paragraphs exist solely to hold a forward-compatibility seam open — they constrain the V1 implementation only because a deferred extension named in [`future-considerations.md`](../../spec_topics/future-considerations.md) needs the surface in place. Concrete instances:

- `binder.md` — *Binder-invocation re-entrancy* (paragraph at the top of the page) holds the path open for an automatic `bind_context: session` retry.
- `binder.md` — *`candidates` field stays in the schema, runtime MUST NOT surface it* (covered in the failure-mode arms list, the schema, and rule 5 of System-note rendering) holds the surface open for the deferred binder refinement loop.
- `invocation.md` — *Argument-binding style* (the `style: "positional" | "named"` discriminator paragraph) holds the AST shape open for named-argument syntax.
- `invocation.md` — *Options surface* (open-struct options record paragraph) holds the per-call options bag open for a per-call timeout.
- `query.md` — *Options surface* (open-struct options record paragraph) holds the per-call options bag open for per-call timeout / `model` / `tools` / `system` overrides.
- `tool-calls.md` — *Options surface* (open-struct options record paragraph) holds the per-call options bag open for a per-call timeout.

Each paragraph is dense, sits flush with adjacent functional rules, and only signals its forward-compatibility role through a single trailing clause cross-linking [`future-considerations.md`](../../spec_topics/future-considerations.md). An implementing agent reading these pages cannot scan for "rules that exist only because of a seam" in one pass and risks two failure modes: (1) over-implementing the seam (e.g. wiring named-argument bindings now because the discriminator is exhaustive), or (2) treating the seam clause as removable optimisation surface during refactors.

The spec needs a consistent, scannable marker that distinguishes pure forward-compatibility paragraphs from functional V1 requirements while keeping both fully normative.

## Spec Documents

- `spec_topics/binder.md` — *Binder-invocation re-entrancy* paragraph (edited)
- `spec_topics/binder.md` — `ambiguous` arm + `candidates` field paragraphs (envelope schema, failure-modes list, System-note rendering rule 5) (edited)
- `spec_topics/invocation.md` — *Argument-binding style* paragraph (edited)
- `spec_topics/invocation.md` — *Options surface* paragraph (edited)
- `spec_topics/query.md` — *Options surface* paragraph (edited)
- `spec_topics/query.md` — `Ok` payload-as-`string` paragraph (option-dependent — same callout pattern would apply if the rule is reframed as a seam)
- `spec_topics/tool-calls.md` — *Options surface* paragraph (edited)
- `spec_topics/future-considerations.md` — referenced by every callout; cross-link targets must remain stable (read-only)
- `spec_topics/governance.md` — REQ-ID prefix table; the marker convention should not collide with existing markup conventions (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The fix is a pure spec-organisation reformat: the same paragraphs remain normative, the same observable behaviour is required. No leaf's *Tests* / *Ships when* changes. Leaves that already cite these paragraphs (V15d for the `style` discriminator, V16i / V16's ambiguous-arm leaves for `candidates`, V5/V6/V14/V15 leaves that consume the open-struct options surfaces) continue to test the same assertions. Whether the H6 REQ-ID pass treats seam paragraphs as a distinct prefix family is downstream of this finding's resolution but does not require a plan change today.

## Consequence

**Severity:** medium

Implementers can produce a working V1 system without the marker, but the unmarked seam paragraphs invite two specific mistakes: over-engineering the seam (named-argument binding, `candidates` rendering) at V1, or quietly dropping the seam during refactors because it reads as dead code. Both surface as spec-conformance regressions long after merge.

## Solution Space

**Shape:** single

### Recommendation

Introduce one consistent callout pattern for pure forward-compatibility paragraphs and apply it across the six known sites listed in *Spec Documents*. The callout is a Markdown blockquote whose first line is a bolded label naming the deferred extension; the body is the existing seam paragraph verbatim, with the existing `[Future Considerations](./future-considerations.md#…)` cross-link retained as the last clause.

Form:

```markdown
> **V1 seam — <deferred-extension-name>.** <existing paragraph text, including the trailing
> Future-Considerations cross-link.>
```

Concrete bindings:

| Spec page | Paragraph | Label |
| --- | --- | --- |
| `binder.md` | Binder-invocation re-entrancy | `V1 seam — automatic context escalation` |
| `binder.md` | `candidates` field retained, not rendered | `V1 seam — binder refinement loop` |
| `invocation.md` | `style: "positional" \| "named"` discriminator | `V1 seam — named-argument invocation` |
| `invocation.md` | Open-struct options record | `V1 seam — per-call timeout` |
| `query.md` | Open-struct options record | `V1 seam — per-call timeout / per-query overrides` |
| `tool-calls.md` | Open-struct options record | `V1 seam — per-call timeout` |

Edge cases the spec author must watch:

- The callout content remains fully normative — a `MUST` inside the blockquote is a `MUST` and must receive a REQ-ID at H6 the same way an unboxed paragraph does.
- The `candidates` rule is currently distributed across three locations on `binder.md` (failure-mode arms list, JSON schema block, System-note rendering rule 5). Wrap only the lead paragraph and leave the schema block and rule 5 unboxed; cross-link them back to the boxed paragraph rather than re-quoting.
- Do not promote inline single-clause seam mentions inside otherwise-functional paragraphs (e.g. the `realpath` race acknowledgement on `invocation.md` line 12 that ends "V1 accepts the residual (see Future Considerations …)") to callouts — the callout marker is reserved for paragraphs that are *purely* about holding a seam open. Mixed-purpose paragraphs stay as they are.
- The marker text `V1 seam — ` is sufficient for `grep`-based tooling; no separate machine-readable annotation is required at this stage.
- `governance.md`'s REQ-ID prefix table is unaffected; per-page prefixes (`BNDR-`, `INVK-`, `QRY-`, `TC-`) continue to apply to seam-callout content the same as functional content.

## Related Findings

- "Normative spec pages cite plan documents as enforcement gates — spec/plan boundary conflated" — same-cluster (both are spec-organisation findings about disambiguating the role of paragraphs in normative pages; resolve independently).
- "Governance page lacks \"not for implementing agents\" signal" — same-cluster (both want a scannable marker so implementers can identify which paragraphs constrain their work).
- "Reviewer SHOULD NOT directive belongs in governance, not in spec body" — same-cluster (both involve maintainer-oriented prose embedded in implementer-facing spec pages).
- "Observability bullet misplaced — belongs in a Non-Functional Requirements section" — same-cluster (broader pattern of categorising rules in normative pages so implementers can scan by intent).

## spec_topics/governance.md

---

# Governance page is unmarked as a meta-spec document

**Original heading:** Governance page lacks "not for implementing agents" signal
**Kind:** scope

## Finding

`spec_topics/governance.md` contains rules (GOV-1 through GOV-12) that govern how the spec corpus is *authored* — REQ-ID coining, anchoring, retirement, lifecycle, and CI gates over the Markdown source. None of the rules describe runtime behaviour, language semantics, or extension surface. GOV-10 and GOV-11 do address implementers, but only to scope their *reading discipline* over the spec corpus — they still concern the corpus as artefact, not the system being built.

Yet nothing in the page or its entry point distinguishes it from implementation-spec topics. `governance.md`'s opening sentence ("This page owns the spec corpus's REQ-ID governance…") describes its subject but does not tell an implementing agent that the obligations within do not produce code. Worse, the page is filled with normative-sounding language — "MUST be recorded," "MUST anchor matches at a word boundary," "the V18s gate treats any unmapped REQ-ID as a CI failure" — that pattern-matches as software requirements. In `spec.md`'s Appendix, Governance is listed as a peer of Glossary, Grammar Appendix, and Related Work with no marker:

> - [Governance](./spec_topics/governance.md) — REQ-ID prefix table, retirement registry, and the GOV-1 through GOV-8 rules…

An implementing agent following GOV-10 (read only the topics in your leaf's `**Spec**` field) is protected, but an agent doing exploratory reading of the spec, or any plan leaf whose `**Spec**` field happens to include `governance.md` (currently H6, V18s) reads dozens of MUSTs that look like runtime obligations and only resolve into spec-authoring obligations on careful inspection. The cost is reader time and risk of mis-implementation; the fix is one sentence.

## Spec Documents

- `spec_topics/governance.md` — opening orientation paragraph (edited)
- `spec.md` — Appendix bullet for Governance (edited)
- `plan_topics/conventions.md` — read-only (confirms GOV-10 / GOV-11 are the existing reading-scope mechanism)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The proposed edit is editorial framing only: it adds a self-describing banner sentence and a parenthetical in `spec.md`'s Appendix. No leaf's `Tests` or `Ships when` criteria change; H6's anchor pass operates on `**PREFIX-N.**` markers and is not sensitive to a new banner sentence; V18s gates parse the prefix table and `## Retired REQ-IDs` sections, neither of which moves.

## Consequence

**Severity:** low

An implementing agent who reads `governance.md` cold may spend time trying to translate GOV-1 through GOV-12 into runtime behaviour before realising they are spec-corpus obligations. No implementer would produce wrong runtime behaviour from this confusion (the rules do not describe runtime behaviour at all), but they may waste reading time and may quote GOV obligations in code-review threads where they do not apply.

## Solution Space

**Shape:** single

### Recommendation

Add a one-paragraph banner immediately under the `# Governance` H1 in `spec_topics/governance.md`, before the existing "This page owns…" sentence:

> *Audience.* This page is directed at spec maintainers and at the V18s CI gate, not at implementers of the loom runtime. It governs the spec corpus itself — how REQ-IDs are coined, anchored, retired, and gated — and sources no software requirement on the runtime, the binder, the type system, or the Pi integration. Implementers who restrict their reading per GOV-10 will reach this page only via H6 and V18s leaves.

In `spec.md`'s Appendix bullet for Governance, append a parenthetical marker so the meta-spec character is visible without clicking through:

> - [Governance](./spec_topics/governance.md) — *spec-corpus governance, not implementation spec.* REQ-ID prefix table, retirement registry, and the GOV-1 through GOV-12 rules…

Edge cases for the implementer applying this fix:

- The banner must not introduce a new `**GOV-N.**` marker — it carries no obligation and would inflate the dense-numbering range. Plain prose only.
- Update the bullet text to read "GOV-1 through GOV-12" (currently "GOV-1 through GOV-8") while making this edit; the spec body already defines GOV-9 through GOV-12 and the Appendix bullet has drifted.
- Do not add similar banners to `glossary.md`, `grammar.md`, or `related-work.md` even though they share the meta-spec character — those pages carry `(no IDs — narrative)` in the prefix table, which already signals their non-normative status. Governance is unique in carrying real REQ-IDs that nonetheless do not bind runtime behaviour, so it needs the explicit signal that the others do not.

## Related Findings

- "Reviewer SHOULD NOT directive belongs in governance, not in spec body" — same-cluster (both turn on the spec-authoring vs runtime-spec boundary; that finding moves a directive *into* governance, this one labels governance as the destination)
- "GOV-8 bookkeeping description is editorial cruft" — same-cluster (both observe that GOV rules describe spec bookkeeping and should not be cited as runtime obligations)
- "Normative spec pages cite plan documents as enforcement gates — spec/plan boundary conflated" — decision-dependency (if the plan-citation cleanup also lands, governance.md loses its plan_topics/v18-cancellation.md cross-links and the audience banner sharpens further; resolve this finding first since the banner is unconditional)
- "V1 seam requirements indistinguishable from functional requirements" — same-cluster (both ask for a structural marker to distinguish a sub-class of obligations from default-normative ones)
- "Meta-annotation labels (\"Orientation; this paragraph is informative\") are editorial cruft" — decision-dependency (that finding deletes inline informative-vs-normative labels; this one adds one banner. The two are compatible only if the banner is treated as page-level framing, not paragraph-level annotation — keep the banner, delete the inline labels)

## spec_topics/diagnostics.md

---

# Unenumerated diagnostic placeholders sit inside a normative section as a buried reviewer waiver

**Original heading:** Unenumerated placeholders buried inside normative section; non-goal mislocalised
**Kind:** scope

## Finding

The "Placeholder rendering (normative)" section in `spec_topics/diagnostics.md` opens with a paragraph titled "V1.0 closure scope (non-normative)" that lists roughly two dozen placeholder names appearing in the normative registry table — `<schema>`, `<X>`, `<enum>`, `<method>`, `<model>`, `<provider>`, `<source>`, `<capability>`, `<slug>`, `<name1>`, `<name2>`, `<path-a>`, `<path-b>`, `<higher>`, `<lower>`, `<A>`, `<B>`, `<root>`, `<fields>`, `<paths>`, `<list>`, `<kind>`, `<cap>`, `<ms>`, `<N>`, `<error>` — and concedes that none of them carries a binding rendering rule. The paragraph then says "Reviews SHOULD NOT re-raise the unenumerated placeholders as a V1.0 correctness finding."

Two distinct things are wrong with this. First, an implementing agent reading the registry table at `spec_topics/diagnostics.md` cannot structurally distinguish a row whose placeholders are fully pinned by one of the six categories from a row that uses placeholders the categories never enumerate. The closure-scope paragraph is the only signal, it lives several screens above most rows, and it is framed editorially ("non-normative") inside a section flagged "(normative)" — every signal points the wrong way. Second, the "Reviews SHOULD NOT re-raise…" sentence is a directive aimed at spec reviewers, not at anyone implementing or testing the runtime; embedding it in the normative diagnostics page is the same audience-mixing anti-pattern that recurs across the spec.

## Spec Documents

- `spec_topics/diagnostics.md` — Placeholder rendering (normative) (edited)
- `spec_topics/future-considerations.md` — Known V1 limitations (no seam expected) (edited)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. The relocation is editorial: H3's `Diagnostic` shape and serialiser, and V18s's diagnostic-code closure gate, both consume the registry-row set unchanged. No leaf currently asserts per-placeholder rendering vectors against the unenumerated names, and the V1.0 disposition (renderers MAY use the obvious extension) is preserved by the recommended rewrite.

## Consequence

**Severity:** low

Two conformant implementations can ship without disagreement on the six enumerated categories — that part is byte-pinned. They can still disagree on the rendering of every other placeholder, because the spec hands them the unenumerated set under a non-normative paragraph and leaves the choice of "obvious extension" to each implementer. The disagreement is bounded (the affected diagnostics are operator-facing panic and load messages, not author-facing parse errors that tests assert on), but the page misrepresents itself as fully closing placeholder rendering when it does not.

## Solution Space

**Shape:** single

### Recommendation

Make two coordinated edits.

In `spec_topics/diagnostics.md`, replace the current "V1.0 closure scope (non-normative)" paragraph with a short normative non-goal statement at the top of the **Placeholder rendering** section:

> **V1.0 scope.** The six categories below are the closed V1.0 placeholder-rendering surface. Registry rows whose `Message` template uses placeholder names outside the six categories carry no byte-identical rendering rule; conformant V1.0 implementations MAY render those placeholders by the obvious extension of the closest matching category, and tests asserting on those messages MUST treat the unenumerated portion as implementation-defined. Closing the placeholder map for every registry row is post-V1.0 work tracked under [Future Considerations — Diagnostic placeholder rendering closure](./future-considerations.md).

Drop the "Reviews SHOULD NOT re-raise…" sentence entirely; the cross-link to future-considerations.md is the structural signal that supersedes it.

In `spec_topics/future-considerations.md`, add a bullet under **Known V1 limitations (no seam expected)**:

> - **Diagnostic placeholder rendering closure.** V1.0 pins byte-identical rendering for six placeholder categories (`<type>`/`<expected>`/…, `<scrutinee summary>`/`<value>`, `<construct>`/`<expr>`, numerics, source-derived names and paths, and underlying-error first lines). The remaining placeholders that appear in registry rows — identifier-shaped (`<schema>`, `<X>`, `<enum>`, `<method>`, `<model>`, `<provider>`, `<source>`, `<capability>`, `<slug>`, `<name1>`, `<name2>`), path-shaped (`<path-a>`, `<path-b>`, `<higher>`, `<lower>`, `<A>`, `<B>`, `<root>`), list-valued (`<fields>`, `<paths>`, `<list>`), tag-valued (`<kind>`, `<cap>`), numeric-elsewhere (`<ms>`, `<N>`), and host-error-aliased (`<error>` ≡ `<error.message>`) — ship without a normative rendering rule in V1.0; implementations choose by the obvious extension of the nearest enumerated category. A post-V1.0 revision will close the map under the GOV-7 / GOV-8 lifecycle.
>   *Recorded at:* [Diagnostics — Placeholder rendering](./diagnostics.md).

Edge cases for the implementer:

- Move the unenumerated-placeholder list out of `diagnostics.md` and into `future-considerations.md` verbatim, so a `grep` for any specific placeholder name still resolves to the future-considerations page after the move.
- Preserve the standalone gap for `<list>` in `loom/runtime/reload-teardown-timeout` separately — that placeholder also appears in a normative test path (the `session_shutdown` teardown timeout), and the related finding flagged under "Related Findings" closes it with a bespoke rendering rule rather than rolling it into the deferred bucket.
- The "GOV-7 / GOV-8 closure posture remains in force for the categories that *are* enumerated" sentence currently in the buried paragraph is correct and should survive the rewrite — fold it into the new non-goal block (the closed category-to-placeholder map remains a spec-versioned breaking change).

## Related Findings

- "`<list>` placeholder in `reload-teardown-timeout` message unspecified" — same-cluster (touches the same placeholder gap on the same page; resolved by a bespoke rendering rule rather than by the deferral bucket above)
- "Reviewer SHOULD NOT directive belongs in governance, not in spec body" — same-cluster (identical anti-pattern: a reviewer-facing directive embedded in normative spec prose; both findings benefit from the same audience-separation discipline)
- "Governance page lacks 'not for implementing agents' signal" — same-cluster (the structural fix on both pages is to label the audience explicitly so implementing agents can skip reviewer-only material)
- "Numeric ceilings misplaced — belong in a Non-Functional Requirements section" — same-cluster (same misplacement pattern: normative material framed inappropriately for its surrounding section)

---

# `<list>` placeholder in `reload-teardown-timeout` message has no per-item format

**Original heading:** `<list>` placeholder in `reload-teardown-timeout` message unspecified
**Kind:** testability

## Finding

`spec_topics/diagnostics.md` line 346 pins the message template for `loom/runtime/reload-teardown-timeout` as:

> `reload teardown timed out after <ms>ms; <N> invocation(s) still in flight: <list>`

The accompanying prose describes `<list>` as containing "the still-in-flight invocations (slash name plus invocation id)" and nothing more. The V1.0 closure-scope note at line 69 of the same page does pin two of the three open variables — list-valued placeholders are joined by `", "` in source order, and `ActiveInvocationRegistry` (`Set<{ loomAbort; disposeBarrier }>`) iteration order is its insertion order, which matches the per-invocation registration order — but it does **not** pin the per-item rendering. Each item is a 2-tuple of slash-name + invocation-id, and no rule in the page maps that tuple to bytes: the separator between the two fields, whether the slash-name carries its leading `/`, and whether the invocation-id is rendered as a UUID, an opaque token, or a registry index are all unspecified.

A V18s-style conformance test that asserts on the rendered `message` field byte-for-byte against a fixture cannot be written. Two implementers handed the current text would reasonably produce e.g. `/foo:550e8400-e29b-41d4-a716-446655440000` vs `foo (550e8400…)` vs `foo#1` and both pass spec review. The blast radius is small (one diagnostic, console-only delivery channel) but the testability gap is real.

## Spec Documents

- `spec_topics/diagnostics.md` — Code registry row for `loom/runtime/reload-teardown-timeout` (line 346) (edited)
- `spec_topics/diagnostics.md` — V1.0 closure scope (line 69) (read-only — already pins list join + ordering)
- `spec_topics/pi-integration-contract.md` — Extension entry point step 4 and `ActiveInvocationRegistry` definition (read-only — defines the source-of-truth order and the invocation-id origin)

## Plan Impact

**Phases:** None

**Leaves (implementation order):**

None. No current plan leaf owns the `session_shutdown` teardown handler or asserts on `loom/runtime/reload-teardown-timeout`. V18s requires every registry code be asserted as a literal string by at least one test, but that gate operates on the code identifier, not the rendered message body, so the spec gap does not currently block any planned leaf. The future leaf that ships the `session_shutdown` handler — implicit in `pi-integration-contract.md` Extension entry point but not yet in `plan.md` — is what this fix unblocks for byte-equal fixture testing.

## Consequence

**Severity:** high

Two reasonable implementers will produce divergent byte sequences for the same in-flight invocation set. Any test that asserts on the diagnostic's `message` field is non-portable; tests that only assert on the registry code (per V18s) survive but lose the ability to verify that the rendered list actually identifies the offending invocations.

## Solution Space

**Shape:** single

### Recommendation

Pin the per-item rendering in the line-346 registry row's `message` column (or in the body prose immediately above it). Concretely, replace the parenthetical "(slash name plus invocation id)" with a normative clause:

> `<list>` is the comma-and-space-joined (`, `) sequence of `ActiveInvocationRegistry` entries in insertion order, each rendered as `/<slash-name>:<invocation-id>` where `<slash-name>` is the registered slash command name without its leading slash adjacent to the literal `/` prefix, and `<invocation-id>` is the per-invocation UUID the runtime allocates at handler entry (canonical lowercase 8-4-4-4-12 hex form per V14a's `loom-direct:<uuid>` convention).

Edge cases the implementer must handle:

- The diagnostic only fires when at least one `disposeBarrier` remains unsettled, so `<N> ≥ 1` and `<list>` is never empty by construction — no empty-list rendering rule needed.
- If the runtime grows a per-invocation id distinct from the V14a `loom-direct:<uuid>` (e.g. for tool-exposed looms whose `toolCallId` originates from Pi), the spec must say which id `<invocation-id>` refers to. Recommend the runtime-allocated id, not the upstream Pi-allocated one, so the rendering is uniform across slash, tool-execute, and child-`invoke` entry points.
- Once pinned, this row should also be added under `diagnostics.md`'s closure-scope note as an explicit case so the GOV-7/GOV-8 closure status of `<list>` for this row is no longer "unenumerated by obvious extension."

## Related Findings

- "Unenumerated placeholders buried inside normative section; non-goal mislocalised" — same-cluster (the meta-finding about how `<list>` appears in the closure note as still-unenumerated; this finding pins one of the two remaining list-valued sites)
- "`remainingShutdownBudget` never defined — shutdown timeout formula unverifiable" — co-resolve (the `<ms>` placeholder in the same message template is the other unverifiable variable; both should be closed in the same edit pass for the `reload-teardown-timeout` row)

## spec_topics/binder.md

---

# `loom/load/binder-model-not-strict-capable` is unreachable in V1 with no test seam

**Original heading:** `loom/load/binder-model-not-strict-capable` code is structurally unreachable in V1 — no test seam
**Kind:** testability

## Finding

`spec_topics/binder.md` (Strict-capability requirement) explicitly states that under the pinned `pi-coding-agent ^0.72.1`, `Model<Api>` exposes no per-model strict-capability field, so the strict-capability check at loom load is universally degraded to best-effort: every resolved binder model emits `loom/load/binder-model-strict-capability-unknown` (W) and registers. The error-level code `loom/load/binder-model-not-strict-capable` (E) is reserved for "a future `pi-coding-agent` minor [that] adds a strict-capability indicator" and is documented as not firing under the V1 pin. The plan codifies this by marking the V16e behaviour test for that code as **skipped under `^0.72.1`** (see `plan_topics/v16-binder.md` V16e Tests).

The result is a documented dead branch: the diagnostic code sits in the `diagnostics.md` registry, the V16e Tests bullet names it, the V18s gate (2) (Diagnostic-code registry closing gate) is satisfied because the literal string appears in test source, but no test execution ever exercises the emission path. The code can rot silently and the only mechanical signal of breakage is a manual step in the Pi version bump procedure (step 6 — "Update the strict-capability indicator (binder)"), which by construction runs only after `Model<Api>` already exposes the field upstream.

The mismatch is between (a) a normative E-level diagnostic that ships in V1, (b) registry/coverage gates that count its presence as "covered", and (c) zero behavioural verification that the emission path actually works. A future Pi minor that exposes `strictCapable` will be the first event to discover any regression in the dead branch — well after the regression could have been introduced.

## Spec Documents

- `spec_topics/binder.md` — Binder model / strict-capability requirement (option-dependent)
- `spec_topics/diagnostics.md` — Code registry rows for `loom/load/binder-model-not-strict-capable` and `loom/load/binder-model-strict-capability-unknown` (option-dependent)
- `spec_topics/pi-integration-contract.md` — `ExtensionContext` interface (`modelRegistry: ModelRegistry`); SDK capability item 7; Pi version bump procedure step 6 (read-only)
- `spec_topics/frontmatter.md` — `bind_model` row referencing the diagnostic (read-only)
- `spec_topics/discovery.md` — `looms.binderModel` setting paragraph referencing the registry-capability check (read-only)

## Plan Impact

**Phases:** Horizontal, Vertical V16, Vertical V18

**Leaves (implementation order):**

- H1 — SDK surface-inventory test (read-only — already enumerates capability 7 by diagnostic code only; unaffected by either option but a documentation-only edit may be needed if Option B introduces an exemption mechanism)
- V16e — `bind_model` resolution chain (modified — owns the strict-capability check, the fake `ModelRegistry` test fixture, and the currently-skipped not-strict-capable test)
- V18s — Coverage-matrix closing CI gate (option-dependent — gate (2) currently passes vacuously on the literal grep; under Option B it grows an explicit allow-list mechanism)

## Consequence

**Severity:** low

The V1 user-visible behaviour is correct (the W-level diagnostic fires, looms register, malformed envelopes surface via the V16o template). The defect is a verification hole: an E-level diagnostic that ships as part of the V1 contract has no executed test asserting its emission, and the V18s gate cannot detect this because the literal string is present in (skipped) test source. When a Pi minor finally adds the indicator and the bump procedure unskips the test, any regression introduced in the interim surfaces for the first time at upgrade — exactly the moment the spec promises the contract has been "re-validated".

## Solution Space

**Shape:** multiple

### Option A — Stub the `Model<Api>` strict-capability field via the existing `ModelRegistry` seam

**Approach.** V16e already builds a fake `ModelRegistry` that records `find(provider, modelId)` calls (per the V16e Tests bullet). Define the strict-capability check as a duck-typed read on the returned `Model<Api>` — three-valued: `strictCapable === true` → ok; `strictCapable === false` → emit E-level `loom/load/binder-model-not-strict-capable`; absent / `undefined` → emit W-level `loom/load/binder-model-strict-capability-unknown`. Real `^0.72.1` `Model<Api>` continues to lack the field, so production behaviour is the universal-W branch as the spec already requires. The V16e fake returns a synthetic `Model<Api>` whose `strictCapable: false` exercises the E-level branch in tests today.

**Spec edits.**
- `spec_topics/binder.md` strict-capability paragraph: replace "inspecting the returned `Model<Api>` for a strict-capability indicator" with the explicit three-valued read rule against a property whose name (`strictCapable` or whatever Pi's eventual name will be) the spec pins now. State that the runtime probes the field by name, treats `undefined` as "unknown", `false` as "not capable", `true` as "capable". Remove the sentence "[the E-level code] does not fire under ^0.72.1" — under the duck-typed read it can fire whenever a caller (test or future Pi) supplies `strictCapable: false`.
- `spec_topics/diagnostics.md`: no row changes; the description text on the E-level row may be tightened to reference the duck-typed field rather than "Pi's model registry [flagging]".
- `spec_topics/pi-integration-contract.md` Pi version bump procedure step 6: reframe as "if Pi's chosen field name differs from the loom-side probe name, rename the probe constant in the same edit"; the path is no longer "stops being universally degraded" because it was never universally degraded once the duck-typed read was specified.

**Pros.**
- Removes the dead branch entirely; the E-level emission is exercisable today against the existing seam.
- V18s gate (2) becomes meaningful for this row instead of vacuously satisfied by a skipped test.
- No new exemption mechanism; no growth of the V18s allow-list surface.
- Forward-compatible: when Pi adds the field, the runtime sees it without code change (provided Pi uses the pinned name).

**Cons.**
- Spec must commit to a probe field name *now*, before Pi defines one. If Pi picks a different name later, the bump procedure must include a rename (manageable — already step 6's territory).
- Runtime reads a field that is structurally absent from the typed `Model<Api>` shape under `^0.72.1`, requiring a `(model as Record<string, unknown>).<probeName>` access or equivalent. This is a small, localised type-safety concession.

**Risks.**
- Pi names the field something other than the probed name. Mitigated by step 6's rename obligation and the H1 SDK surface-inventory test (which would notice the new field on the namespace and force a probe-side update).

### Option B — Document an explicit V18s exemption and route the dead code through a guarded sentinel

**Approach.** Add an allow-list mechanism to V18s gate (2) for diagnostic codes that are intentionally unreachable under the V1 dependency pin. The V16e implementation guards the E-level emission behind a `// V1: unreachable until pi-coding-agent exposes per-model strict-capability` marker that throws or asserts-unreachable if reached. The diagnostic row in the registry stays; the code constant in the H3 diagnostics module gets a `@dead-in-v1` tag. The Pi version bump procedure step 6 acquires an explicit "remove the `@dead-in-v1` tag, delete the unreachable guard, unskip the V16e test" obligation.

**Spec edits.**
- `spec_topics/diagnostics.md`: tag the row (e.g. add a `Status: dead-in-V1 (re-enabled by Pi minor exposing strict-capability indicator)` column or footnote).
- `plan_topics/v18-cancellation.md` V18s gate (2): extend the literal-grep contract to subtract a curated allow-list of `@dead-in-v1` codes, with a corresponding gate-side check that every allow-listed code is also tagged in the diagnostics registry (catches drift between the two).
- `plan_topics/v16-binder.md` V16e: keep the skipped test, add a complementary test that asserts the unreachable guard fires if the surrounding code is reached (enforces the "dead" property mechanically).
- `spec_topics/pi-integration-contract.md` Pi version bump procedure step 6: extend with the un-skip / de-tag obligations.

**Pros.**
- Preserves the spec's current framing (the E-level code "does not fire under ^0.72.1") verbatim.
- No type-safety concession on the `Model<Api>` shape.

**Cons.**
- Introduces an exemption mechanism into V18s purely for one diagnostic code. The exemption must itself be tested (gate-on-the-gate), and every future "intentionally dead in V1" code grows the allow-list.
- The dead branch remains untested; bit-rot risk persists. The "guard fires if reached" test only proves the guard itself, not the surrounding emission code.
- Step 6 of the bump procedure stays a manual checklist item that humans can miss.

**Risks.**
- Future contributors treat the allow-list as a general escape valve for "I couldn't write a test", eroding the V18s gate.

### Option C — Remove the E-level diagnostic from the V1 registry; reintroduce it on Pi bump

**Approach.** Drop `loom/load/binder-model-not-strict-capable` from `diagnostics.md` and the H3 constants module entirely for V1. The V1 strict-capability check has only two outcomes: capable (no emission) or unknown (W). When Pi adds the indicator, the version bump procedure step 6 re-introduces the E-level row, the constant, the V16e test, and any cross-references in `binder.md` / `frontmatter.md` / `discovery.md`.

**Spec edits.**
- `spec_topics/diagnostics.md`: delete the row.
- `spec_topics/binder.md`, `spec_topics/frontmatter.md`, `spec_topics/discovery.md`: drop the references; reword the binder paragraph to enumerate only the `unresolved` and `unknown` (W) outcomes.
- `spec_topics/pi-integration-contract.md` step 6: re-scope to "introduce the new diagnostic code, the registry row, the V16e test, and the cross-references in the same edit" rather than "update the indicator".
- `plan_topics/v16-binder.md` V16e: drop the skipped test row; the `loom/load/binder-model-not-strict-capable` literal is no longer mentioned.

**Pros.**
- No dead code, no skipped test, no exemption mechanism. V18s gate (2) is meaningful by construction.
- Simplest V1 surface.

**Cons.**
- The diagnostic table no longer documents the eventual error code, breaking the "diagnostic registry as forward-looking contract" frame the spec currently uses.
- Re-introduction at bump time is a multi-file edit instead of a single-line constant edit, making the bump procedure heavier.
- Loses the cross-reference value that `frontmatter.md` and `discovery.md` currently get from naming the diagnostic.

**Risks.**
- A reader of V1 has no in-spec signal that strict-capability mismatches exist as a concept, only that the field is "best-effort".

### Recommendation

Adopt **Option A**. Specify the strict-capability check as a duck-typed read on a probe field name pinned by the spec (`strictCapable` is the natural choice unless the runtime author has a stronger candidate), with three outcomes (`true` / `false` / absent). The V16e fake `ModelRegistry` already exists; extend it to return a synthetic `Model<Api>` with `strictCapable: false` to exercise the E-level branch, and with `strictCapable: undefined` to exercise the universal-W branch. The implementer must (a) commit to the probe field name in the binder paragraph, (b) access the field via a typed cast (e.g. `(model as { strictCapable?: boolean }).strictCapable`) so the type concession is localised and audit-greppable, and (c) update step 6 of the Pi version bump procedure to require renaming the probe constant if Pi adopts a different field name.

Edge cases the implementer must watch:
- A future Pi version that exposes the field under a different name leaves the probe reading `undefined` and the runtime emits the W-level diagnostic forever — the H1 SDK surface-inventory test must grow an assertion that catches "field present on `Model<Api>` namespace but not under the probed name".
- The duck-typed read must not throw on `null` models (e.g. `ModelRegistry.find` returning `null` for an unresolved model is governed by `loom/load/binder-model-unresolved` and must short-circuit before the strict-capability probe runs).

## Related Findings

- "Provider error mapping MUST re-validate on upgrade — no CI gate" — same-cluster (different MUST, same Pi-version-bump verification-hole pattern; resolves independently)
- "Seed-field mapping MUST re-validate on upgrade — no CI gate" — same-cluster (ditto)

## spec_topics/pi-integration-contract.md

---

# Seed-field re-validation MUST has no enforcement seam in the Pi version bump procedure

**Original heading:** Seed-field mapping MUST re-validate on upgrade — no CI gate
**Kind:** testability

## Finding

`spec_topics/pi-integration-contract.md` — **Provider seed-field mapping** asserts that the four-row provider→seed-field table is "version-coupled to `@mariozechner/pi-ai` and MUST be re-validated on each upgrade." The same paragraph then concedes that V1.0 ships the V16h fixtures inside `npm test` but does not enumerate them as a step of the **Pi version bump procedure** below, classifies the gap as "post-V1.0 maintenance follow-up", and instructs reviewers not to re-raise it.

The numbered six-step procedure on the same page (steps 1–6) does mention re-typecheck, surface-inventory, `engines.node`, the `peerDependencies` literal move, the capability-probe constants, and the strict-capability indicator — but it never mentions the seed-field table. A contributor who follows the checklist verbatim, sees green H1 tests, and merges the bump commit will have satisfied every enumerated gate without ever re-running the V16h fixtures against the candidate Pi minor; the MUST is therefore unenforceable by the procedure that is supposed to enforce it.

The fixtures themselves do exist (per V16h tests), so on a CI that runs the full `npm test` against `main` after the bump, drift would be caught — but only for *removed* or *renamed* fields on the four currently-supported `Api` values. There is no test that enumerates `Api` values present in pi-ai's model registry against the seed-field table, so a Pi minor that introduces a fifth `Api` (or splits an existing one) silently leaves that provider with `omitted` semantics by default of falling off the table; nothing fails. The "MUST re-validate" obligation is left entirely to the contributor's diligence, with the spec then explicitly waiving review pressure on the gap.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — Provider seed-field mapping paragraph (edited)
- `spec_topics/pi-integration-contract.md` — Pi version bump procedure section (edited)
- `spec_topics/pi-integration-contract.md` — Provider error mapping paragraph (read-only — sibling structure, edited under the related finding)
- `plan_topics/h1-scaffold.md` — H1 SDK surface-inventory test description (option-dependent — only edited if the new gate is mechanised through H1's inventory rather than V16h's fixtures)
- `plan_topics/v16-binder.md` — V16h test bullet (edited)

## Plan Impact

**Phases:** Horizontal, Vertical V16

**Leaves (implementation order):**

- H1 — Repository scaffold and test framework — (modified)
- V16h — Binder determinism settings — (modified)

## Consequence

**Severity:** medium

A contributor following the bump checklist verbatim can widen `peerDependencies` past a Pi minor that adds, renames, or splits an `Api` value without ever exercising the seed-field table. The spec waives review pressure on the gap, so the MUST relies entirely on contributor diligence. The most likely failure mode is silent: a new provider with no table row inherits `omitted`, binder requests carry no seed for it, and reproducibility is lost without any test or diagnostic firing.

## Solution Space

**Shape:** single

### Recommendation

Wire the seed-field re-validation as a procedural-and-mechanical gate in two coordinated edits, then drop the waiver.

1. **Add a new step to the Pi version bump procedure** (between current steps 5 and 6, after the constant block is updated and before the strict-capability check). Wording shape:

   > **Re-validate the provider seed-field table.** Run the V16h provider seed-field fixtures against the candidate `@mariozechner/pi-ai` minor. If any supported `Api` value's seed field has been renamed, retyped, or moved between the supporting and non-supporting sets, update the table in [Provider seed-field mapping](#provider-seed-field-mapping) and the V16h fixture inputs in the same commit. If the candidate minor introduces a new `Api` value not yet listed, add a row (with `omitted` as the conservative default unless pi-ai documents a seed field) and a corresponding fixture in the same commit. The H1 `Api`-coverage test (below) is the mechanical gate that fails until this step has been completed.

2. **Add an `Api`-coverage assertion to the H1 SDK surface-inventory test.** The existing test imports `@mariozechner/pi-coding-agent` and walks the seven named capabilities; extend it to also enumerate the `Api` literal-union values exposed by pi-ai's model registry surface and assert that every value appears as a row key in the seed-field table constant (which becomes the single source of truth, mirrored from the spec table). A new pi-ai `Api` value lights up the H1 test red at the bump commit, exactly parallel to how a new SDK capability does today. This is the mechanical equivalent of the surface-inventory gate cited in `h1-scaffold.md` and explicitly invoked by the bump procedure.

3. **Update V16h's tests** to read provider rows from the same shared constant the H1 coverage test enumerates, so the per-provider seed-presence assertions and the H1 inventory assertion cannot drift from each other.

4. **Remove the `Reviews SHOULD NOT re-raise…` sentence and the "post-V1.0 maintenance follow-up" framing** from the seed-field paragraph. With steps 1–3 in place the gap is closed, and the waiver becomes inappropriate.

Edge cases the implementer must watch:

- pi-ai's `Api` surface is a TypeScript literal union, not a runtime-iterable list. The H1 test cannot enumerate it via reflection; the test must consume the canonical list from the same constant the runtime classifier uses, and a separate type-level assertion (`type Check = Api extends keyof typeof SEED_FIELD_TABLE ? true : never; const _: Check = true;`) is what catches drift at typecheck time. The H1 test's role is then to assert table-key membership against the same constant the type check guards.
- "Adding a row with `omitted` as the conservative default" must not silently regress a provider that pi-ai *did* add seed support for. Document this in the new step as a contributor instruction: when adding a row, the contributor MUST consult pi-ai release notes and the new provider's request adapter source to decide between a named field and `omitted`.
- The new step parallels (but is distinct from) the analogous step required by the sibling provider-error-mapping finding. The two steps should be added in the same edit but kept as separate numbered items, since the fixtures and tables are independent and a contributor may bump pi-ai for reasons that affect only one.

## Related Findings

- "Provider error mapping MUST re-validate on upgrade — no CI gate" — co-resolve (identical structural gap; the bump-procedure edit and the H1-inventory expansion follow the same pattern, ideally landed in the same commit)
- "`loom/load/binder-model-not-strict-capable` code is structurally unreachable in V1 — no test seam" — same-cluster (also a version-coupled re-validation surface; bump-procedure step 6 already covers the strict-capability indicator, so the fix shape differs but the cluster is the "version-coupled MUSTs that lack a mechanical bump-time gate")

---

# Shutdown-timeout formula references undefined `remainingShutdownBudget`

**Original heading:** `remainingShutdownBudget` never defined — shutdown timeout formula unverifiable
**Kind:** testability

## Finding

Step 4 sub-step 3 of the Extension entry point bounds the `Promise.allSettled(activeInvocations.map(inv => inv.disposeBarrier))` await with `Math.min(2000ms, remainingShutdownBudget)`, "measured against the runtime's injected `Clock` seam." The same expression is reproduced verbatim in the trigger column of the `loom/runtime/reload-teardown-timeout` row in `spec_topics/diagnostics.md`. The identifier `remainingShutdownBudget` appears only at those two sites — it is never typed, never sourced, never given a unit, default, or floor, and no surface (handler argument, `Clock` method, registry field, settings key, environment variable) is identified as the channel that delivers it to the handler.

The Pi SDK provides nothing of the sort. The `SessionShutdownEvent` shape exposed to `pi.on("session_shutdown", handler)` carries `type`, `reason`, and an optional `targetSessionFile` — no deadline, no budget, no parent timer. The `ExtensionContext` actions (`getSignal`, `abort`, `shutdown`, `getModel`, `isIdle`, `hasPendingMessages`, etc.) likewise expose no deadline. There is therefore no host-supplied operand for the formula to reduce against.

The consequences are mechanical. A test using `FakeClock` cannot drive `Math.min(2000ms, remainingShutdownBudget)` to a fixed deadline because one operand is undefined; an implementer cannot resolve which value to read at handler entry; and the `<ms>` placeholder in the `loom/runtime/reload-teardown-timeout` message template (`reload teardown timed out after <ms>ms; ...`) cannot be asserted against a known fixture, so the V18s diagnostic-code gate has nothing to bind to.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — Extension entry point step 4 sub-step 3 (edited)
- `spec_topics/diagnostics.md` — `loom/runtime/reload-teardown-timeout` row (edited)
- `spec_topics/cancellation.md` — second-trigger paragraph that cross-references step 4 (read-only)

## Plan Impact

**Phases:** None

**Leaves (implementation order):** None

The `session_shutdown` handler — its subscription, the `ActiveInvocationRegistry`, the bounded `Promise.allSettled` await, and the `loom/runtime/reload-teardown-timeout` emission — has no closing leaf in the current plan. No leaf's acceptance criteria reference the shutdown formula or the timeout diagnostic, so resolving this finding does not modify or unblock any existing leaf. (The orthogonal absence of any leaf that *implements* the handler is a separate coverage-matrix gap.)

## Consequence

**Severity:** high

Two implementers will diverge on the bound: one will treat `remainingShutdownBudget` as "no extra cap" and use a flat 2000 ms, another will invent a settings key or environment variable, a third will return immediately on the assumption that an undefined operand makes `Math.min` resolve to `NaN`. The corresponding diagnostic message will be unreproducible across implementations, defeating the V18s gate that asserts every diagnostic code surfaces against a known fixture.

## Solution Space

**Shape:** single

### Recommendation

Drop the `Math.min(2000ms, remainingShutdownBudget)` formulation. Pi does not deliver a shutdown budget to extensions, and there is no other in-scope source for one. Replace it with a single fixed cap.

Concretely, edit `spec_topics/pi-integration-contract.md` step 4 sub-step 3 to read along the lines of:

> **Await subagent disposal.** `await Promise.allSettled(activeInvocations.map(inv => inv.disposeBarrier))`, bounded by the constant `SHUTDOWN_AWAIT_CAP_MS = 2000` measured against the runtime's injected `Clock` seam (deadline = `Clock.now() + SHUTDOWN_AWAIT_CAP_MS` captured at handler entry; the await resolves on the earlier of `Promise.allSettled(...)` settling or `Clock.setTimeout(SHUTDOWN_AWAIT_CAP_MS, ...)` firing). On timeout the runtime emits one `loom/runtime/reload-teardown-timeout` diagnostic and proceeds to step 4. The constant lives in the same source-of-truth pinned-constants block as the Step 0 capability-probe constants so H1's literal-read tests can assert it.

Edit the `loom/runtime/reload-teardown-timeout` row in `spec_topics/diagnostics.md` to match — replace `Math.min(2000ms, remainingShutdownBudget)` with `SHUTDOWN_AWAIT_CAP_MS (2000ms)`.

Edge cases the implementer must observe:

- `Clock.now()` is captured **once** at handler entry; the deadline is absolute, not a refreshing 2000 ms slide, so a slow `loomAbort.abort()` propagation in sub-step 2 does not extend the await.
- The pending `Clock.setTimeout` handle is cleared on the success path so a reload that completes in 5 ms does not leak a 1995 ms timer onto the about-to-be-invalidated runtime.
- `<ms>` in the diagnostic message renders the *elapsed* wall time at timeout (`Clock.now() - start`), not the cap; this stays asserted via `FakeClock.advance(2000)` driving a deterministic value.
- The constant is named in source so the H1 literal-read test consumes it from the same constants block as Step 0's `>=20.6.0`, `^0.72.1`, and the AbortSignal member list (per `spec_topics/pi-integration-contract.md` Step 0 "four pinned constants" rule).

## Related Findings

- "`<list>` placeholder in `reload-teardown-timeout` message unspecified" — co-resolve (same diagnostic row, same handler; both fixes land together as a single edit to the message template and the corresponding sub-step)

---

# Forced-respond turn produces no specified `ValidationError` payload when the model emits plain text

**Original heading:** Provider compatibility for typed queries: observable output when model ignores forced-tool selection is unspecified
**Kind:** testability

## Finding

The "V1 diagnostic limitation" paragraph in `spec_topics/pi-integration-contract.md` (the paragraph immediately after **Provider compatibility for typed queries**) states that when a supported provider routes a typed query but the underlying model ignores forced-tool selection — the common case for OpenAI-compatible local backends — "the visible symptom is a `validation` error with `respond_repair.attempts` exhausted." That fixes the `kind` and (loosely) `attempts`, but it does not fix the rest of the `ValidationError` payload defined in `spec_topics/errors-and-results.md`:

- **`validation_errors: array<ValidationIssue>`** — On a normal `schema_validation` exhaustion the array is the AJV failures from the final malformed payload. On the "model never called the respond tool" path AJV had no tool-call arguments to inspect, so the spec leaves the array's contents undefined: empty? a synthesised single `ValidationIssue`? a per-attempt accumulated list? Each option is plausible and observably different.
- **`raw_response: string | null`** — The model produced plain text on each forced respond turn. Whether `raw_response` carries that text (and which turn's text — the last one, or the joined sequence) versus `null` is not stated.
- **`cause`** — `errors-and-results.md` lists exactly two arms: `schema_validation` and `empty_template`. Neither describes "forced tool was offered, model ignored it." The implicit assignment to `schema_validation` is correct by elimination but never spelled out.
- **`attempts`** — "Exhausted" matches `respond_repair.attempts` only when respond-repair triggers on every forced respond turn. The spec never states that a plain-text reply on a forced respond turn counts as a validation failure (rather than as, say, `tool_loop_exhausted` per the curious "`last_tool_name: null` when exhaustion fired on the forced respond turn of a typed query (the model never picked the respond tool within the budget)" line in `errors-and-results.md` for `ToolLoopExhaustedError`). Two reasonable implementers could land on different `kind`s for this scenario.

V13g's acceptance test ("attempts exhausted → `Err({kind:"validation", attempts: N})`") sidesteps all four points. A future test gated on "stub provider returns plain text on every forced-respond turn" cannot be written deterministically without the contract being stated.

## Spec Documents

- `spec_topics/pi-integration-contract.md` — **Provider compatibility for typed queries** / **V1 diagnostic limitation** paragraphs (edited)
- `spec_topics/errors-and-results.md` — **`ValidationError`** schema and `cause` arm enumeration (edited)
- `spec_topics/query.md` — **Typed queries are tool-loop-shaped** / **Schema-validation respond-repair** / **Non-validation failures during a respond-repair follow-up** (read-only)

## Plan Impact

**Phases:** Vertical V6, Vertical V13

**Leaves (implementation order):**

- V6l — Two-phase tool-loop driver for typed queries — (modified)
- V13g — Respond-repair methodology: `validator_error` — (modified)
- V13i — Respond-repair methodology: `none` — (modified)

## Consequence

**Severity:** high

Two implementers shipping V6l + V13g against the same fixture set can produce divergent observables for the "model ignored forced tool" path: one synthesises a `ValidationIssue { schema_keyword: "required", … }` and populates `raw_response`, another emits `validation_errors: []` and `raw_response: null`, a third routes the case through `tool_loop_exhausted` instead. All three pass the existing V13g test ("attempts exhausted"). Loom authors writing recovery via `match` cannot rely on a stable shape; reviewers cannot mechanically reject any of them.

## Solution Space

**Shape:** single

### Recommendation

Amend the **V1 diagnostic limitation** paragraph in `spec_topics/pi-integration-contract.md` to specify the full observable, and amend `spec_topics/errors-and-results.md` to admit the synthesised issue. Concretely:

- A forced respond turn on which the model emits plain text (no `__loom_respond_<slug>` tool-use block) MUST be classified as a schema-validation failure, not as `tool_loop_exhausted`. The runtime synthesises a single `ValidationIssue` for that turn:

  ```
  { path: "", schema_keyword: "required",
    message: "model returned plain text instead of calling the forced respond tool" }
  ```

  This issue feeds the same respond-repair pipeline as an AJV failure: it consumes one `respond_repair.attempts` slot, and the follow-up template is the methodology-appropriate one (the `validator_error` template's `<validator-errors>` placeholder is rendered from this synthesised issue exactly as if AJV had produced it).

- Terminal exhaustion returns:
  ```
  Err(QueryError {
    kind: "validation",
    cause: "schema_validation",
    attempts: respond_repair.attempts,                    // the configured budget
    validation_errors: [<the synthesised issue from the final attempt>],
    raw_response: <the plain-text body of the final forced respond turn>,
    message: "model did not call the forced respond tool"
  })
  ```

- With `respond_repair.methodology: none`, the *first* forced respond turn that produces plain text returns the same `Err` shape with `attempts: 0` (no follow-ups issued, consistent with the existing `none` contract).

- `ToolLoopExhaustedError`'s "`last_tool_name: null` when exhaustion fired on the forced respond turn" clause in `errors-and-results.md` stays scoped to its actual case: `tool_loop.max_iterations` was already saturated by free-phase rounds before the forced respond turn could be issued. The "model ignored forcing" path never reaches `tool_loop_exhausted`.

Edge cases the implementer must watch:
- A stub provider that alternates plain-text and a malformed tool-call payload across respond-repair attempts produces a mixed `validation_errors` final value — assert that only the *last attempt's* issues appear, not an accumulation across attempts (consistent with current spec wording, which speaks of "the final malformed assistant text").
- `raw_response` is the plain-text body of the *last* forced respond turn, not the concatenation across attempts.
- The synthesised `ValidationIssue.path` is `""` (the JSON Pointer to the document root), not `"/"` — match the empty-path convention AJV uses for root-level failures so V6j's path-shape test does not need a special case.

## Related Findings

- "`respond_repair` (underscore) vs `respond-repair` (hyphen) inconsistency" — same-cluster (the recommendation here uses both spellings the same way the existing spec does; resolving the naming finding will mechanically rewrite the recommended text but not change its content).
- "Discarded-query `Err` always-log emission: contradiction between query.md and pi-integration-contract.md" — same-cluster (both findings concern the observable surface of `kind: "validation"` `Err`s; resolutions are independent but a fixer touching one will likely re-read the other).
- "Provider error mapping MUST re-validate on upgrade — no CI gate" — same-cluster (both touch the V1 supported-provider set in `pi-integration-contract.md`; resolve independently).

## spec_topics/query.md vs. spec_topics/pi-integration-contract.md

---

# Discarded-query `Err` emission contradicts the always-log exclusion list

**Original heading:** Discarded-query `Err` always-log emission: contradiction between query.md and pi-integration-contract.md
**Kind:** testability

## Finding

Two normative spec rules disagree about the operator-facing observable for a discarded query that returns `Err`.

`spec_topics/query.md` § *Observability of discarded results* states that `let _ = @\`...\`` and the equivalent `void`-tail form preserve the failure operator-side: *"On the operator-facing surface, an `Err` from a discarded query is preserved as a runtime event on the always-log set defined in [Pi Integration Contract — Runtime event channel]."* Read literally, this asserts that **every** `Err` from a discarded query reaches the channel.

`spec_topics/pi-integration-contract.md` § *Runtime event channel* defines the always-log set as a fixed partition of the nine `QueryError` variants. Four of the nine — `validation`, `context_overflow`, `cancelled`, and `invoke_callee_error` — are *deliberately excluded*, with the rule applying *"regardless of whether the author matched the `Err`, propagated it via `?`, or discarded it via `let _ =`."* The exclusion rationale (validation is a "query-internal repair signal whose final outcome is what matters", `context_overflow`/`cancelled` are "self-explanatory in context", `invoke_callee_error` is already covered by the inner `Err`'s origin emission) is written without considering the discard case, where: (a) the validation `Err` *is* the terminal outcome — there is no later "eventual terminal event" to carry the count; and (b) for `context_overflow` and `cancelled` the user-facing surface is by definition silent under discard, so "self-explanatory in context" no longer holds.

Net effect: for a discarded `let _ = @\`...\``, four of the nine `QueryError` variants are unobservable in any normative way — `query.md` says one thing, `pi-integration-contract.md` says the opposite, and a conformance test cannot decide whether to assert `loom-system-note` emission or assert its absence. The plan (`plan_topics/v18-cancellation.md` § V18q test (b)) has silently chosen the pi-integration-contract reading: *"discarding does not promote them into the always-log set."* That decision needs to be reflected in the spec, with the rationale extended to cover the discard case.

## Spec Documents

- `spec_topics/query.md` — Observability of discarded results (edited)
- `spec_topics/pi-integration-contract.md` — Runtime event channel, always-log exclusion list and rationale (edited)
- `spec_topics/errors-and-results.md` — QueryError variants (read-only — discriminator inventory of the nine variants)

## Plan Impact

**Phases:** Vertical V5, Vertical V15, Vertical V18

**Leaves (implementation order):**

- V5e — Prompt-mode conversation driver — (modified) — its cross-link to V18q already encodes Option-A semantics ("`let _ = @\`...\`` of an always-log-set `Err` emits exactly one `display: false` runtime event"); the modifier "always-log-set" becomes redundant once the spec is tightened, but the bullet still reads correctly
- V15m — `InvokeCalleeError` variant with recursive `inner` — (modified) — its cross-link "`invoke_callee_error` is excluded from the always-log set; this leaf asserts zero `RuntimeEvent` emissions for the wrapper itself" inherits the discard-included exclusion automatically
- V18q — Runtime event channel and always-log emission — (modified) — owns the canonical Option-A test: *"The four excluded kinds (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`) produce zero events at the always-log channel — including when surfaced through a `let _ = @\`...\`` discard or a `void`-tail-expression discard (discarding does not promote them into the always-log set)"*

## Consequence

**Severity:** high

Two reasonable implementers reading only `query.md` vs. only `pi-integration-contract.md` will produce divergent runtime behaviour for discarded `validation` / `context_overflow` / `cancelled` / `invoke_callee_error` failures. A conformance test cannot be written today that closes both interpretations. The plan resolves the ambiguity in V18q by fiat, but the spec — the document the V1 conformance suite is supposed to certify — does not.

## Solution Space

**Shape:** multiple

### Option A — Tighten `query.md` to defer to the exclusion list

**Approach.** Amend `query.md` § *Observability of discarded results* so the operator-surface guarantee is explicitly conditioned on always-log membership. Concretely: replace *"an `Err` from a discarded query is preserved as a runtime event on the always-log set"* with *"if the `Err`'s `kind` is in the always-log set defined in [Pi Integration Contract — Runtime event channel], it emits exactly as it would for any other disposition (handled, `?`-propagated, or cascaded); the four excluded kinds (`validation`, `context_overflow`, `cancelled`, `invoke_callee_error`) emit nothing on this channel even at a discard site."* Extend the exclusion rationale paragraph in `pi-integration-contract.md` with one sentence per excluded kind explaining why the rationale survives the discard case (e.g. for `validation`: *"a discarded `validation` is by construction a programming error — the author wrote `let _ = @<Schema>\`…\`` and ignored the schema mismatch; the diagnostics-channel emission at the originating site, plus the absence of any user-visible outcome, is the intended signal"*).

**Spec edits.** Two paragraphs touched (one in each topic). Numeric variant counts unchanged. No new event shape, no new field on `RuntimeEvent`, no change to the always-log set membership.

**Pros.** Matches what the plan already tests. Zero implementation churn. Preserves the rationale for the exclusions, which is sound for the matched / `?`-propagated cases and merely needs to be defended for the discard case. Smallest possible spec surface.

**Cons.** Operators lose the ability to observe discarded `validation` / `cancelled` / `context_overflow` failures via the runtime event channel — they have to rely on the diagnostics channel (panics, `loom/load/*`) and on user-visible cascades, neither of which fires for these four kinds at a discard site. A loom that silently swallows a `validation` failure at every iteration of a long loop is operator-invisible.

**Risks.** The "self-explanatory in context" rationale for `cancelled` and `context_overflow` is genuinely weakened at a discard site; the explanation has to lean on "the author chose to discard, accept their choice", which is a different argument than the original.

### Option B — Promote excluded kinds at discard sites only

**Approach.** Amend `pi-integration-contract.md` to carve out the discard case: for any `QueryError` the runtime would otherwise drop, if the disposition is a `let _ = @\`...\`` discard or a `void`-tail-expression discard, emit a `loom-system-note` with `display: false`, `details: { event: RuntimeEvent }`, and a new boolean field `discarded: true` on the `RuntimeEvent` payload. Other dispositions (handled, `?`-propagated to a frame that handles, cascaded) continue to follow the exclusion list. `query.md` keeps its current sentence (now consistent with the contract).

**Spec edits.** One additive field on `RuntimeEvent` (`discarded?: boolean`). One paragraph in `pi-integration-contract.md` describing the discard-site override, including which `(kind, query_site, message, occurred_at)` is used for the dedup key (probably the same key — discarding does not multiply emissions). The existing exclusion rationale paragraph stays but gets a "(except at discard sites — see below)" qualifier.

**Pros.** Preserves the operator-visibility guarantee that the original `query.md` sentence promised. Closes the silent-swallow risk for discarded `validation` failures inside loops. Aligns with the spirit of the always-log channel being operator-facing rather than user-facing.

**Cons.** Asymmetric: the same `Err` kind is observable or not depending on disposition, which is the exact pattern the contract's "regardless of whether the author matched the `Err`, propagated it via `?`, or discarded it via `let _ =`" sentence currently rejects. Requires V18q test (b) to be inverted (the four kinds *do* emit when discarded, with `discarded: true`). Adds a payload field that downstream consumers must learn.

**Risks.** The asymmetry will surface again whenever a future spec page reasons about "what does the operator see for kind X" — every such question now needs a per-disposition answer.

### Recommendation

Take **Option A**. The plan has already aligned every cross-linked leaf around it, the dedup contract stays uniform across dispositions, and no `RuntimeEvent` payload churn is required. When writing the rationale extension in `pi-integration-contract.md`, name the discard case explicitly so a future reader does not re-discover this contradiction: for `validation`, the diagnostic at the originating site (when one fires — depth-5 violations and respond-repair failures both have `loom/runtime/*` codes available) plus the author's explicit choice to discard is the signal; for `cancelled` and `context_overflow`, the author's choice to discard a user/operator-initiated outcome is itself the disposition; for `invoke_callee_error`, the inner `Err`'s origin-site emission is unchanged by the wrapper's disposition. Edge cases the implementer must watch: (a) the `cause: "schema_validation"` vs. `cause: "empty_template"` arms of `validation` are both excluded — V18q test (b) already asserts arm-uniformity and should not be relaxed; (b) the `void`-tail-expression form must be treated the same as the explicit `let _ =` form (V18q test (j) already covers this); (c) tightening `query.md` does *not* affect the diagnostics channel — `loom/runtime/*` panics inside `${expr}` of a discarded query continue to flow through `details: { diagnostics: [...] }` per V18q test (g) and V18m / V18n.

## Related Findings

- "`callable set` vs `tools: allowlist` — two names for one concept" — same-cluster (terminology hygiene in the same contract, independent fix)
- "\"Operator-facing\" undefined; \"always-log set\" undefined with no glossary entry" — co-resolve (the rationale extension this finding requires can use, and should reinforce, the glossary entry the other finding is requesting)

## spec_topics/discovery.md

---

# Configurable package-scan bounds: V1 scope rationale missing

**Original heading:** Configurable scan bounds V1 scope unexplained — mandatory vs. deferrable ambiguous
**Kind:** scope

## Finding

`spec_topics/discovery.md` introduces three settings-level knobs that govern non-functional behaviour of the package-discovery walk: `looms.scanPackages` (boolean, default `true`), `looms.scanPackagesMaxFiles` (integer, default `2000`), and `looms.scanPackagesTimeoutMs` (integer, default `2000`). They appear both in §"Package discovery" (the cap-check site) and in §"Settings file reads" → "Keys read" (alongside `looms` and `looms.binderModel`). They are the only `looms.*` keys in V1 whose purpose is performance tuning rather than configuring required functionality.

The spec specifies *what* these knobs do but never *why* they need to be operator-configurable in V1. Every other `looms.*` key in scope corresponds to a feature with no defensible default — `looms` enumerates user-supplied paths; `looms.binderModel` names a model the runtime cannot guess. The three scan knobs are different: hardcoded defaults of `2000` files / `2000` ms / scan-enabled would already be operationally adequate for the typical install. Without a rationale paragraph, an implementing agent cannot tell whether the full settings-driven surface — read path, deep-merge interaction, two integer-typed validators, three diagnostic strings citing `looms.scanPackages*` keys — is a load-bearing V1 requirement or a forward-compatibility seam that could be deferred to Future Considerations.

This is purely a scoping/justification gap; the normative wording is unambiguous about the intended behaviour. The cost of the gap is paid in V14m and V14n test surface and in the V1 settings-key inventory operators must learn.

## Spec Documents

- `spec_topics/discovery.md` — §"Package discovery" → "Edge cases" (last bullet) (edited)
- `spec_topics/discovery.md` — §"Settings file reads" → "Keys read" (edited)
- `spec_topics/future-considerations.md` — §"Surface extensions" (option-dependent — only edited under Option B)
- `spec_topics/diagnostics.md` — `loom/load/discovery-slow` row (option-dependent — message references the cap-key names)
- `spec_topics/implementation-notes.md` — Clock seam call-site list mentions `looms.scanPackagesTimeoutMs` (read-only)
- `spec_topics/pi-integration-contract.md` — `Clock.now()` description references `looms.scanPackagesTimeoutMs` (read-only)

## Plan Impact

**Phases:** Vertical V14

**Leaves (implementation order):**

- V14m — Discovery: package `looms/` and `pi.looms` — modified (the existing test list cites all three keys: cap-fired tests, opt-out test, `FakeClock`-driven timeout test)
- V14n — Discovery: settings file reads (`looms` array, plus the read mechanism reused by V16e for binder model) — modified (Keys-read inventory and per-key validation tests)

## Consequence

**Severity:** low

The behavioural contract is unambiguous, so V14m / V14n implementers will produce a working system either way. The cost of leaving it as-is is operator confusion (three knobs whose existence is unjustified) plus a slightly larger V1 surface than necessary. The cost of getting it wrong in the other direction (silently dropping the knobs without leaving an opt-out) would be operationally bad on monorepos that exceed the hardcoded cap.

## Solution Space

**Shape:** multiple

### Option A — Keep all three knobs; add a rationale clause

**Approach.** Retain `looms.scanPackages`, `looms.scanPackagesMaxFiles`, and `looms.scanPackagesTimeoutMs` as V1-required settings keys. Add one sentence to the §"Package discovery" cap-bullet (and mirror it in §"Settings file reads" → "Keys read") explaining why operator-tunable bounds are V1 rather than hardcoded.

**Spec edits.**
- In `discovery.md` §"Package discovery" → "Edge cases" → last bullet, prepend a clause along the lines of: "Package counts and walk time vary by install — monorepos and global-package-heavy setups can exceed the default caps without the user having any other knob to relieve the pressure — so the bounds are operator-tunable rather than hardcoded."
- No structural changes elsewhere.

**Pros.**
- Minimal diff; no plan churn.
- Preserves the operator escape hatch on monorepos that exceed `2000` files or `2000` ms.
- `looms.scanPackages: false` remains a valid full-disable.

**Cons.**
- Three settings keys remain in the V1 surface that a thinner scope could omit.

**Risks.** None material.

### Option B — Hardcode the integers; keep only the boolean opt-out; defer per-key tunability

**Approach.** Drop `looms.scanPackagesMaxFiles` and `looms.scanPackagesTimeoutMs` from V1 settings. Keep `looms.scanPackages` (boolean) as the V1 opt-out. Hardcode the file-count cap and timeout cap at `2000` / `2000` in the implementation. Move the per-key tunability to `future-considerations.md` under "Surface extensions".

**Spec edits.**
- In `discovery.md` §"Package discovery" → "Edge cases", change the cap-bullet to cite hardcoded constants (`2000` files, `2000` ms) instead of named settings keys; keep the `looms.scanPackages: false` clause unchanged.
- In `discovery.md` §"Settings file reads" → "Keys read", remove the two integer keys; keep `looms.scanPackages`.
- In `diagnostics.md`, update the `loom/load/discovery-slow` row to drop the `looms.scanPackages{MaxFiles,TimeoutMs}` references and instead name the hardcoded caps. The hint should still mention `looms.scanPackages: false` as a recovery path.
- In `implementation-notes.md` and `pi-integration-contract.md`, drop the `looms.scanPackagesTimeoutMs` references in favour of "the package-discovery walk timeout cap".
- In `future-considerations.md`, add an item under "Surface extensions" along the lines of "Operator-tunable package-discovery caps — V1 ships hardcoded `2000` file / `2000` ms bounds with a wholesale opt-out (`looms.scanPackages: false`); a future minor exposes `looms.scanPackagesMaxFiles` and `looms.scanPackagesTimeoutMs` for finer-grained tuning when monorepos prove the defaults too tight." Anchor it back at `discovery.md`'s cap-bullet.

**Pros.**
- Smaller V1 settings surface; one fewer concept for operators to learn.
- Smaller V14m / V14n test matrices (no integer-validation tests, no per-key cap tests — the FakeClock timeout test is still required against the hardcoded cap).
- Forward-compatibility cleanly anchored in Future Considerations.

**Cons.**
- Operators on monorepos that genuinely exceed `2000` files have only the all-or-nothing `looms.scanPackages: false` switch — they cannot raise the cap without disabling package discovery entirely. This is a real operational regression versus Option A for the population of users the cap exists to serve.
- Requires more cross-file edits (diagnostics, implementation-notes, pi-integration-contract, future-considerations) than Option A.

**Risks.**
- If real installs hit the cap during the V1 rollout window, the only recovery path (`looms.scanPackages: false`) shifts the user to *settings* `looms` entries for every package-shipped loom they want — a substantial config burden that the integer-tunable knobs would have spared them.

### Recommendation

Take **Option A**. The integer knobs cost two settings keys and a small amount of test surface; in exchange they preserve a graceful recovery path for the exact failure mode the caps are designed to detect (overly large package trees). The Option B regression — operators forced into wholesale opt-out plus manual `looms` entries — is a worse outcome than carrying the keys. The fix is one rationale clause in `discovery.md` §"Package discovery"; no plan changes are needed beyond a no-op spec re-read by V14m / V14n.

Edge case for the implementer: the rationale clause should make clear that the defaults are *upper bounds*, not target performance — i.e. a healthy install completes the walk well under both caps and never trips `loom/load/discovery-slow`. Otherwise readers may mistake the defaults for performance budgets.

## Related Findings

- "Post-V1 item dependencies unstated — no ordering signal for future contributors" — same-cluster (both touch the V1-vs-Future-Considerations boundary; Option B would add a new Future Considerations item that this sibling finding's structural fix would then catalogue)
- "V1 seam requirements indistinguishable from functional requirements" — same-cluster (both are scope-lens findings about distinguishing must-ship V1 surface from forward-compatibility seams; resolves independently)

