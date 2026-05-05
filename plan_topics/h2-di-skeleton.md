# H2 — Dependency-injection skeleton with fakes

**Spec.** [Implementation Notes — Runtime](../spec_topics/implementation-notes.md#runtime) (Schema validation bullet — pins the `SchemaValidator` behavioural contract); [Pi Integration Contract](../spec_topics/pi-integration-contract.md) (pins `ExtensionAPI`, `ConversationDriver`, `SubagentSpawner` / `SubagentSession`, and the `FakeFileSystem` / `FileSystem` surface). Other seams are loom-internal and have no normative spec page.

**Adds.** Pure-interface seams for every collaborator the runtime needs, declared as TypeScript signatures in the code block below. A constructor-injection factory `makeRuntime({ ... })` that wires them. In-memory fakes for every interface in `test/fakes/` — production code never imports a fake. `SubagentSpawner` is a factory seam wrapping Pi's `createAgentSession` (per [Pi Integration Contract — Conversation drive — subagent mode](../spec_topics/pi-integration-contract.md) and [Pi Integration Contract — Subagent session lifecycle](../spec_topics/pi-integration-contract.md)): `spawn(opts)` returns a `SubagentSession` handle whose `dispose()` delegates to the underlying `AgentSession.dispose()` and is the sole surface V12a, V18d, and V18n test against. `ToolHost.getCommandContext()` returns `undefined` when no slash-handler is currently retained (before the first invocation and after `session_shutdown`); production callers pass a defined `ctx` to `setCommandContext` on slash-handler entry, and `setCommandContext(undefined)` clears the retained reference. `FileSystem.homedir()` exists so production code never reads `process.env` directly (per [Pi Integration Contract — `FakeFileSystem` / `FileSystem` interface](../spec_topics/pi-integration-contract.md#fakefilesystem--filesystem-interface) and [Directory Convention — Home-directory expansion](../spec_topics/discovery.md#home-directory-expansion)).

```ts
// Re-exported Pi types — H2 does not redeclare them.
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

// Clock — abstract wall-clock for deterministic tests.
interface Clock {
  now(): number;                                    // ms since epoch
}

// RandomSource — seedable PRNG seam.
interface RandomSource {
  next(): number;                                   // uniform in [0, 1)
}

// FileSystem — read/write loom + .warp + settings files; the watcher path is a separate seam.
interface FileSystem {
  readText(path: string): Promise<string>;          // rejects with FileNotFound | FileReadError
  writeText(path: string, contents: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  homedir(): string;                                // never read process.env directly
}

// DiagnosticsSink — the universal emit path mandated by H3's Ships-when.
// `Diagnostic` is the shape introduced in H3.
interface DiagnosticsSink {
  report(d: Diagnostic): void;
  drain(): readonly Diagnostic[];                   // sorted (file, line, col); preserves report order on equal positions
}

// SchemaValidator — behavioural contract pinned by spec_topics/implementation-notes.md (Schema validation bullet).
// `LoweredSchema` is V4's lowered JSON-Schema artefact; `ValidationError` mirrors AJV's error shape.
interface SchemaValidator {
  compile(schema: LoweredSchema): CompiledValidator;
  invalidate(schemaHash: string): void;             // file-watcher entry point per spec
}
interface CompiledValidator {
  validate(value: unknown): { ok: true } | { ok: false; errors: readonly ValidationError[] };
}

// ModelClient — provider-agnostic chat surface used by ConversationDriver.
// `ModelRequest` / `ModelResponse` shapes are deferred to V5 / V6.
interface ModelClient {
  send(req: ModelRequest): Promise<ModelResponse>;
}

// ConversationDriver — drives one query against a session; mode-specific implementations
// (PromptModeConversationDriver in V5e, SubagentModeConversationDriver in V12a) live downstream.
interface ConversationDriver {
  send(text: string, opts?: { deliverAs?: "user" | "steer" }): Promise<string>;
}

// ToolHost — invokes a tool by registered name; concrete impls in H4 / V14.
// The retained ExtensionCommandContext is set on slash-handler entry and cleared on session_shutdown.
interface ToolHost {
  invoke(name: string, args: unknown): Promise<unknown>;
  getCommandContext(): ExtensionCommandContext | undefined;
  setCommandContext(ctx: ExtensionCommandContext | undefined): void;
}

// LoomLoader — parses a .loom (or .warp) file into the in-memory program shape used by the runtime.
// `ParsedLoom` is the shape introduced in V3 / V17; H2 forward-declares it and the downstream leaf
// that introduces the shape narrows the parameter type.
interface LoomLoader {
  load(path: string): Promise<ParsedLoom>;
}

// SubagentSpawner — factory seam wrapping Pi's createAgentSession.
// `SubagentSpawnOptions` is the call shape introduced by V12a; `AgentEvent` is the event shape
// surfaced by Pi's session subscribe API.
interface SubagentSpawner {
  spawn(opts: SubagentSpawnOptions): Promise<SubagentSession>;
}
interface SubagentSession {
  sendUserMessage(text: string): Promise<void>;
  subscribe(handler: (event: AgentEvent) => void): Unsubscribe;
  dispose(): Promise<void>;                         // idempotent; delegates to AgentSession.dispose()
}
type Unsubscribe = () => void;
```

Forward references (`Diagnostic`, `LoweredSchema`, `ValidationError`, `ModelRequest`, `ModelResponse`, `ParsedLoom`, `SubagentSpawnOptions`, `AgentEvent`) are deliberate: H2 owns the *method shape* every seam exposes; the leaf that introduces each *data shape* (H3, V4, V4a, V5/V6, V3/V17, V12a respectively) lands the data shape and narrows the placeholder type at that point. The seam signatures themselves do not change.

**Tests.**
- `makeRuntime` returns a runtime whose collaborators are exactly the ones passed in (identity check).
- Each interface declared in `Adds.` has a TypeScript-level conformance test: the in-memory fake is assigned to the interface variable, and a separate `expectType<>` assertion confirms the production adapter (when introduced in H4) matches the same interface.
- `FakeModelClient` raises if its response queue is empty (no silent default).
- `FakeFileSystem.readText` for unknown path rejects with a typed error.
- `FakeDiagnosticsSink` preserves report order on drain.
- `FakeFileSystem.homedir()` returns the constructor-injected value; production `PiFileSystem.homedir()` delegates to `os.homedir()`.
- `FakeToolHost.getCommandContext()` returns `undefined` until `setCommandContext(ctx)` is called, then returns the most recently set `ctx`; `setCommandContext(undefined)` resets it to `undefined`.
- `FakeSubagentSpawner.spawn(...)` returns a handle whose `dispose()` is observable (call-count probe) and idempotent (a second `dispose()` is a no-op, per [Pi Integration Contract — Subagent session lifecycle](../spec_topics/pi-integration-contract.md)).
- `FakeSubagentSpawner.spawn(...)` rejects with a typed error when no scripted spawn response is queued (matches the existing "no silent default" rule for `FakeModelClient`).
- Every fake has at least one negative-path test.

**Deps.** H1.

**Ships when.** Every interface has a fake, `import` graph forbids fakes leaking into `src/`.
