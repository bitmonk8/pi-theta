# Reference — Diagnostics registry

The closed theta 1.0 diagnostic-code registry, sharded by namespace. This page
transcribes the stable-contract columns — **Code**, **Sev**, **Phase**, and the
normative **Message** — verbatim from the four spec registry pages (see
Provenance). The Message column is normative per **DIAG-4**: renderers emit it
character-for-character with `<…>` placeholders interpolated, and tests source the
expected string from this column. The full *Trigger* / *Spec rule* / *Hint*
columns live on the spec registry pages and are not restated here to avoid drift.

## Diagnostic shape

```
{
  severity: "error" | "warning",
  code:     string,                          // e.g. "theta/parse/binding-case-mismatch"
  file?:    string,                          // absolute path; omitted for file-less codes
  range?:   { start: { line, column }, end: { line, column } },  // 1-indexed; end exclusive
  message:  string,                          // single-line summary
  hint?:    string,                          // optional suggested fix
  related?: array<{ file, range, message }>, // related sites
  masked?:  array<string>,                   // hard-ceiling co-fire enumeration
  details?: object,                          // per-row structured payload
}
```

Located-site classification (closed): **Located** (single token span in one file —
`file` and `range`); **File-only** (one file, no single span — `file`, no
`range`); **Location-less** (no single concrete file — neither `file` nor
`range`). Serialised `content` line format: `"<file>:<line>:<col>: <code>:
<message>"` (Located), `"<file>: <code>: <message>"` (File-only), `"<code>:
<message>"` (Location-less), optionally `+ "\n  hint: <hint>"`.

## Code registry rules (normative)

- **DIAG-1.** Every author-visible diagnostic carries a code from this registry.
- **DIAG-2.** The registry is closed. Adding/removing a code or changing its
  namespace, severity, or trigger is a spec change.
- **DIAG-3.** Codes are stable identifiers; renaming is a breaking change deferred
  to theta 2.0.
- **DIAG-4.** The Message column is normative; renderers emit it
  character-for-character.

Namespaces: `theta/parse/*` (lex / parse / type), `theta/load/*` (file-load,
registration, discovery), `theta/runtime/*` (execution panics, runtime-defect
surface, delivery/lifecycle failures), `theta/host/*` (host-observed anomalies,
emitted via `console.error`). `theta/typecheck/*` is a build-time `tsc` brand
namespace, **not** runtime diagnostics — no registry row, out of scope. Severity
`E/W` means the severity is resolved per diagnostic by that row's trigger.

## `theta/parse/*`

| Code | Sev | Phase | Message |
|---|---|---|---|
| `theta/parse/illegal-escape` | E | lex | `illegal escape sequence: \<char>` |
| `theta/parse/invalid-unicode-escape` | E | lex | `invalid Unicode escape: value is not a Unicode scalar value` |
| `theta/parse/literal-newline-in-string` | E | lex | `literal newline in string literal` |
| `theta/parse/unterminated-string` | E | lex | `unterminated string literal` |
| `theta/parse/invalid-path-separator` | E | lex | `invalid path separator: backslash in path literal` |
| `theta/parse/stray-backslash` | E | lex | `stray backslash in source` |
| `theta/parse/invoke-non-theta-extension` | E | parse | `invoke path '<path>' does not end in .theta` |
| `theta/parse/import-non-thetalib-extension` | E | parse | `import path '<path>' does not end in .thetalib` |
| `theta/parse/binding-case-mismatch` | E | parse | `binding name must start with a lowercase letter or _` |
| `theta/parse/schema-case-mismatch` | E | parse | `schema name must start with an uppercase letter` |
| `theta/parse/reserved-keyword-as-identifier` | E | parse | `reserved keyword '<keyword>' cannot be used as an identifier` |
| `theta/parse/single-line-if` | E | parse | `single-line body not permitted; wrap in { ... }` |
| `theta/parse/block-comment` | E | lex | `block comments are not supported` |
| `theta/parse/integer-narrowing` | E | type | `cannot narrow number to integer` |
| `theta/parse/integer-literal-out-of-range` | E | lex | `integer literal exceeds the safe-integer range` |
| `theta/parse/number-literal-not-finite` | E | lex | `number literal is not a finite IEEE-754 double` |
| `theta/parse/unsupported-feature` | E | parse | `unsupported syntactic feature: <construct>` |
| `theta/parse/immutable-rebinding` | E | parse | `cannot reassign immutable binding '<name>'` |
| `theta/parse/assignment-as-expression` | E | parse | `assignment is not an expression` |
| `theta/parse/assignment-to-member-or-index` | E | parse | `cannot assign to member or index; mutability is binding-level only` |
| `theta/parse/mut-on-immutable-context` | E | parse | `'mut' is not permitted in this binding position` |
| `theta/parse/mut-on-discard` | E | parse | `'mut' is not permitted on discard binding '_'` |
| `theta/parse/increment-decrement` | E | parse | `'<op>' operator is not supported` |
| `theta/parse/non-boolean-condition` | E | type | `condition must be boolean; got <type>` |
| `theta/parse/comparison-chaining` | E | parse | `comparison operators do not chain; use &&` |
| `theta/parse/mixed-plus-operands` | E | type | `'+' has mixed operand types: <left> and <right>` |
| `theta/parse/non-orderable-operands` | E | type | `'<op>' requires two numeric or two string operands; got <left> and <right>` |
| `theta/parse/non-indexable-receiver` | E | type | `indexed access requires an array<T> or object receiver; got <type>` |
| `theta/parse/non-string-object-index` | E | type | `object index must be string; got <type>` |
| `theta/parse/array-element-type-mismatch` | E | type | `array element type mismatch at index <i>: expected <expected>, got <actual>` |
| `theta/parse/array-no-common-type` | E | type | `array elements have no common type; annotate the binding with array<A \| B> or use a single schema` |
| `theta/parse/return-no-common-type` | E | type | `return operands have no common type; annotate the function return type or reconcile the operands` |
| `theta/parse/non-string-array-join` | E | type | `array.join requires a string element type; got array<<element>>` |
| `theta/parse/extra-object-field` | E | parse | `extra field '<field>' on schema '<schema>'` |
| `theta/parse/missing-object-field` | E | parse | `missing field '<field>' on schema '<schema>'` |
| `theta/parse/bare-object-literal` | E | parse | `bare object literal not permitted in this position; name the schema (Schema { ... })` |
| `theta/parse/default-not-literal` | E | parse | `params default RHS must be a literal-sublanguage form; offending sub-expression: <expr>` |
| `theta/parse/non-trailing-default` | E | parse | `non-defaulted param '<field>' follows a defaulted param; defaulted params must be trailing` |
| `theta/parse/tool-arg-arity` | E | parse | `Pi tool '<name>' takes a single object argument; got <count>` |
| `theta/parse/tool-arg-not-object-literal` | E | parse | `Pi tool '<name>' argument must be written inline as a bare object literal { ... }; a let-bound value cannot supply the field shape` |
| `theta/parse/tool-arg-schema-conflict` | E | type | `Pi tool '<name>' argument field '<field>' type is provably disjoint from the input schema: expected <expected>, got <actual>` |
| `theta/parse/let-without-initialiser` | E | parse | `let binding '<name>' has no initialiser` |
| `theta/parse/let-rhs-type-mismatch` | E | type | `let binding '<name>' initialiser type mismatch: expected <expected>, got <actual>` |
| `theta/parse/statement-in-arm-body` | E | parse | `match arm body must be an expression; wrap statements in a block expression { ... }` |
| `theta/parse/by-on-object-schema` | E | parse | `the 'by' clause applies only to discriminated-union schemas (schema X by f = A \| B \| …)` |
| `theta/parse/doc-comment-misplaced` | E | parse | `'///' doc comment is not legal above this production` |
| `theta/parse/generic-arity-mismatch` | E | parse | `generic type '<ctor>' expects <expected> type argument(s); got <actual>` |
| `theta/parse/void-in-non-return-position` | E | parse | `'void' is only permitted as a function or theta return type` |
| `theta/parse/result-in-schema-position` | E | parse | `'Result' has no lowered-schema form and is not permitted in a schema-feeding position` |
| `theta/parse/unknown-identifier` | E | parse | `unknown identifier '<name>'` |
| `theta/parse/unknown-method` | E | parse | `unknown method '<method>' on type <type>` |
| `theta/parse/non-array-iterand` | E | type | `'for' expects array<T> after 'in'; got <type>` |
| `theta/parse/break-outside-loop` | E | parse | `'break' outside of a loop` |
| `theta/parse/continue-outside-loop` | E | parse | `'continue' outside of a loop` |
| `theta/parse/break-with-value` | E | parse | `'break' takes no value in theta 1.0` |
| `theta/parse/illegal-template-escape` | E | lex | `` illegal escape sequence in @`...` template: \<char> `` |
| `theta/parse/unterminated-template` | E | lex | `` unterminated @`...` query template `` |
| `theta/parse/discarded-query-result` | E | parse | `query result discarded; use ? to propagate failure or 'let _ = ...' to discard explicitly` |
| `theta/parse/empty-template` | W | parse | `query template body is empty after newline-trim and dedent` |
| `theta/parse/interpolated-result` | E | type | `Result value cannot be interpolated; unwrap with ? or match first` |
| `theta/parse/explicit-schema-mismatch` | W | parse | `explicit @<Schema> ascription is not compatible with binding annotation` |
| `theta/parse/match-arm-type-mismatch` | E | type | `match arm body type does not match the common type of the other arms` |
| `theta/parse/question-outside-result-fn` | E | type | `'?' used in a scope whose return type is not Result<T, QueryError>` |
| `theta/parse/question-on-non-result` | E | type | `'?' requires a Result operand; got <type>` |
| `theta/parse/match-guard-not-supported` | E | parse | `match guards are not supported in theta 1.0` |
| `theta/parse/rest-pattern-not-supported` | E | parse | `rest patterns are not supported in theta 1.0` |
| `theta/parse/bare-return-in-non-void` | E | type | `missing return value` |
| `theta/parse/unreachable-code` | W | parse | `unreachable code after return` |
| `theta/parse/nested-fn` | E | parse | `nested 'fn' declarations are not supported in theta 1.0` |
| `theta/parse/function-as-value` | E | parse | `function '<name>' used outside call position; functions are not first-class in theta 1.0` |
| `theta/parse/redundant-wire-name` | W | parse | `redundant 'as' clause: wire name '<name>' equals the theta-side name` |
| `theta/parse/wire-name-collision` | E | parse | `wire name '<name>' collides with another field on schema '<schema>'` |
| `theta/parse/empty-schema-body` | E | parse | `'<X>' has no fields; an empty schema cannot be validated.` |
| `theta/parse/empty-enum-body` | E | parse | `'<X>' has no variants; an empty enum cannot be validated.` |
| `theta/parse/unknown-variant` | E | parse | `unknown variant '<variant>' on enum '<enum>'` |
| `theta/parse/unresolved-named-type` | E | parse | `unresolved named type '<name>'` |
| `theta/parse/duplicate-enum-value` | E | parse | `duplicate enum value '<value>' across variants of enum '<enum>'` |
| `theta/parse/duplicate-enum-variant-name` | E | parse | `duplicate variant name '<variant>' on enum '<enum>'` |
| `theta/parse/non-string-enum-value` | E | parse | `enum variant value must be a string literal; got <kind>` |
| `theta/parse/inline-enum` | E | parse | `inline 'enum[...]' is not supported; use a top-level 'enum' declaration or a literal-union` |
| `theta/parse/ambiguous-discriminator` | E | parse | `ambiguous discriminator for <X>; candidates: <fields>. Declare explicitly with 'by <field>'.` |
| `theta/parse/missing-discriminator` | E | parse | `<X> is a union of object schemas with no shared single-literal discriminator field. Add a 'kind' (or similar) field to each variant, or declare explicitly with 'by <field>'.` |
| `theta/parse/duplicate-discriminator-value` | E | parse | `duplicate discriminator value '<value>' across variants of <X>` |
| `theta/parse/nested-discriminator` | E | parse | `discriminator field '<field>' must be at the top level of each variant of <X>` |
| `theta/parse/non-string-discriminator` | E | parse | `discriminator '<field>' on <X> must be a string-literal type; got <kind>` |
| `theta/parse/type-alias-cycle` | E | parse | `type-alias cycle: <path>` |
| `theta/parse/system-on-prompt-mode` | E | parse | `'system:' is not permitted on a mode: prompt theta` |
| `theta/parse/system-interp-not-path` | E | parse | `'system:' interpolation body must be a bare identifier path` |
| `theta/parse/system-interp-unknown-param` | E | parse | `'system:' interpolation references unknown param '<name>'` |
| `theta/parse/system-interp-bad-field` | E | parse | `'system:' interpolation '.<field>' does not name a reachable object field on <path>` |
| `theta/parse/system-interp-unterminated` | E | parse | `'system:' interpolation '${' is not closed by a matching '}'` |
| `theta/parse/timeout-field-rejected` | E | parse | `'timeout:' field is not supported in theta 1.0` |
| `theta/parse/bind-context-session-on-subagent` | W | parse | `'bind_context: session' has no effect on a mode: subagent theta` |
| `theta/parse/bind-echo-on-bypass` | W | parse | `'bind_echo: true' has no effect on a single-string-bypass theta` |
| `theta/parse/thetalib-top-level-statement` | E | parse | `top-level statement not permitted in .thetalib file; move into a fn body` |
| `theta/parse/import-name-collision` | E | parse | `imported symbol '<name>' collides with another import or top-level declaration` |
| `theta/parse/import-unknown-symbol` | E | parse | `imported symbol '<name>' is not declared or re-exported by '<path>'` |
| `theta/parse/invoke-arg-type-mismatch` | E | type | `invoke argument <i> ('<param>') type mismatch: expected <expected>, got <actual>` |
| `theta/parse/tool-arg-type-mismatch` | E | type | `tool '<name>' argument type mismatch: expected <expected>, got <actual>` |
| `theta/parse/fn-arg-type-mismatch` | E | type | `fn '<name>' argument <i> ('<param>') type mismatch: expected <expected>, got <actual>` |
| `theta/parse/invoke-return-type-mismatch` | E | type | `invoke<Schema> annotation incompatible with callee '<callee>' return type <actual>` |
| `theta/parse/invoke-arity-too-few` | E | parse | `invoke '<callee>' passes too few arguments: expected <required> non-defaulted, got <provided>` |
| `theta/parse/invoke-arity-too-many` | E | parse | `invoke '<callee>' passes too many arguments: expected at most <max>, got <provided>` |

## `theta/load/*`

| Code | Sev | Phase | Message |
|---|---|---|---|
| `theta/load/extension-bootstrap-failed` | E | load | `extension bootstrap failed: <capability> threw <error>` |
| `theta/load/host-incompatible` | E | load | `host incompatible (<kind>): observed <observed>, required <required>` |
| `theta/load/invalid-encoding` | E | lex | `invalid UTF-8 encoding at byte offset <offset>` |
| `theta/load/unknown-frontmatter-field` | W | load | `unknown frontmatter field '<field>'` |
| `theta/load/deferred-frontmatter-field` | W | load | `frontmatter field '<field>' is reserved for a deferred theta 1.0 feature` |
| `theta/load/missing-mode` | E | load | `frontmatter is missing required field 'mode:'` |
| `theta/load/params-null` | E | load | `'params: null' is not permitted; omit 'params:' or use 'params: {}'` |
| `theta/load/frontmatter-value-out-of-range` | E | load | `frontmatter field '<dotted-key>' must be a non-negative integer; got <observed>` |
| `theta/load/bind-echo-without-params` | W | load | `'bind_echo: true' has no effect on a no-params theta` |
| `theta/load/unknown-mode-value` | E | load | `unknown 'mode:' value '<value>'; expected 'prompt' or 'subagent'` |
| `theta/load/unknown-methodology-value` | E | load | `unknown 'respond_repair.methodology:' value '<value>'; expected 'validator_error', 'schema_repeat', or 'none'` |
| `theta/load/unknown-bind-context-value` | E | load | `unknown 'bind_context:' value '<value>'; expected 'none' or 'session'` |
| `theta/load/unknown-tool` | E | load | `unknown Pi tool '<name>'` |
| `theta/load/unresolvable-theta-path` | E | load | `cannot resolve .theta path '<path>'` |
| `theta/load/prompt-mode-callable` | E | load | `'tools:' entry '<path>' points at a prompt-mode theta; only subagent-mode thetas are permitted` |
| `theta/load/tool-name-collision` | E | load | `tool name '<name>' collides with another 'tools:' entry, top-level fn, or import` |
| `theta/load/invalid-tool-rename` | E | load | `'as <name>' rename target must be lowercase-first; got '<name>'` |
| `theta/load/invocation-cycle` | E | load | `invocation cycle: <A> → <B> → <A>` |
| `theta/load/invoke-path-escape` | E | load, runtime | `invoke path '<path>' resolves outside every active discovery root` |
| `theta/load/binder-model-unresolved` | E | load | `binder model unresolved: set 'bind_model:' in frontmatter or 'theta.binderModel' in settings` |
| `theta/load/model-unresolved` | E | load | `theta 'model:' value '<value>' resolves to no available model, or is ambiguous across providers` |
| `theta/load/binder-model-not-strict-capable` | E | load | `binder model '<model>' is not flagged as strict-structured-output capable` |
| `theta/load/binder-model-strict-capability-unknown` | W | load | `binder model '<model>' strict-capability flag unavailable; load-time check degraded to best-effort` |
| `theta/load/argument-hint-not-displayed` | W | load | `'argument-hint:' declared without 'description:'; Pi's autocomplete entry will be empty` |
| `theta/load/callee-has-errors` | E/W | load | `callee '<path>' has errors; see related diagnostics` |
| `theta/load/import-cycle` | E | load | `import cycle: <A>.thetalib → <B>.thetalib → <A>.thetalib` |
| `theta/load/unresolvable-thetalib-path` | E | load | `cannot resolve .thetalib import '<path>'` |
| `theta/load/case-collision` | W | load | `case-insensitive filename collision in <source>: '<path-a>' and '<path-b>'` |
| `theta/load/cross-source-shadow` | W | load | `slash name '<name>' shadowed across discovery sources: '<higher>' wins over '<lower>'` |
| `theta/load/cross-format-collision` | E | load | `slash name '<name>' collides at the same priority: <paths>` |
| `theta/load/invalid-slash-name` | E | load | `` slash names must be lowercase kebab/snake; rename the file (e.g. `code-review.theta`) `` |
| `theta/load/missing-source` | E/W | load | `discovery source path does not exist: <descriptor>` |
| `theta/load/unreadable-source` | E/W | load | `discovery source is unreadable: <descriptor>` |
| `theta/load/wrong-type-source` | E/W | load | `discovery source <descriptor> is neither a .theta file nor a directory of them` |
| `theta/load/unreadable` | W | load | `.theta file is unreadable: '<path>'` |
| `theta/load/settings-unreadable` | W | load | `settings file '<path>' is unreadable` |
| `theta/load/settings-invalid-json` | W | load | `settings file '<path>' is not valid UTF-8 JSON` |
| `theta/load/settings-invalid-entry` | E | load | `settings 'thetaPaths[<index>]' must be a string path; got <kind>` |
| `theta/load/settings-value-out-of-range` | E | load | `settings key <key> value is out of range; got <observed>` |
| `theta/load/invalid-extension` | E | load | `'thetaPaths[<index>]' resolves to '<path>' which does not end in .theta` |
| `theta/load/non-canonical-extension` | W | load | `file '<path>' has non-canonical extension case; rename to lowercase '.theta' or '.thetalib'` |
| `theta/load/manifest-invalid` | E | load | `package '<name>' has invalid 'pi.theta': expected string[], got <kind>` |
| `theta/load/manifest-escapes-package` | W | load | `package '<name>' 'pi.theta' entry '<path>' resolves outside the package root` |
| `theta/load/discovery-slow` | W | load | `package-discovery walk aborted at <root>: <cap> cap reached` |
| `theta/load/package-read-timeout` | W | load | `package '<name>' package.json read exceeded <deadline>ms during package discovery` |
| `theta/load/typed-query-unsupported-provider` | W | load | `provider '<provider>' (model '<model>') is outside the theta 1.0 typed-query supported set; typed queries will fail at runtime` |
| `theta/load/schema-slug-collision` | E | load | `schema-slug collision on slug <slug>: two distinct inline schemas hash alike` |

## `theta/runtime/*`

theta 1.0.0 has exactly six **panic sources** (the first six rows). One further
code — `theta/runtime/internal-error` — covers the runtime-defect surface (a code
stable, trigger intentionally open-ended). The remaining codes are delivery /
rebuild / registration / teardown / lifecycle failures. `reload-teardown-timeout`
is delivered via `console.error` (not the persistent channel).

| Code | Sev | Phase | Message template |
|---|---|---|---|
| `theta/runtime/match-error` | E | runtime | `MatchError: no arm matched <scrutinee summary>`. |
| `theta/runtime/index-out-of-bounds` | E | runtime | `index out of bounds: <i> not in 0..<length>`. |
| `theta/runtime/null-member-access` | E | runtime | `null member access: .<field>`. |
| `theta/runtime/null-index-access` | E | runtime | `null index access: [<i>]`. |
| `theta/runtime/missing-object-key` | E | runtime | `missing object key: <key>`. |
| `theta/runtime/invoke-depth-exceeded` | E | runtime | `invoke chain depth exceeded: <depth> > 32`. |
| `theta/runtime/system-note-delivery-failed` | E | runtime | `system-note delivery failed: <original content first line>`. |
| `theta/runtime/registry-swap-failed` | E | runtime | `registry swap failed: <path>`. |
| `theta/runtime/watcher-terminated` | E | runtime | `theta watcher terminated; hot-reload halted until /reload`. |
| `theta/runtime/internal-error` | E | runtime | `internal error: <error.message>`. |
| `theta/runtime/subagent-dispose-failure` | E | runtime | `subagent dispose failed: <dispose error first line>`. |
| `theta/runtime/registration-cache-collision` | E | runtime | `tool-registration cache collision on slug <slug>: <name1> vs <name2>`. |
| `theta/runtime/validator-cache-collision` | E | runtime | `validator-cache collision on slug <slug>: two distinct schema documents hash alike`. |
| `theta/runtime/active-set-restore-failed` | E | runtime | `failed to restore tool active-set after /<name>: <error>`. |
| `theta/runtime/cancelled-by-session-shutdown` | E | runtime | `theta /<name> cancelled by session shutdown (<reason>)`. |
| `theta/runtime/reload-teardown-timeout` | E | runtime | `reload teardown timed out after <ms>ms; <N> invocation(s) still in flight: <list>`. |
| `theta/runtime/custom-type-unsafe` | E | runtime | `custom-message type is not transcript-safe: '<value>'`. |
| `theta/runtime/subagent-model-unresolved` | E | runtime | `subagent invocation has no resolved model: frontmatter 'model:' is absent and the inherited session model is undefined` |

Division by zero, modulo by zero, integer overflow, and explicit author-driven
panics are deliberately not in the panic catalogue.

## `theta/host/*`

Emitted via `console.error` (typical observation site is the `session_shutdown`
teardown handler, where the persistent channel may already be invalidated).

| Code | Sev | Phase | Message |
|---|---|---|---|
| `theta/host/session-shutdown-reason-unknown` | W | runtime | `session_shutdown event.reason outside closed set: <observed>`. |
| `theta/host/session-shutdown-pinned-constant-unreadable` | W | runtime | `session_shutdown pinned-constant read failed: <failure>`. |
| `theta/host/session-swap-instance-survived` | E | runtime | `extension instance survived a session-only session_shutdown (reason: <reason>); Pi lifecycle contract violated — terminating`. |
| `theta/host/session-shutdown-teardown-step-failed` | W | runtime | `session_shutdown teardown step <step> failed at <call>: <error>`. |

## `masked` field (hard-ceiling co-fire)

Each entry is one of `"ceiling#1"`, `"ceiling#2"`, `"ceiling#3"`, `"ceiling#4"`;
the field is omitted when no co-fire occurred (never `masked: []`). Wire location:
`details.masked` for diagnostic surfaces, `details.event.masked` for runtime-event
surfaces. In theta 1.0 `masked` is never populated on a diagnostic-shape surface;
the only non-empty enumeration reachable is `["ceiling#2"]` on the runtime-event
channel (see [Hard ceilings](./hard-ceilings.md)).

## Provenance

- `theta/parse/*` table (Code/Sev/Phase/Message transcribed verbatim):
  `docs/spec_topics/diagnostics/code-registry-parse.md`.
- `theta/load/*` table: `docs/spec_topics/diagnostics/code-registry-load.md`.
- `theta/runtime/*` table: `docs/spec_topics/diagnostics/code-registry-runtime.md`.
- `theta/host/*` table: `docs/spec_topics/diagnostics/code-registry-host.md`.
- Diagnostic shape, located-site classification, serialised content format,
  DIAG-1…DIAG-4, `theta/typecheck/*` out-of-scope note:
  `docs/spec_topics/diagnostics/diagnostic-shape.md`.
- Diagnostics hub / delivery channels: `docs/spec_topics/diagnostics.md`.
- `masked` field closed set and wire-location split:
  `docs/spec_topics/hard-ceilings/ceilings-3-and-4.md#masked-field`.
- Implementation confirmation: panic codes in `src/runtime/runtime-panics.ts`
  (`INDEX_OUT_OF_BOUNDS_CODE`, `MISSING_OBJECT_KEY_CODE`, `NULL_INDEX_ACCESS_CODE`,
  `NULL_MEMBER_ACCESS_CODE`, `INVOKE_DEPTH_EXCEEDED_CODE`) match the registry;
  `INVOKE_DEPTH_CAP = 32` (`src/runtime/runtime-panics.ts:51`), template
  `invoke chain depth exceeded: <depth> > 32`.
