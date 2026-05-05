# V15 — `invoke`, registered loom callees, cross-mode

## V15a — `invoke("./path.loom", ...)` parsing and resolution

- **Spec.** [Invocation — Resolution, Static resolution](../spec_topics/invocation.md#static-resolution), [Directory Convention — Discovery roots](../spec_topics/discovery.md#discovery-roots).
- **Adds.** Path is a string literal; resolved at parse time relative to calling loom; must end in `.loom`. Dynamic dispatch rejected. After resolution the path is `realpath`-normalised and rejected with `loom/load/invoke-path-escape` if it lies outside every active discovery root. The callee is opened, parsed, and lowered into the parent's per-load-pass static-resolution cache; the walk is transitive across callee `invoke` literals and `tools:` `.loom` entries. Each visited file is parsed once per pass.
- **Tests.** Relative paths resolve; non-string path rejected; non-`.loom` extension rejected; path that resolves outside all active roots → `loom/load/invoke-path-escape`; symlink that lands outside every root → same diagnostic; same callee referenced twice (e.g. from two distinct `invoke(...)` sites in the same parent) is parsed exactly once per load pass.
- **Deps.** V12, V14k–V14p (discovery roots).
- **Ships when.** `invoke` syntax works, the path-escape check fires, and the static-resolution cache is populated.

## V15b — Untyped `invoke` returns `Result<null, QueryError>`

- **Spec.** [Invocation](../spec_topics/invocation.md) (typed return).
- **Adds.** Child's return value discarded; only `Ok(null)` or `Err` reach parent.
- **Tests.** Successful child → `Ok(null)`; failed child → `Err`; child's actual return value not visible.
- **Deps.** V15a.
- **Ships when.** Fire-and-forget invokes work.

## V15c — Typed `invoke<Schema>` with AJV validation

- **Spec.** [Invocation — Typed return](../spec_topics/invocation.md), [Invocation — Static resolution](../spec_topics/invocation.md#static-resolution).
- **Adds.** `invoke<Plan>("./plan.loom", ...)` validates child's return value against `Plan`. When both annotation and callee are statically resolvable, the parser also checks structural compatibility (using the same compatibility relation as `let x: T = expr`) between the annotated `Schema` and the callee's inferred return type; mismatch is `loom/parse/invoke-return-type-mismatch`. When either side is unresolvable, the runtime AJV check remains the safety net.
- **Tests.** Valid return → `Ok(value)`; invalid → `Err({kind:"invoke_failure", reason:"validation"})`; statically resolvable annotation/callee mismatch → `loom/parse/invoke-return-type-mismatch`; statically resolvable callee returning a narrower type than the annotation → no parse error (compatibility allows widening); unresolvable callee → no parse error, runtime AJV decides.
- **Deps.** V15a, V4.
- **Ships when.** Typed invokes safe and static return-type compatibility enforced.

## V15d — Positional argument binding for `invoke`

- **Spec.** [Invocation — Argument binding, Argument arity](../spec_topics/invocation.md#argument-binding), [Invocation — Static resolution](../spec_topics/invocation.md#static-resolution).
- **Adds.** Arguments bind positionally to callee `params:` in declaration order; type-checked against the callee's declared schema when the callee is statically resolvable per the load-pass cache populated by V15a; otherwise the runtime AJV check is the safety net. Arity is checked **before** per-argument type checking: too few non-defaulted args with a statically resolvable callee → `loom/parse/invoke-arity-too-few`; too few with an unresolvable callee → runtime `InvokeInfraError { reason: "validation" }` from AJV; too many args (always) → `loom/parse/invoke-arity-too-many` (no runtime safety net possible).
- **Tests.** Type mismatch where callee is statically resolvable → `loom/parse/invoke-arg-type-mismatch`; type mismatch where callee is unresolvable (parent saw `loom/load/callee-has-errors` warning) → no parse error, runtime AJV rejects with `Err(InvokeInfraError { reason: "validation", ... })`. Too few args, statically resolvable → `loom/parse/invoke-arity-too-few`; too few args, unresolvable → runtime `InvokeInfraError { reason: "validation" }`. Too many args → `loom/parse/invoke-arity-too-many` regardless of resolvability. Arity error fires before per-arg type check (the first extra slot does not produce a type-mismatch diagnostic).
- **Deps.** V15a, V3b.
- **Ships when.** Args reach callee correctly typed and arity errors are unambiguous.

## V15e — `.loom` paths in `tools:` (default basename naming)

- **Spec.** [Parameters and Frontmatter](../spec_topics/frontmatter.md) (`tools:`), [Tool Calls](../spec_topics/tool-calls.md) (registered loom callee), [Invocation — Resolution, Static resolution, Argument arity](../spec_topics/invocation.md#static-resolution), [Directory Convention — Discovery roots](../spec_topics/discovery.md#discovery-roots).
- **Adds.** `./summarise.loom` in `tools:` becomes `summarise` callable; basename hyphen → underscore (`./code-review.loom` → `code_review`); resolution relative to calling loom. The same path-escape check V15a applies (post-realpath, against active discovery roots) fires here too: a `.loom` `tools:` entry whose path escapes is rejected with `loom/load/invoke-path-escape` and the callable is not created. The same arity rules from V15d apply to registered-loom calls (parse-time too-few when statically resolvable; always parse-time too-many). The callee is opened/parsed/lowered into the same per-load-pass static-resolution cache V15a populates. A callee whose file fails to parse or lower at this site emits `loom/load/callee-has-errors` (severity `error` for `tools:`) and prevents parent registration; the callee's own diagnostic codes are carried via `related`.
- **Tests.** Default name correct; hyphens converted; resolution relative; entry callable from both code (`<name>(...)`) and model; path that escapes all active roots → `loom/load/invoke-path-escape`; arity mismatches at registered-loom call sites surface the same `loom/parse/invoke-arity-*` codes as V15d; broken callee in `tools:` → `loom/load/callee-has-errors` error at the entry site, parent does not register, `related` enumerates the callee's own codes; same callee reached via both a `tools:` entry and an `invoke(...)` literal in the same parent is parsed exactly once.
- **Deps.** V14a, V15a, V15d.
- **Ships when.** Loom paths register as named callables, path-escape and arity errors fire, and parse failures surface at the parent.

## V15f — `.loom` path with `as` rename

- **Spec.** [Parameters and Frontmatter](../spec_topics/frontmatter.md) (`tools:`).
- **Adds.** `./classify.loom as triage` overrides default name.
- **Tests.** Override applied; PascalCase rename rejected; collision with another final name is load error.
- **Deps.** V15e.
- **Ships when.** Loom callees fully renamable.

## V15g — Prompt-mode `.loom` callee in `tools:` is load error

- **Spec.** [Parameters and Frontmatter](../spec_topics/frontmatter.md) (`tools:`).
- **Adds.** Load-time check: a `.loom` path in `tools:` must point at a subagent-mode loom; prompt-mode is rejected.
- **Tests.** Prompt-mode callee → `loom/load/prompt-mode-callable` error; diagnostic mentions interleaving concern.
- **Deps.** V15e, V12a.
- **Ships when.** Footgun closed at load time.

## V15h — Cross-mode cell: prompt → prompt

- **Spec.** [Invocation — Cross-mode semantics, Tools and model](../spec_topics/invocation.md).
- **Adds.** Prompt-mode parent invoking prompt-mode child: child attaches to caller's current conversation; child's queries are user-visible turns. The child's `tools:` set replaces the parent's *for the duration of the child's body* via `pi.setActiveTools` snapshot/restore in a `finally` block (same protocol as the per-query swap in [Pi Integration Contract](../spec_topics/pi-integration-contract.md)). Nested prompt → prompt invokes stack: each level snapshots the immediately-prior set, not the root; on return the immediately-prior set is restored.
- **Tests.** Child turns appear in parent's transcript; child's queries see only the child's tools (not the parent's union); on child return, the parent's queries again see the parent's tools; nested prompt → prompt → prompt restore order is reverse-LIFO (peeling the stack restores each level's snapshot, ending at the user session's original set); `Err`, panic, and cancellation paths in the child also restore.
- **Deps.** V15a.
- **Ships when.** Cell verified and tools-lifetime swap holds across success and failure paths.

## V15i — Cross-mode cell: prompt → subagent

- **Spec.** [Invocation](../spec_topics/invocation.md) (cross-mode matrix).
- **Adds.** Prompt-mode parent invoking subagent-mode child: child spawns fresh isolated conversation; only return value reaches parent.
- **Tests.** Parent transcript unchanged by child's intermediate turns; return value reaches parent.
- **Deps.** V15a, V12a.
- **Ships when.** Cell verified.

## V15j — Cross-mode cell: subagent → prompt

- **Spec.** [Invocation](../spec_topics/invocation.md) (cross-mode matrix).
- **Adds.** Subagent-mode parent invoking prompt-mode child: child attaches to caller subagent's own private conversation. Nothing leaks to grandparent.
- **Tests.** Grandparent (user session) transcript unchanged; subagent transcript contains child's turns.
- **Deps.** V15h, V12a.
- **Ships when.** Cell verified.

## V15k — Cross-mode cell: subagent → subagent

- **Spec.** [Invocation](../spec_topics/invocation.md) (cross-mode matrix).
- **Adds.** Sibling spawn (not nested under caller's).
- **Tests.** Two sibling sessions exist concurrently; neither sees the other's transcript.
- **Deps.** V15i.
- **Ships when.** Cell verified.

## V15l — `InvokeInfraError` variant

- **Spec.** [Invocation](../spec_topics/invocation.md) (failures), [Invocation — Static resolution](../spec_topics/invocation.md#static-resolution).
- **Adds.** Schema name `InvokeInfraError`; wire `kind:"invoke_failure"` (unchanged) with `reason` enum: `load_failure`, `parse_failure`, `validation`, `cancelled`, `panic`. Carries `callee_path`. The runtime variant fires when a code-issued `invoke(...)` reaches a callee that fails at the moment of invocation — distinct from the parent-load-time `loom/load/callee-has-errors` warning, which is a parent diagnostic emitted when the static-resolution walk first observed the callee in a broken state. Both surfaces can fire for the same broken callee: the load-time warning at parent registration plus the runtime `InvokeInfraError { reason: "parse_failure" | "load_failure" }` when the call actually executes.
- **Tests.** Each reason synthesised and surfaces correctly. Callee broken at parent load → parent diagnostics drain contains `loom/load/callee-has-errors`; subsequent runtime invoke against the same callee → `Err(InvokeInfraError { reason: "parse_failure", callee_path, ... })`. Callee that parses cleanly at parent load but is deleted before invocation → no load-time warning; runtime `Err(InvokeInfraError { reason: "load_failure", ... })`.
- **Deps.** V15a, V5g.
- **Ships when.** Invoke-infra failures uniformly typed.

## V15m — `InvokeCalleeError` variant with recursive `inner`

- **Spec.** [Invocation](../spec_topics/invocation.md) (failures).
- **Adds.** `kind:"invoke_callee_error"` with recursive `inner: QueryError`.
- **Tests.** Cascade of two-level invoke surfaces inner-of-inner correctly; AJV accepts recursive schema definition.
- **Deps.** V15l, V11g.
- **Ships when.** Callee errors propagate without information loss.

## V15n — Parse-time cycle detection

- **Spec.** [Invocation — Cycle detection](../spec_topics/invocation.md), [Invocation — Static resolution](../spec_topics/invocation.md#static-resolution).
- **Adds.** Walk the per-load-pass static-resolution graph V15a builds; detect cycles; report `loom/load/invocation-cycle` with full path. Unresolvable callees (those that produced `loom/load/callee-has-errors`) are walk leaves — the walker does not descend through them, and a cycle routed through such a node is not detected at this load. After a watcher-driven re-walk that lifts the unresolvability, the cycle (if any) is caught on the next pass.
- **Tests.** Self-cycle (`A → A`); two-step (`A → B → A`); three-step; cycle through warp `fn` invokes too (deps on V17j); cycle routed through an unparseable callee → no cycle diagnostic at first load (only `callee-has-errors`); after the callee is fixed and the watcher re-walks, the cycle surfaces as `loom/load/invocation-cycle`.
- **Deps.** V15a.
- **Ships when.** Static cycles caught with the load-pass leaf rule for unresolvable nodes.
