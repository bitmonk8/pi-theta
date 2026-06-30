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

Implementation in progress. Track progress against
[`docs/plan.md`](./docs/plan.md) and the
[spec coverage matrix](./docs/plan_topics/coverage-matrix.md).

| Leaf | Status | Date | Notes |
|---|---|---|---|
| H1a | Complete | 2026-06-30 | Project scaffold and toolchain: `package.json` deps/scripts, `tsconfig.json`, Vitest, lint toolchain + loadable `eslint-plugin-loom-local` skeleton, architectural manifest tests. |
| H2a | Complete | 2026-06-30 | Cross-cutting lint + architectural gates over `src/**`: comment-keyed `no-broad-catch`, `no-unguarded-promise-combinator`, `no-blocking-sync` ESLint rules (`eslint.config.js`), and a module-level-mutable-binding architectural scan; wired into `npm test`. |
| H3a | Complete | 2026-06-30 | Dependency-injection seam skeleton: the seven host-seam interfaces (`Checkpoint`, `SchemaValidator`, `Clock`, `FileSystem`, `FileWatcher`, `TokenEstimator`, `IdSource`) and a constructor-injection `RuntimeRoot`; plus an identifier-keyed ambient-primitive scan (`// allow-ambient:` comment-keyed) wired into `npm test` over `src/**`. |
| H4a | Complete | 2026-06-30 | Extension factory shell + end-to-end harness: the never-throw synchronous-arm `src/extension/factory.ts` (per-call `try`/`catch` Pi-SDK-boundary registrations + `loom-system-note` renderer), the thin `extensions/index.ts` entry shim, an in-memory fixture-supply seam, and a reusable in-process session double with a minimal response-emission capability; session-double fidelity-contract self-check (streaming-before-idle, single-turn append, `pi.on` cancel-forward, CNCL-4 reason propagation) wired into `npm test`. |
| H4b | Complete | 2026-06-30 | Response-programming surface: the single input-side scripting API (`tests/harness/response-program.ts`, exposed via `double.responses` / `driveResponses()`) extending H4a's minimal emission into scripted-injection categories (a) assistant turns + fragments, (b) `tool_use` results incl. `isError` + mixed parallel batch, (c) binder response/failure with the V11f ≤3-call per-class retry budget, (d) `tool_loop.max_rounds` exhaustion, (e) abort at pre-call/in-flight/during-retry; deterministic-replay gate + per-category functional-effect self-checks wired into `npm test`. |
| H5a | Complete | 2026-06-30 | REQ-ID / diagnostic-code closing-gate automation: `tools/closing-gate/` reconciles the spec REQ-ID set + diagnostics registry against `coverage-matrix.md` and the asserting/citing tests, returning a structured per-gap findings collection (unmapped-executable-REQ-ID, mapped-REQ-ID-no-citing-test, registry-code-no-asserting-test, asserted-code-not-in-registry, retired/live clash, per-prefix numbering hole; `loom/typecheck/*` excluded). Evaluated against seeded fixtures under `test-fixtures/closing-gate/` (green no-violation + red per owned violation), wired into `npm test`. |
| H5c | Complete | 2026-06-30 | `no-broad-catch` allow-list closing-gate arm: extends `tools/closing-gate/` with a reconciliation that scans the `// allow-broad-catch:` exemption comments across `src/**` and reds out (`broad-catch-allow-list-unresolved`) when an entry's cited token resolves to none of the four admitted arms — a coverage-matrix REQ-ID, an exactly-one `cka-<n>` *Token* cell, a concrete `loom/...` registry code (never a glob/wildcard family), or the structural `pi-sdk-boundary` token. Evaluated against seeded `broad-catch-no-violation` / `broad-catch-unresolved` fixtures under `test-fixtures/closing-gate/`, wired into `npm test`. |
| H5d | Complete | 2026-06-30 | Transitive-completeness closing-gate arm: extends `tools/closing-gate/` (`parseClosingLeafCells` + `parseH5bDeps` + `expandLeafTokens`, plus `h5bDepsText` in `loadCorpus`) to reconcile every `coverage-matrix.md` closing-leaf cell (in the *Numbered REQ-IDs* and *Code-keyed obligation areas* tables) against H5b's expanded `Deps.` membership — tokenising each cell by its backtick spans, expanding contiguous within-group `<group><letter>` ranges on both sides, excluding the literal `<new>` and `*(numbered above)*` cells — and emits `transitive-completeness-unreachable` for a per-cell at-least-one failure (a multi-leaf primary + co-witness cell stays green when one listed leaf is present). Evaluated against seeded `transitive-no-violation` / `transitive-unreachable` fixtures under `test-fixtures/closing-gate/`, wired into `npm test`. |
| H5e | Complete | 2026-06-30 | Un-anchored normative-MUST text-scan closing-gate arm: extends `tools/closing-gate/` (`parsePrefixTablePages` + `parseCkaAreaRows` + `parsePlanLeaves` + `pageHasUnanchoredMust` + `classifyClosingCell` wired into `runClosingGate`, plus `planLeavesText` in `loadCorpus`) with three sub-recognisers over the non-narrative `spec_topics/**`-shaped pages — un-enumerated-MUST (`un-anchored-must-unenumerated`), `<new>`-placeholder-MUST (`un-anchored-must-new-placeholder`, plus `un-anchored-must-unresolved-leaf` for a non-resolving token like `V99z`), and un-rowed-page (`un-rowed-page-residue`, excluding GOV-24 hub stubs whose stem matches a trailing-slash subtree row). A page is in scope iff its prefix-table cell is not the byte-exact `(no IDs — narrative)` literal; an un-anchored MUST (a MUST/MUST-NOT paragraph with no `PREFIX-N` and no `loom/...` code) must be enumerated in the *Code-keyed obligation areas* table with a closing-leaf token resolving to a real plan leaf. The arm runs only when the corpus supplies `planLeavesText`, so the H5a/H5c/H5d fixtures stay dormant. Evaluated against seeded `un-anchored-no-violation` / `un-enumerated-must` / `new-placeholder-must` / `un-rowed-page` fixtures under `test-fixtures/closing-gate/`, wired into `npm test`; live-corpus binding flips at H6a. |
| H5f | Complete | 2026-06-30 | Per-facet citing-test closing-gate arm: extends `tools/closing-gate/` (`deriveFacetPartition` + `parseFacetRows` + `citesTokenInline` wired into `runClosingGate`, plus `perFacetCitingTests` in `loadCorpus`, gated by an `h5f-enabled.md` marker) to reconcile each multi-leaf `coverage-matrix.md` row — across **both** the *Numbered REQ-IDs* and *Code-keyed obligation areas* tables — against its facet leaves' facet-naming citing tests. For a row whose closing-leaf cell lists ≥2 leaves it derives the facet partition from the cell alone (dropping a leaf whose immediately-following parenthetical contains the literal `co-witness` token, keeping every other listed leaf) and emits `per-facet-citing-test-missing` for any remaining facet with no test source citing both the row's subject (the numbered REQ-ID, or the `cka-<n>` token for a code-keyed row) and that facet's closing-leaf-ID inline. Best-effort per-test-source existence scan (per-facet semantic fidelity stays the release-time residue item-7 obligation). Evaluated against seeded `per-facet-no-violation` (including a co-witness-excluded row) / `per-facet-violation` fixtures under `test-fixtures/closing-gate/`, wired into `npm test`; live-corpus binding flips at H6a. |
| M-T | Tests red | 2026-06-30 | Minimal end-to-end `.loom` slash-command tests (SLSH-2 MVP happy path): the `buildMinimalLoom` seam (`src/mvp/minimal-loom.ts`, inert stub) + two failing harness tests — a dispatched prompt-mode loom issues one untyped `@`-query whose streamed assistant response appends as one prompt-mode turn, and the run produces exactly one appended turn and no diagnostic. Session double extended with a `pi.sendMessage` diagnostics recorder. Tests compile (typecheck clean) and red on the absent prompt-mode pipeline. |
| H4c | Complete | 2026-06-30 | Modeled-behaviour surface: extends the H4b scripting contract with the two modelling categories the `V4c`/`V4f`/`V9i`/`V9o` vectors consume — (f) `scriptInvokeChild` (a completed `invoke(...)` child's produced final value surfaces as a completed-invoke-child outcome, ERR-13 no-rollback) and (g) `scriptSubagentCallee` (a private subagent `AgentSession` dispatch whose outcome is read from the terminal `agent_end`, ignoring `willRetry:true` events per PIC-43, surfaced as a subagent-loom outcome rather than a plain turn); determinism gate + per-category functional-effect self-checks wired into `npm test`. |
| M | Complete | 2026-06-30 | Minimal end-to-end `.loom` slash command (SLSH-2 MVP happy path): `buildMinimalLoom` (`src/mvp/minimal-loom.ts`) parses a `mode:`-only frontmatter and the single untyped `` @`<literal>` `` body query of an in-memory `.loom` source and returns a `LoomFixture` whose `run` drives one prompt-mode turn — `pi.sendUserMessage(<rendered literal>)` then `ctx.waitForIdle()` — leaving exactly one appended user+assistant turn and no diagnostic. Harness-supplied single-source discovery only (no ambient `src/**` filesystem read, no `FileSystem` seam); the two `M-T` SLSH-2 tests go green. |

Open spec-review work lives in [`docs/spec-review.md`](./docs/spec-review.md)
(per-finding fixes processed bottom-up by `/fix-spec-shape-single-findings`).

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
| `package.json` | Package manifest; declares the Pi extension and peer-deps on `@earendil-works/pi-*`. |

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
