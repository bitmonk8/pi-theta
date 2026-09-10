# Bug 0473 — author-written `theta_progress(...)` is unreachable from theta code on Oh-My-Pi: pi-theta's OWN in-process tool is dispatched through the host-loop bridge, whose provider registration a host reserving built-in API names rejects and whose fabricated-turn settle that host does not drive

- **Status:** fixed (0.468.0).
- **Sev/Diff estimate:** S2/D2 — S2: RFC 0010's L3 author surface is a
  documented, shipped API (`docs/how-to/report-progress-from-a-theta.md`) that
  is completely non-functional from theta *code* on Oh-My-Pi — a code-side
  `theta_progress(...)` returns `Err(CodeToolError{cause:"execution"})` where the
  provider registration throws, and hangs indefinitely where it does not. No
  wrong theta output, but the feature does not work at all on that host. The
  model-facing call is unaffected. D2: one bespoke constant plus one
  dispatch-preference branch threaded through the composition root; no new host
  surface consumed.
- **Kind:** defect + host-portability gap. The generic PIC-64 code-side
  extension-tool dispatch was validated against Pi (`badlogic/pi-mono`)
  v0.80.10 and hard-codes `api: "openai-completions"` for the host-loop bridge
  provider — a built-in API name Oh-My-Pi's `api-registry` reserves, so
  `pi.registerProvider` throws `Cannot register custom API "openai-completions":
  built-in API names are reserved.` Independently, pi-theta's OWN
  `theta_progress` tool (whose `execute` is a pure in-process side effect,
  `registerThetaProgressTool` → `executeThetaProgress`) has no reason to route
  through a fabricated host turn at all; doing so subjects it to the whole
  bridge machinery (provider registration, model switch, `agent_settled`
  barrier, transcript read-back) that a second host need not implement the way
  the v0.80.10 blueprint assumed.
- **Related:**
  - RFC 0010 L3 (`docs/rfcs/0010-live-execution-visibility.md`,
    `docs/spec_topics/execution-status.md` EXST-13) — the `theta_progress` tool
    this bug makes unreachable from code.
  - PIC-64 (`docs/spec_topics/pi-integration-contract/subagent.md`
    #subagent-host-loop-dispatch) — the code-side extension-tool dispatch ladder
    whose only executable rung on both hosts today is the host-loop bridge
    (rung 1 `pi.getToolDefinition` has no dispatcher wired; Oh-My-Pi exposes no
    such surface anyway).
  - Bug 0322 (`0322-unknown-tool-dispatch-safety-net.md`) — the neighbouring
    `cause:"unknown_tool"` resolve-time arm; this bug is the `cause:"execution"`
    dispatch-time arm one branch below it.
- **Affected** (at b75e1ff, v0.467.0):
  - `src/extension/production-host-loop-dispatch.ts:475` —
    `api: "openai-completions"` on the bridge `registerProvider` config. On a
    host that registers the provider's `api` into a global API registry
    reserving built-in names, this throw aborts the whole `dispatch()`, which
    `runCodeSideToolCall` lowers to `Err(CodeToolError{cause:"execution"})`.
  - `src/extension/production-theta-producer.ts:3849` — the dispatch site: an
    execute-less callable-set entry (the `pi.getAllTools()` snapshot strips
    `execute` from EVERY extension tool, including pi-theta's own
    `theta_progress`) routes unconditionally to
    `#dispatchExtensionToolViaLadder`, i.e. the host-loop bridge, with no
    preference for a handler this process holds live.
  - Consequence for the primary code-side use (a subagent worker / a prompt-mode
    slash theta calling `theta_progress(...)`): the call never reaches
    `executeThetaProgress`; it fails or hangs in the bridge.

## Symptom

Observed against Oh-My-Pi (`omp/18.1.16`, `@bitmonk8/pi-theta@0.467.0`) with a
prompt-mode theta whose code calls `theta_progress(...)`:

- With the reserved API name in place, a `match theta_progress({ … })` binds
  `Err`, `e.cause === "execution"`, `e.message === 'Cannot register custom API
  "openai-completions": built-in API names are reserved.'`; a `?` halts the
  theta at that statement. The identical failure reproduces for ANY extension
  tool called from code (e.g. `winagent_status({})`), confirming the reserved
  name breaks the shared bridge, not `theta_progress` specifically.
- With only the API name corrected, the provider registers, but the fabricated
  bridge turn never settles (`awaitSettledTurn` never observes `agent_settled`
  from the host-driven `sendUserMessage`): the call hangs indefinitely in BOTH
  the prompt-parent and subagent-child regimes.

A model-issued `theta_progress` `tool_use` — which flows through the real host
tool loop, never the bridge — returns `ok` throughout.

## Expected

`theta_progress` is pi-theta's OWN tool with a pure in-process `execute`
(`executeThetaProgress`, EXST-13/14/15). A code-side `theta_progress(...)` call
should run that handler directly — same clamp/drop state as the model-facing
`execute`, same parent-regime bus publication + milestone / child-regime wire
line — and return the fixed `ok`, on every host, with no fabricated turn.

## Actual

The code-side call is treated as a generic third-party extension tool and routed
through the PIC-64 host-loop bridge, which (a) registers a provider under a
reserved API name and (b) fabricates a host turn the second host does not drive
to settlement — so the author-facing L3 surface is unusable from theta code.

## Fix (shipped 0.468.0)

Two independent changes, both in this PR:

1. **Bespoke bridge API tag** (`production-host-loop-dispatch.ts`). The bridge
   provider's `api` is now a bespoke, non-reserved name
   (`BRIDGE_API = "theta-host-loop-bridge"`) instead of the built-in
   `openai-completions`. `provider-composer` dispatches the bridge's own
   `streamSimple` whenever `model.api === provider.api`, so no real API adapter
   is ever consulted; the only requirement is that the name not collide with a
   host's reserved built-ins. This unblocks `registerProvider` on Oh-My-Pi and
   is a no-op on Pi (both spell the same self-authored turn). It does not, by
   itself, make the bridge *settle* on a host that drives fabricated turns
   differently — that residual is a host-side matter for third-party extension
   tools and is out of scope here.

2. **In-process dispatch of pi-theta's own tools** (the headline).
   `registerThetaProgressTool` now returns a `ThetaProgressRegistration` whose
   `codeSideExecute` runs the SAME `executeThetaProgress` closure — sharing the
   one per-registration clamp/drop `state` with the model-facing `execute`. The
   factory threads a per-process `Record<string, InProcessToolExecute>`
   (`{ theta_progress: codeSideExecute }`) through `composeExtensionInstance` →
   `runComposePass` → the producer input (`inProcessToolExecutors`). At the
   dispatch site, when a resolved callable-set entry carries no `execute` (every
   extension tool, post-snapshot) the producer first consults
   `inProcessToolExecutors[tool.toolName]` and, on a hit, dispatches it directly
   with the same CANCEL-3 swallowing-handler attachment as a built-in's
   `execute` — never the bridge. Because the map is wired per process from each
   instance's own registration, the parent and each subagent child each dispatch
   their OWN handler (the child's `isChildRegime` handler emits the EXST-15 wire
   line); the executor closure is never marshalled across the process boundary.

Result on Oh-My-Pi: a code-side `theta_progress(...)` returns `ok` and runs its
class-2 side effect in both regimes, with no fabricated turn — verified
end-to-end (`omp -p /…`) in prompt mode (`A=ok B=ok`) and in a subagent child
(the theta proceeds past the call instead of stalling).

## Test obligations

- Unit (`tests/execution-status-progress-tool.test.ts`): `codeSideExecute` runs
  the parent-regime handler (exactly one `bus.authorMessage` + one milestone)
  and returns the fixed `ok` envelope; and it SHARES the 200 ms clamp state with
  the model-facing `execute` (an accepted model-side call then a code-side call
  inside the window is counted-but-dropped, its count riding the next accepted
  code-side call).
- Producer wiring (`tests/prompt-mode-extension-tool-dispatch.test.ts`): a
  code-side call to a tool present in `inProcessToolExecutors` dispatches the
  in-process handler with verbatim args and lowers its `ok` envelope to
  `Ok("ok")`, while the host-loop seam is NEVER consulted even though its rung is
  available; and a tool NOT in the map still routes through the host-loop rung
  (the branch is name-scoped, not a blanket bypass).

## Provenance

- Reserved-name throw: `@earendil-works/pi-ai` `api-registry.ts` (the
  `built-in API names are reserved` guard); the bridge config at
  `production-host-loop-dispatch.ts`. `Api = KnownApi | (string & {})` admits a
  bespoke name with no type change.
- In-process dispatch preference: `production-theta-producer.ts` `#resolveToolCall`
  `dispatch()` execute-less arm; `ProductionProducerInput.inProcessToolExecutors`;
  `production-composition.ts` producer-deps assembly and the
  `composeExtensionInstance`/`runComposePass` threading; `factory.ts`
  registration capture; `execution-status/progress-tool.ts`
  `ThetaProgressRegistration.codeSideExecute`; `runtime/tool-call-execute.ts`
  `InProcessToolExecute`.
- Contract: `docs/spec_topics/execution-status.md` EXST-13 (the tool's
  always-`ok` return and shared code/model callable-set entry);
  `docs/spec_topics/pi-integration-contract/subagent.md` PIC-64 (the code-side
  dispatch ladder the in-process path short-circuits for pi-theta's own tools).
