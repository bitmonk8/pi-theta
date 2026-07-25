# Bug 0001 — Extension-registered tools are unreachable from Theta

- **Status:** partially shipped — **subagent-mode reach is solved and shipped**
  (RFC 0005 model-facing + RFC 0006 code-side, in 0.10.0). **Prompt-mode reach
  remains open** (both model-facing and code-side). See *Shipped status* and
  *Remaining gap* below.
- **Kind:** defect (spec + implementation disagree; prompt mode still
  under-delivers the documented `tools:` contract).
- **Affects (remaining):** prompt-mode callable-set admission
  (`src/parser/callable-set.ts`, the `resolvePiTool` wiring in
  `src/extension/production-composition.ts`) and the prompt-mode query-time
  active set (`src/runtime/conversation-drive.ts`).

## Status — read this first

**Original defect.** Extension-registered Pi tools (`finding_store`,
`projection`, …) are unreachable from a Theta, though the spec says they resolve.
A plain Pi agent's model can call them; a Theta could not — it failed to load if
`tools:` named one, and its query-time active set was exactly the callable set
(ambient not unioned in).

**Two reach needs.** *Model-facing* (the Theta's model calls the tool) and
*code-side* (Theta code calls it, zero-token, deterministic — the RFC-0002
channel).

**Shipped status (0.10.0) — subagent mode solved.** The subagent branch is fully
delivered by two accepted, implemented RFCs:

- [RFC 0005 — Child-process subagent sessions](../rfcs/0005-child-process-subagent-sessions.md):
  `mode: subagent` now runs as a child `pi --mode rpc` process. The child runs
  full startup discovery, so extension tools are natively registered and reachable
  by the subagent's **model** via `--tools`. This also deleted the spec's
  seven-name `customTools` contradiction (see *Spec status*).
- [RFC 0006 — Child-process theta execution](../rfcs/0006-child-process-theta-execution.md):
  the whole callee runs in a child `pi --theta -p` process under a new
  *subagent-root* regime. There the child has a real host session, so **code-side**
  extension-tool calls dispatch through the child's host agent loop
  (*host-loop dispatch*) — zero model tokens, deterministic arguments, no
  executable definition crossing any boundary.

The host-loop dispatch mechanism (RFC 0006's release-gate acceptance criterion)
was prototyped end-to-end against Pi v0.80.10, passed, and shipped child-side:
`src/extension/production-host-loop-dispatch.ts` (the injectable collaborators
against the real Pi surface) and `src/runtime/host-loop-dispatch.ts` (the
leaf-tested seam), gated on the subagent-root regime plus a `typeof` surface
probe. Contract pinned at `pi-integration-contract/subagent.md` PIC-61.

**Remaining gap (this bug).** **Prompt-mode** thetas are still fully affected:
naming an extension tool in a prompt-mode theta's `tools:` still raises
`theta/load/unknown-tool` and un-registers the whole theta (fail-closed, no
silent fallthrough). Neither reach need is met in prompt mode:

- *model-facing* — unshipped (**Option A** below; trivial);
- *code-side* — unshipped (**Option E parent-side** below; can now reuse the
  shipped host-loop-dispatch module).

**Option C** (upstream `getToolDefinition` on `ExtensionAPI`) would supersede
both prompt-mode options with a clean registry read; it was requested upstream
twice and refused, and is pursued in parallel. If it lands it slots in as the
preferred rung and retires the host-loop machinery without changing any process
architecture.

**Key source locations:** Theta `src/parser/callable-set.ts`,
`src/extension/production-composition.ts` (`resolvePiTool`, the seven-name
switch), `src/runtime/conversation-drive.ts` (prompt-mode drive + query-time
active set), the shipped host-loop dispatch modules named above. Pi host source
cloned at `c:/UnitySrc/pi-agent-hist`; Theta runs against installed
`@earendil-works/pi-coding-agent` **v0.80.10**.

## Summary

A Pi session exposes two kinds of tools to the model: the host built-ins
(`read`, `bash`, `grep`, `edit`, `write`, `ls`, `find`) and any tools an
installed extension registers (e.g. `finding_store`, `projection`). The spec says
both kinds are reachable from a Theta by name. In **subagent mode** this now
holds (RFC 0005/0006). In **prompt mode** the runtime still reaches only the
built-ins: naming an extension-registered tool in `tools:` raises
`theta/load/unknown-tool` and the whole theta fails to register. Because the
frozen callable set is the sole tool boundary for both code-side calls and the
query-time tool loop, in prompt mode an extension tool is reachable by no path.

## Expected behaviour (what the spec says)

The spec states that extension-supplied Pi tools resolve, in three places:

1. **`tools:` normative owner** — `docs/spec_topics/frontmatter/frontmatter-fields-a.md`
   §`tools`: "**Pi tool names** (`read`, `bash`, `grep`, ...) resolve against
   **Pi's tool registry** at theta-load time." The list is an open example;
   resolution is against the registry, not a fixed set.
2. **Glossary** — `docs/spec_topics/glossary.md`: "A *Pi tool* is a tool
   registered against the Pi runtime **(built-in or extension-supplied)**,
   referenced in `tools:` by name."
3. **Resolution snapshot** — `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`
   §Resolution snapshot: each Pi-tool entry holds a reference to the resolved
   `ToolDefinition` **as returned by Pi's tool registry** at load.

By these, a prompt-mode theta that lists `finding_store` in `tools:` should
resolve it, expose it to the model during `@` queries, and admit
`finding_store({ … })` from theta code — like a built-in.

## Actual behaviour in prompt mode (what the runtime does)

The callable-set resolver (`src/parser/callable-set.ts`) is registry-agnostic:
it delegates to an injected `deps.resolvePiTool(name)` and treats `undefined` as
`theta/load/unknown-tool`. The production composition root injects a
`resolvePiTool` backed by a fixed seven-name switch (`builtinToolDefinition`,
`src/extension/production-composition.ts`):

```
switch (name) {
  case "grep": … case "read": … case "find": … case "ls":
  case "bash": … case "edit": … case "write": …
  default: return undefined;   // every extension tool name → unresolved
}
```

Any name outside the seven returns `undefined`, so the resolver raises
`theta/load/unknown-tool` and, because "the theta registers iff no error-severity
diagnostic was raised," a single `tools: [finding_store]` entry un-registers the
whole prompt-mode theta.

### The callable set is the only door — for code and for queries

The restriction is not confined to code-side calls. The prompt-mode query-time
tool loop installs exactly the theta's callable set as the model's active tools
for the query window, and the ambient session snapshot is **not** unioned in
(`docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md`;
`src/runtime/conversation-drive.ts` / `src/runtime/invoke-prompt-suspend.ts`). So
a prompt-mode theta cannot fall back to letting the model call the extension tool
during an `@` query either — if the tool cannot enter the callable set, it is
absent from the model's active set too.

## Spec status

The `tools:`/glossary/resolution-snapshot contract says registry-backed
(extension tools included). A second spec region — the subagent integration
contract's closed seven-name `customTools` materialisation — used to contradict
it. **RFC 0005 resolved that contradiction** by deleting the seven-name
enumeration for the subagent path (built-ins and extension tools alike now
resolve in the child by name, one mechanism).

The remaining spec work is prompt-mode only: split the `tools:` contract so
"Pi tool (built-in)" and "Pi tool (extension-supplied)" state their prompt-mode
reach explicitly, and record the reach asymmetry any interim (Option-A-only)
state introduces.

## Why it matters

RFC 0002 established the tool call as the language's zero-token side-effect
channel. That win reaches the seven built-ins from any theta, and now reaches
extension tools from subagent-mode thetas (RFC 0006). It does **not** yet reach
extension tools from **prompt-mode** thetas — a prompt-mode orchestration theta
that must drive `finding_store` / `projection` (mint an id, write a record, run a
projection) cannot call them at all.

## Remaining gap — reach analysis (prompt mode)

The fix is bounded by what the pinned Pi SDK lets a theta *extension* obtain for
a tool another extension registered.

| Prompt-mode reach path | What theta needs | Available on the pinned public extension API (`pi` / `ctx`)? |
|---|---|---|
| **model-facing** (`@` query tool loop) | tool name in the active set + parameter schema | **Yes.** `pi.getAllTools()` gives name + `parameters`; `pi.setActiveTools([…names])` activates it on the live host session, which dispatches `execute`. |
| **code-side dispatch** (`name({ … })` from theta code) | an executable `ToolDefinition` (`.execute`) | **No** direct handle — `getAllTools()` strips `execute`, and the theta extension holds neither a host `AgentSession` nor an `ExtensionRunner`. But **host-loop dispatch** (the shipped RFC-0006 mechanism, Option E) authors the `tool_use` and lets the host loop execute — no `execute` handle needed. |

Key SDK facts (verified at the pin):

- `ExtensionAPI.getAllTools(): ToolInfo[]` returns metadata only
  (`name | description | parameters | promptGuidelines` + `sourceInfo`) — **no
  `execute`**.
- The executable definition is reachable via `AgentSession.getToolDefinition` /
  `ExtensionRunner.getToolDefinition` (both public), but the theta extension holds
  neither handle: `pi` / `ctx` expose only `getAllTools()` and a
  `ReadonlySessionManager`. So on the pinned public extension API an extension
  tool's `execute` is unreachable from a theta by direct handle.

## Solution options for the remaining prompt-mode gap

### Option A — public-API prompt-mode model-facing reach (trivial, unshipped)

Wire the production `resolvePiTool` to consult `pi.getAllTools()`: admit any
registered tool name, carrying its `parameters` schema (enough for the RFC-0002
disjointness check and the model tool spec). Prompt-mode `@` queries then reach
the extension tool via `setActiveTools`; the host session executes it. Code-side
`name({ … })` raises a precise diagnostic if only this rung is available.

- **Pro:** ships on the pinned public API; removes the whole-theta-unregister
  cliff for the model-facing case.
- **Con:** partial — does not deliver the RFC-0002 zero-token *code* channel; bakes
  in a built-in/extension code-side asymmetry authors must learn (until Option E
  or C lands).

### Option E (parent-side) — host-loop dispatch for prompt-mode code-side (no upstream, unshipped)

Reuse the **already-shipped** host-loop dispatch module
(`src/extension/production-host-loop-dispatch.ts` / `src/runtime/host-loop-dispatch.ts`,
built for RFC 0006 child-side) against the parent's **user host session**. A
theta-controlled fake provider authors the `tool_use` (deterministic args) and
the host agent loop executes it (the host holds `execute`), so theta needs no
`execute` handle. Flow per code-side call: register a dummy bridge provider once
at load; `setActiveTools([…callable set, extTool])`; `setModel(bridge)` on the
user session; `sendUserMessage(encoded request)` + `waitForIdle`; the bridge's
two-state `streamSimple` emits the `tool_use` then ends the turn; read the
tool-result back; restore the model in a `finally`.

- **Pro:** deterministic args, zero LLM tokens, documented APIs only; the
  dispatch machinery already exists and is leaf-tested.
- **Con — the key open tradeoff:** in RFC 0006 the transcript pollution + a
  temporary session-model switch are confined to the child's **private, discarded**
  session. Parent-side in prompt mode they land in the **user's live, visible
  session**: each call injects a fabricated user message + tool-call + tool-result
  card (SLSH-2 forbids suppression) and thrashes the persisted session model
  (`model_select` fires twice per call). Latency is negligible next to a real model
  turn; the cost is transcript pollution + model thrash in the user's own session.

### Option C — upstream `getToolDefinition` on `ExtensionAPI` (clean, blocked upstream)

Pi already exposes `getToolDefinition(name)` on `AgentSession`/`ExtensionRunner`
and already delegates `getAllTools` into the extension actions. A symmetric
one-line delegation of `getToolDefinition` onto `ExtensionAPI` would give the
theta the host session's executable definition directly — no fake provider, no
transcript pollution, matching the resolution-snapshot contract exactly. Both
prompt-mode reach paths then work first-class.

- **Pro:** highest quality; clean registry read; retires the host-loop machinery
  everywhere (child-side too) with no process-architecture change.
- **Con:** blocked on an upstream Pi release + SDK pin bump. **Requested upstream
  twice and refused** (Pi issues #2420, #3497). The refusal answered a different
  question — "an extension hard-coding a call into an *unknown third-party* tool";
  Theta is a language runtime where the **end user** names the exact tool in
  `tools:`, the schema is already published by `getAllTools()`, and the requested
  `execute` is the exact closure the host already runs when the model calls the
  tool. That fresh case (drafted for a re-ask) has not moved the maintainer;
  treat C as contingent, pursued in parallel.

### Superseded / moot options (recorded for provenance)

- **Option D** (child `pi -p --tools`, subagent model-facing) — **subsumed by
  RFC 0005**, which uses `--mode rpc` for multi-turn.
- **Option F** (child `pi --theta`, subagent code-side) — **shipped as RFC 0006**.
- **Option B** (harvest executables via a throwaway `discoverAndLoadExtensions`) —
  **deprioritised**; re-runs every installed extension's factory (uncontainable
  third-party side effects). Its subagent use-case is now solved; retained only as
  a last resort if both E-parent-side and C prove unavailable.
- **Provider-seat as the *architecture*** (PS-capture / PS-emit / PS-interpose) —
  **rejected** as the resolution architecture: it re-enters the model loop per call
  and violates the frozen load-time resolution snapshot. The refined PS-emit *form*
  survives only as the tactical **host-loop dispatch** mechanism (Option E), now
  shipped child-side. PS-capture (depends on an undocumented `context.tools`
  execute-leak) and PS-interpose (rebinds the provider process-wide) are not
  adopted.

## Decision needed (prompt mode)

Subagent mode is resolved and shipped. The open decision is the no-upstream
**prompt-mode code-side** path:

- **Option A** ships regardless for the prompt-mode model-facing case (trivial).
- **Option E parent-side** — apply the shipped host-loop dispatch module to the
  user session. Accept per-call transcript pollution + session-model thrash **in
  the user's live session**? (Unlike RFC 0006, where it is confined to a private
  child session.)
- **Option C** pursued in parallel; supersedes E if merged.

Recommended next step: ship Option A; decide E-parent-side vs. wait-for-C on
whether prompt-mode thetas must make code-side extension calls given the
user-session pollution cost.

## Fail-closed guard (any option)

Reach must be a **hard, probe-asserted gate that refuses registration with a
precise diagnostic** rather than silently degrading — under `pi -p` an
un-registered slug falls through to the ordinary agent and *looks* like it worked.

1. Capability assertion in the Step-0 probe / SDK inventory
   (`capability-probe.ts`, `sdk-inventory.ts`): C ⇒ assert
   `typeof pi.getToolDefinition === "function"`; A ⇒ `pi.getAllTools` /
   `pi.setActiveTools` (already asserted).
2. Fallback ladder, no silent fallthrough: `getToolDefinition` (C: first-class)
   → else `getAllTools`+`setActiveTools` (A: model-facing) → else **refuse to
   register** with a precise diagnostic (extend `theta/load/unknown-tool` or add
   `theta/load/extension-tool-unreachable`) naming the tool and the reason. A
   code-side call that resolved only at the A rung raises a precise
   `CodeToolError`, never a fabricated value.

## Non-goals

- **The tool-name literal rule.** RFC 0002 kept tool *names* literal to preserve
  load-time callable-set resolution and the arity check. Unchanged.
- **`.theta` callees.** Already resolve; unaffected.
- **New tool capabilities.** The ask is to reach tools the host already
  registers, not to invent a new effect surface.
- **Subagent-mode reach.** Solved and shipped (RFC 0005/0006); out of scope here.

## Open questions (remaining, prompt mode)

- **Resolution time vs. availability time.** Resolve against the registry at load
  (pin the `ToolDefinition`) or check at invocation? Behaviour when a tool present
  at load is absent at invocation (and vice versa)?
- **Permission / safety.** Prompt-mode code-side zero-token dispatch removes the
  model-turn checkpoint. RFC 0006 recorded the disposition for subagent mode (no
  new gate: `bash` is already the maximal capability behind the same `tools:` and
  trust gates); confirm the same disposition holds for prompt mode.

## Prior art in this repository

- Registry-agnostic resolver contract: `src/parser/callable-set.ts`.
- The production wiring that narrows it (prompt mode):
  `src/extension/production-composition.ts` (`builtinToolDefinition`,
  `resolvePiTool`).
- Callable set as the prompt-mode query-time active set:
  `src/runtime/conversation-drive.ts`, `src/runtime/invoke-prompt-suspend.ts`.
- Shipped host-loop dispatch (RFC 0006, reusable parent-side for Option E):
  `src/extension/production-host-loop-dispatch.ts`,
  `src/runtime/host-loop-dispatch.ts`.
- Subagent reach, shipped: [RFC 0005](../rfcs/0005-child-process-subagent-sessions.md),
  [RFC 0006](../rfcs/0006-child-process-theta-execution.md),
  `docs/how-to/use-an-extension-tool-in-a-subagent.md`.
- The zero-token channel this gap bounds: [RFC 0002 — Computed field values in
  Pi-tool arguments](../rfcs/0002-computed-tool-arguments.md).
- SDK capability gating: `src/extension/capability-probe.ts`,
  `src/extension/sdk-inventory.ts`.

## Provenance

- Spec pages measured against: `docs/spec_topics/frontmatter/frontmatter-fields-a.md`
  (§`tools`), `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md`
  (§Resolution snapshot), `docs/spec_topics/glossary.md`,
  `docs/spec_topics/pi-integration-contract/subagent.md` (PIC-61, post-RFC-0005/0006),
  `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md`.
- SDK surface inspected at the pin (`@earendil-works/pi-coding-agent` v0.80.10):
  `dist/core/extensions/types.d.ts` (`getAllTools`, `ToolInfo`), 
  `dist/core/extensions/runner.d.ts` / `dist/core/agent-session.d.ts`
  (`getToolDefinition`), `dist/index.d.ts` (root exports).
- Upstream refusals: Pi issues #2420 (2026-03-19), #3497 (2026-04-21) — both
  closed no-fix; the blessed cross-extension channel is `pi.events`, which needs
  the tool-*providing* extension to cooperate and be commonly owned, so it does
  not fit a language runtime reaching a user's declared tools.
