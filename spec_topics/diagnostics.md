# Diagnostics

Loom emits structured diagnostics through two delivery channels, both owned by the loom extension. Pi's own `LoadExtensionsResult.errors` field is **not** used: that field belongs to Pi's extension loader and is only populated while Pi is `import()`-ing the loom extension's entry point. A failure there is a bootstrap failure the user sees on Pi startup, orthogonal to the diagnostics defined here, which all fire after the extension is already live (during scan, watcher reload, or slash-command execution).

**Persistent diagnostics (default).** All `loom/parse/*`, `loom/type/*`, `loom/load/*`, and `loom/runtime/*` diagnostics are delivered via

```
pi.sendMessage(
  {
    customType: "loom-system-note",
    content:    <serialised batch>,            // see "Serialised content format" below
    display:    true,
    details:    { diagnostics: <Diagnostic[]> } // single-element array for runtime/single-error cases
  },
  { triggerTurn: false }
)
```

The `pi.registerMessageRenderer("loom-system-note", …)` registered by the loom extension formats these into transcript-persistent, dim-styled notes; see [Pi Integration Contract — System notes](./pi-integration-contract.md) for the renderer registration rules and the best-effort fallback (`ctx.ui.notify` then `loom/runtime/system-note-delivery-failed` then `console.error`) that applies when `pi.sendMessage` itself throws or rejects. The renderer MUST be registered synchronously inside the extension factory **before** the first discovery scan kicks off, so the first batch of scan diagnostics renders through the loom-specific renderer rather than as raw fallback text. This is the only diagnostic sink for loom-author-facing parse, type, load, and runtime errors.

The `loom-system-note` channel also carries operator-facing runtime failure events (`details: { event: RuntimeEvent }`) for non-panic `QueryError` failures in the always-log set; the two `details` payload shapes are disjoint by key and are specified under "System notes" and "Runtime event channel" in [Pi Integration Contract](./pi-integration-contract.md). Renderers MUST switch on which key is present and MUST NOT assume both.

**Transient toasts (auxiliary).** Failures internal to the loom extension's own bookkeeping that the user must see immediately but that do **not** belong in the transcript — the chokidar watcher itself throwing, an unrecoverable settings I/O exception that no `loom/load/settings-*` code covers, an internal extension invariant violation — use `ctx.ui.notify(message, "error")` directly. This is a narrow secondary surface; loom-author-facing diagnostics (anything with a `loom/parse/*`, `loom/type/*`, `loom/load/*`, or `loom/runtime/*` code) MUST go through the persistent channel above and MUST NOT be routed through `ctx.ui.notify` as their primary sink.

**Re-scan deduplication.** A watcher-triggered reload re-emits the persistent diagnostic for any file whose contents are still broken. The runtime does **not** attempt to clear or supersede prior `loom-system-note` messages from the transcript — Pi's `pi.sendMessage` API has no documented "remove" or "replace by metadata" counterpart, and `display: true` system notes are part of the immutable session log. Authors will therefore see the same diagnostic line recur after each reload until the underlying file is fixed; this is the V1 contract and the renderer MUST NOT attempt to suppress duplicates.

Internal diagnostic shape:

```
{
  severity: "error" | "warning",
  code:     string,                          // e.g., "loom/parse/binding-case-mismatch"
  file:     string,                          // absolute path
  range:    { start: { line, column }, end: { line, column } },  // 1-indexed; end exclusive
  message:  string,                          // single-line summary
  hint?:    string,                          // optional suggested fix
  related?: array<{ file, range, message }>, // related sites (e.g., the colliding declaration)
}
```

**Code namespaces:**

- `loom/parse/*` — lexer / parser errors (unknown token, case mismatch, missing brace, etc.).
- `loom/type/*` — type-system errors (unknown identifier, type mismatch, schema constraint violation).
- `loom/load/*` — file-load and registration errors (unreadable file, missing or wrong-type discovery source, name collision, invalid frontmatter, unresolvable `tools:` entry).
- `loom/runtime/*` — runtime errors surfaced as panics (`MatchError`, index out of bounds, etc.) reported back to Pi as system notes.

**Serialised content format.** The `content` string of each `loom-system-note` follows the line format `"<file>:<line>:<col>: <code>: <message>"`, optionally followed by `"\n  hint: <hint>"` when a hint is present. Related sites are appended as additional indented lines. When a single message carries a multi-error batch (the scan-time case), each `Diagnostic` becomes one such line block and successive blocks are separated by a single blank line; the corresponding structured `Diagnostic[]` is carried in `details.diagnostics` for the renderer and for downstream consumers (LSP integrations, test harnesses) that want the typed shape rather than the rendered string.

**Multi-error reporting.** Every parse / type pass collects all errors from the full file (and from transitive `.warp` imports) before failing. The loom is rejected with the complete list in **one `pi.sendMessage` call per `.loom` file** — `content` carries the full batch in the format above; `details.diagnostics` carries the same as a structured array — rather than fast-failing on the first error or fanning out one message per error. Authors get every problem in the file at once, in a single transcript entry.

## Code registry rules (normative)

Three rules govern the diagnostic-code surface:

1. **Every author-visible diagnostic emitted by the runtime MUST carry a code from the registry below.** Emitting an unregistered code is a defect; tests are entitled to assert on the specific code at every documented diagnostic site.
2. **The registry is closed.** Adding a new code, removing a code, or changing a code's namespace, severity, or trigger are all spec changes — not implementation changes. New diagnostic sites added by future spec work MUST land their codes in this table at the same time.
3. **Codes are stable identifiers.** Renaming a registered code is a breaking change to the public diagnostics contract (tests, LSP integrations, system-note formatters, doc cross-links). Treat each code as part of the language surface.

Naming convention for codes is `<namespace>/<kebab-case-rule-name>`. The rule-name component derives from the spec rule's short name; it is not generated, so the registry below is the source of truth.

## Code registry

The table enumerates every diagnostic the V1 spec defines. *Severity* is `error` (`E`) or `warning` (`W`); a few discovery-source codes carry severity `E/W`, meaning the severity is decided per-source by the table in [Discovery — Failure modes](./discovery.md) rather than fixed at the code level. *Phase* identifies which pipeline stage emits the diagnostic: `lex` (lexing / encoding), `parse` (parsing / static checks performed by the parser), `type` (type-system checks), `load` (file-load, registration, discovery), or `runtime` (panic during execution). *Trigger* is the canonical condition; *Spec rule* points to the topic page where the rule is stated; *Hint* gives the normative author-facing hint when the spec mandates one.

### `loom/lex/*` and `loom/parse/*` — lexical and parse errors

| Code | Sev | Phase | Trigger | Spec rule | Hint |
|---|---|---|---|---|---|
| `loom/parse/illegal-escape` | E | lex | Backslash followed by an unrecognised character inside a regular string literal. | [Lexical — String literals](./lexical.md) | — |
| `loom/parse/literal-newline-in-string` | E | lex | Literal newline inside a regular (single-line) string literal. | [Lexical — String literals](./lexical.md) | Use a `@`...`` query template, or split with `+ "\n" +`. |
| `loom/parse/unterminated-string` | E | lex | EOF reached while scanning a string literal. | [Lexical — String literals](./lexical.md) | — |
| `loom/parse/invalid-path-separator` | E | lex | Backslash inside a path literal (`import`, `invoke`, `tools:` `.loom` entry). | [Lexical — Path literals](./lexical.md) | Use `/` separators only. |
| `loom/parse/binding-case-mismatch` | E | parse | Identifier in a binding / parameter / fn-name / field-name position does not start with a lowercase letter or `_`. | [Lexical — Identifiers](./lexical.md) | — |
| `loom/parse/schema-case-mismatch` | E | parse | Identifier in a schema / enum / variant / type-alias position does not start with an uppercase letter. | [Lexical — Identifiers](./lexical.md) | — |
| `loom/parse/reserved-keyword-as-identifier` | E | parse | Reserved keyword used in an identifier position. | [Lexical — Reserved keywords](./lexical.md) | — |
| `loom/parse/single-line-if` | E | parse | `if` / `for` / `while` / `fn` body is not a braced block (e.g. `if (x) stmt`). | [Lexical — Statement terminators](./lexical.md) | Wrap the body in `{ ... }`. |
| `loom/parse/block-comment` | E | lex | `/* ... */` block comment used. | [Lexical — Comments](./lexical.md) | Use `//` or `///` line comments. |
| `loom/parse/integer-narrowing` | E | type | `number` value used where `integer` is expected (the `integer → number` widening is one-way). | [Lexical — Number literals](./lexical.md) | — |
| `loom/parse/unsupported-feature` | E | parse | A V1-deferred or non-Loom syntactic construct (arrow function, spread, optional chaining, `===`, bitwise op, comma op, nested template, etc.) appears in source. | [Expressions — Not supported](./expressions.md) | — |
| `loom/parse/immutable-rebinding` | E | parse | Reassignment of a `let` (non-`mut`) binding. | [Bindings — `let` vs `let mut`](./bindings.md) | Use `let mut` if mutation is intentional. |
| `loom/parse/assignment-as-expression` | E | parse | Assignment used in expression position (e.g. `if (x = 1)`). | [Bindings — Reassignment is a statement](./bindings.md) | — |
| `loom/parse/assignment-to-member-or-index` | E | parse | `obj.field = ...` or `arr[i] = ...`. | [Bindings — Mutability is binding-level only](./bindings.md) | Rebind the whole value with `let mut`. |
| `loom/parse/mut-on-immutable-context` | E | parse | `mut` modifier on a function parameter, `for` iteration variable, or `match` pattern binding. | [Bindings — Immutable contexts](./bindings.md) | — |
| `loom/parse/mut-on-discard` | E | parse | `let mut _ = ...`. | [Bindings — Immutable contexts](./bindings.md) | — |
| `loom/parse/increment-decrement` | E | parse | `++` or `--` operator used. | [Bindings — Increment / decrement](./bindings.md) | Use `count += 1` / `count -= 1`. |
| `loom/parse/non-boolean-condition` | E | type | Non-`boolean` value used in `if` / `while` / ternary condition or as `&&` / `\|\|` operand. | [Expressions — Truthiness](./expressions.md) | Write `if (x != "")`, `if (xs.length > 0)`, etc. |
| `loom/parse/comparison-chaining` | E | parse | Chained comparison such as `a < b < c`. | [Expressions — Operator precedence](./expressions.md) | Comparison operators do not chain; use `&&`. |
| `loom/parse/mixed-plus-operands` | E | type | `+` applied to a `number`/`integer` and a `string` (or any other mixed-type pair). | [Expressions — `+` operator](./expressions.md) | Convert explicitly or interpolate inside a string. |
| `loom/parse/array-element-type-mismatch` | E | type | Array literal element does not type-check against the surrounding sink's element type. | [Expressions — Array construction](./expressions.md) | — |
| `loom/parse/array-no-common-type` | E | type | Array literal whose elements have no common type and no sink to narrow against. | [Expressions — Array construction](./expressions.md) | Annotate the binding with `array<A \| B>` or use a single schema. |
| `loom/parse/non-string-array-join` | E | type | `arr.join(...)` invoked on an array whose element type is not `string`. | [Expressions — `array<T>` stdlib](./expressions.md) | Map elements to strings first; no implicit coercion in V1. |
| `loom/parse/extra-object-field` | E | parse | Schema constructor lists a field not declared by the schema. | [Expressions — Object construction](./expressions.md) | — |
| `loom/parse/missing-object-field` | E | parse | Schema constructor omits a declared (required) field. | [Expressions — Object construction](./expressions.md) | — |
| `loom/parse/bare-object-literal` | E | parse | Bare `{ field: expr }` (no schema name) used in expression position. | [Expressions — Object construction](./expressions.md) | Name the schema: `Schema { field: expr }`. |
| `loom/parse/unknown-identifier` | E | parse | Bare identifier in call or value position resolves to nothing in scope. | [Expressions — Identifier resolution](./expressions.md) | — |
| `loom/parse/unknown-method` | E | parse | Method or property accessed on a built-in type that the V1 stdlib does not expose. | [Expressions — Built-in methods](./expressions.md) | — |
| `loom/parse/non-array-iterand` | E | type | `for x in expr` where `expr` is not `array<T>`. | [Control Flow — `for`/`in`](./control-flow.md) | Use `obj.keys()` for objects, `s.split(...)` for strings. |
| `loom/parse/break-outside-loop` | E | parse | `break` outside the body of a `for` / `while` loop. | [Control Flow — `break`/`continue`](./control-flow.md) | — |
| `loom/parse/continue-outside-loop` | E | parse | `continue` outside the body of a `for` / `while` loop. | [Control Flow — `break`/`continue`](./control-flow.md) | — |
| `loom/parse/break-with-value` | E | parse | `break expr` (V1 `break` carries no value). | [Control Flow — `break`/`continue`](./control-flow.md) | — |
| `loom/parse/illegal-template-escape` | E | lex | Backslash followed by an unrecognised character inside a `@`...`` query template body. | [Query — Escapes](./query.md) | — |
| `loom/parse/unterminated-template` | E | lex | EOF reached while scanning a `@`...`` query template. | [Query — Multi-line templates](./query.md) | — |
| `loom/parse/discarded-query-result` | E | parse | Bare `@`...`` expression-statement (the `Result` is dropped without `?` or `let _ =`). | [Query — Discarded query results](./query.md) | Use `?` to propagate failure or `let _ = @\`...\`` to discard explicitly. |
| `loom/parse/empty-template` | W | parse | `@`...`` template's static body is empty or whitespace-only after newline-trim and dedent. The loom still loads; the runtime short-circuits the query if the fully-rendered text is also empty. | [Query — Degenerate rendered templates](./query.md) | Add literal text or use `\\n` to keep an intentionally-blank prompt. |
| `loom/parse/interpolated-result` | E | type | `${expr}` interpolation whose `expr` has Loom static type `Result<T, E>` (the runtime renderer raises the same code as a panic when the type is statically unresolvable). | [Query — Stringification of interpolated values](./query.md) | Unwrap with `?` or `match` before interpolating. |
| `loom/parse/explicit-schema-mismatch` | W | parse | Both a binding annotation and an explicit `@<Schema>` ascription are present and disagree. | [Query — Explicit form](./query.md) | — |
| `loom/parse/match-arm-type-mismatch` | E | type | A `match` arm's body type is not assignable to the common type of the other arms. | [Errors and Results — Arm syntax](./errors-and-results.md) | — |
| `loom/parse/question-outside-result-fn` | E | type | `?` used in a function or top-level loom whose return type is not `Result<_, QueryError>` (and cannot be inferred to one). | [Errors and Results — `?` operator](./errors-and-results.md) | Declare the enclosing scope's return type as `Result<_, QueryError>`. |
| `loom/parse/match-guard-not-supported` | E | parse | Guarded `match` arm (`Pattern if cond => ...`). | [Errors and Results — Pattern grammar](./errors-and-results.md) | Deferred to a future release. |
| `loom/parse/rest-pattern-not-supported` | E | parse | Rest pattern (`[first, ...rest]`, `{ kind, ...other }`). | [Errors and Results — Pattern grammar](./errors-and-results.md) | Deferred to a future release. |
| `loom/parse/bare-return-in-non-void` | E | type | Bare `return` (no argument) in a function or loom whose return type is not `void`. | [Return Statement](./return.md) | — |
| `loom/parse/unreachable-code` | W | parse | Statement appears after a `return` in the same block. | [Return Statement](./return.md) | — |
| `loom/parse/nested-fn` | E | parse | `fn` declaration nested inside another `fn` body or a block. | [Function Definitions — Placement](./functions.md) | Top-level `fn` only in V1. |
| `loom/parse/function-as-value` | E | parse | Function name used outside call position (bound to `let`, passed as argument, etc.). | [Function Definitions — Placement](./functions.md) | — |
| `loom/parse/redundant-wire-name` | W | parse | `field as "field"` rename whose wire name equals the loom-side identifier. | [Schemas — Wire-name renaming](./schemas.md) | Drop the `as` clause. |
| `loom/parse/wire-name-collision` | E | parse | Two fields in the same schema share a wire name, or a wire name collides with another field's loom-side name. | [Schemas — Wire-name renaming](./schemas.md) | — |
| `loom/parse/unknown-variant` | E | parse | `Enum.Variant` reference where `Variant` is not a declared variant of `Enum`. | [Schemas — Variant access](./schemas.md) | — |
| `loom/parse/duplicate-enum-value` | E | parse | Two `enum` variants share an explicit string value. | [Schemas — Enum declarations](./schemas.md) | — |
| `loom/parse/non-string-enum-value` | E | parse | `enum` variant explicit value is not a single string literal. | [Schemas — Enum declarations](./schemas.md) | V1 enums carry string values only. |
| `loom/parse/inline-enum` | E | parse | `enum["a", "b"]` or other inline-enum form. | [Schemas — Enum declarations](./schemas.md) | Use a literal-union (`"a" \| "b"`) or a top-level `enum` declaration. |
| `loom/parse/ambiguous-discriminator` | E | parse | Discriminated-union detection finds more than one candidate field. | [Schemas — Discriminated unions](./schemas.md) | Declare explicitly with `by <field>`. |
| `loom/parse/missing-discriminator` | E | parse | Discriminated-union detection finds no candidate field. | [Schemas — Discriminated unions](./schemas.md) | Add a `kind` (or similar) field to each variant, or declare explicitly with `by <field>`. |
| `loom/parse/duplicate-discriminator-value` | E | parse | Two variants of a discriminated union share the same discriminator value. | [Schemas — Discriminated unions](./schemas.md) | — |
| `loom/parse/nested-discriminator` | E | parse | Discriminator field is not at the top level of each variant (e.g. `kind: { type: "x" }`). | [Schemas — Discriminated unions](./schemas.md) | — |
| `loom/parse/system-on-prompt-mode` | E | parse | `system:` frontmatter field declared on a `mode: prompt` loom. | [Frontmatter — `system`](./frontmatter.md) | Either switch to `mode: subagent` or remove `system:`. |
| `loom/parse/system-interp-not-path` | E | parse | Body of a `${...}` interpolation in `system:` is not a bare identifier path (e.g. `${arr[0]}`, `${a + b}`, `${f(x)}`, `${a?.b}`, `${"x"}`). | [Frontmatter — `system` Interpolation](./frontmatter.md) | The `system:` slot accepts only bare identifier paths; see [future-considerations.md](./future-considerations.md) for richer expressions. |
| `loom/parse/system-interp-unknown-param` | E | parse | Head identifier of a `system:` `${...}` path does not name a declared `params` field. | [Frontmatter — `system` Interpolation](./frontmatter.md) | — |
| `loom/parse/system-interp-bad-field` | E | parse | A `.Ident` step in a `system:` `${...}` path does not name a reachable object field, or descends into an array or un-narrowed discriminated union. | [Frontmatter — `system` Interpolation](./frontmatter.md) | — |
| `loom/parse/system-interp-unterminated` | E | parse | `${` in a `system:` value is not closed by a matching `}` before the YAML scalar ends. | [Frontmatter — `system` Interpolation](./frontmatter.md) | — |
| `loom/parse/timeout-field-rejected` | E | parse | `timeout:` field declared on a query, tool call, or invoke (V1 has no per-call timeout). | [Cancellation](./cancellation.md) | Per-call timeouts are deferred. |
| `loom/parse/bind-context-session-on-subagent` | W | parse | `bind_context: session` declared on a `mode: subagent` loom. | [Binder — Binder context](./binder.md) | Subagent-mode looms have no caller-session context. |
| `loom/parse/bind-echo-on-bypass` | W | parse | `bind_echo: true` declared on a binder-bypass-eligible loom (single no-default `string` param). | [Binder — Echo policy](./binder.md) | The bypass auto-suppresses echo regardless. |
| `loom/parse/warp-top-level-statement` | E | parse | `.warp` file contains a top-level statement, `let`, or query. | [Imports — `.warp` file rules](./imports.md) | Move the code into a `fn` body. |
| `loom/parse/import-name-collision` | E | parse | Two imports bring in the same symbol name, or an imported symbol collides with a top-level declaration in the same file. | [Imports — Name collisions](./imports.md) | Resolve with `as`-aliasing. |
| `loom/parse/invoke-arg-type-mismatch` | E | type | `invoke(...)` argument does not type-check against the callee's declared `params` schema (when the callee is statically resolvable). | [Invocation — Argument binding](./invocation.md) | — |
| `loom/parse/tool-arg-type-mismatch` | E | type | `<name>(args)` tool-call argument does not match the tool's input schema or the callee loom's `params` (when statically resolvable). | [Tool Calls — Argument shape](./tool-calls.md) | — |

### `loom/load/*` — file-load and registration errors

| Code | Sev | Phase | Trigger | Spec rule | Hint |
|---|---|---|---|---|---|
| `loom/load/invalid-encoding` | E | lex | Source file is not valid UTF-8, or carries a non-UTF-8 BOM. | [Lexical — Encoding](./lexical.md) | Re-save the file as UTF-8 (no BOM, or UTF-8 BOM). |
| `loom/load/unknown-frontmatter-field` | W | load | Frontmatter contains a field not in the V1 vocabulary. | [Frontmatter](./frontmatter.md) | — |
| `loom/load/deferred-frontmatter-field` | W | load | Frontmatter contains a field reserved for a deferred V1 feature. | [Frontmatter](./frontmatter.md) | — |
| `loom/load/missing-mode` | E | load | Frontmatter omits the required `mode:` field. | [Frontmatter — Field contract](./frontmatter.md) | Add `mode: prompt` or `mode: subagent`; `mode:` is the only required frontmatter field. |
| `loom/load/unknown-mode-value` | E | load | `mode:` is present but its value is neither `prompt` nor `subagent`. | [Frontmatter — Field contract](./frontmatter.md) | V1 recognises `prompt` and `subagent` only. |
| `loom/load/unknown-tool` | E | load | `tools:` entry names a Pi tool not in the registry. | [Frontmatter — `tools`](./frontmatter.md) | — |
| `loom/load/unresolvable-loom-path` | E | load | `tools:` `.loom` entry resolves to a path that does not exist or is not readable. | [Frontmatter — `tools`](./frontmatter.md) | — |
| `loom/load/prompt-mode-callable` | E | load | `tools:` `.loom` entry points at a prompt-mode loom file. | [Frontmatter — `tools`](./frontmatter.md) | Subagent-mode looms only inside `tools:`; use `invoke(...)` for prompt-mode callees. |
| `loom/load/tool-name-collision` | E | load | Two `tools:` entries (after `as` rename) resolve to the same name; or a `tools:` name collides with a top-level `fn` or import. | [Frontmatter — `tools`](./frontmatter.md) | Disambiguate with `as`. |
| `loom/load/invalid-tool-rename` | E | load | `as <name>` target is not loom-identifier-shaped (e.g. `as MyTool` instead of `as my_tool`). | [Frontmatter — `tools`](./frontmatter.md) | Use a lowercase-first identifier. |
| `loom/load/invocation-cycle` | E | load | Static walk of `invoke` paths discovers a cycle. | [Invocation — Cycle detection](./invocation.md) | — |
| `loom/load/import-cycle` | E | load | Static walk of `.warp` `import` graph discovers a cycle. | [Imports — Cycles](./imports.md) | — |
| `loom/load/case-collision` | W | load | Two `*.loom` files within one discovery source differ only in case. | [Discovery — Case-insensitive collisions](./discovery.md) | Rename one file. |
| `loom/load/cross-source-shadow` | W | load | The same slash name resolves from multiple discovery sources at different priorities. | [Discovery — Source priority](./discovery.md) | Remove the lower-priority entry. |
| `loom/load/cross-format-collision` | E | load | A `.loom` candidate's slash name collides with an already-registered Pi prompt template (`.md`), subagent, or other extension's command at `session_start` time; the loom is dropped and the existing registration survives. | [Discovery — Slash-name collisions across formats](./discovery.md) | Rename the `.loom` (or the colliding `.md`) so the slash names diverge. |
| `loom/load/invalid-slash-name` | E | load | `*.loom` filename stem does not match `^[a-z0-9][a-z0-9_-]*$`. | [Discovery — Filename validity](./discovery.md) | Slash names must be lowercase kebab/snake; rename the file (e.g. `code-review.loom`). |
| `loom/load/missing-source` | E/W | load | A discovery source's path does not exist. Severity is per the failure-modes table in [Discovery — Failure modes](./discovery.md): error for explicit references (`pi.looms` entries, settings `looms` entries, `--loom` flags), warning never — conventional locations (global, project, package `looms/`) emit no diagnostic when missing. | [Discovery — Failure modes](./discovery.md) | Check the source descriptor in the message and either create the path or remove the configuration entry. |
| `loom/load/unreadable-source` | E/W | load | A discovery source's path exists but cannot be read (permission denied, ACL, symlink loop at the root, transient I/O error). Severity is per the failure-modes table: error only for `--loom` flags, warning for every other source. | [Discovery — Failure modes](./discovery.md) | — |
| `loom/load/wrong-type-source` | E/W | load | A discovery source's path exists but is neither a `.loom` file nor a directory containing them. Severity is per the failure-modes table: error for `pi.looms` entries, settings `looms` entries, and `--loom` flags; warning for the conventional-location roots when the root path resolves to something other than a directory. | [Discovery — Failure modes](./discovery.md) | Point the entry at a `.loom` file or a directory of them. |
| `loom/load/unreadable` | W | load | A `*.loom` file discovered under any source is itself unreadable (broken symlink, EACCES on the file, transient I/O error). The loom is not registered; the rest of the scan continues. | [Discovery — Failure modes](./discovery.md) | — |
| `loom/load/settings-unreadable` | W | load | `~/.pi/agent/settings.json` or `.pi/settings.json` exists but is unreadable. | [Discovery — Settings file reads](./discovery.md) | — |
| `loom/load/settings-invalid-json` | W | load | A settings file is present but not valid UTF-8 JSON. | [Discovery — Settings file reads](./discovery.md) | — |
| `loom/load/settings-invalid-entry` | E | load | A `looms` array entry is not a string (object-form entries are not accepted in V1). | [Discovery — `looms` entry schema](./discovery.md) | Use a string path; object-form entries are reserved. |
| `loom/load/invalid-extension` | E | load | A settings `looms` file entry (or a glob match) resolves to a file whose name does not end in `.loom`. | [Discovery — `looms` entry schema](./discovery.md) | Point the entry at a `.loom` file or narrow the glob. |
| `loom/load/manifest-invalid` | E | load | A package's `pi.looms` field is not a `string[]` (a string, object, `null`, or an array containing non-string entries). The package contributes no looms; other packages still process. | [Discovery — Package discovery](./discovery.md#package-discovery) | Set `pi.looms` to an array of path strings, mirroring `pi.skills` / `pi.prompts`. |
| `loom/load/manifest-escapes-package` | W | load | A `pi.looms` entry's resolved path lies outside the package root (via `..` segments or an absolute path). The entry is skipped; other entries in the same array still process. | [Discovery — Package discovery](./discovery.md#package-discovery) | Use a path relative to the package root. |
| `loom/load/typed-query-unsupported-provider` | W | load | A loom contains at least one typed-query expression and its resolved `model:` routes through a provider outside the V1 typed-query support set (`anthropic-messages`, `openai-completions`, `mistral`, `amazon-bedrock`). The loom still loads; typed queries return `Err(QueryError { kind: "transport", retryable: false, ... })` at runtime. | [Pi Integration Contract — Provider compatibility for typed queries](./pi-integration-contract.md) | Switch to a supported provider, drop the typed-query expressions, or wait for the deferred JSON-mode fallback in [Future Considerations](./future-considerations.md). |

### `loom/runtime/*` — runtime panics and delivery failures

V1 has exactly five panic sources. Each surfaces through the channels defined in [Errors and Results — Runtime panics](./errors-and-results.md) (slash-command system note for top-level looms; `Err(QueryError { kind: "invoke_failure", reason: "panic", ... })` to an `invoke` parent). Two additional `loom/runtime/*` codes — `system-note-delivery-failed` and `subagent-dispose-failure` — are not panics but delivery-failure diagnostics emitted, respectively, by the system-note fallback path and the subagent session lifecycle teardown defined in [Pi Integration Contract](./pi-integration-contract.md).

| Code | Sev | Phase | Trigger | Spec rule | Message template |
|---|---|---|---|---|---|
| `loom/runtime/match-error` | E | runtime | A `match` whose arms collectively fail to cover the scrutinee at runtime. | [Errors and Results — Runtime panics](./errors-and-results.md) | `MatchError: no arm matched <scrutinee summary>`. |
| `loom/runtime/index-out-of-bounds` | E | runtime | `arr[i]` with `i < 0` or `i >= arr.length`. | [Errors and Results — Runtime panics](./errors-and-results.md) | `index out of bounds: <i> not in 0..<length>`. |
| `loom/runtime/null-member-access` | E | runtime | `expr.field` where `expr` evaluated to `null`. | [Errors and Results — Runtime panics](./errors-and-results.md) | `null member access: .<field>`. |
| `loom/runtime/null-index-access` | E | runtime | `expr[i]` where `expr` evaluated to `null`. | [Errors and Results — Runtime panics](./errors-and-results.md) | `null index access: [<i>]`. |
| `loom/runtime/missing-object-key` | E | runtime | `obj[k]` where `k` is not a present loom-side field name on `obj`. | [Errors and Results — Runtime panics](./errors-and-results.md) | `missing object key: <key>`. |
| `loom/runtime/system-note-delivery-failed` | E | runtime | `pi.sendMessage` for a `loom-system-note` threw or rejected; emitted by the fallback path after `ctx.ui.notify` has been attempted. `message` carries the original note's `content`; `hint` carries the underlying `sendMessage` error's message. | [Pi Integration Contract — System notes](./pi-integration-contract.md) | `system-note delivery failed: <original content first line>`. |
| `loom/runtime/subagent-dispose-failure` | E | runtime | `AgentSession.dispose()` threw while the runtime was tearing down a subagent-mode invocation in its `finally` block. Emitted regardless of whether teardown was triggered by normal return, `Err`, panic, cancellation, or an unexpected exception. The original error that triggered teardown is **not** masked — the parent still observes it. `hint` carries the underlying `dispose` error's message. | [Pi Integration Contract — Subagent session lifecycle](./pi-integration-contract.md) | `subagent dispose failed: <dispose error first line>`. |

Division by zero, integer overflow, and explicit author-driven panics are deliberately not in V1's panic catalogue — division yields IEEE-754 `Infinity` / `NaN` per the `number` rules in [Expressions](./expressions.md), and there is no `panic(...)` builtin. Adding any of those is a registry-level change per rule 2 above.
