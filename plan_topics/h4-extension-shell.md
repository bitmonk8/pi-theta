# H4 — Pi extension shell

**Adds.** `extensions/index.ts` exporting `default function (pi: ExtensionAPI)`; registers a single no-op `/loom-status` command that prints "pi-loom: no looms loaded yet"; `PiModelClient`, `PiToolHost`, `PiFileSystem`, `PiExtensionAPI` adapter shims (no logic) wrapping Pi's surfaces. `PiExtensionAPI` owns the per-mode tool-registration plumbing per [Pi Integration Contract — Tool-registration lifetime and visibility](../spec_topics/pi-integration-contract.md): an extension-scoped `Map<schema-hash, registeredToolName>` cache fronting `pi.registerTool`, and a `withActiveTools(loomCallableSet, fn)` helper that wraps `pi.getActiveTools` / `pi.setActiveTools` snapshot/restore in a `try`/`finally`. `PiToolHost` retains the live `ExtensionCommandContext` reference so synthesised tool-call `ctx` arguments forward to it (V14c-a).

**Tests.**
- Factory invoked with `FakeExtensionAPI` registers exactly one command.
- Each shim has one delegation contract test against its fake.
- `PiFileSystem.homedir()` delegates to `os.homedir()` (single-call test against a spy).
- Registration cache is content-addressed: two `defineTool(...)` calls with the same lowered `parameters` hash dedupe to one `pi.registerTool` call.
- `withActiveTools(set, fn)` restores the prior active set when `fn` resolves, when `fn` rejects, and when `fn` throws synchronously.
- `PiToolHost` exposes the retained `ExtensionCommandContext` to V14c-a via a typed accessor; the accessor returns the most recent `ctx` even after a session reload (no stale closure).
- The `/loom-status` `pi.registerCommand` call passes a `getArgumentCompletions` callback (V1 returns `[]`); the registered options object has all three keys `description`, `getArgumentCompletions`, `handler` (asserted on the `FakeExtensionAPI` registration record).

**Deps.** H2.

**Ships when.** `pi -e C:\UnitySrc\pi-loom` loads the extension and `/loom-status` runs in a real Pi session (manual smoke recorded in `docs/manual-smoke.md`).
