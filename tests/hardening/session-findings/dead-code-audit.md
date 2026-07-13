# Dead-code audit — orphan modules (maintainer decision 7, Phase 6 final)

Conservative dead-code audit of the 27 `src/` modules with **no production importer**
(verified: no non-test `src/` file has an actual `from ".../<module>"` import — the
apparent hits in `conversation-drive.ts` / `invoke-prompt-suspend.ts` /
`sdk-inventory.ts` / `version-bump-gates.ts` / `prompt-transport-mapping.ts` are
spec-anchor comment references, not imports).

Method per module: (1) confirm zero production importers; (2) read the module header +
spec anchor; (3) walk the transitive import graph from the production entry
`src/extension/factory.ts` (103 reachable modules) to decide whether the *same
behaviour* is reached through a **factory-reachable** module with a **green test on the
live production path** (→ SUPERSEDED), an intentional test/CI/arch gate (→ GATE), or is
simply not wired (→ UNWIRED). Default on uncertainty: KEEP + FLAG.

## Counts

| Bucket | Count |
|---|---|
| DELETED (superseded alternate) | 4 |
| KEPT — build/test/coverage gate | 7 |
| FLAGGED — genuine unwired feature | 16 |
| **Total** | **27** |

## Verification (after deletions)

- `npm run typecheck` — clean (no dangling imports).
- `npm run lint` — clean.
- `npm test` — **1606 passed / 138 files, 0 failed** (baseline 1624 / 142; −18 tests
  from 4 deleted leaf-only test files).
- `npm run test:conformance` — **26 passed**.
- Orphan re-check (import walk from `factory.ts`): factory-reachable count **held at 103**
  (no previously-reachable production module lost its last importer → **no new orphan
  introduced**); unreached set dropped 34 → 30; the 4 deleted modules are gone.

### One deletion was reverted (the audit's central structural finding)

An initial 5th deletion — `runtime/tool-call-host-denial.ts` + its test — turned the
**H6a `live-corpus-release-gate`** red: `coverage-matrix-mapped REQ-ID PIC-52 has no
citing test`. The orphan leaf tests are the **coverage-matrix REQ-ID citing anchors**
that the closing gate binds each REQ-ID to (by REQ-ID token). Even where a module's
*behaviour* is superseded and covered by a live production-path test, that live test does
not carry the leaf's REQ-ID token, so deleting the leaf test orphans the REQ-ID citation
and reddens the release gate. Per the VERIFY rule ("if it breaks anything else, REVERT"),
`tool-call-host-denial` was restored. The other 4 deletions did **not** break the gate
(their REQ-IDs are either not coverage-matrix-mapped or cited by another live test).

> **Residual finding for the maintainer:** deleting a *superseded* orphan whose leaf test
> is the sole citing anchor for a coverage-matrix-mapped REQ-ID requires re-pointing
> `coverage-matrix.md` to the live production-path test (or adding the REQ-ID token to
> that test). That is spec-corpus surgery, out of decision-7 scope. `tool-call-host-denial`
> is the one confirmed instance (PIC-52); the same constraint may block deleting other
> superseded orphans not attempted here.

---

## DELETED (superseded alternate → removed)

Each: the module's feature is implemented + wired via a **different factory-reachable
module**, exercised by a **green test on the live production path**; the module carries no
unique unwired spec obligation; and deletion broke nothing beyond its own leaf-only test.

| Deleted module | Deleted leaf-only test | Superseding live (factory-reachable) module | Proving green test on the live path |
|---|---|---|---|
| `src/runtime/invoke-args-options.ts` (V15k — INV-2 positional arg style, INV-3 open-struct invoke-options, FN-5 final-value propagation) | `tests/invoke-args-options.test.ts` | `production-loom-producer.ts` `#resolveInvoke`/`#driveCallee` (positional bind inline `expr.args.slice(1).map(...)`; FN-5 surfaced off the shared `function-result.ts` / `statement-executor.ts` seam) | `tests/production-live-resolvers.test.ts` (H8b — a callee load failure surfaces `Err(InvokeInfraError{cause:"load_failure"})` "never `Ok(null)` (FN-5)"; success propagates the tail value) |
| `src/runtime/subagent-swallowing-handler.ts` (V9o — subagent `AgentSession.abort()` late-rejection swallowing) | `tests/subagent-swallowing-handler.test.ts` | `runtime/subagent-isolation.ts` `attachSubagentAbortForwarding` (`void session.abort().catch(() => {})` — structural swallow at the construction site), wired at `production-loom-producer.ts:1097` | `tests/subagent-isolation.test.ts` (PIC-41 abort forwarding) + `tests/production-subagent-query-model.test.ts` (live subagent path) |
| `src/extension/cache-eviction.ts` (V15e — evict stale static-resolution parse-cache entries + transitive `.warp` importers on swap) | `tests/hot-reload-cache-eviction.test.ts` | `import-static-checks.ts` `parseCache` is a **per-pass** `const … new Map()` (discarded each pass) + `hot-reload.ts` `rediscover`→`rebuildAndSwap` does a **full rebuild per swap** → targeted eviction is rendered moot (no cross-swap cache exists to go stale) | `tests/watcher-hot-reload-integration.test.ts` (a debounced onChange re-runs discovery, swaps the registry, re-parses through the shipped composition) |
| `src/extension/reload-pre-eval.ts` (V4g / ERR-7 — route watcher-time reload failure onto the note channel, `triggerTurn:false`) | `tests/pre-evaluation-reload-failure.test.ts` | `hot-reload.ts` — `emitErr7`/`runReload` route **every** reload-failure arm (re-parse / settings re-merge / re-compose / `registerTool`) uniformly to `loom/runtime/registry-swap-failed` on the note channel with `triggerTurn:false` (comment: "surfaces uniformly as the ERR-7 … rather than an unhandled rejection") | `tests/watcher-hot-reload-integration.test.ts` (arm d — a watcher-time rebuild failure surfaces ERR-7 on the note channel with `triggerTurn === false`, prior registry stays live) |

**Files deleted (8):** `src/runtime/invoke-args-options.ts`,
`tests/invoke-args-options.test.ts`, `src/runtime/subagent-swallowing-handler.ts`,
`tests/subagent-swallowing-handler.test.ts`, `src/extension/cache-eviction.ts`,
`tests/hot-reload-cache-eviction.test.ts`, `src/extension/reload-pre-eval.ts`,
`tests/pre-evaluation-reload-failure.test.ts`.

Each deleted test imported **only** its deleted leaf (verified) — dead-module-only
coverage; the superseded behaviour retains live coverage via the proving tests above.

---

## KEPT — build / test / coverage gate (7)

| Module | Gate / test that drives it |
|---|---|
| `src/extension/inventory-closure-audit.ts` | `tests/inventory-closure-audit-gate.test.ts` (`npm test`-side disk-walk audit gate — "walks the audited source tree and emits zero violation records", land-green on `main`) + `tests/inventory-closure-audit.test.ts` (auditor unit tests). Imports `sdk-inventory.ts` (its rule set). |
| `src/extension/version-bump-gates.ts` | `tests/version-bump-gates.test.ts` (V18c Pi version-bump static gates) + driven by `tests/session-shutdown.test.ts`, `tests/session-swap-tripwire.test.ts`, `tests/version-bump-acceptance.test.ts`. |
| `src/extension/version-bump-acceptance.ts` | `tests/version-bump-acceptance.test.ts` (version-bump-triggers runtime-evidence acceptance gate + revert path). |
| `src/parser/schema-subset-gate.ts` | `tests/schema-subset-gate.test.ts` (V5d reject-by-default schema-keyword allowlist gate). Distinct from the `result-in-schema-position` rule which **is** in production `type-grammar.ts`; this allowlist gate is consumed only by its gate test. |
| `src/extension/unknown-reason-rule.ts` | `tests/unknown-reason-rule.test.ts` (PIC-45/46/47 closed-set membership / constant-source pinning / snapshot-read-failure rule — an architectural rule enforced by its test). |
| `src/mvp/minimal-loom.ts` | `tests/minimal-slash-command.test.ts` (M-phase minimal end-to-end `.loom` SLSH-2 smoke — the narrowest vertical, retained as a regression scaffold). |
| `src/runtime/tool-call-host-denial.ts` | **Behaviour superseded** by `runtime/tool-call-execute.ts` `lowerToolExecuteThrow` (execute()-throw → `Err(CodeToolError{cause:"execution"})`, wired via `effectful-statement-host.ts` → `#resolveToolCall`, proven live by `tests/production-live-resolvers.test.ts:152`). **Retained** because `tests/tool-calls-host-denial.test.ts` is the **sole PIC-52 citing test** for the H6a `live-corpus-release-gate`; deletion reddened the gate and was reverted. Its `isError:true`-return guard is additionally design-moot (spec fix F-1578 removed `isError` from the code-side `AgentToolResult` type). |

---

## FLAGGED — genuine unwired feature (16)

Real feature implementations whose production wiring is missing (the campaign's dominant
defect class). **Not deleted, not wired** (out of decision-7 scope) — residual findings
for a future maintainer decision. Each: named module → spec behaviour → unwired evidence.

### Binder context subsystem (5) — decision-4 outcome: `session-context-walk` + `compact-transcript` WIRED (b3); `provider-error-mapping` WIRED (b2, classifier); `binder-inference` + `binder-seed` (forced-tool structured output + FNV-1a seed) INTENTIONALLY UNWIRED — the spec-pinned forced-tool mechanism is **not realizable** against the available provider (a top-level `anyOf` envelope is not a valid Anthropic tool `input_schema` → empty tool args → all binds malformed; live-confirmed). The shipped free-text envelope binder is retained as pragmatically correct.

- **`src/binder/session-context-walk.ts`** — BNDR-10 `bind_context: session` truncation walk. **✅ WIRED (decision 4, sub-phase b3).** The parser retains `bindContext` on `ParsedFrontmatter`; `runBinder`'s `#buildBinderSessionContext` runs `walkSessionContext` (≤20 turns ∧ ≤8000 tokens over the injected `TokenEstimator`) → `renderCompactTranscript` → prepends the *Recent session context* block to the binder prompt (BNDR-9 unsafe-`customType` aborts binding). Proven by `tests/frontmatter-contract.test.ts` (+4) + live `tests/hardening/session-bind-context.test.ts` (binder resolved `city=Zurich` purely from a prior turn). `compact-transcript.ts` is now reached via this path.
- **`src/binder/compact-transcript.ts`** — BNDR-7/8/9 compact-transcript renderer (byte-exact transcript body, assistant-body determinism, canonical JSON, transcript-safe `customType` precondition). Unwired: the shipped binder renders no transcript body; this module's only consumer is `binder-system-prompt.ts`, itself unreached from `factory.ts`.
- **`src/binder/binder-inference.ts`** — V9j pi-ai `complete()` structured-output binder call (forced single tool `__loom_bind_<slug>`, `temperature:0`, provider seed field, `onResponse` capture). Unwired: the shipped binder drives an off-session turn, not a structured-output `complete()` call.
- **`src/binder/provider-error-mapping.ts`** — V9j provider-response → `QueryError` taxonomy (`ContextOverflowError`/`TransportError` classification), the `loom/load/typed-query-unsupported-provider` warning, and the unsupported-provider `TransportError` synthesis. Unwired: no factory-reachable module classifies provider responses; `stopReason` is never probed on the live prompt/binder path.
- **`src/binder/binder-seed.ts`** — V11e FNV-1a binder determinism seed (offset `0x811c9dc5`, prime `0x01000193`, over the bare command name). Unwired: the shipped binder issues no seeded provider call (`renderBinderTurnPrompt` carries no seed).

### Runtime (8)

- **`src/runtime/invoke-ceiling-depth.ts`** — ceiling #4 (JSON-document depth `≤5` / `maxDepth`) at the `invoke(...)` `params` boundary and the `invoke<T>` return boundary. **✅ WIRED (Part B decision 3, Option A).** `#driveCallee` runs `enforceInvokeParamsDepth` per positional arg at invoke entry (before callee load; `cause:"validation"`); `#validateInvokeReturn` runs `enforceInvokeReturnDepth` on a typed `Ok` payload before AJV (CIO-3; `cause:"return_validation"`). Proven by `tests/production-live-resolvers.test.ts` (+3 deterministic) + `tests/invoke-ceiling-depth.test.ts`. **RESOLVED:** the code-driven-tool-args analogue `enforceCodeToolArgDepth` (V14e, `tool-call.ts`) is now WIRED. `#resolveToolCall` runs it on the constructed `params` object before AJV / before the tool executes (CIO-3); a depth-6+ argument is carried on the `CodeSideToolCall` as `argDepthBreach`, and `runCodeSideToolCall` short-circuits to the `arg-depth-error` outcome (`Err(CodeToolError{cause:"validation"})`) without dispatching `execute()`. Proven by `tests/production-live-resolvers.test.ts` (+3 deterministic). Still open: the MODEL-driven tool-args row of ceiling-#4's per-boundary table (separate seam).
- **`src/runtime/invoke-prompt-suspend.ts`** — V15d prompt→prompt parent-suspend + `setActiveTools` snapshot/restore around a suspended child body. **✅ WIRED (Part B decision 1, Option A).** `#driveCallee` now threads the caller's mode; when caller+callee are both `prompt` it drives the callee via `bindPromptConversation` (user-session attach) under `runPromptSuspendInvoke`, surfaces the callee FINAL VALUE via the shared `surfaceCalleeFinalValue` FN-5 projection (not PIC-53 trailing text), and derives the child `loomAbort` from `parentSignal` (CANCEL-5). Live-proved by `tests/hardening/session-invoke-attach.test.ts` + the existing `session-crossmode.test.ts`. Deferred: the subagent→prompt attach cell (still spawns fresh; user-invisible difference).
- **`src/runtime/tool-batch.ts`** — V14b model-driven parallel tool-call batch (`Promise.allSettled` settle-all before the next user turn, independent per-sibling lowering). Unwired: production `runToolBatch` executes siblings **sequentially**; `Promise.allSettled` appears nowhere in `src/`.
- **`src/runtime/tool-call-off-surface.ts`** — V14c four off-`CodeToolError` routings (loom-callable setup-throw clean-value + `internal-error`; non-conforming return shape → `internal-error{tool-return-shape}`; non-settling `await`; post-cancel late-settlement discard). Unwired: the live `lowerResolvedToolEnvelope` performs no shape validation; `tool-return-shape`/`shape_check` routing exists nowhere reachable.
- **`src/runtime/query-discard.ts`** — QRY-19 `loom/parse/discarded-query-result` on a bare `@`…`` expression-statement + QRY-20 discard observability (`display:false` runtime event preserving `kind`/`message`/`discard_site`). **QRY-19 ✅ WIRED.** `loom-document.ts` `checkStructural` → `walkStatement` `case "query"` calls `checkDiscardedQueryResult` for every `QueryStmt` (the parser only produces a `QueryStmt` for a NON-tail bare query — a trailing line-start query is promoted to the body/void tail, and the `?`-propagate / `let _ =`-discard / `let x = …` binding forms parse to `try` / `let` nodes — so the disposition is always `bare-expr-statement`). Proven by `tests/whole-program-parser.test.ts` §"QRY-19" (positive + 4 negative pins) and the existing `tests/query-discard.test.ts` unit facet; a latent discard in `tests/acceptance/fixtures/acc-code-tool-loop.loom` was corrected to the `?`-propagate form. **QRY-20 ⛔ DEFERRED (not minimally realizable in isolation).** The discard-observability RUNTIME event belongs to the broader still-unwired operator-facing always-log `RuntimeEvent` emission layer: `runQueryEffect` (`effectful-statement-host.ts`) drops the `outcome.event` the query loop builds, and NO production path threads a `SystemNoteChannelDeps` (nor `Clock`/`invocationId`/loom-name) into `ExecuteBodyDeps`, so `emitDiscardObservability` has no runtime call-site. Wiring only QRY-20 would (a) require inventing that runtime→system-note-channel thread through the spec-anchored executor (cka-50/cka-47/ERR-8…12 invariants), (b) require void-tail-form return-type detection the executor does not currently carry, and (c) be inconsistent with the still-unwired ordinary-query always-log event. `emitDiscardObservability` / `buildDiscardEvent` remain unit-proven (`tests/query-discard.test.ts`); only the runtime call-site is deferred.
- **`src/runtime/forwarding-listener-trap.ts`** — V17b throw-trap around the three forwarding listeners' `loomAbort.abort(source.reason)` → `loom/runtime/internal-error` (+ `InvokeInfraError{cause:"internal_error"}` at an invoke parent) without swallowing the cancellation. Unwired: the live `cancellation-core.ts` `forwardSignalReason` calls `loomAbort.abort()` with **no** `try`/`catch` trap.
- **`src/runtime/prompt-transport-mapping.ts`** — V9n PIC-50/51 prompt-mode transport-error mapping. **✅ WIRED (Part B decision 2, Option A).** `query-tool-loop.ts` gained an error-bearing `transport` variant (`FreePhaseTurn`/`ForcedRespondTurn` + `UntypedQueryOutcome`/`TypedQueryOutcome`); `effectful-statement-host.ts` maps it to `Err`; `LivePromptQueryModel` calls `extractPromptModeQueryResult` (untyped `nextFreePhaseTurn` + typed `forcedRespondTurn`) and `mapPromptModeSyncThrow` (sendUserMessage sync-throw), provider from `ctx.model.provider`. Proven by `tests/query-tool-loop.test.ts` (+3 transport-channel unit tests), `tests/prompt-transport-mapping.test.ts`, and `tests/hardening/session-prompt-transport.test.ts` (live no-regression). **Note:** the subagent-mode analogue `extractSubagentQueryResult` (`subagent-isolation.ts`) is STILL unwired — same gap, out of this decision's scope.
- **`src/runtime/tool-registration.ts`** — V9f: the PIC-17 active-set snapshot/swap/restore gate **is superseded** (folded inline into `production-loom-producer.ts` `#driveUserVisibleTurn` and `driveStreamedUserTurn`: `getActiveTools()` → `setActiveTools([...])` → `finally setActiveTools(ambient)`), **but** the module also carries genuinely-unwired residues — PIC-8 restore-failure protocol (the production `finally` has no `try`/`catch`), PIC-19 setup-failure protocol, PIC-44 registration cache-collision, and `ToolDefinition.label` derivation (`factory.ts` registers commands with no label). KEPT+FLAGGED because deletion would drop the only implementation of those obligations (mixed module).

### Extension / parser (3)

- **`src/extension/drain-state.ts`** — PIC-29/30/31/32 `LoomRegistry` drain-state **slash-dispatch routing**. ✅ WIRED (Decision 5 remainder, phase 1 — commit pending). The composeInstance production registration path (`factory.ts` `registerFixtures(fixtures, registry)`) now registers a drain-state-gated dispatch **wrapper** (`drainGatedHandler`) as the pi command handler instead of a raw pass-through: at dispatch it calls the new `resolveSlashDispatchWithReadFailover(name, () => registry.readDrainState(), registry)` and either dispatches the registry's CURRENT raw entry (arm (a) — post-swap-aware) or emits the shutting-down/superseded note on `loom-system-note` (`triggerTurn:false`). Registry stores RAW `run`; wrapper is the only indirection (no recursion). Threaded via `wiring.registry` at both `session_start` initial registration and the reload re-register closure. `shouldShortCircuitShutdown`/`evalShutdownShortCircuitWithReadFailover` remain for **Decision 6** (`session_shutdown` short-circuit). **Two-arm reconciliation follow-up (chosen Option B):** the live contract (`drain-state-contract.md:3`) excised arm (c) `degraded-needs-reload` + its `markRuntimeDegraded` writer in loom 1.0, and PIC-31's slash-site failover is arm (b) shutting-down — the new helper matches that. The module's vestigial three-arm `routeSlashDispatchWithReadFailover`/`degradedNote` + their existing tests were left untouched (degraded arm is dead-in-prod: no writer sets that tag). Full two-arm module/test reconciliation is a deferred follow-up. Verified: `drain-state-contract.test.ts` +4, deterministic `drain-gated-dispatch-integration.test.ts` (4), live no-regression `session-drain-gated.test.ts` (1).
- **`src/extension/load-pre-eval.ts`** — V4e load-time pre-evaluation failure routing (ERR-1…6, ERR-16 ceiling-#4→#3 cross-route) onto the note channel with `triggerTurn:false`. Unwired: the shipped load path (`production-composition.ts` `makeLoadEmit`) surfaces load errors via a transient **toast** (`ctx.ui.notify`) + stderr — an explicitly documented "known load-phase routing gap". (Contrast: reload-phase note routing **is** wired via `hot-reload.ts` — see DELETED `reload-pre-eval`.)
- **`src/parser/query-schema-inference.ts`** — V13b typed-query response-schema **inference** from the surrounding type context (QRY-2/3 shallow outward walk to the nearest sink), explicit `@<Schema>` override, `loom/parse/explicit-schema-mismatch` warning, per-query `$defs` pruning. ✅ WIRED (Decision 5 remainder, phase 2, Option 1 — commit pending). New post-parse whole-body pass `src/parser/query-schema-resolve.ts` (tree-rebuild, Option B) reconstructs the innermost-first `SchemaSinkFrame[]` per null-schema `QueryExpr`, calls `inferQuerySchema`, and serializes the result back onto `QueryExpr.schema` (single source of truth; no consumer change). Adapters: `annotationToInferred` (source string → `InferredSchema`, reusing `annotationToCompatType`) + `serializeInferred` (inverse). Invoked in `parseLoomDocument` after `mergeByLine`, before the checkers/producers; diagnostics folded in. `checkExplicitSchemaMismatch` wired on the `let x: T = @<S>` RHS (QRY-4 one-directional warning). `prunePerQueryDefs` wired into `runtime/query-schema-lowering.ts` (`pruneDocumentDefs`, schema-subset.md step-4 reachability; idempotent on current minimal shapes). **Indirect positions covered:** call-arg (local `fn` params), enclosing-fn tail/`return` operand (incl. nested in if/loops), array-literal element, ternary branch, + paren/`?` transparency. **Documented parse-time limitations (spec-divergence-by-necessity):** (a) `match-arm` is NOT a transparent sink per query-forms.md:42 — correctly opaque; (b) **tool-call + `invoke` arg param sinks are not statically resolvable** (tool sigs live in the host registry; invoke targets are external `.loom` resolved at load/runtime) — only local-`fn` call-args are inferable at parse time; (c) `InferredSchema` models only primitive/named/array<T>, so object/union indirect sinks (top-level or nested in `array<…>`) stay untyped. Verified: `query-schema-resolve.test.ts` (34, deterministic parser-level); `query-schema-inference.test.ts` (17) + `typed-query-schema-integration.test.ts` (6) unchanged-green.

---

## Notes

- The two orchestrator-supplied "confirmed superseded" examples (`invoke-ceiling-depth`,
  `invoke-prompt-suspend`) were **reclassified to UNWIRED** after direct inspection of the
  production invoke path showed the cited live behaviour is a *different* obligation
  (ceiling #1 chain-depth, and fresh-spawn) than what each module owns (ceiling #4
  JSON-document depth, and prompt→prompt attach/suspend). Per "never delete on
  uncertainty," neither was deleted.
- Second-level orphans kept alive only by first-level orphans (`invoke-cross-mode`,
  `ceiling-arbitration`, `active-invocation-registry`, `binder-system-prompt`,
  `sdk-inventory`, `session-shutdown`, `session-swap-tripwire`) were **not** in scope and
  remain referenced by their (kept) importers — no new orphan was introduced.
