# Future Considerations

Features deliberately deferred from V1, organised by the kind of decision V1 must make about each. The buckets answer two questions: which V1 surfaces must leave a forward-compatible seam, and which items are post-V1 work that V1 is *not* expected to anticipate.

The categories are:

1. **Tooling deferrals (no V1 impact).** Items that ship as new tools or commands and require no V1 runtime decision.
2. **Surface extensions (V1 leaves a seam).** Items that extend a V1 type, struct, or call shape in a backward-compatible way. Each item names the V1 seam it needs.
3. **Model-level changes (no V1 seam expected).** Items that change the runtime value model, evaluation model, or tool-result contract enough that V1 is not expected to anticipate them; adding them post-V1 will require a migration.
4. **Known V1 limitations (no seam expected).** Cross-cutting V1 scope decisions where V1 deliberately leaves no seam because the disposition is "ship without one" rather than "defer the seam". Each item names the orientation bullet on `spec.md` that records the V1 disposition.

Items occasionally carry a `Depends on:` annotation where they presuppose another item in the list.

V1 design choices that ship with a known behavioural or diagnostic gap — i.e. constraints on the V1 runtime itself rather than features deferred from it — are recorded on the topic page that owns the surrounding contract, not here. See for example [Pi Integration Contract — Provider compatibility for typed queries](./pi-integration-contract.md) for the typed-query diagnostic limitation on supported providers.

---

## Tooling deferrals (no V1 impact)

- **LSP support** for `.loom` and `.warp` files (syntax highlighting, type checking, autocomplete).
- **`loom test` command** for dry-run execution that runs a loom against a recorded transcript or a stub model without hitting a live provider.
- **Richer runtime-event telemetry** — per-loom token aggregation, latency histograms, cost reporting, retention policies, and a consumer-facing read API for the `details: { event }` stream defined in [Pi Integration Contract — Runtime event channel](./pi-integration-contract.md). V1 ships only the per-occurrence emission and the `RuntimeEvent` payload shape; downstream consumers in V1 read from Pi's session transcript via existing surfaces.

---

## Surface extensions (V1 leaves a seam)

Each bullet below describes a deferred V1 extension and points at the normative paragraph that pins the V1 seam the extension consumes. The seams themselves live on the topic pages that own each surface; this page enumerates only what V1 chose not to do, and where to read the seam contract.

- **Per-call timeouts** on queries, tool calls, and invokes (V1 has only AbortSignal-driven cancellation; cf. [Cancellation](./cancellation.md)).
  *Anchored at:* [Query — Options surface](./query.md), [Tool Calls — Options surface](./tool-calls.md), [Invocation — Options surface](./invocation.md).
- **Pre-flight token-count check** before the runtime issues a user turn, so oversized rendered templates surface as `ContextOverflowError` without a wasted provider round-trip.
  *Anchored at:* [Query — Detection of `ContextOverflowError`](./query.md) (the `tokens_used` / `tokens_limit` nullability and population rule already permit a pre-flight path to populate them from a local estimate without changing the variant shape).
- **Typed-query support for providers without named-tool forcing** (Gemini, OpenAI Responses, weak local models) via a JSON-mode / system-prompt fallback. V1 narrows typed queries to providers where pi-ai exposes named-tool forcing (per [Pi Integration Contract — Provider compatibility for typed queries](./pi-integration-contract.md)) and rejects unsupported providers with a load-time warning.
  *Anchored at:* [Pi Integration Contract — Provider compatibility for typed queries](./pi-integration-contract.md) (the V1 supported provider set is a single named runtime constant; widening adds a fallback path without touching the typed-query behavioural contract).
- **Per-query overrides for `model`, `tools`, and `system`** (project → loom → query cascade).
  *Anchored at:* same query-options surface as per-call timeouts — [Query — Options surface](./query.md).
- **User-defined error types beyond `QueryError`.**
  *Anchored at:* [Errors and Results — Discriminator type-openness](./errors-and-results.md).
- **`BinderError` as a Loom-visible `QueryError` variant**, once looms become first-class values invocable from non-loom programmatic harnesses that need to observe binder failures structurally.
  *Anchored at:* same discriminator seam as user-defined error types — [Errors and Results — Discriminator type-openness](./errors-and-results.md).
  *Depends on:* First-class loom values (for non-loom harnesses needing structured observation).
- **Per-loom `binder_temperature` knob**, if real usage shows authors need to tune the binder's nondeterminism budget.
  *Anchored at:* [Parameters and Frontmatter — Unknown-key policy](./frontmatter.md).
- **User-overridable binder system prompt** — V1 fixes the binder prompt for predictability.
  *Anchored at:* same unknown-key policy as `binder_temperature` — [Parameters and Frontmatter — Unknown-key policy](./frontmatter.md). The deferred extension also needs an injection point in the binder for an author-supplied prompt template; that injection point does not exist in V1.
- **Automatic context escalation:** when binding fails without context, automatically retry with `bind_context: session` attached — trades a second binder call for a smoother success rate on context-sensitive looms that forgot to opt in.
  *Anchored at:* [Slash-Command Argument Binding — Binder-invocation re-entrancy](./binder.md).
  *Depends on:* [Binder refinement loop](#binder-refinement-loop), only if escalation surfaces user-visible turns; otherwise independent.
  *Decision required before this item can be scoped:* whether automatic escalation surfaces a user-visible turn (composing with the [Binder refinement loop](#binder-refinement-loop)) or stays operator-only.
- <a id="binder-refinement-loop"></a>**Binder refinement loop:** multi-turn `needs_info` negotiation (binder asks the user a clarifying question, gets a reply, retries) instead of V1's single-shot "system note then stop" behaviour; the same future revision also begins surfacing `ambiguous.candidates` as a user-facing pick-one disambiguation rather than a terminating system note.
  *Anchored at:* three V1 carriers preserve the post-V1 migration and must not be "simplified" away — (i) the binder envelope schema's three-arm discriminator (`ok` | `needs_info` | `ambiguous`) per [Binder envelope schema](./binder.md#binder-envelope-schema-constructed-dynamically-from-params); collapsing to two arms is breaking; (ii) the `ambiguous.candidates` field (`array<string> | null`, AJV-accepted, V1-suppressed by [System-note rendering](./binder.md#system-note-rendering) rule 5); dropping it from the schema is breaking; (iii) the per-arm `loom /<name>:` system-note prefix grammar in the [failure-modes table](./binder.md#failure-modes); collapsing the two failure-arm prefixes is breaking.
- **Named-argument / key=value invocation syntax.**
  *Anchored at:* [Invocation — Argument-binding style](./invocation.md) (the AST node carries a `style: "positional" | "named"` discriminator; V1 only emits `"positional"`, but consumers match exhaustively).
- **Richer expression sublanguage inside frontmatter `system:`** (full `${expr}` interpolation rather than just `${param}` paths).
  *Anchored at:* [Parameters and Frontmatter — Parser entry point](./frontmatter.md) (the `${…}` parser is the same entry point used by `@`...`` query templates, restricted at parse time to dotted paths by a parser-level filter rather than a hand-rolled regex).
- **Package-style (`@scope/pkg`) and project-rooted (`/looms/...`) `import` paths** — V1 supports relative paths only.
  *Anchored at:* [Imports — Resolver interface](./imports.md) (every `.warp` import flows through a single `Resolver` seam; widening is additive).
- <a id="mid-loom-user-session-replacement"></a>**Mid-loom user-session replacement.** A future feature that calls `ctx.newSession()`, `ctx.fork()`, or `ctx.switchSession()` from inside a running loom invalidates the factory-captured `pi` reference used by the prompt-mode driver. The future implementation will need to re-acquire `pi` via `withSession` before the next `sendUserMessage`.
  *Seam:* the prompt-mode driver reads `pi` from a single captured reference; introducing a re-acquisition hook is a localised change and does not perturb V1's "captured for the lifetime of each loom invocation" rule.
  *Anchored at:* [Pi Integration Contract — Conversation drive — prompt mode](./pi-integration-contract.md) (the V1 invariant "V1 looms never trigger replacement" is the lifetime guarantee the seam preserves).
- **Pi extension API: Pi-owned subagents exposed as enumerable slash commands.** Pi's `SlashCommandSource` union (`@mariozechner/pi-coding-agent`'s `core/slash-commands.d.ts`) is `"extension" | "prompt" | "skill"`; Pi-owned subagents are spawned via `createAgentSession(...)` and are not surfaced through `pi.getCommands()`, so the cross-format slash-name collision check in [Pi Integration Contract — Extension entry point](./pi-integration-contract.md) and [Discovery — Slash-name collisions at the same priority](./discovery.md) covers exactly three arms in V1. If a future Pi minor extends `SlashCommandSource` to include `"subagent"` (i.e. Pi-owned subagents become enumerable slash commands), the cross-format collision set widens to four arms and the V14q test matrix gains a parallel `.md` subagent fixture.
  *Anchored at:* [Pi Integration Contract — Extension entry point](./pi-integration-contract.md) and [Discovery — Slash-name collisions at the same priority](./discovery.md) (the `session_start` handler's collision check already reads source-string membership from a single named set; widening that set is additive and does not perturb the asymmetric loser-drops rule).
- <a id="symlink-resolution-hardening"></a>**Symlink-resolution hardening for invoke-path containment** — V1 implements the discovery-root containment check by `realpath`-then-`open`, accepting an irreducible kernel-level TOCTOU window between the two syscalls (see [Invocation — Resolution](./invocation.md)). A future pass replaces the two-step sequence with a single atomic resolve-and-open primitive — `openat2(..., RESOLVE_NO_SYMLINKS | RESOLVE_BENEATH)` on Linux, and the platform equivalents on macOS / Windows / other targets — closing the residual race without changing the V1-visible diagnostic codes (`loom/load/invoke-path-escape`) or `InvokeInfraError { reason: "load_failure" }` envelope.
  *Anchored at:* [Invocation — Resolution](./invocation.md) (the path-resolution call site in the invoke runtime is a single named function used by both load-time and invocation-time checks; replacing its body is additive and does not perturb caller code).
- **Pi extension API: `argumentHint` field on `RegisteredCommand`** — Pi's built-in `.md` prompt templates carry an `argumentHint` that drives a distinct slot in the slash-command autocomplete dropdown, but extension-registered commands have no such slot. Loom's `argument-hint` frontmatter field is therefore consumed by the binder only in V1 (see [Slash-Command Argument Binding](./binder.md)). A future contributor either upstreams `argumentHint` to Pi's `RegisteredCommand` or revisits the V1 decision once Pi exposes the field.
  *Anchored at:* [Parameters and Frontmatter](./frontmatter.md) (the binder simply has no hint to use beyond the frontmatter field) and [Slash-Command Invocation](./slash-invocation.md) (the `argument-hint` value is preserved on the loom's parsed AST and would only need to be threaded into the registration options).

---

## Model-level changes (no V1 seam expected)

- **First-class loom values** (`Loom<T>` type, passing looms as arguments, higher-order composition) — V1 only supports literal-path `invoke` and frontmatter-registered callables.
- **Loom-level concurrency primitives** (e.g. `parallel { ... }` blocks or a parallel-`for` form) building on Pi tools' Promise-returning shape — V1 keeps every tool call sequential and synchronous-looking.
- **Streaming partial tool results** from Pi's `onUpdate` callback into loom code (e.g. an iterator-style consumption form) — V1 returns only the final result.
- **Structured tool output schemas**, when Pi (or upstream providers) introduce a strict output-schema contract for tools — V1 returns `string` from every Pi tool call.
- **Richer untyped-query return shape** (e.g. `Result<string | AssistantMessage, QueryError>` exposing tool-use traces, multiple content blocks, citations) — V1 returns plain `Result<string, QueryError>`. A future widening would change the value model even though existing call sites would keep working under the union form.
- **Per-parameter `mut` on function parameters** (Rust-style `fn f(mut x: T)`) — V1 keeps all function parameters immutable.
- **Value-carrying `break expr`** inside `for` / `while` loops — V1's `break` and `continue` carry no value.
- **`match` guards** (`Ok(x) if x.value > 3 => ...`) and **rest patterns** (`[first, ...rest]`, `{ kind, ...other }`) — neither is in V1.
- **Non-decimal number literals** (hex `0x...`, octal `0o...`, binary `0b...`) **and underscore digit separators** (`1_000_000`) — V1 accepts decimal literals only with no separators.
- **Integer-division operator** — V1's `/` always produces `number`; there is no dedicated truncating-division operator.
- **Additional string and array stdlib methods** beyond the V1 set — the V1 method surface is deliberately small; extending it is non-breaking by design (anything not on the list is a parse-time "unknown method" error, leaving the namespace open).

---

## Known V1 limitations (no seam expected)

- **No per-loom sandbox or capability model.** V1 looms run inside the Pi extension-host process at full host privilege; filesystem, network, and Pi-API access are bounded only by Pi's own extension permissions and by the per-loom `tools:` allowlist. A future per-loom capability model is not anticipated by V1 and will require a migration.
  *Recorded at:* [`spec.md` — Orientation — Scope — Trust boundary](../spec.md#scope).
- **No formal source-language migration mechanism for major-version transitions.** V1 promises that a `.loom` or `.warp` file loading cleanly under V1.0 loads and behaves identically under every V1.x release (substantive changes are mediated by the `GOV-8` REQ-ID lifecycle); migration across major versions is out of V1 scope and will require a separate mechanism when V2 ships.
  *Recorded at:* [`spec.md` — Orientation — Scope — Source-language stability](../spec.md#scope).

