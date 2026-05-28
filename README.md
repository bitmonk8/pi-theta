# pi-loom

A [Pi Coding Agent](https://pi.dev) extension that introduces **loom**, a
purpose-built scripting language for authoring parameterized, programmatic
templates that drive an LLM conversation.

A `.loom` file interleaves ordinary code (variables, loops, conditionals,
functions) with literal text destined for the model. Evaluating a loom
appends turns to a conversation — either the caller's current conversation
(*prompt mode*) or a fresh isolated conversation (*subagent mode*) — and
evaluates to a final value (its last expression or `return expr`),
available to programmatic callers and propagated across the subagent
boundary. Loom evaluation itself produces no file outputs; any file writes
occur only through Pi tools the loom explicitly admits via frontmatter
`tools:` (e.g. `write`, `edit`). `.warp` files are library modules that
share loom's grammar and type system and are imported by `.loom` files.

The full design lives in [`docs/spec.md`](./docs/spec.md). The implementation roadmap
lives in [`docs/plan.md`](./docs/plan.md).

## Status

Pre-implementation. The specification and implementation plan are complete;
no runtime code has been written yet. Track progress against
[`docs/plan.md`](./docs/plan.md) and the
[spec coverage matrix](./docs/plan_topics/coverage-matrix.md).

Open spec-review work lives in [`docs/spec-review.md`](./docs/spec-review.md)
(per-finding fixes processed bottom-up by `/fix-spec-shape-single-findings`).
Deferred mechanical sweeps that span too many files for the per-finding
fix-loop — currently the *load-bearing* qualifier rewrite — are tracked
separately in [`docs/spec-sweeps.md`](./docs/spec-sweeps.md), awaiting a
scope decision before execution.

## Highlights

- **Two file kinds, one grammar.** `.loom` files are invocable as Pi slash
  commands; `.warp` files are import-only library modules.
- **Query-and-await.** `@`-prefixed templates send the conversation so far to
  the model and bind the typed reply to a variable.
- **Structured outputs.** `schema` declarations lower to a JSON-Schema subset
  validated with AJV; typed queries return `Result<T, QueryError>`.
- **Two execution modes.** *Prompt mode* appends to the caller's
  conversation; *subagent mode* runs in an isolated child conversation and
  returns a value.
- **Tool calls and cross-loom invocation.** `<tool>(args)` invokes registered
  Pi tools; `invoke(...)` runs another loom with cycle detection.
- **LLM-driven argument binding.** Slash-command arguments are parsed into
  typed `params` by an LLM binder with deterministic fallbacks.

## Install

Not yet published. Once implemented, the extension will be installed as a Pi
package that exposes its `extensions/` directory via the `pi.extensions`
field in `package.json`.

## Repository layout

| Path | Contents |
|---|---|
| [`docs/spec.md`](./docs/spec.md) | Top-level spec index. |
| [`docs/spec_topics/`](./docs/spec_topics/) | Per-topic normative spec pages. |
| [`docs/plan.md`](./docs/plan.md) | Top-level implementation plan. |
| [`docs/plan_topics/`](./docs/plan_topics/) | Per-phase plan pages and coverage matrix. |
| [`docs/spec-review.md`](./docs/spec-review.md) | Spec review log. |
| `extensions/` | Pi extension entry points (populated during implementation). |
| `package.json` | Package manifest; declares the Pi extension and peer-deps on `@mariozechner/pi-*`. |

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](./LICENSE-APACHE) or
  <https://www.apache.org/licenses/LICENSE-2.0>)
- MIT License ([LICENSE-MIT](./LICENSE-MIT) or
  <https://opensource.org/licenses/MIT>)

at your option.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally
submitted for inclusion in this work by you, as defined in the Apache-2.0
license, shall be dual licensed as above, without any additional terms or
conditions.
