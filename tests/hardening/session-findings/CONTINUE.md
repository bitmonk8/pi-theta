# Bootstrap prompt — continue the pi-loom production-readiness program

Paste everything below the line into a new session (cwd `C:/UnitySrc/pi-loom`).

---

You are a hardening strategist/orchestrator continuing an in-progress program to
make **Loom** (the `pi-loom` extension) fully production-ready **as defined by its
spec**. This is a resumption; substantial work is already done and pushed on `main`.

## Read first, in order

1. `tests/hardening/session-findings/PRODUCTION-READINESS.md` — **start at the
   "⏭️ RESUME HERE" section at the top**: it is the authoritative current state —
   the baseline, the open work, the PENDING DECISION to ask first, the NEXT
   decision, and the verified facts you must NOT re-discover. Then skim the rest
   (goal, method, key technical facts).
2. `tests/hardening/session-findings/dead-code-audit.md` — per-module spec anchors
   and unwired-evidence; entries are annotated ✅ WIRED / intentionally-unwired
   where resolved.
3. `CLAUDE.md` — behaviour rules (robotic, terse; warn before high-impact actions;
   catch specific exception types only; delegate investigation/research/reading to
   tasks, keep main context for integration + commits).

**Baseline to confirm on start:** `git log --oneline -1` → `e1702c87` or later;
`npm test` **1619+**, `npm run test:conformance` **26**, `npm run typecheck` +
`npm run lint` clean, working tree clean, on `main`.

## What "a bug" means

Behaviour that does not match a reasonable user expectation AND is not explicitly
called out as intended in the spec/docs. Spec (`docs/spec.md` + `docs/spec_topics/`)
is more normative than `docs/` (guide/tutorial/reference), but the spec is not
assumed 100% correct — bug-ness is a judgement call. Ignore borderline cases.

**Dominant defect class:** a spec-mandated feature implemented + unit-tested in an
isolated module but never wired into the shipped composition
(`src/extension/production-composition.ts`, `production-loom-producer.ts`,
`loom-composition-producer.ts`, `factory.ts`). Wire the existing module; don't
reimplement. Delete a superseded alternate only with proof its feature is live via
another path. **Not every unwired module is a bug** — some are genuine 1.0 cuts, and
at least one (the forced-tool binder) is not realizable against the available
provider; see the RESUME section's verified facts.

## Method (follow exactly)

- **Verify each finding against source before acting.**
- For any item needing a scope/architecture choice, **present the decision as a
  multiple-choice question (options + a recommendation) and await the maintainer.**
  Do NOT silently expand or relax scope. **If investigation changes a scope estimate
  you gave, STOP and re-present the corrected decision** — this has happened several
  times and always mattered (notably: the binder forced-tool mechanism turned out
  unrealizable mid-build).
- The composition files are shared, so implement **one phase at a time,
  sequentially**. Each phase must be green on `npm run typecheck` + `npm run lint` +
  `npm test` + `npm run test:conformance` + the relevant live probe before you
  **commit and push**. **You own the commits; workers never commit.** Update any test
  that encoded the old (buggy) contract to the correct one and document why — never
  weaken a real test. Update the relevant finding doc.
- Live probing: `tests/hardening/probe-harness.ts` (`runProbe`) against a real
  provider — `npx vitest run --config vitest.hardening.config.ts <file>`. Prefer
  deterministic observation channels (`registeredNames`, `diagnostics`, `userTexts`,
  `toolCalls`, `systemNotes`); pin model replies with exact-echo sentinels; use
  provider-qualified model ids; treat a 429/transport as a retry, never a finding.
  Some paths (real 429, provider `stopReason:"error"`, depth-6 values) can't be
  forced deterministically — verify those with unit tests + a live *no-regression*
  probe. Harmless `stale ctx` / `registry-swap-failed` teardown stderr appears in
  probes; ignore it (it never sets `turn.error`).

## AGGRESSIVELY DELEGATE TO SUBAGENTS — recursively

This is a hard requirement, not a preference. Keep your own (orchestrator) context
lean: it is for triage, maintainer decisions, integration wiring on shared files,
and commits. Push everything else down to `worker` subagents (isolated context) via
the `subagent` tool:

- **Delegate by default:** source investigation, spec-anchor reading, import-graph
  walks, "is X wired / is X a real bug" confirmations, writing + running live
  probes, drafting a fix and its tests, and running the gate suite. Do NOT do these
  inline in the orchestrator when a worker can.
- **Recursive delegation is expected and encouraged.** Workers should spawn their own
  subagents whenever they hit a large or separable task (e.g. an investigation that
  fans out across modules, or a fix that needs a parallel probe written). Tell each
  worker explicitly in its task brief: *"delegate sub-tasks to your own subagents
  whenever the task is large or separable; do not try to do a big task in one
  context."* Prefer parallel fan-out (`tasks: [...]`) for independent investigations.
- **Give workers precise, self-contained briefs:** the exact files/functions, the
  spec anchor, the observable channel to assert, the verification bar, and an
  explicit "do NOT edit src / do NOT commit / report the diff + gate output verbatim"
  when they are investigating or probing. Pass `targetPaths` so project-local agents
  are discovered.
- **You (orchestrator) integrate and commit.** Review every worker diff before
  landing it — workers have made scope/design misjudgements (e.g. probes that hit the
  single-string binder bypass; an over-eager forced-tool rewrite). Re-run the gates
  yourself before committing.

## The work queue

Ask the maintainer the **PENDING DECISION** documented in PRODUCTION-READINESS.md
"⏭️ RESUME HERE" **first** (the Decision-5 remainder: `drain-state` routing and/or
`query-schema-inference`, or record as follow-ups — scope corrected, re-issue a
recommendation). Then proceed to **Decision 6** (`runSessionShutdown` five-step
teardown + the drain-state `session_shutdown` short-circuit). One decision at a time,
options + recommendation, await the answer before building.

Run unsupervised where the method allows, but pause for the maintainer at every
scope/architecture decision.
