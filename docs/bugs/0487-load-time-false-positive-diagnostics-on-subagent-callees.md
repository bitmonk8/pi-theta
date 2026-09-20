# Bug 0487 — Load-time false-positive diagnostics on subagent callees: `unknown-tool` for in-process tools, `binder-model-unresolved` for caller-supplied models, and cascading `callee-has-errors`

- **Status:** open.
- **Sev/Diff estimate:** S4/D3 — S4: purely cosmetic; no functionality affected
  (all three diagnostics describe conditions that are resolved at invocation
  time, not load time). D3: three distinct resolution gaps in the load-time
  check, each needing its own carve-out; none are trivial one-liners because
  they cross the parse→compose→invoke boundary.
- **First observed:** 2026-09-19, on `fix-cluster-tree.theta` and all six
  `workers/lens-*.theta` files. Present since RFC 0010 shipped `theta_progress`
  (0.473.0) and since the quality-loop workers were authored without
  `bind_model:` (by design — they receive it from the caller).

## Symptoms

Loading `.pi/theta/quality-loop.theta` (or any theta that invokes workers as
subagent callees) emits three classes of false-positive diagnostics:

1. **`theta/load/unknown-tool: unknown Pi tool 'theta_progress'`** on
   `fix-cluster-tree.theta`. The tool is declared in `tools:` frontmatter and
   used in code; it dispatches correctly at runtime through the
   `inProcessToolExecutors` path (RFC 0010, EXST-13). But the load-time
   callable-set resolver (`src/parser/callable-set.ts`, `resolveEntry`)
   checks only `builtinToolDefinition` (the 7 hardcoded Pi tools:
   grep/read/find/ls/bash/edit/write) and the host's extension-tool registry
   (`deps.resolvePiTool`). In-process tool executors — registered by the
   factory at composition time, after parsing — are invisible to it.

2. **`theta/load/binder-model-unresolved`** on every worker theta that omits
   `bind_model:` in its own frontmatter. These workers are subagent callees
   whose model is supplied by the caller at invocation time (the orchestrator's
   `bind_model:` propagates to the callee). The load-time check
   (`src/parser/frontmatter.ts`) fires because it cannot see the caller's
   model — it validates each file in isolation.

3. **`theta/load/callee-has-errors`** on `quality-loop.theta`, cascading from
   (1). The caller inherits the callee's load errors even though the callee
   runs fine at invocation time. This is a consequence of (1), not an
   independent defect.

All three are severity `error` in the diagnostic output. None block
invocation — the loop has run hundreds of waves successfully with them
present. They are pure noise.

## Root cause

The load-time validation pass resolves each theta file's `tools:` and
`bind_model:` in isolation, before the composition root threads in the
runtime-only resources (in-process executors, caller-supplied model). The
validation has no concept of "this will be resolved later at invocation time"
and rejects anything it cannot resolve at parse time.

## Fix

**SETTLED (operator, 2026-09-20).** Part (1) → option A; part (2) →
verify-the-mechanism-first (the doc's callee-graph hypothesis is likely
WRONG, see the note under (2)); part (3) falls out of (1).

Three separate carve-outs, each scoped to its own resolution gap:

### (1) `theta_progress` / in-process tools — OPTION A (settled)

The callable-set resolver needs an additional resolution arm for tool names
that the composition root will register as in-process executors. Options:

- **A.** Thread the set of in-process tool names into the parse-time
  `CallableSetDeps` so `resolveEntry` can accept them (simplest; the factory
  already knows the names before parsing — `theta_progress` is currently the
  only one).
- **B.** Make in-process tools self-declaring: a theta-level annotation or a
  new `tools:` entry kind (e.g. `theta_progress [in-process]`) that the
  parser accepts without host resolution. More grammar surface than needed
  for one tool.

**SETTLED: option A.** The factory already constructs the `inProcessTools`
record before calling `composeAndBind`; project its key set into the parse-time
`CallableSetDeps` so `resolveEntry` accepts an in-process-tool name (currently
only `theta_progress`) as a resolved Pi-tool-shaped entry instead of minting
`theta/load/unknown-tool`. The name must still dispatch at runtime through the
existing `inProcessToolExecutors` path (unchanged). All three `resolvePiTool`
closure sites in `production-composition.ts` (the top-level compose deps and
the two callee-resolution sites) must resolve the in-process names
identically, so a callee declaring `theta_progress` in its own `tools:` is not
re-flagged.

### (2) `binder-model-unresolved` on callees — VERIFY THE MECHANISM FIRST

**The doc's original callee-graph hypothesis is probably wrong and must be
verified before any code lands.** The local `.pi/settings.json` DOES set
`theta.binderModel`, yet the warning still fired for the workers at this
session's startup — which points at the LOAD-TIME check ignoring the
`theta.binderModel` settings fallback that the runtime binder honors, NOT at a
missing callee-graph suppression. The diagnostic message itself names both
sources ("set 'bind_model:' in frontmatter or 'theta.binderModel' in
settings"), so the check that MINTS it must be threading the settings value and
failing to — or the workers load in a context where settings are not visible
(a subagent child in a worktree whose cwd has no `.pi/settings.json`).

Required first step (the test-writer / implementer must establish this before
choosing the fix): reproduce the warning and determine WHICH is true —
(a) the load-time binder-model check does not consult
`settings.theta.binderModel` at all (fix: thread the settings fallback into
the check so it matches the runtime resolver and the message's own promise);
or (b) the workers legitimately load with no settings in scope and the
callee-supplied-model suppression the doc first proposed is the right shape
after all. Do NOT implement the callee-graph suppression on the doc's
unverified say-so; the witness must pin the actual mechanism.

### (3) `callee-has-errors` cascade

Falls out automatically once (1) is fixed: if the callee's only error was
the `theta_progress` false positive, removing that error removes the cascade.
No separate fix needed.

## Workaround

None needed — the diagnostics are cosmetic and do not affect runtime
behaviour. They can be visually ignored.

## Affected surface

- `src/parser/callable-set.ts` — `resolveEntry`, the Pi-tool resolution arm.
- `src/parser/frontmatter.ts` — `binder-model-unresolved` emission.
- `src/extension/production-composition.ts` — `composeAndBind` deps threading,
  `preEvalCauseOf` (if severity is to be downgraded rather than suppressed).
- Spec: `docs/spec_topics/diagnostics/code-registry-parse.md` (the diagnostic
  code inventory).

## Witnesses

Current `.pi/theta/workers/` — every worker theta and `quality-loop.theta`
exercise all three false positives on every load. A witness test should:

- Compose a callee with `tools: [theta_progress]` and verify zero
  `unknown-tool` diagnostics.
- Compose a callee without `bind_model:` that is invoked by a caller with
  `bind_model:` and verify zero `binder-model-unresolved` diagnostics.
- Verify the caller emits zero `callee-has-errors` when the callee's only
  diagnostics were the above false positives.
