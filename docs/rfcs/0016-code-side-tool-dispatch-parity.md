# RFC 0016 — Code-side tool calls honor installed tool implementations

- **Status:** draft (feature request; current behavior is not classified as a bug).
- **Scope:** execution parity between a code-side Pi-tool call and an equivalent
  model-issued call, including installed same-name overrides, host settings,
  validation, execution hooks, and cancellation.
- **Does NOT touch:** conversation turns or conversation-transcript output;
  operator rendering is a separate proposal, [RFC 0017](./0017-code-side-tool-observability-parity.md).
- **Depends on:** a supported host integration that can dispatch the effective
  installed tool without driving a conversation. The required capability is a
  design dependency, not a claim that the current extension API supplies it.

## Summary

A Pi tool called from theta code should behave like the same tool called by the
model in the same host session, with the same arguments and equivalent tool
availability. The intentional differences are the caller, the absence of a
model request and conversation turn, and theta's existing result adapter.

In particular, a code-side `bash` call should execute the installed `bash`
override when that is the implementation an equivalent model call executes.
It should not construct a separate stock implementation because its caller is
code rather than a model.

This RFC requests execution parity. RFC 0017 separately requests observability
parity. Neither permits a fabricated conversation turn or a per-call row in the
conversation transcript, including an LLM-context-free custom-entry row.

## Motivation and current behavior

The motivating case is pi-config's `bash-render` extension. It registers a tool
named `bash` whose execution wrapper delegates to Pi's bash implementation while
adding command tracing. Its renderer consumes that trace to display execution
progress. Theta's direct bash calls bypass both the wrapper and the renderer.

The current code-side resolver has two relevant properties:

- `builtinToolDefinition` constructs stock built-ins from the session cwd.
- `resolveCallablePiTool` prefers those built-ins before registry admission.
  `resolvePiTool` calls the constructed definition's `execute` directly, without
  an update callback.

These functions live in `src/extension/callable-pi-tool-resolver.ts`. The current
spec describes direct built-in dispatch under Tool execution from theta code
and PIC-64. Other extension tools can use the PIC-64 host-loop bridge, which
obtains the installed implementation but introduces fabricated conversation
messages and model switches. Neither path satisfies the combined requirements
of this proposal: installed implementation parity and no conversation effects.

This is a requested change to an intentional design, not a reproduction claim
or a reopening of bug 0520.

## Proposed contract

### 1. Resolve the host's effective installed tool

For an admitted Pi-tool callable, dispatch uses the effective implementation
that the host selects for the underlying tool name in the invocation's own
session. The presented theta name may be renamed; resolution still follows its
underlying host-tool identity.

- A same-name extension override has the same precedence as for model calls.
- Without an override, the host's configured built-in is used, including its
  applicable shell settings, cwd, and operation adapters.
- The rule applies to Pi tools generally, not only `bash`.
- Theta's declared callable set remains an additional reachability restriction.
  Parity does not grant access to undeclared, excluded, hidden, or otherwise
  host-ineligible tools.
- Parent and child sessions resolve locally. No parent execute handle, tool
  context, credentials, or extension closure is marshalled into a child.

Load-time schema admission and dispatch-time implementation selection must have
an explicit consistency rule. A registry change must not silently pair an old
schema with an unrelated new implementation. The exact snapshot/revalidation
policy is an implementation-design question below.

### 2. Preserve execution behavior, not only the function name

Execution parity includes:

- host input validation and applicable tool-call permission/blocking hooks;
- argument transformations in their host-defined order;
- the selected implementation's execution wrapper and settings;
- partial-update production, without binding partial values to theta code;
- result transformations/redaction and the host's success/failure outcome;
- cancellation forwarding, resource cleanup, and nested-tool dispatch where
  supported for the equivalent model-issued call.

Theta must not recreate these behaviors in a parallel bash implementation or
invoke an override's raw `execute` while silently skipping the host's hooks.
Hook refusals remain refusals. Headless execution does not auto-approve a
permission request that an equivalent host call cannot satisfy.

The call executes once. Observers and renderers do not re-run it. Turning off
operator rendering must not turn off an installed execution wrapper.

A code-origin call has truthful provenance and a host-recognized execution
scope. It does not pretend to be an assistant tool call or borrow an unrelated
model call's parent id. Any nested-call support uses that real scope, not a
fabricated `executeTool` permission path.

### 3. Keep the code channel conversation-free

Dispatch causes no model/provider request and no fabricated user, assistant,
tool-call, or tool-result message. It adds no conversation turn, custom message,
custom entry, or per-call conversation-transcript row. It does not switch the
session model or thinking level to execute the tool.

This excludes the existing host-loop bridge as the implementation of this
contract. It also excludes recording then hiding or deleting fabricated turns:
the messages must never enter the conversation or its persisted session tree.
Existing drive-level notes and run-card behavior are not changed by this RFC.

Tools can deliberately produce their own documented effects. For example,
`theta_print` intentionally emits conversation content. This RFC adds no such
effect through dispatch itself and does not suppress effects inherent in the
selected tool. An override that emits conversation content cannot be made
conversation-free by hiding it; its compatibility requires an explicit decision.

### 4. Preserve theta's language boundary

The source calling convention and declared callable-set restriction stay in
place. Ordinary Pi-tool calls continue to return theta's `Result<string,
QueryError>` adaptation of the final host outcome; partial updates are an
observer surface, not extra theta results.

The bug-0520 rendered-text contract remains in force: successful text content
is passed through under the existing filter/join rule. This proposal does not
normalize bash placeholders, parse presentation trailers, introduce raw output
capture, or infer shell status from rendered text. An installed override can
intentionally change the host result, as it does for a model call.

The implementation proposal must account for the host's failure and result-hook
surfaces without silently importing an unrelated result-routing fix or a richer
Theta output type.

## Integration approach

Prefer a host-owned, transcript-free dispatch capability that selects the
effective tool and runs the same execution pipeline as model calls. The host
owns validation, permissions, hook order, execution scope, and nested calls;
theta supplies code-origin provenance, arguments, and its invocation signal.

This is a capability request, not a proposed name for an API that already
exists. `pi.getAllTools()` metadata is not an executable dispatcher. Obtaining
an executable definition alone would not establish hook/permission parity.
The current `ExtensionToolContext.executeTool()` also cannot be borrowed from
an idle slash-command context: it requires a host-owned parent scope, and its
availability does not establish a new root code-dispatch capability.

If the supported host API is insufficient, the implementation needs upstream
work or another explicitly reviewed supported adapter. Host requirements and
migration/refusal behavior must be decided before implementation; a silent
fallback to stock bash or the fabricated-turn bridge is not parity.

## Acceptance criteria

1. In a real host, install a same-name bash override that records entry, emits
   a partial update, delegates once, and marks its final result. Equivalent
   model-issued and code-side calls select it and produce the same tool-level
   effects. The code-side call consumes no provider turn.
2. With no override, non-default shell settings and cwd affect the code-side
   call as they affect the equivalent model call.
3. Host argument transforms, blocking hooks, result redaction, execution
   failures, and nested-call restrictions run with matching semantics. A denied
   call has no tool side effect; redacted results do not leak to observers.
4. Abort a long-running override and verify signal delivery, cleanup, one
   terminal theta outcome, and no late rebinding or duplicate execution.
5. Exercise an overridden non-bash built-in and an extension-only tool, including
   a renamed callable, in parent and child sessions with independently installed
   implementations. Verify execution behavior without relying on RFC 0017.
6. Compare session entries, reconstructed model context, conversation-transcript
   render input, provider requests, model/thinking selections, and subsequent
   model input before and after a code-only call. No call-attributable turn,
   message, custom entry, transcript row, or model switch appears. Do not prove
   this by filtering out entries after dispatch.
7. Prove rejecting controls: an adapter that selects stock bash despite the
   installed override, or uses the old host-loop bridge, fails the witnesses.

## Alternatives considered

- **Special-case pi-config's bash override.** Does not establish the general
  principle and couples theta to one installed extension.
- **Look up the override and call raw `execute`.** Resolves implementation
  identity but does not by itself preserve hooks or authenticated nested scope.
- **Route every call through the current host-loop bridge.** Finds installed
  tools but violates the no-turn/no-transcript requirement.
- **Copy the override's tracing or shell settings into theta.** Creates a second
  implementation that can drift and does not honor future overrides.

## Specification and compatibility impact

If accepted, revise Tool execution from theta code, PIC-64's dispatch ladder
and permission description, callable-set snapshot rules, and the associated
host capability/version audit. The no-conversation-turn principle is retained
and extended to extension-tool dispatch rather than replaced with a bridge
exception. No grammar or theta source migration is proposed.

Execution can change for installations with overrides: that change is the
feature, not a promise of byte-identical behavior to the previous stock path.
Host hooks can also refuse work previously dispatched out of band. The release
proposal must identify these compatibility effects and the applicable versioning
policy. No normative spec edit or implementation is authorized by this draft.

## Open questions

- What supported host capability exposes effective-tool dispatch, authenticated
  root code-call scope, and hooks without conversation mutation?
- How are load-time schemas kept consistent with dynamic registration, reload,
  and host exposure/active-tool rules during an invocation?
- What host baseline and unsupported-host migration/refusal policy are needed?
- Which contextual differences are intentional theta adaptations (notably
  invocation cancellation), and how are they represented to extensions?

## Provenance

- Owner request in this conversation: file two feature RFCs, apply the general
  model/code tool-behavior parity principle, and add neither conversation turns
  nor conversation-transcript appearances. The separation and constraints above
  come from that request; the integration approach is proposed, not approved.
- `builtinToolDefinition`, `resolvePiTool`, `resolveCallablePiTool`
  (`src/extension/callable-pi-tool-resolver.ts`): current stock built-in creation,
  direct execution, and built-in-before-registry precedence.
- `createProductionHostLoopDispatch`
  (`src/extension/production-host-loop-dispatch.ts`): current fabricated-turn
  extension-tool adapter; not an implementation proposed here.
- `bashRender` (`pi-config/extensions/bash-render/index.ts`, external canonical
  pi-config checkout): motivating installed execution wrapper and renderer.
- Tool Calls — No conversation turn / Return type
  (`../spec_topics/tool-calls.md`); Tool execution from theta code
  (`../spec_topics/pi-integration-contract/host-interfaces-core.md`); PIC-64
  (`../spec_topics/pi-integration-contract/subagent.md`): current contract, not
  retroactive evidence of a defect.
- Bug 0520 (`../bugs/0520-code-side-bash-empty-output-binds-host-placeholder.md`):
  rendered-text pass-through is retained, not reopened.
- Pi 1.4.0 `docs/extensions.md` and `ExtensionToolContext` in the exported
  extension declarations: installed tool registration, tool-hook pipeline,
  nested execution, and the parent-scope distinction. No new host API is claimed.
