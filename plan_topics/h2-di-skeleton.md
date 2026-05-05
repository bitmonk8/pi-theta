# H2 — Dependency-injection skeleton with fakes

**Spec.** (none — infrastructure leaf; no normative spec page)

**Adds.** Pure-interface seams for every collaborator the runtime will need: `Clock`, `RandomSource`, `FileSystem`, `DiagnosticsSink`, `ModelClient`, `ConversationDriver`, `ToolHost`, `SchemaValidator`, `LoomLoader`, `ExtensionAPI`. `ToolHost` exposes `getCommandContext(): ExtensionCommandContext | undefined` (returns `undefined` when no slash-handler is currently retained — i.e. before the first invocation and after `session_shutdown`) and `setCommandContext(ctx: ExtensionCommandContext | undefined): void` (production callers pass a defined `ctx` on slash-handler entry; passing `undefined` clears the retained reference). A constructor-injection factory `makeRuntime({ ... })` that wires them. In-memory fakes for every interface in `test/fakes/` — production code never imports a fake. `FileSystem` includes a `homedir(): string` accessor — never read `process.env` directly (per [Pi Integration Contract — `FakeFileSystem` / `FileSystem` interface](../spec_topics/pi-integration-contract.md#fakefilesystem--filesystem-interface) and [Directory Convention — Home-directory expansion](../spec_topics/discovery.md#home-directory-expansion)).

**Tests.**
- `makeRuntime` returns a runtime whose collaborators are exactly the ones passed in (identity check).
- `FakeModelClient` raises if its response queue is empty (no silent default).
- `FakeFileSystem.readText` for unknown path rejects with a typed error.
- `FakeDiagnosticsSink` preserves report order on drain.
- `FakeFileSystem.homedir()` returns the constructor-injected value; production `PiFileSystem.homedir()` delegates to `os.homedir()`.
- `FakeToolHost.getCommandContext()` returns `undefined` until `setCommandContext(ctx)` is called, then returns the most recently set `ctx`; `setCommandContext(undefined)` resets it to `undefined`.
- Every fake has at least one negative-path test.

**Deps.** H1.

**Ships when.** Every interface has a fake, `import` graph forbids fakes leaking into `src/`.
