# pi-loom production-readiness program — findings & state

**Goal.** Make Loom fully production-ready **as defined by the spec**
(`docs/spec.md` + `docs/spec_topics/`, more normative than `docs/` guide/tutorial/
reference; the spec is not assumed 100% correct — bug-ness is a judgement call:
is the behaviour reasonable given Loom's purpose?).

**Dominant defect class (holds throughout).** Nearly every gap is the same shape:
a spec-mandated feature is **implemented and unit-tested in an isolated module but
never wired into the shipped composition** (`src/extension/production-composition.ts`,
`production-loom-producer.ts`, `loom-composition-producer.ts`, `factory.ts`). The
isolated unit tests are green; the live pipeline never calls the code. This is the
gap that live testing (real `pi` + real model) catches and unit tests miss.

**Method (proven — keep using it).**
1. Probe the live shipped extension with `tests/hardening/probe-harness.ts`
   (`runProbe`): plant real `.loom`/`.warp` files, drive real slash invocations
   against a live model, observe deterministic channels
   (`registeredNames`, `diagnostics`, `userTexts`, `toolCalls`, `systemNotes`).
   Run: `npx vitest run --config vitest.hardening.config.ts <file>`.
2. Confirm each finding against source before fixing.
3. For anything needing a scope/architecture choice, **present the decision with
   options + a recommendation and get a human answer** — do not silently expand or
   relax scope.
4. Implement one phase at a time (the composition files are shared, so phases are
   sequential). Verify each: `npm run typecheck` + `npm run lint` +
   `npm test` + `npm run test:conformance` + the relevant live probe. Then
   **commit and push**.
5. Prefer wiring the existing unit-tested module over reimplementing; delete
   superseded alternates only with proof the feature is live via another path.

---

## Part A — COMPLETED (8 maintainer decisions, all pushed on `main`)

All decisions were resolved to **full spec conformance**. Verification at the last
commit: `npm test` 1606, `npm run test:conformance` 26, typecheck + lint clean.

| Phase | Findings resolved | Decision | Commit |
|---|---|---|---|
| 1 | BND-1, BND-3, DISCO-1 (load + runtime) | Binder runs **off-session** against the resolved binder model; envelope internal; `Running`/needs-info notes; non-bypass loom with no resolvable binder model fails to load | `f5ea2278` |
| 2 | STL-6, CANCEL-1 | Executor `fail` Flow carries the effect-`Err` payload (no more `cancelled` masking); loop-iteration cancel checkpoint wired | `01447ab3` |
| 3a | QTL-1 / SLSH-2 | Every prompt-mode query streams as a real user-visible turn (removed the off-session chained path + its empty-reply auth bug) | `cd22280c` |
| 3b | CANCEL-2/3/4/5 | Per-invocation `loomAbort` + `ctx.signal`/`agent_end` forwarding; binder-call cancellation; late-settlement swallowing handlers; derived child controller | `b1c57dbc` |
| 4a | STL-2 (subagent) | Subagent query driver **owns the agentic loop** (round-by-round `complete()` + callable-set tools); `max_rounds` enforced; ceiling #2 reachable | `4d851d22` |
| 4b | STL-2 (prompt) | Prompt-mode `max_rounds` enforced via pi's `tool_call` **block** hook + round counting, preserving native streaming | `74b91091` |
| 5 | DISCO-2 | Hot-reload/watcher subsystem wired (arm watcher → 250 ms debounce → rebuild-and-swap → re-register + structural-change note + ERR-7; shutdown detaches) | `f970c200` |
| 6 | decision 7 | Dead-code audit: deleted 4 provably-superseded modules (+4 leaf tests); kept 7 gates; flagged 16 unwired (Part B) | `552545b9` |
| 7 | INV-9 (Part B decision 1) | prompt→prompt `invoke` attaches to the caller's user session (`runPromptSuspendInvoke` wired; caller-mode threaded; callee final value via shared `surfaceCalleeFinalValue`; CANCEL-5 derived child); subagent→prompt attach deferred | pending |

Earlier standalone hardening fixes on `main` (same program, pre-decisions):
XMODE-1 `d3db448c`, BIND-1 `e9d17ffd`, SNOTE-1/SUBAG-3 `fe3594c4`,
SUBAG-1/2 `a0dcf942`, CONV-6 `5e0cccf8`.

---

## Part B — REMAINING (the second tranche — NOT yet decided)

Surfaced by the Phase-6 dead-code audit. These modules are full implementations
with **no production caller**; each is a genuine spec gap. They need the same
decision-by-decision treatment before "spec fully implemented" is true. Per-module
detail + spec anchors + unwired evidence: `dead-code-audit.md` (FLAGGED-UNWIRED).

### B1 — user-facing behaviour gaps (recommend deciding first)

- **INV-9 — prompt→prompt `invoke` never attaches. ✅ FIXED (decision 1, Option A, commit pending push).**
  **Before:** production `#driveCallee` **always** spawned a fresh isolated subagent
  session for every invoke callee (`spawnSubagentConversation`); a prompt-mode callee
  invoked from a prompt-mode caller ran invisibly in a private session and could not
  see the user's conversation. **After:** the prompt→prompt cross-mode cell is wired —
  `#driveCallee` now threads the caller's mode and, when caller+callee are both
  `prompt`, drives the callee via `bindPromptConversation` (user-session attach:
  the callee's `@`-queries stream as user-visible turns in the SAME conversation)
  under `runPromptSuspendInvoke` (V15d active-set snapshot → install child callable
  set → suspend parent by awaiting the child body → restore in `finally`). The
  callee's FINAL VALUE (not PIC-53 trailing-turn text) crosses the boundary via a
  new shared `surfaceCalleeFinalValue` FN-5 projection (also adopted by the subagent
  surface). CANCEL-5 parity: `bindPromptConversation` now derives its `loomAbort`
  from `parentSignal` for a child invoke. Live-proved by
  `tests/hardening/session-invoke-attach.test.ts` (child query appears in the parent
  drive's `userTexts`; typed `invoke<number>` returns 42). Deferred (separate lower-
  impact decision): the **subagent→prompt** attach cell (still spawns fresh; the
  difference is invisible to the user — both are private to the grandparent).
  Modules wired: `src/runtime/invoke-prompt-suspend.ts`. Spec: `invocation.md`
  §Cross-mode semantics (prompt→prompt row + prompt→prompt paragraph).
- **Prompt-mode transport errors are swallowed.** `src/runtime/prompt-transport-mapping.ts`
  (PIC-50/51). A trailing `assistant` turn with `stopReason:"error"` maps to
  `Ok(text)`, never `Err(TransportError)`; `LivePromptQueryModel.nextFreePhaseTurn`
  never probes `stopReason`. A failed provider turn is indistinguishable from success.
- **Ceiling #4 not enforced on `invoke` boundaries.** `src/runtime/invoke-ceiling-depth.ts`.
  JSON-document depth ≤5 (`"JSON document depth exceeds 5"`) at the `invoke(...)`
  `params` boundary and the `invoke<T>` return boundary — production runs AJV only
  (no `maxDepth`) and binds params without a depth walk. (Distinct from the wired
  chain-depth ceiling #1.) Spec: `hard-ceilings.md` ceiling #4.
- **Binder context subsystem (5 modules) unused by the Phase-1 off-session binder.**
  `session-context-walk.ts` (BNDR-10 `bind_context: session` truncation walk —
  a documented frontmatter feature that currently does nothing),
  `compact-transcript.ts` (BNDR-7/8/9 transcript rendering),
  `binder-inference.ts` (V9j structured-output `complete()` binder call, forced
  single tool, `temperature:0`), `provider-error-mapping.ts` (V9j provider→
  `QueryError` taxonomy: `ContextOverflowError`/`TransportError`,
  `loom/load/typed-query-unsupported-provider`), `binder-seed.ts` (V11e FNV-1a
  determinism seed). The shipped binder works but does none of this.

### B2 — diagnostics / quality gaps (lower severity; some overlap the README's
acknowledged "partial type-layer diagnostics")

- `src/runtime/query-discard.ts` — QRY-19 `loom/parse/discarded-query-result` on a
  bare `@`…`` expression-statement + QRY-20 discard-observability event.
- `src/runtime/tool-batch.ts` — V14b model-driven **parallel** tool-call batch
  (`Promise.allSettled`); production `runToolBatch` runs siblings sequentially.
- `src/runtime/tool-call-off-surface.ts` — V14c tool-return **shape** validation
  routings (`internal-error{tool-return-shape}`, non-settling await, post-cancel
  late-settlement discard); the live envelope lowering does no shape check.
- `src/runtime/forwarding-listener-trap.ts` — V17b throw-trap around the cancel
  forwarding listeners → `loom/runtime/internal-error`; live `forwardSignalReason`
  has no `try`/`catch`.
- `src/extension/drain-state.ts` — PIC-29..32 `LoomRegistry` drain-state
  **slash-dispatch routing** + note templates (only the *storage* is wired via
  `reload-wiring.ts`).
- `src/extension/load-pre-eval.ts` — V4e load-time failure routing onto the
  note channel; the shipped load path surfaces load errors via a transient
  `ctx.ui.notify` toast + stderr (documented known load-phase routing gap;
  contrast: reload-phase note routing IS wired).
- `src/parser/query-schema-inference.ts` — V13b typed-query response-schema
  **inference** from surrounding type context (QRY-2/3); production resolves only
  an explicit `@<Schema>` annotation.
- `src/runtime/tool-registration.ts` — mixed: the PIC-17 active-set snapshot/swap is
  superseded (inline in the producer), but PIC-8 restore-failure, PIC-19
  setup-failure, PIC-44 cache-collision, and `ToolDefinition.label` derivation are
  unwired residues. Kept (deletion would drop the only impl of those obligations).

### B3 — kept build/test gates (NOT features; leave as-is)
`inventory-closure-audit.ts`, `version-bump-gates.ts`, `version-bump-acceptance.ts`,
`schema-subset-gate.ts`, `unknown-reason-rule.ts`, `mvp/minimal-loom.ts`,
`tool-call-host-denial.ts` (a coverage-matrix REQ-ID citing anchor).

### Also note (partial wiring, from Phase 5)
`runSessionShutdown` (`src/extension/session-shutdown.ts`) full five-step teardown
is still not wired — the factory's `session_shutdown` detaches the hot-reload
watcher + cancels the debounce timer, but the registry-drain / forwarding-listener
detach steps need the cancellation-path resources threaded in.

---

## Artifacts map
- `tests/hardening/session-findings/SUMMARY.md` — the session-semantics campaign summary (fixes + deferrals).
- `tests/hardening/session-findings/*.md` — per-lens findings (subagent, crossmode, systemnotes, convdrive, binder, discodyn, subagent-toolloop, cancellation, promptloop, dead-code-audit).
- `tests/hardening/SUMMARY.md`, `tests/hardening/cli-findings/SUMMARY.md` — the two earlier campaigns (37+ fixes).
- `tests/hardening/probe-harness.ts` + `tests/hardening/BRIEFING.md` equivalent (`session-findings/BRIEFING.md`) — how to probe.
- Live probe files: `tests/hardening/session-*.test.ts` (need a live provider).

## Key technical facts learned (constraints that shaped the decisions)
- The pi SDK exposes **no** per-turn tool-round cap and no round-by-round stepping;
  `AgentSession.prompt` runs an opaque internal agentic loop. → `max_rounds` must be
  enforced by the loom (subagent: own the loop via `complete()`; prompt: bound pi's
  loop via the `tool_call` **block** hook + `before_provider_request` round counting).
- `DefaultResourceLoaderOptions.systemPrompt` is a direct SDK option (SUBAG-1 needed
  no custom adapter — the old "can't supply ExtensionRuntime" comment was false).
- Off-session `complete()` does **not** inherit session credentials — resolve auth
  via `modelRegistry.getApiKeyAndHeaders(model)` and pass `apiKey`/`headers`.
- pi extension hooks usable by the loom: `pi.on("tool_call", h)` returns
  `{ block?, reason? }`; `before_provider_request` fires once per model round;
  `tool_execution_start/end`, `agent_end`, `turn_start/end` are observable.
- Bare model ids can be ambiguous across providers — use provider-qualified refs
  (e.g. `anthropic/claude-haiku-4-5`) in fixtures.
