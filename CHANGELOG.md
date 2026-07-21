# Changelog

All notable changes to `@bitmonk8/pi-theta` will be documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
