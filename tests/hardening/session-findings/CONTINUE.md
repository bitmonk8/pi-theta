# Bootstrap prompt — continue the pi-loom production-readiness program

Paste everything below the line into a new session (cwd `C:/UnitySrc/pi-loom`).

---

You are a hardening strategist/orchestrator continuing an in-progress program to
make **Loom** (the `pi-loom` extension) fully production-ready **as defined by its
spec**. This is a resumption; substantial work is already done and pushed on
`main`.

**Read first, in order:**
1. `tests/hardening/session-findings/PRODUCTION-READINESS.md` — the authoritative
   state: the goal, the method, Part A (8 decisions already completed + commits),
   Part B (the remaining unwired tranche), and the key technical facts/constraints.
2. `tests/hardening/session-findings/dead-code-audit.md` — per-module spec anchors
   and unwired-evidence for the Part B items.
3. `tests/hardening/session-findings/SUMMARY.md` and the per-lens `*.md` files —
   the findings history.
4. `CLAUDE.md` — behaviour rules (robotic, terse; warn before high-impact actions;
   catch specific exception types only).

**What "a bug" means here:** anything where Loom's behaviour does not match a
reasonable user expectation and is not explicitly called out as intended in the
spec/docs. Spec (`docs/spec.md` + `docs/spec_topics/`) is more normative than
`docs/` (guide/tutorial/reference), but the spec is not assumed 100% correct —
bug-ness is a judgement call. Ignore borderline cases.

**The dominant defect class:** a spec-mandated feature is implemented + unit-tested
in an isolated module but never wired into the shipped composition
(`src/extension/production-composition.ts`, `production-loom-producer.ts`,
`loom-composition-producer.ts`, `factory.ts`). Wire the existing module; do not
reimplement. Delete a superseded alternate only with proof its feature is live via
another path.

**Method (follow exactly):**
- Verify each finding against source before acting.
- For any item needing a scope/architecture choice, **present the decision with
  options + a recommendation and ask the maintainer** (use the multiple-choice
  question tool). Do NOT silently expand or relax scope. If investigation changes
  a scope estimate you gave, STOP and re-present the corrected decision (this
  happened twice already and mattered).
- Delegate testing and implementation to `worker` subagents (isolated context).
  Live probing uses `tests/hardening/probe-harness.ts` (`runProbe`) against a real
  provider: `npx vitest run --config vitest.hardening.config.ts <file>`. Prefer
  deterministic observation channels; pin model replies with exact-echo sentinels;
  treat a 429/transport as a retry, never a finding.
- The composition files are shared, so implement **one phase at a time,
  sequentially**. Each phase: `npm run typecheck` + `npm run lint` + `npm test` +
  `npm run test:conformance` + the relevant live probe must all be green; update
  any test that encoded the old (buggy) contract to the correct one and document
  why — never weaken a real test. Then **commit and push** (you own the commits;
  workers do not commit). Update the relevant finding doc marking the item FIXED
  with before/after.

**Remaining work (Part B of PRODUCTION-READINESS.md), recommended order.**
Take the maintainer through these **one decision at a time**, options + recommendation,
starting with the user-facing ones:
1. **INV-9** — prompt→prompt `invoke` never attaches to the caller's conversation
   (always spawns fresh). `src/runtime/invoke-prompt-suspend.ts`,
   `invoke-cross-mode.ts` unwired. Highest user-facing impact; also the hardest
   (attach-and-suspend semantics + `setActiveTools` snapshot/restore).
2. **Prompt-mode transport-error mapping** — a failed provider turn returns
   `Ok(text)` not `Err(TransportError)`. `src/runtime/prompt-transport-mapping.ts`.
3. **Ceiling #4 on `invoke` boundaries** — JSON-document depth ≤5 unenforced on
   `invoke` params/return. `src/runtime/invoke-ceiling-depth.ts`.
4. **Binder context subsystem** — `bind_context: session`, transcript compaction,
   structured-output binder call, provider-error taxonomy, determinism seed
   (5 modules). Decide whether the off-session binder from Phase 1 should adopt
   these; `bind_context: session` is a documented feature that currently no-ops.
5. **B2 diagnostics/quality gaps** — `query-discard`, `tool-batch` (parallel),
   `tool-call-off-surface` (shape validation), `forwarding-listener-trap`,
   `drain-state` routing, `load-pre-eval` (load errors to note channel),
   `query-schema-inference`, `tool-registration` residues. Several overlap the
   README's acknowledged "partial type-layer diagnostics" — some may be legitimate
   1.0 cuts; decide per item.
6. **`runSessionShutdown`** full five-step teardown wiring (partial after Phase 5).

**Key constraints (from PRODUCTION-READINESS.md §Key technical facts) — don't
re-discover:** the pi SDK has no tool-round cap (the loom must own/bound the loop);
off-session `complete()` needs `modelRegistry.getApiKeyAndHeaders` auth;
`DefaultResourceLoaderOptions.systemPrompt` exists; `pi.on("tool_call",…)` returns
`{block?,reason?}` and `before_provider_request` fires once per round; use
provider-qualified model ids in fixtures.

**Baseline to confirm on start:** `git log --oneline -1` should be the dead-code
audit commit or later; `npm test` 1606+, `npm run test:conformance` 26, working
tree clean. Then begin with decision 1 (INV-9): investigate/confirm against source,
present options + recommendation, and await the maintainer's choice before building.

Run unsupervised where the method allows, but pause for the maintainer at every
scope/architecture decision.
