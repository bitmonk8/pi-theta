# Bug 0001 — Extension-registered tools are unreachable from prompt-mode Theta

- **Status:** fixed — shipped in 0.11.0. Mode-independent `tools:` admission plus
  parent-side host-loop dispatch deliver prompt-mode reach along both paths; see
  the `[0.11.0]` CHANGELOG entry and
  [PIC-64](../spec_topics/pi-integration-contract/subagent.md#pic-64). Subagent
  mode reached extension tools natively and was out of scope.
- **Kind:** defect — the prompt-mode runtime under-delivered the documented
  `tools:` contract.
- **Affected:** prompt-mode callable-set admission (`src/parser/callable-set.ts`,
  the `resolvePiTool` wiring in `src/extension/production-composition.ts`) and the
  prompt-mode query-time active set (`src/runtime/conversation-drive.ts`).

## Summary

A Pi session exposes two kinds of tools to the model: the host built-ins
(`read`, `bash`, `grep`, `edit`, `write`, `ls`, `find`) and any tools an
installed extension registers (e.g. `finding_store`, `projection`). The spec says
both kinds are reachable from a Theta by name.

In **subagent mode** both resolve: the callee runs in a child `pi` process that
performs full startup discovery, so extension tools are natively registered and
reachable — model-facing (via `--tools`) and code-side (via host-loop dispatch in
the child).

In **prompt mode** the runtime reaches only the built-ins. Naming an
extension-registered tool in `tools:` raises `theta/load/unknown-tool` and the
whole theta fails to register. Because the frozen callable set is the sole tool
boundary for both code-side calls and the query-time tool loop, in prompt mode an
extension tool is reachable by no path.

Two reach needs define the prompt-mode fix:

- **model-facing** — the theta's model calls the tool during an `@` query;
- **code-side** — theta code calls it directly, zero-token and deterministic (the
  RFC-0002 side-effect channel).

## Expected behaviour (what the spec says)

Extension-supplied Pi tools resolve, per three spec anchors:

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

## Actual behaviour in prompt mode before the fix (≤ 0.10.x)

The callable-set resolver (`src/parser/callable-set.ts`) is registry-agnostic:
it delegates to an injected `deps.resolvePiTool(name)` and treats `undefined` as
`theta/load/unknown-tool`. The production composition root injected a
`resolvePiTool` backed by a fixed seven-name switch (`builtinToolDefinition`,
`src/extension/production-composition.ts`); it now falls back to the
`pi.getAllTools()` registry snapshot via `resolveRegistryExtensionTool`:

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

## Why it matters

The tool call is the language's zero-token side-effect channel (RFC 0002). It
reaches the seven built-ins from any theta, and reaches extension tools from
subagent-mode thetas. It does not reach extension tools from **prompt-mode**
thetas — a prompt-mode orchestration theta that must drive `finding_store` /
`projection` (mint an id, write a record, run a projection) cannot call them.

## Reach analysis (prompt mode)

The fix is bounded by what the pinned Pi SDK lets a theta *extension* obtain for
a tool another extension registered.

| Reach path | What theta needs | Available on the pinned public extension API (`pi` / `ctx`)? |
|---|---|---|
| **model-facing** (`@` query tool loop) | tool name in the active set + parameter schema | **Yes.** `pi.getAllTools()` gives name + `parameters`; `pi.setActiveTools([…names])` activates it on the live host session, which dispatches `execute`. |
| **code-side dispatch** (`name({ … })` from theta code) | an executable `ToolDefinition` (`.execute`) | **No** direct handle — `getAllTools()` strips `execute`, and the theta extension holds neither a host `AgentSession` nor an `ExtensionRunner`. Host-loop dispatch authors the `tool_use` and lets the host loop execute — no `execute` handle needed. |

Key SDK facts (verified at the pin):

- `ExtensionAPI.getAllTools(): ToolInfo[]` returns metadata only
  (`name | description | parameters | promptGuidelines` + `sourceInfo`) — **no
  `execute`**.
- The executable definition is reachable via `AgentSession.getToolDefinition` /
  `ExtensionRunner.getToolDefinition` (both public), but the theta extension holds
  neither handle: `pi` / `ctx` expose only `getAllTools()` and a
  `ReadonlySessionManager`. So on the pinned public extension API an extension
  tool's `execute` is unreachable from a theta by direct handle.

## Solution

Prompt-mode reach is delivered in-repo along both paths, on the pinned public
extension API.

**Model-facing.** `resolvePiTool` consults `pi.getAllTools()` and admits any
registered tool name, carrying its `parameters` schema (enough for the RFC-0002
disjointness check and the model tool spec). Prompt-mode `@` queries then reach
the extension tool via `setActiveTools`; the host session executes it. This
removes the whole-theta-unregister failure for the model-facing case.

**Code-side.** The host-loop dispatch module
(`src/extension/production-host-loop-dispatch.ts` /
`src/runtime/host-loop-dispatch.ts`, also used for subagent code-side) runs
against the parent's **user host session**. A theta-controlled bridge provider
authors the `tool_use` with deterministic arguments, and the host agent loop
executes it (the host holds `execute`), so the theta needs no `execute` handle.
Flow per code-side call: register a per-dispatch uniquely-named bridge provider
(torn down after the turn, per PIC-64 (a)); `setActiveTools([extTool])` — the
dispatched tool installed as the sole active tool for the turn under the PIC-17
snapshot/restore protocol (PIC-64 (e)); `setModel(bridge)` on the user
session; `sendUserMessage(encoded request)` + `waitForIdle`; the bridge's
two-state `streamSimple` emits the `tool_use` then ends the turn; read the
tool-result back; restore the model in a `finally`. Arguments are deterministic
and no LLM tokens are spent.

**Accepted cost.** Parent-side in prompt mode this dispatch lands in the user's
live session: each code-side call injects a fabricated user message + tool-call +
tool-result card (SLSH-2 forbids suppressing them) and thrashes the persisted
session model (`model_select` fires twice per call). Latency is negligible next
to a real model turn. This transcript pollution + model thrash in the user's own
session is accepted as the cost of the zero-token code channel.

**Resolution is load-time.** Every named tool is resolved against the registry
when the theta loads, pinning the `ToolDefinition` into the resolution snapshot;
a name that does not resolve at load refuses registration (see *Fail-closed
guard*). The pinned handle is used for the rest of the run — invocation does not
re-resolve. If a pinned handle is somehow unusable at call time, the code-side
call raises a precise `CodeToolError` rather than silently doing nothing or
fabricating a value. Tools do not come and go within a single run; the call-time
check is a guard, not a routine path.

**Permission model.** Code-side dispatch adds no new permission gate. The
capability is already bounded by the two existing gates — the theta must name
each tool in `tools:`, and the project must be trusted — and the maximal
capability behind those same gates (`bash`) already dispatches without a per-call
model-turn checkpoint. An extension tool reached this way is strictly weaker than
that, so it needs no extra gate: one consistent rule across prompt and subagent
modes.

**Parallel upstream simplification.** A one-line `getToolDefinition` delegation on
`ExtensionAPI` (already present on `AgentSession` / `ExtensionRunner`) would give
the theta the host session's executable definition directly — no bridge provider,
no transcript pollution — matching the resolution-snapshot contract exactly. It is
requested upstream and pursued in parallel by the maintainer. If it is accepted
and the SDK pin bumps, the code-side path simplifies to a registry read and the
host-loop machinery is retired parent-side; the fail-closed ladder below already
prefers it automatically when present.

## Fail-closed guard

Reach must be a **hard, probe-asserted gate that refuses registration with a
precise diagnostic** rather than silently degrading — under `pi -p` an
un-registered slug falls through to the ordinary agent and *looks* like it worked.

1. Capability assertion in the Step-0 probe / SDK inventory
   (`capability-probe.ts`, `sdk-inventory.ts`): assert `pi.getAllTools` /
   `pi.setActiveTools` (already asserted); if `typeof pi.getToolDefinition ===
   "function"` **and** a rung-1 dispatcher is wired, the first-class rung below
   is available. Both conjuncts are required: recording availability from the SDK
   surface alone would register thetas whose every code-side call then failed for
   want of a dispatcher, so registration would outrun dispatchability.
2. Fallback ladder, no silent fallthrough: `getToolDefinition` (first-class,
   direct executable definition) → else `getAllTools` + `setActiveTools`
   (model-facing) + host-loop dispatch (code-side) → else **refuse to register**
   with a precise diagnostic (extend `theta/load/unknown-tool` or add
   `theta/load/extension-tool-unreachable`) naming the tool and the reason. A
   code-side call whose tool resolved only at the model-facing rung raises a
   precise `CodeToolError`, never a fabricated value.

## Non-goals

- **The tool-name literal rule.** Tool *names* stay literal to preserve load-time
  callable-set resolution and the arity check (RFC 0002). Unchanged.
- **`.theta` callees.** Already resolve; unaffected.
- **New tool capabilities.** The ask is to reach tools the host already registers,
  not to invent a new effect surface.
- **Subagent-mode reach.** Reaches extension tools natively; out of scope here.

## Prior art in this repository

- Registry-agnostic resolver contract: `src/parser/callable-set.ts`.
- The production wiring that narrows it (prompt mode):
  `src/extension/production-composition.ts` (`builtinToolDefinition`,
  `resolvePiTool`).
- Callable set as the prompt-mode query-time active set:
  `src/runtime/conversation-drive.ts`, `src/runtime/invoke-prompt-suspend.ts`.
- Host-loop dispatch (reused parent-side for the code-side path):
  `src/extension/production-host-loop-dispatch.ts`,
  `src/runtime/host-loop-dispatch.ts`.
- Subagent reach: [RFC 0005](../rfcs/0005-child-process-subagent-sessions.md),
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
  `docs/spec_topics/pi-integration-contract/subagent.md`,
  `docs/spec_topics/pi-integration-contract/tool-registration-lifetime.md`.
- SDK surface inspected at the pin (`@earendil-works/pi-coding-agent` v0.80.10):
  `dist/core/extensions/types.d.ts` (`getAllTools`, `ToolInfo`),
  `dist/core/extensions/runner.d.ts` / `dist/core/agent-session.d.ts`
  (`getToolDefinition`), `dist/index.d.ts` (root exports).
- Upstream `getToolDefinition`-on-`ExtensionAPI` request: Pi issues #2420, #3497.
  The blessed cross-extension channel is `pi.events`, which needs the
  tool-*providing* extension to cooperate and be commonly owned, so it does not
  fit a language runtime reaching a user's declared tools.
