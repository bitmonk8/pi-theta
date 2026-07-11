# Session-semantics hardening campaign — summary (third pass)

The prior two passes (`tests/hardening/SUMMARY.md` 25 fixes;
`tests/hardening/cli-findings/SUMMARY.md` ~12 fixes) exhausted the **static**
surface — parse / load / discovery / expressions / frontmatter / imports /
invoke-parse+ceilings. This third pass targets **real session runtime
semantics** reachable only against a live model + a real conversation: subagent
isolation, cross-mode invoke value passing, multi-turn conversation drive, the
final value, system-note rendering, the binder, and discovery dynamics. Six
parallel probe lenses drove adversarial `.loom`/`.warp` files through the SHIPPED
extension via `tests/hardening/probe-harness.ts` and compared observed behaviour
to the spec/docs.

## Dominant defect class (unchanged)

Every bug this pass found is the same class the prior passes named: a
**spec-mandated feature implemented + unit-tested in an isolated module but never
wired into the shipped composition** (`production-composition.ts` /
`production-loom-producer.ts` / `loom-composition-producer.ts`). The isolated
unit tests are green; the live pipeline never calls the code. Renderers, spawn
adapters, wrappers, and lowering passes all existed and were correct — they just
had no production caller. This is precisely the gap a "real extension in real
life" probe suite catches and isolated unit tests miss.

## Fixed and pushed (7 findings, 6 commits)

| id | area | one-line | commit |
|---|---|---|---|
| XMODE-1 | invoke | a callee-returned `Err` was passed through raw, not wrapped as `InvokeCalleeError`; reading `e.inner`/`e.callee_path` (documented fields) panicked uncatchably and aborted the parent | `d3db448c` |
| BIND-1 | binder | an enum/schema (`NamedType`) `params:` field left `loweredSchema` absent → the loom was misclassified as no-params: binder skipped, param arrived `null`, false SLSH-1 "takes no parameters" note | `e9d17ffd` |
| SNOTE-1 / SUBAG-3 | slash | the SLSH-3 top-level `Err` system note was never emitted — a slash loom that failed at the top level failed **completely silently** (prompt-mode even returned `Ok(trailing-text)` for a failed run); for a directly-slash-invoked subagent loom the failure was totally invisible | `fe3594c4` |
| SUBAG-1 | subagent | `system:` frontmatter was never injected into the spawned subagent conversation — the model never received it (the "cannot supply `ExtensionRuntime`" DIVERGENCE comment was false; `DefaultResourceLoaderOptions.systemPrompt` is a direct SDK option) | `a0dcf942` |
| SUBAG-2 | subagent | a subagent's `tools:` callable set was never installed (`customTools: []` hardcoded) — the subagent model could never make a tool call | `a0dcf942` |
| CONV-6 | subagent | a `Result`-typed tail / `return Ok(x)` operand (the canonical `return.md` idiom) was re-wrapped to `Ok(Ok(x))`, so `invoke<T>` validated the `Ok(x)` wrapper against `T` and failed `return_validation`, and a tail `Err(e)` was masked as success | `5e0cccf8` |

Safety/correctness highlights: XMODE-1 (uncatchable parent crash), SNOTE-1
(silent top-level failures — no user-facing signal at all), SUBAG-1/2 (the
subagent-mode core feature — `system:` + `tools:` — was inert).

Each fix was verified against its spec anchor, re-run through the live probe to
confirm before/after, and gated on `npm test` (1601) + `npm run typecheck` +
`npm run lint`, all green.

## Deferred — needs a decision, NOT fixed unsupervised

- **DISCO-1 — binder-model resolution unwired.** `resolveBinderModel` /
  `loom/load/binder-model-unresolved` have no production caller, and the shipped
  binder drives its turn against the ambient session model (`ctx.model`),
  ignoring `bind_model:` / `looms.binderModel`. Two facets, both risky to fix
  unsupervised: (1) the **load-time** check is spec-mandated but high-impact —
  firing it would make every non-bypass loom **fail to load** unless the operator
  configures `looms.binderModel`/`bind_model:`, breaking setups that today work
  fine against the session model (the lenient current behaviour is arguably the
  more reasonable one, so the "bug" is a judgement call); (2) the **runtime**
  facet (honour the configured binder model) is entangled with the deferred
  BND-1/BND-3 binder-turn-visibility re-architecture the prior pass flagged as
  needing a design decision (the binder runs as a user-visible streamed turn via
  `driveStreamedUserTurn`, which takes no model parameter). Recommend a human
  decision on both facets. See `session-findings/discodyn.md` (DISCO-1).

- **DISCO-2 — hot-reload / watcher subsystem unwired.** `ReloadDebouncer`,
  `armWatcherWithTerminalRecovery`, `rebuildAndSwap`, `structuralChangeNote`, and
  the settings-file watcher are full implementations with no production caller;
  the factory installs no step-5 watcher. Editing a `.loom` / `.pi/settings.json`
  during a live session produces no re-scan, no debounced reload, no
  structural-change note, and no ERR-7 surface — the user must restart. A large
  subsystem-wiring change AND a 1.0-scope question (is hot-reload in scope for the
  first release?). Recommend a scoping decision before wiring. See
  `session-findings/discodyn.md` (DISCO-2).

## Borderline (recorded, not pursued — per "ignore borderline")

- **XMODE-2** — an interpolating backtick template / `match` inside `${…}` in a
  `match`-arm value silently evaluates to `null` instead of
  `loom/parse/unsupported-feature`. Real footgun but the author is using an
  unsupported construct; value-passing surface unaffected. (`crossmode.md`)
- **SLSH-5 chain suffix** — the SNOTE-1 fix emits the correct leaf SNK row for an
  `invoke_callee` cascade but not the ` from <callee> invoked at <parent>:<line>`
  provenance suffix (deferred; needs invoke-provenance at the boundary).
- Known/deferred confirmations (not re-fixed): BND-1/BND-3 binder-envelope leak,
  QTL-1 prompt-mode chained-query visibility, QTL-3 depth-class repair skip —
  all previously documented as needing the same binder/streaming design decision.

## Probe files (this pass)

`tests/hardening/session-subagent.test.ts`, `session-crossmode.test.ts`,
`session-systemnotes.test.ts`, `session-convdrive.test.ts`,
`session-binder.test.ts`, `session-discodyn.test.ts` — each a live-host probe
run under `npx vitest run --config vitest.hardening.config.ts <file>` (needs a
live provider). Per-lens findings in `session-findings/*.md`.
