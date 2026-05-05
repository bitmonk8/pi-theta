# V3 — Frontmatter and `params` (excluding binder)

## V3a — Frontmatter parsing

- **Spec.** [Parameters and Frontmatter](../spec_topics/frontmatter.md).
- **Adds.** Real YAML frontmatter; recognised fields: `description`, `argument-hint`, `mode`, `model`, `tools`, `system`, `bind_model`, `bind_context`, `bind_echo`, `coercion`, `params`. Unknown fields produce `loom/load/unknown-frontmatter-field` warning. Loom-specific fields other than `mode` and `description`/`argument-hint`/`params` are recognised but ignored with a "not yet implemented in this leaf" warning until their implementing leaf lands. Absent `params:` and `params: {}` are equivalent and mean "no-params loom"; `params: null` is `loom/load/params-null`. `argument-hint` is parsed and stored on the AST for binder-grounding consumption (V16f); declaring `argument-hint:` without `description:` emits the advisory `loom/load/argument-hint-not-displayed` so authors are not surprised by an empty-looking dropdown entry (the autocomplete UI shows only `description`).
- **Tests.** YAML parse errors point at correct column; unknown field warning shape; `mode: subagent` is the documented "not implemented yet" parse error referencing V12a; `params` field type-grammar fragment recognised (primitive types only here; array/named types in V3b); absent `params:` and `params: {}` produce the same internal no-params state; `params: null` is rejected with `loom/load/params-null` and the loom does not register; `argument-hint:` set without `description:` → `loom/load/argument-hint-not-displayed` advisory and the loom still loads; both fields present → no advisory.
- **Deps.** V2.
- **Ships when.** Frontmatter parses; later leaves can attach semantics non-breakingly.

## V3b — `params` typed declaration

- **Spec.** [Parameters and Frontmatter](../spec_topics/frontmatter.md) (params).
- **Adds.** `params:` with primitive types, `array<T>` over primitives, and `T | null`. Named-schema references parse but resolution defers to V4. Defaults defer to V16a.
- **Tests.** Each primitive type binds; `array<string>` binds; `T | null` binds; named-schema reference parses but errors with "schema not yet declarable" until V4b.
- **Deps.** V3a.
- **Ships when.** Loom body can read `${param}` of primitive type (interpolation arrives in V5b).

## V3c — Bypass binder (no-params and single-string forms)

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (binder bypass), [Invocation from Pi](../spec_topics/slash-invocation.md) (no-params overflow).
- **Adds.** Two static bypass cases, checked at load time in this order:
  1. **No-params bypass.** When `params:` is absent or `{}`, the loom takes no parameters; the binder is skipped, no envelope schema is constructed, and the loom runs with an empty params object. Trailing slash text after the command name is trimmed; if the trimmed remainder is non-empty, the runtime emits a single `customType: "loom-system-note"` message before the loom starts, formatted as `loom /<name>: ignoring extra arguments — this loom takes no parameters`. Whitespace-only remainders trim to empty and emit no note. The note fires only on the slash-invocation path; `invoke(...)` and registered-tool callers skip the slash parser entirely. `bind_echo: true` on a no-params loom is `loom/load/bind-echo-without-params` (warning) and produces no echo regardless; `bind_context` and `bind_model` on a no-params loom are silently ignored.
  2. **Single-string bypass.** When `params:` declares exactly one field, that field's type is `string`, and the field has no default, the runtime sets that param to the trimmed slash text and skips the binder. AJV runs as safety net.
- **Tests.** No-params bypass detected for absent `params:` and `params: {}` alike; trailing slash text emits the documented system note (`content` matches the [`slash-invocation.md` "No-params overflow"](../spec_topics/slash-invocation.md) template) and the loom still runs; whitespace-only remainder emits no note; `invoke(...)` and registered-tool callers against a no-params loom never emit the note. `bind_echo: true` on a no-params loom emits `loom/load/bind-echo-without-params` and no echo. The no-params check runs **before** the single-string check (a `params: {}` loom does not fall into the single-string branch). Single-string bypass detection is purely static; slash text trimmed; multiple-params, non-string, or default-having shapes do not bypass; AJV still runs.
- **Deps.** V3b, M (system-note channel).
- **Ships when.** A no-params loom or single-string-param loom can be invoked from a slash command without an LLM binder, with documented overflow handling for the no-params case.
