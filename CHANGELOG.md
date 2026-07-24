# Changelog

All notable changes to `@bitmonk8/pi-theta` will be documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.10.0] - 2026-07-24

### Added

- **Extension-registered Pi tools are now callable from theta CODE in
  subagent mode (host-loop dispatch, PIC-61 rung 2).** The RFC 0006
  code-side dispatch ladder's host-loop rung is wired: inside the
  subagent-root child, a code-side `<name>(args)` call to an
  extension-registered Pi tool registers a per-dispatch theta-controlled
  provider whose stream function authors the `tool_use` with the
  code-supplied arguments verbatim; the child's host agent loop (which
  holds every registered tool's `execute`) runs the call, and the runtime
  reads the tool result back — deterministic arguments, zero model tokens,
  no executable definition ever obtained by theta code. The fabricated
  turn and temporary session-model switch are confined to the child's
  private, discarded `--no-session` session. The mechanism was
  prototype-verified end-to-end against the pinned Pi v0.80.10 (the
  RFC-designated acceptance criterion) before wiring. A theta whose code
  calls an extension tool now loads and dispatches in the child; contexts
  with no dispatch rung (parent/prompt mode) keep the fail-closed
  `theta/load/extension-tool-unreachable` refusal. `subagent fn` inline
  bodies (in-process, off-session) remain model-facing only.

### Fixed

- **Result envelope reached stderr instead of stdout in a real child
  (latent 0.9.0 defect).** Pi's non-interactive output guard reassigns
  `process.stdout.write` to stderr in `--mode json`, so the PIC-59
  `theta_result` envelope written through the extension's stdout would
  never have reached the parent's stdout scan in a real spawned child.
  The envelope writer now writes file descriptor 1 directly
  (`fs.writeSync(1, line)`, one atomic newline-terminated line),
  bypassing the reroute.

## [0.9.0] - 2026-07-24

### Changed

- **Subagent mode now runs the whole callee theta in the child process
  (RFC 0006).** The RFC 0005 remote-session design (parent-side interpreter
  driving a child `pi --mode rpc` session) is superseded: each subagent-mode
  invocation spawns `pi --theta <dirs> --mode json -p "/<slug>" --no-session`
  and the callee's interpreter, typed-query mechanics, and resolution
  snapshot all execute inside the child under a new *subagent-root* regime
  (selected by the `PI_THETA_SUBAGENT_ROOT=<slug>` env marker, never
  authorable from a `.theta` file; a nested subagent callee still spawns its
  own child). Observable theta language semantics are unchanged. The RPC
  drive contract is retired — deleted, not kept as a fallback; the RFC 0005
  launcher, executable-resolution ladder, trust inference, teardown/kill,
  and orphan-handling machinery are reused under the new driver.
  Spec: `pi-integration-contract/subagent.md` rewritten again (new
  PIC-58…PIC-63; PIC-40/41 retired with successors PIC-62/63; PIC-42/43
  retired), plus `invocation.md` (INV-5), §Resolution snapshot, SLSH-2,
  and satellite pages.
- **Cancellation without RPC.** `thetaAbort` now closes the parent-held
  child stdin pipe as the grace signal, then process-tree kills after the
  bounded budget; the drive's terminal signal keys off stdio close so a
  final envelope flushed at exit is never lost.

### Added

- **Typed return values cross the process boundary via a result envelope.**
  The child emits one JSONL line `{"theta_result":{"v":1,"ok":…}}` /
  `{"theta_result":{"v":1,"err":…}}` on stdout alongside the `--mode json`
  event stream; the parent scans stray-line-tolerantly, verifies the
  envelope version (skew detected, not tolerated), and maps to `Ok`/`Err`
  with full `Result` fidelity (every `QueryError` variant, `CodeToolError`,
  `InvokeInfraError` causes, panics as internal-error). A child that exits
  without an envelope maps fail-closed to
  `Err(InvokeInfraError { cause: "internal_error", … })` — never a
  fabricated value.
- **Marshalled params channel (binder bypass).** Already-typed param values
  travel to the child as canonical JSON — `PI_THETA_PARAMS` env var below
  the pinned 8 KB threshold, a 0600 temp file via `PI_THETA_PARAMS_FILE` at
  or above it (child reads and deletes; parent-`finally` backstop). The
  child validates against the theta's `params:` schema and skips the binder
  entirely; binder inference remains exclusive to human slash invocation.
- **Code-side extension-tool dispatch ladder (fail-closed).** A theta whose
  code calls an extension-registered Pi tool now loads only when a dispatch
  rung is available (upstream `getToolDefinition` when exposed, host-loop
  dispatch otherwise); with no rung the theta refuses to register at load
  with `theta/load/extension-tool-unreachable`. The host-loop dispatch
  module ships behind DI seams; its live wiring is the RFC's designated
  follow-up, so this release keeps the rung fail-closed (model-facing
  extension-tool reach is unaffected). No new permission gate: the existing
  `tools:` declaration, operator trust decisions, and fail-closed
  registration remain the gates.
- **Whole-callee content-hash verification.** The parent's load-time hash
  now covers the root `.theta` plus transitive `.thetalib` imports; the
  child verifies after its own parse and refuses diverged callees.
- New diagnostics: `subagent-envelope-parse-failed`,
  `subagent-envelope-schema-skew`, `subagent-exit-without-envelope`,
  `subagent-params-validation-failed` (runtime) and
  `extension-tool-unreachable` (load); `subagent-child-crashed`,
  `subagent-wire-parse-failed`, `subagent-model-preflight-mismatch`
  rescoped to the envelope/json child.

### Removed

- The RFC 0005 RPC session driver (`subagent-rpc-driver`), the per-query
  `agent_end` extraction, the RPC `abort` command mapping, the parent-side
  subagent query model, and the `PI_THETA_SUBAGENT_CHILD` boolean marker
  (subsumed by `PI_THETA_SUBAGENT_ROOT`).

## [0.8.0] - 2026-07-24

### Changed

- **Subagent mode now runs each invocation in a spawned child `pi` process
  (RFC 0005).** The in-process `createAgentSession` subagent session is
  replaced by a per-invocation child `pi --mode rpc --no-session` process
  driven over Pi's documented RPC JSONL protocol. The observable theta
  language semantics are unchanged (isolated conversation, private transcript
  discarded on return, only the return value propagates, no ambient tool
  inheritance), with one stated adjustment: installed extensions'
  contributions (system-prompt appends, handlers, providers) are present in
  the child, as in any Pi session — no user/project context (files, skills,
  templates) is inherited. Executable resolution re-launches the running
  parent binary (entry-script or compiled-binary rung; no `PATH` fallback;
  fail-closed at load with `theta/load/subagent-executable-unresolved`).
  Spec: `pi-integration-contract/subagent.md` rewritten (PIC-9/22/40/41/42/43
  successors; PIC-23 retired) plus satellite pages.

### Added

- **Extension-registered Pi tools are reachable by a subagent theta's model.**
  A subagent-mode `tools:` list now resolves against `pi.getAllTools()` —
  extension-supplied tools included — and is passed to the child as a
  `--tools` allowlist (empty callable set maps to `--no-tools`). Child trust
  follows necessity-inference: `--approve` iff the callable set contains a
  project-local extension tool, `--no-approve` otherwise. Code-side dispatch
  of extension tools from theta code remains out of scope (RFC 0006) and
  fails, surfacing as `Err(CodeToolError)` to theta code — never a silent
  fallthrough.
- **`.theta` callable content-hash verification across the process boundary.**
  The parent records a transitive-closure content hash of each `.theta`
  callable at load and marshals it to the child; the child verifies after its
  own parse and refuses diverged callees fail-closed
  (`theta/runtime/subagent-callable-hash-mismatch`).
- **Model pre-flight for inherited session models.** When a subagent theta
  inherits the caller's live session model, the runtime confirms via the
  child's RPC state surface that the marshalled `--provider`/`--model`
  reference resolved to the intended model before the first query
  (`theta/runtime/subagent-model-preflight-mismatch` on divergence).
- **Invoke-depth carriage across processes.** The `invoke`-chain depth
  counter is marshalled to subagent children on
  `PI_THETA_SUBAGENT_INVOKE_DEPTH`, so the depth-32 hard ceiling continues
  across process hops instead of resetting.
- New diagnostics: `subagent-spawn-failed`, `subagent-child-crashed`,
  `subagent-wire-parse-failed`, `subagent-teardown-timeout`,
  `subagent-callable-hash-mismatch`, `subagent-model-preflight-mismatch`
  (runtime) and `subagent-executable-unresolved` (load);
  `subagent-dispose-failure` re-scoped to child teardown.

### Removed

- The in-process subagent machinery: `createAgentSession` spawn block, the
  closed seven-name `customTools` materialisation, the `ResourceLoader`
  adapter (PIC-23), and `SessionManager.inMemory` transcript privacy (now
  `--no-session` ephemeral per the pinned CLI contract). The capability
  probe's factory-probable member set shrinks nine → seven and gains a
  Step 0 (f) executable-resolution probe.

## [0.7.1] - 2026-07-21

### Fixed

- **Teardown-quiesce the hot-reload watcher (PIC-57).** A debounced
  file-watcher registry rebuild could resume *after* the session's extension
  runtime was invalidated on teardown (`/new`, `/resume`, `/fork`, `/reload`,
  or quit), driving re-registration or diagnostic emission through a stale
  `pi.*` surface and throwing against Pi's `assertActive()` (surfacing as
  `registry swap failed: theta watcher` + `system-note delivery failed` on
  teardown). Root cause: the reload debouncer's cancel cleared only the pending
  timer, not an in-flight rebuild or the deferred re-arm, and `session_shutdown`
  did not await the in-flight rebuild before returning. `ReloadDebouncer` is now
  teardown-aware (`markTornDown()` clears the pending timer and the deferred
  re-arm and short-circuits any new rebuild; `whenIdle()` resolves once no
  rebuild is in flight), and `session_shutdown` sub-step 4 marks the debouncer
  torn-down and awaits `whenIdle()` — bounded by the same absolute
  `SHUTDOWN_AWAIT_CAP_MS` deadline sub-step 3 already uses, with degrade-to-skip
  if it has elapsed — so an in-flight rebuild completes (or no-ops) while the
  ctx is still active, and no watcher rebuild ever runs against an invalidated
  runtime. No new diagnostic code. Spec: new **PIC-57** in
  `session-shutdown-semantics.md`.

## [0.7.0] - 2026-07-21

### Added

- **`subagent fn` — in-file subagent callables (RFC 0001).** A `subagent`
  modifier on the top-level `fn` form whose body evaluates in a fresh, isolated
  subagent session — the same boundary an `invoke("./child.theta", ...)` crosses,
  without a second file. Identical to an ordinary `fn` in its parameter list,
  positional call form, and inferred-and-validated return type; the sole
  difference is the per-call session boundary. `@` queries in the body target the
  spawned session, not the caller's conversation (the caller's conversation stays
  unpolluted). Arguments cross by value with no closure capture; the return value
  crosses the boundary as the `Ok` payload, a callee `Err` surfaces as
  `InvokeCalleeError`, and a body panic as `InvokeInfraError`. The spawned
  session inherits the enclosing theta's configuration by default; an optional
  `with { ... }` clause overrides any subset of `{ system, model, tools,
  tool_loop, respond_repair }` (an unresolvable `with { model }` is rejected at
  load with `theta/load/model-unresolved`). A `subagent fn` call is a countable
  frame under the depth-32 `invoke` ceiling, and a self-referencing `subagent fn`
  is rejected at load as a length-1 `theta/load/invocation-cycle`; a body that
  fails to parse or type-check surfaces `theta/load/callee-has-errors` (inline,
  naming the function). Callable from a `mode: prompt` theta (the prompt→subagent
  cross-mode cell) and admissible on a `.thetalib` fn (a shared, isolated library
  helper whose session inherits the calling theta's configuration and whose
  `with { tools }` narrows against the calling theta's callable set). `subagent`
  and `with` are contextual keywords, so existing identifiers are unaffected. No
  new runtime or parse diagnostic codes are introduced (all reuse existing
  codes). Bumps the theta language surface to **theta 1.2**.

## [0.6.0] - 2026-07-20

### Added

- **`par for` — structured parallel fan-out (RFC 0003).** A parallel loop form
  that evaluates its body concurrently for each element of an `array<T>` iterand
  and collects per-iteration results in input-index order as a value-producing
  expression of type `array<Result<T, QueryError>>`. Iterations run against
  isolated work only (child sessions, `invoke`, `subagent fn`, Pi-tool calls, and
  pure computation) — never the enclosing conversation. The optional `max <expr>`
  clause (any `integer`-typed expression) lowers the in-flight width; without it
  a per-loop throttle of 64 in-flight iterations applies (excess queues; the
  throttle is not a routing-class hard ceiling). Each iteration reports
  independently: an `Err` (or a downgraded per-iteration panic, ERR-20) becomes
  that element's value and does not cancel siblings; whole-theta cancellation is
  terminal (no final value). `par` is a contextual keyword recognised only before
  `for`, so existing identifiers named `par` are unaffected. Legal in both
  prompt- and subagent-mode thetas. New parse diagnostics:
  `theta/parse/par-query-in-body`, `theta/parse/par-shared-mutation`,
  `theta/parse/par-break-continue`. Bumps the theta language surface to
  **theta 1.1**.

## [0.5.0] - 2026-07-20

### Added

- **Computed field values in Pi-tool arguments (RFC 0002).** The single
  positional bare-object argument of a Pi-tool call now admits **full Theta
  expressions** for its field values — identifier references, operators, function
  and tool calls, `?`, `${...}` interpolation, and nested arrays/objects whose
  leaves are expressions — instead of restricting them to the Theta literal
  sublanguage. The bare-object *shape* rule is unchanged (a single object literal
  written inline, typed by the tool's registered input schema); `params:`
  defaults remain literal-only and are out of scope. Field-value expressions
  evaluate left-to-right in source order at call time, before dispatch; a panic
  or early-returning `?` aborts dispatch. This is an additive source-language
  change under the GOV-15 diagnostic-registry carve-out and lands within theta
  1.x. Spec: `docs/spec_topics/tool-calls.md`, `docs/spec_topics/grammar.md`,
  `docs/reference/grammar.md`, `docs/spec_topics/expressions.md`.
- **`theta/parse/tool-arg-schema-conflict`** — new error-severity parse
  diagnostic (DIAG-2 code addition). Fires only when a Pi-tool field-value
  expression's static type is *provably disjoint* from the tool's input-schema
  field type mapped through the schema subset (a sound front-run of a certain
  runtime AJV rejection); formats, patterns, numeric refinements, and satisfiable
  unions fall through to the runtime AJV check and are never rejected at parse
  time.
- **`theta/parse/tool-arg-not-object-literal`** — new error-severity parse
  diagnostic (DIAG-2 code addition) for the surviving bare-object *shape* rule:
  a Pi-tool argument that is not written inline as a bare object literal (e.g. a
  `let`-bound object passed as `read(args)`). Its message directs the author to
  inline the fields, replacing the mis-scoped reuse of
  `theta/parse/bare-object-literal`.

### Removed

- **`theta/parse/tool-arg-not-literal`** retired for Pi-tool call sites (DIAG-2
  code removal), superseded by the computed-argument grammar above.
  `theta/parse/tool-arg-arity` and `theta/parse/default-not-literal` are
  unchanged.

## [0.3.0] - 2026-07-19

### Changed

- **Ported to the Pi SDK 0.80.x API.** Bumped `@earendil-works/pi-coding-agent`,
  `pi-agent-core`, `pi-ai`, and `pi-tui` to `0.80.10` and adapted the runtime and
  test harnesses to the reshaped SDK surface:
  - `complete` is now imported from the `@earendil-works/pi-ai/compat` subpath
    (it moved off the package root in 0.80.x).
  - `createAgentSession` model/auth wiring migrated from the removed
    `modelRegistry` / `authStorage` options to `modelRuntime`
    (`ModelRuntime.create()`); `ModelRegistry` is now built via
    `new ModelRegistry(runtime)` (the static `.create()` factory was removed).
- **Split the SDK dependency-range convention.** `devDependencies` are pinned to
  the build/test target `~0.80.10`; `peerDependencies` now declare an open floor
  (see Breaking) instead of a single shared tilde range. Updated the `#pi-sdk-pin`
  contract (PIC-33/PIC-34, the manifest lock-step, and the "Deliberate deviation"
  rationale) to describe the peer-floor / dev-pin split.

### Breaking

- **Raised the minimum supported Pi version to `>=0.80.8`.** `peerDependencies`
  moved from `~0.75.5` to `>=0.80.8` — the earliest release in which every SDK
  API shape the runtime requires exists. Hosts on Pi `< 0.80.8` are no longer
  supported and are rejected by the runtime peer-dependency probe.

## [0.2.0] - 2026-07-19

### Changed

- **Renamed the project Loom → Theta** (named after Turing's fixed-point
  combinator, Θ), to resolve a package-name collision with an unrelated
  `pi-loom`. This is a breaking rename across every surface:
  - Package `@bitmonk8/pi-loom` → `@bitmonk8/pi-theta` (published as `0.2.0`).
  - File extensions `.loom` → `.theta` (programs), `.warp` → `.thetalib`
    (library modules).
  - CLI flag `--loom` → `--theta` (hard rename, no alias).
  - Discovery/settings/manifest surfaces `~/.pi/agent/looms/` →
    `~/.pi/agent/theta/`, `.pi/looms/` → `.pi/theta/`, `loomPaths` →
    `thetaPaths`, `pi.looms` → `pi.theta`, `looms.*` settings → `theta.*`.
    Old names are not honoured; an old-named dir/key surfaces a one-shot
    deprecation diagnostic.
  - Diagnostic-code prefix `loom/*` → `theta/*` (suffixes unchanged, except
    those naming the old extension, e.g. `import-non-warp-extension` →
    `import-non-thetalib-extension`).
  - Runtime identifiers `Loom*` → `Theta*`, `Warp*` → `ThetaLib*`.
  - Release-version literal `loom X.Y` → `theta X.Y`; governance anchors
    `loom-1-0-*` → `theta-1-0-*`.
  - Retired the legacy `v1-*` HTML-anchor dual-anchor governance machinery
    (GOV-25–GOV-29) wholesale, repointing all inbound `#v1-*` cross-references
    to their `theta-1-0-*` canonical arms.
  - See [`docs/rename-to-theta.md`](docs/rename-to-theta.md) for the full plan.
