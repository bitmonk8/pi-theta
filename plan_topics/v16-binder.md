# V16 — Slash-command argument binder (LLM path)

## V16a — Param defaults

- **Spec.** [Parameters and Frontmatter](../spec_topics/frontmatter.md) (defaults), [Grammar Appendix — Loom literal sublanguage](../spec_topics/grammar.md#loom-literal-sublanguage).
- **Adds.** `field: type = literal` defaults. The RHS is parsed by the Loom literal sublanguage — primitive literals (including unary-`-` on numeric literals), `null`, array literals, bare-key object literals against the LHS schema, `Enum.Variant` access, and variant-schema construction (`Cat { ... }`). The is-literal check runs at parse time against the Loom AST; failures emit `loom/parse/default-not-literal` naming the offending sub-expression. No operators, function calls, identifier references other than `Enum.Variant`, `${...}` interpolation, or `@`...`` templates.
- **Tests.** Each admitted literal shape parses and lowers (string, number, negative number, boolean, `null`, array, bare-key object, `Enum.Variant`, variant-schema constructor). Object-literal field order is free; missing required field is `loom/parse/missing-object-field`; extra field is `loom/parse/extra-object-field`. Discriminated-union variant default written as `Cat { name: "x" }` produces a value with the correct discriminator (no `species:` written by the author). `Enum.Variant` default arrives at the loom body with the runtime enum brand attached — cross-enum equality (`Severity.High` default equals body-constructed `Severity.High`; not equal to `OtherEnum.High`). Each forbidden form (operator, function call, `let`-bound identifier reference, `${...}`, `@`...``) emits `loom/parse/default-not-literal` and the message names the offending sub-expression. Defaults apply only when the slash arg omits the corresponding positional argument.
- **Deps.** V3b, V10a (enum), V11a (discriminated unions).
- **Ships when.** Defaults declarable in Loom literal syntax with full enum and union support.

## V16b — Default merging after binder

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (defaulting).
- **Adds.** After binder returns `ok`, runtime fills defaults for any field omitted from `args`, *then* AJV validates merged result.
- **Tests.** Omitted defaulted field filled; binder-provided value overrides default; AJV runs against merged shape.
- **Deps.** V16a.
- **Ships when.** Default-merge order correct.

## V16c — Binder envelope schema construction

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (binder envelope).
- **Adds.** Per-loom dynamic envelope schema with three `anyOf` arms (`ok`, `needs_info`, `ambiguous`); built once at load and reused.
- **Tests.** Envelope shape matches the [`binder.md` Binder envelope schema](../spec_topics/binder.md) (`anyOf` of `ok` / `needs_info` / `ambiguous` arms); reused across invocations (cache hit); per-loom uniqueness.
- **Deps.** V11a (discriminated unions), V3b.
- **Ships when.** Envelope schema constructable.

## V16d — Defaulted-fields-relaxed in envelope's `args` arm

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (binder envelope).
- **Adds.** In the `ok` arm, copy of params schema with each defaulted field removed from `required` (type unchanged).
- **Tests.** Required-without-default fields stay required; defaulted fields removed from `required`; types preserved.
- **Deps.** V16c, V16a.
- **Ships when.** Binder isn't asked to invent defaults.

## V16e — `bind_model` resolution chain

- **Spec.** [Slash-Command Argument Binding — Binder model](../spec_topics/binder.md), [Diagnostics](../spec_topics/diagnostics.md).
- **Adds.** Two-step resolution: frontmatter `bind_model:` → `settings.json` `looms.binderModel` (read via the V14n mechanism). **No further fallback.** When neither resolves and the loom is not bypass-eligible (no-params or single-string bypass per V3c), load fails with `loom/load/binder-model-unresolved`; the loom is reported via the diagnostics channel and its slash command is not registered. The resolved model is checked at the same load-time pass against Pi's model registry for strict structured-output / strict tool-input capability; failure is `loom/load/binder-model-not-strict-capable`. Bypass-eligible looms skip both checks. If Pi's registry does not surface a strict-capable flag, the load-time check degrades to best-effort (advisory diagnostic noted; no load failure) and runtime envelope-malformed failures are caught by V16o (`loom/runtime/binder-malformed-envelope`). When the V18r settings watcher invalidates the V14n cache after a `looms.binderModel` edit, the new value is picked up on the next loom load only — already-loaded looms keep their resolved model, and already-failed loads are not retroactively re-attempted (a structural reload via `/reload` is required for either).
- **Tests.** Frontmatter-only resolution succeeds; settings-only resolution succeeds; both absent on a non-bypass loom → `loom/load/binder-model-unresolved` and the slash command is not registered (Pi's registered-command list does not contain it); both absent on a bypass-eligible loom (no-params; single-string) → no error and the loom registers; resolved model lacking strict capability → `loom/load/binder-model-not-strict-capable` and not registered; Pi registry without a strict flag → advisory diagnostic, loom registers, runtime envelope-malformed failure surfaces as `loom/runtime/binder-malformed-envelope` per V16o; settings change after a failed load → only the next load picks up the new value (already-failed loom stays unregistered until reload). Cross-linked from V18q — every binder-failure cause owned by this leaf emits exactly one runtime event at the originating site.
- **Deps.** V3a, V3c, V14n, V16o.
- **Ships when.** Both load-time errors fire correctly and bypass looms skip both checks.

## V16f — `bind_context: none`

- **Spec.** [Slash-Command Argument Binding — Binder context, Binder system prompt](../spec_topics/binder.md).
- **Adds.** Default mode; binder sees only slash text + frontmatter. The frontmatter `argument-hint:` value (when present) flows into the binder's system prompt under `Argument hint:` as the binder-grounding payload (no other surface consumes it in V1; the autocomplete dropdown does not show it — see V3a).
- **Tests.** No session context attached; deterministic output for identical inputs (modulo provider non-determinism); when `argument-hint:` is set, the binder's system prompt contains `Argument hint: <value>` exactly once; when absent, the line is omitted. Cross-linked from V18q — every binder-failure cause owned by this leaf emits exactly one runtime event at the originating site.
- **Deps.** V16c, V16e.
- **Ships when.** Default binder path works end-to-end and `argument-hint` reaches the binder grounding payload.

## V16g — `bind_context: session` truncation

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (session-context truncation).
- **Adds.** Walk caller-session turns newest-to-oldest; accumulate until 20 turns or 8000 tokens (whichever smaller); whole-turn boundary.
- **Tests.** Exact 20-turn boundary; exact 8000-token boundary (token count via `estimateTokens` from `@mariozechner/pi-coding-agent`), including a turn whose inclusion would push the running sum over 8000 is excluded entirely; partial messages not split. Cross-linked from V18q — every binder-failure cause owned by this leaf emits exactly one runtime event at the originating site.
- **Deps.** V16f.
- **Ships when.** Session-context binder path works.

## V16h — Binder determinism settings

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (determinism).
- **Adds.** `temperature: 0` and fixed seed (where provider supports). Acknowledged near-deterministic, not guaranteed reproducible.
- **Tests.** Request payload includes `temperature: 0`; seed included for providers that support it. Cross-linked from V18q — every binder-failure cause owned by this leaf emits exactly one runtime event at the originating site.
- **Deps.** V16e.
- **Ships when.** Determinism budget minimised.

## V16i — `bind_echo` formatter

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (echo policy).
- **Adds.** One-line system note: fields in declaration order, comma-separated; quote strings only with whitespace/special chars; arrays truncated `[a, b, c, …+N more]` past 3; objects shown as `{first-field-value, …}`; defaulted tagged `(default)`; 120-char cap with `…`.
- **Tests.** Each formatting rule against spec's exact examples. Cross-linked from V18q — every binder-failure cause owned by this leaf emits exactly one runtime event at the originating site.
- **Deps.** V3b.
- **Ships when.** Echoes match spec format.

## V16j — `bind_echo: false` suppression

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (echo policy).
- **Adds.** Frontmatter flag suppresses echo.
- **Tests.** Set false → no echo emitted; set true (default) → echo emitted. Cross-linked from V18q — every binder-failure cause owned by this leaf emits exactly one runtime event at the originating site.
- **Deps.** V16i.
- **Ships when.** Echo opt-out works.

## V16k — `bind_echo` auto-suppression on bypass

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (echo policy + bypass).
- **Adds.** Both bypass cases (no-params and single-string) auto-suppress echo regardless of `bind_echo:`. `bind_echo: true` on a single-string-bypass loom is `loom/parse/bind-echo-on-bypass` (parse warning); `bind_echo: true` on a no-params loom is `loom/load/bind-echo-without-params` (load warning). The two warnings are distinct because the underlying state differs (the parser sees a typed single-string `params:` field for one, the load pass sees no `params:` at all for the other) but the runtime behaviour is identical: no echo.
- **Tests.** Single-string bypass + `bind_echo: true` → `loom/parse/bind-echo-on-bypass` warning + no echo; no-params + `bind_echo: true` → `loom/load/bind-echo-without-params` warning + no echo; either bypass + `bind_echo: false` → no warning, no echo; either bypass + `bind_echo` absent → no warning, no echo. Cross-linked from V18q — every binder-failure cause owned by this leaf emits exactly one runtime event at the originating site.
- **Deps.** V16i, V3c.
- **Ships when.** Both bypass cases have no spurious echoes and emit the correct distinguishing diagnostic when authors set `bind_echo: true`.

## V16l — `needs_info` envelope handling

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (failure modes).
- **Adds.** `kind: "needs_info"` envelope produces system note `loom /<name>: <message>` and loom does not run.
- **Tests.** Message reaches user; loom never starts; runtime returns from invocation cleanly. Cross-linked from V18q — a `needs_info` envelope emits exactly one runtime event at the originating binder site.
- **Deps.** V16c.
- **Ships when.** Insufficient-info case handled.

## V16m — `ambiguous` envelope handling

- **Spec.** [Slash-Command Argument Binding — Failure modes](../spec_topics/binder.md).
- **Adds.** `kind: "ambiguous"` envelope produces system note matching the failure-modes table (`loom /<name>: ambiguous arguments — <model's message>`); loom does not run. The `candidates` field stays in the schema (binder may emit it; AJV accepts `null`), but the runtime does **not** surface it in V1 — the rendered note contains only the model's `<message>`.
- **Tests.** Message reaches user; rendered system-note text contains no candidate values even when the binder emits a non-null `candidates` array; loom never starts. Cross-linked from V18q — an `ambiguous` envelope emits exactly one runtime event at the originating binder site.
- **Deps.** V16c.
- **Ships when.** Ambiguity case handled per the failure-modes table (no candidates rendering).

## V16n — Binder transport failure single retry

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (failure modes).
- **Adds.** Transport failure on binder gets exactly one retry; second failure surfaces as system note.
- **Tests.** Retry happens; second failure `loom-system-note` `content` matches the [`binder.md` Failure-mode templates](../spec_topics/binder.md#failure-mode-templates-normative) row for *Binder model transport failure (after 1 retry)*. An abort observed during the retry is asserted by V18p; this leaf does not duplicate that assertion. Cross-linked from V18q — a binder transport failure (after the single retry) emits exactly one runtime event at the originating binder site.
- **Deps.** V16e.
- **Ships when.** Transient failures don't fail-closed unnecessarily.

## V16o — Binder malformed envelope handling

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (failure modes).
- **Adds.** Malformed-envelope returns (JSON-parse failure or envelope-`anyOf` discriminator failure) get exactly one retry against the same envelope schema; the second failure surfaces as system note `loom /<name>: argument binding failed — could not parse arguments`.
- **Tests.** Malformed envelope retried once on JSON-parse or envelope-`anyOf` failure; final failure `loom-system-note` `content` matches the [`binder.md` Failure-mode templates](../spec_topics/binder.md#failure-mode-templates-normative) row for *Binder returned malformed envelope (after 1 retry)*. Cross-linked from V18q — a malformed-envelope failure (after the single retry) emits exactly one runtime event at the originating binder site.
- **Deps.** V16c.
- **Ships when.** Malformed-envelope case handled.

## V16p — AJV validation of `args` post-default-merge

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (failure modes).
- **Adds.** AJV validates merged `args` (binder output + filled defaults) against full params schema; failure surfaces as system note `argument binding produced invalid args — <ajv-summary>`. No retry on AJV failure of merged `args`.
- **Tests.** Hallucinated field shape caught; AJV summary readable; no re-prompt issued on AJV failure. Cross-linked from V18q — an AJV-validation failure of merged `args` emits exactly one runtime event at the originating binder site.
- **Deps.** V16b.
- **Ships when.** Hallucinations caught at boundary.
