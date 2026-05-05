# M — Minimal end-to-end loom

**Spec.** [Overview](../spec_topics/overview.md), [Pi Extension Integration](../spec_topics/pi-integration.md), [Pi Integration Contract — prompt-mode drive](../spec_topics/pi-integration-contract.md), [Directory Convention — Source priority](../spec_topics/discovery.md), [Diagnostics registry](../spec_topics/diagnostics.md).

**Adds.** Lexer + parser limited to: frontmatter (`---` block with one line `mode: prompt`; `params:` absent or `params: {}`); body containing exactly one expression-statement of the form `` @`literal text` `` (no `${...}`, no `?`, no escapes other than `\``). Runtime: walks the body, calls `ConversationDriver.send` once, awaits `agent_end`. The MVP loom is no-params: `params:` absent and `params: {}` are equivalent, the binder is bypassed, and trailing slash text after the command name emits a single `customType: "loom-system-note"` formatted as `loom /<name>: ignoring extra arguments — this loom takes no parameters` before the loom runs (full rule in V3c). Slash command registration: the registration options object passed to `pi.registerCommand` has exactly three keys — `description` (carrying `frontmatter.description` verbatim and only that — `argument-hint` is not concatenated and is not surfaced through the autocomplete dropdown; binder-grounding only; see [Slash-Command Argument Binding](../spec_topics/binder.md)), `getArgumentCompletions` (V1 returns `[]`), and `handler`. Discovery: `~/.pi/agent/looms/` and `.pi/looms/` only. The factory-time walk and any subsequent re-walks are driven through the `resources_discover` subscription owned by V14t (subscription registration, `event.cwd` source-of-truth, `reason` semantics, and `{}` typed return live there); M's surface is the two-root walk itself.

**Tests.**
- Minimal 4-line loom parses.
- Any unsupported keyword (`let`, `if`, `schema`, ...) → `loom/parse/unsupported-feature`.
- Missing closing backtick → `loom/parse/unterminated-template`.
- Run produces exactly one `send` call with the literal text.
- `/hello extra text` emits a `loom-system-note` whose `content` matches the [`slash-invocation.md` "No-params overflow"](../spec_topics/slash-invocation.md) template (`loom /<name>: ignoring extra arguments — this loom takes no parameters`), and the loom still runs.
- `/hello   ` (whitespace-only remainder) emits no note and runs the loom.
- The `description` argument to `pi.registerCommand` equals `frontmatter.description` exactly (no `argument-hint` concatenation).
- The `pi.registerCommand` call for `/hello` carries a `getArgumentCompletions` callback. V1 returns `[]` (the binder is the only consumer of `argument-hint`; the autocomplete dropdown has no surface for it per `spec_topics/slash-invocation.md`).
- AbortError surfaces as a system note.
- `~/.pi/agent/looms/hello.loom` registers `/hello` (`FakeFileSystem.homedir()` controls the resolution; the test asserts the registered loom's discovered path is exactly `<homedir>/.pi/agent/looms/hello.loom`).
- Two files producing the same slash name across the two roots (`.pi/looms/` vs `~/.pi/agent/looms/`): only the project one registers; the other emits `loom/load/cross-source-shadow` (severity `warning`), naming both absolute paths, with the warning text matching `spec_topics/discovery.md` verbatim.

**Deps.** H1–H4.

**Ships when.** Manual: `hello.loom` placed in `.pi/looms/`, slash `/hello` produces an assistant turn in a real Pi session.
