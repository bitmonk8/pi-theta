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

## V16o — Binder malformed envelope handling

- **Spec.** [Slash-Command Argument Binding — Failure-class taxonomy, Failure modes](../spec_topics/binder.md#failure-class-taxonomy).
- **Adds.** Malformed-envelope returns get exactly one retry against the same envelope schema (per ceiling [HC3-b](../spec.md#hard-ceiling-3)); the second failure surfaces as system note `loom /<name>: argument binding failed — could not parse arguments`. The malformed-envelope class is exactly the set defined in [`binder.md` § Failure-class taxonomy](../spec_topics/binder.md#failure-class-taxonomy): JSON-parse failure, envelope-`anyOf` discriminator failure, `kind` outside `ok | needs_info | ambiguous`, envelope-schema violation (including the `maxLength: 500` cap), and the assistant turn returning plain text instead of calling the binder's structured-output tool. Provider classifier outputs of `TransportError` or `ContextOverflowError` route to V16n's transport-class budget, not here.
- **Tests.** Malformed envelope retried once on each of: JSON-parse failure, envelope-`anyOf` discriminator failure, `kind` outside the three-arm set, envelope-`maxLength` violation, and the plain-text-instead-of-tool-call case; final failure `loom-system-note` `content` matches the [`binder.md` Failure-mode templates](../spec_topics/binder.md#failure-mode-templates-normative) row for *Binder returned malformed envelope (after 1 retry)*. A transport failure observed on the malformed-envelope retry consumes the transport budget rather than a second malformed attempt (and vice versa) per the per-invocation budget paragraph. Cross-linked from V18q — a malformed-envelope failure (after the single retry) emits exactly one runtime event at the originating binder site.
- **Deps.** V16c.
- **Ships when.** Malformed-envelope case handled.

## V16e — `bind_model` resolution chain

- **Spec.** [Slash-Command Argument Binding — Binder model](../spec_topics/binder.md), [Diagnostics](../spec_topics/diagnostics.md).
- **Adds.** Two-step resolution: frontmatter `bind_model:` → `settings.json` `looms.binderModel` (read via the V14n mechanism). **No further fallback.** When neither resolves and the loom is not bypass-eligible (no-params or single-string bypass per V3c), load fails with `loom/load/binder-model-unresolved`; the loom is reported via the diagnostics channel and its slash command is not registered. The resolved model is checked at the same load-time pass against Pi's model registry by calling `ctx.modelRegistry.find(provider, modelId)` and probing the returned `Model<Api>` for the pinned `strictCapable` field via a duck-typed read `(model as { strictCapable?: boolean }).strictCapable`. Three outcomes: `true` admits the model with no diagnostic; `false` emits `loom/load/binder-model-not-strict-capable` (E) and refuses to register the loom; `undefined` (the field is absent) emits `loom/load/binder-model-strict-capability-unknown` (W) and registers the loom (runtime envelope-malformed failure surfaces via the failure-mode template; no diagnostic code). Bypass-eligible looms skip both checks. The probe MUST short-circuit when `ModelRegistry.find` returns `null` (governed by `loom/load/binder-model-unresolved` instead). Under `pi-coding-agent ~0.72.1`, `Model<Api>` exposes no `strictCapable` field, so production behaviour is the universal-W branch — but the E-level branch is reachable today against a synthetic `Model<Api>` whose `strictCapable: false` is set by the V16e fake `ModelRegistry`. The pinned probe field name is `strictCapable`; a Pi minor bump that exposes the indicator under a different name renames the probe constant per step 7 of the [Pi version bump procedure](../spec_topics/pi-integration-contract.md#pi-version-bump-procedure). When the V18r settings watcher invalidates the V14n cache after a `looms.binderModel` edit, the new value is picked up on the next loom load only — already-loaded looms keep their resolved model, and already-failed loads are not retroactively re-attempted (a structural reload via `/reload` is required for either). When the resolved value of `looms.binderModel` changes (compared to the prior merged value, post project-over-global merge — not the raw file contents) and at least one loom previously failed to load with `loom/load/binder-model-unresolved` or `loom/load/binder-model-not-strict-capable`, the runtime emits exactly one `loom-system-note` (via the H4 `sendSystemNote` helper) listing those looms' slash names and prompting `/reload`. No note fires if no looms previously failed, or if the resolved value is unchanged after merge. The note carries no `Diagnostic` payload — it is informational. The prior-failure list is V16e-owned state, retained for the lifetime of the extension instance; the failure list is computed from the previous load pass's failure set, not from a re-attempted resolution against the new value (re-resolution only happens on `/reload`); a settings change that toggles the value back-and-forth within the V18r debounce window collapses to one note carrying the latest list.
- **Tests.** Frontmatter-only resolution succeeds; settings-only resolution succeeds; both absent on a non-bypass loom → `loom/load/binder-model-unresolved` and the slash command is not registered (Pi's registered-command list does not contain it); both absent on a bypass-eligible loom (no-params; single-string) → no error and the loom registers; the V16e fake `ModelRegistry.find(...)` returns synthetic `Model<Api>` instances exercising all three outcomes — `strictCapable: true` admits the model with no diagnostic, `strictCapable: false` emits `loom/load/binder-model-not-strict-capable` (E) and the slash command is not registered, `strictCapable: undefined` emits exactly one `loom/load/binder-model-strict-capability-unknown` (W) per loom and the loom registers (Pi's registered-command list contains it), runtime envelope-malformed failure surfaces via the failure-mode template (no diagnostic code; the user-facing system note is asserted by a separate test rather than a registry-code emission); the strict-capability query goes through `ctx.modelRegistry.find(provider, modelId)` (asserted against the fake `ModelRegistry` that records the call); the probe short-circuits on `ModelRegistry.find` returning `null` (no `strictCapable` read attempted; `loom/load/binder-model-unresolved` fires instead); settings change after a failed load → only the next load picks up the new value (already-failed loom stays unregistered until reload). After a load pass produces ≥2 binder-model-related load failures (`loom/load/binder-model-unresolved` and/or `loom/load/binder-model-not-strict-capable`), changing `looms.binderModel` in `.pi/settings.json` emits exactly one `loom-system-note` whose content lists every previously-failed loom's slash name; `/reload` then registers all of them. Settings change that does not alter the resolved binder-model value (e.g. a global-file edit shadowed by an unchanged project file) emits no note; settings change with zero prior binder-model failures emits no note; two settings edits inside a single V18r debounce window collapse to exactly one note carrying the latest failure list. Cross-linked from V18q — every binder-failure cause owned by this leaf emits exactly one runtime event at the originating site.
- **Deps.** V3a, V3c, V14n, V16o, H4, V18r.
- **Ships when.** Both load-time errors fire correctly and bypass looms skip both checks.

## V16f — `bind_context: none`

- **Spec.** [Slash-Command Argument Binding — Binder context, Binder system prompt](../spec_topics/binder.md).
- **Adds.** Default mode; binder sees only slash text + frontmatter. The frontmatter `argument-hint:` value (when present) flows into the binder's system prompt under `Argument hint:` as the binder-grounding payload (no other surface consumes it in loom 1.0; the autocomplete dropdown does not show it — see V3a).
- **Tests.** No session context attached; deterministic output for identical inputs (modulo provider non-determinism); when `argument-hint:` is set, the binder's system prompt contains `Argument hint: <value>` exactly once; when absent, the line is omitted. No-invent-defaults predicate (item 8 of *System-prompt structure (normative)* in [binder.md](../spec_topics/binder.md)): for a loom whose `params:` declares ≥1 defaulted field, the rendered system prompt contains exactly one line that includes both the substring `defaulted` and at least one of `Do not`, `omit`, or `skip` (all case-sensitive); a renderer that emits no such line fails. Cross-linked from V18q — every binder-failure cause owned by this leaf emits exactly one runtime event at the originating site.
- **Deps.** V16c, V16e.
- **Ships when.** Default binder path works end-to-end and `argument-hint` reaches the binder grounding payload.

## V16g — `bind_context: session` truncation

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (session-context truncation); [Pi Integration Contract](../spec_topics/pi-integration-contract.md) (`estimateTokens` / `buildSessionContext` SDK contracts).
- **Adds.** Walk caller-session turns newest-to-oldest, summing per-turn token counts via `estimateTokens` from `@mariozechner/pi-coding-agent`. Include a candidate turn only if doing so keeps both the running turn count ≤ 20 and the running token total ≤ 8000; the first turn that would exceed either cap is excluded entirely and the walk stops there. Whole-turn boundary (no message-level splitting). Algorithm and worked examples per [Session-context truncation](../spec_topics/binder.md#session-context-truncation-bind_context-session).
- **Tests.** 20-turn cap: 20-turn session fully included; 21-turn session includes the 20 newest turns and excludes the 21st even if the running token total stays under 8000. 8000-token cap: a turn whose inclusion would push the running sum over 8000 is excluded entirely, the walk stops at that turn, and any older turns that would individually fit are not reconsidered (matches the spec's worked example with newest-first per-turn counts `[1200, 900, 1500, 2000, 2800, …]` → 4 turns / 5600 tokens included). Token-cap equality: with newest-first per-turn counts `[3000, 2500, 2500, 100, …]` the walk includes the first three turns (running total exactly 8000) and excludes the fourth (8100 > 8000), confirming the ≤ 8000 boundary is inclusive (matches the spec's *Token-cap equality* worked example → 3 turns / 8000 tokens included). Turn-cap equality: with 21 turns whose running token total never reaches 8000 the walk includes the 20 newest turns (count exactly 20) and excludes the 21st on the count cap regardless of its token weight, confirming the ≤ 20 boundary is inclusive (matches the spec's *Turn-cap equality* worked example → 20 turns included). Single oversized newest turn: when the newest turn alone exceeds 8000 tokens the walk includes nothing and the binder runs with no session-context block (no special diagnostic). Whole-turn boundary: messages within a turn are never split. Cross-linked from V18q — every binder-failure cause owned by this leaf emits exactly one runtime event at the originating site.
- **Deps.** V16f.
- **Ships when.** Session-context binder path works.

## V16h — Binder determinism settings

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (determinism); [Pi Integration Contract — Provider seed-field mapping](../spec_topics/pi-integration-contract.md#provider-seed-field-mapping).
- **Adds.** `temperature: 0` and a fixed seed (for providers in the seed-supporting set per [Pi Integration Contract — Provider seed-field mapping](../spec_topics/pi-integration-contract.md#provider-seed-field-mapping); see Tests) equal to the 32-bit FNV-1a hash of the loom's qualified name per [`binder.md` Determinism](../spec_topics/binder.md), masked to 32-bit unsigned; identical for every invocation of the same loom across processes and runs. Acknowledged near-deterministic, not guaranteed reproducible (the provider may still vary outputs given a fixed seed).
- **Tests.** Request payload includes `temperature: 0` for every provider. Per-provider seed presence: with binder model resolved to a `openai-completions` provider, request payload includes a `seed` field; with `mistral`, includes `random_seed`; with `anthropic-messages`, neither `seed` nor `random_seed` appears anywhere in the request payload; with `amazon-bedrock`, likewise absent. The provider-to-field mapping matches the table in [Pi Integration Contract — Provider seed-field mapping](../spec_topics/pi-integration-contract.md#provider-seed-field-mapping). Per-loom seed value: the request payload's `seed` (resp. `random_seed`) field equals the spec-defined 32-bit FNV-1a hash of the loom's qualified name; two binder calls for the same loom in the same process produce identical seed values; two binder calls for *different* looms produce different seed values (verified against a small fixed pair of loom names). Cross-linked from V18q — every binder-failure cause owned by this leaf emits exactly one runtime event at the originating site.
- **Deps.** V16e.
- **Ships when.** Determinism budget minimised.

## V16i — `bind_echo` formatter

- **Spec.** [Slash-Command Argument Binding](../spec_topics/binder.md) (echo policy).
- **Adds.** One-line system note: fields in declaration order, comma-separated; quote strings only with whitespace/special chars; arrays truncated `[a, b, c, …+N more]` past 3; objects shown as `{first-field-value, …}`; defaulted tagged `(default)`; 120-char cap with `…`.
- **Tests.** One property assertion per format rule from `binder.md` "Echo policy → Format rules": (1) top-level fields rendered in declaration order, comma-separated; (2) string values unquoted when they match `/^[A-Za-z0-9_.-]+$/`, quoted otherwise (whitespace, punctuation, or non-ASCII triggers quoting); (3) arrays of ≤3 elements rendered as `[a, b, c]` in element order, arrays of >3 elements rendered as `[a, b, c, …+N more]` where `N` is the count of dropped elements; (4) object values rendered as `{<first-field-value>, …}` using the schema's first declared field; (5) defaulted fields tagged ` (default)` (single leading space, parenthesised, no comma before the tag); (6) the whole rendered line — including the `Running /<name>: ` prefix — capped at 120 Unicode code points with overflow replaced by a trailing `…` (U+2026), counted in code points not UTF-16 units; (7) when truncation falls inside an array's `…+N more` marker, the inner marker is cut and only the line-level `…` survives. Each assertion is written against a synthetic params/args pair constructed in the test, not against a fixture string lifted from the spec. Edge cases: rule 2's quote predicate is not stated as a regex in the spec ("whitespace or special characters") — pin the predicate definitively in the test (the regex above is one defensible reading; the implementer may pick another but must commit to one and document it in the test file); rule 6's cap is measured post-interpolation, so the test for the cap must vary the loom-name length to confirm the suffix budget shrinks accordingly (see `binder.md` rule 2 under "System-note rendering"); rule 7 is the only rule with an inter-rule interaction (line cap vs array `…+N more`) and gets its own test, not a sub-assertion of rule 3 or 6. Cross-linked from V18q — every binder-failure cause owned by this leaf emits exactly one runtime event at the originating site.
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
- **Adds.** `kind: "ambiguous"` envelope produces system note matching the failure-modes table (`loom /<name>: ambiguous arguments — <model's message>`); loom does not run. The `candidates` field stays in the schema (binder may emit it; AJV accepts `null`), but the runtime does **not** surface it in loom 1.0 — the rendered note contains only the model's `<message>`.
- **Tests.** Message reaches user; rendered system-note text contains no candidate values even when the binder emits a non-null `candidates` array; loom never starts. Cross-linked from V18q — an `ambiguous` envelope emits exactly one runtime event at the originating binder site.
- **Deps.** V16c.
- **Ships when.** Ambiguity case handled per the failure-modes table (no candidates rendering).

## V16n — Binder transport failure single retry

- **Spec.** [Slash-Command Argument Binding — Failure-class taxonomy, Failure modes](../spec_topics/binder.md#failure-class-taxonomy), [Pi Integration Contract — Provider error mapping](../spec_topics/pi-integration-contract.md#provider-error-mapping).
- **Adds.** Transport-class failure on the binder gets exactly one retry per ceiling [HC3-a](../spec.md#hard-ceiling-3); second failure surfaces as system note. The transport class is exactly the V5g classifier's `TransportError` output (every 4xx-not-overflow including HTTP 429, every 5xx, network/TCP/TLS failures, provider-SDK timeouts, and end-of-stream-classified mid-stream truncation), plus `ContextOverflowError` which is treated as transport-class for retry purposes per [`binder.md` § Failure-class taxonomy](../spec_topics/binder.md#failure-class-taxonomy).
- **Tests.** Retry happens for each of: HTTP 429, generic 5xx, network-level failure, provider-SDK timeout, mid-stream truncation, and a recognised `ContextOverflowError`-shaped envelope; second failure `loom-system-note` `content` matches the [`binder.md` Failure-mode templates](../spec_topics/binder.md#failure-mode-templates-normative) row for *Binder model transport failure (after 1 retry)* (no `ContextOverflowError`-specific row exists; that absence is intentional). A malformed envelope observed on the transport-class retry consumes the malformed-envelope budget per V16o, not a second transport attempt. An abort observed during the retry is asserted by V18p; this leaf does not duplicate that assertion. Cross-linked from V18q — a binder transport failure (after the single retry) emits exactly one runtime event at the originating binder site.
- **Deps.** V16e.
- **Ships when.** Transient failures don't fail-closed unnecessarily.

## V16p — AJV validation of `args` post-default-merge

- **Spec.** [Slash-Command Argument Binding — Failure-class taxonomy, Failure modes](../spec_topics/binder.md#failure-class-taxonomy), [Schema Subset — Depth Enforcement](../spec_topics/schema-subset.md#depth-enforcement).
- **Adds.** AJV validates merged `args` (binder output + filled defaults) against full params schema; failure surfaces as system note `argument binding produced invalid args — <ajv-summary>`. No retry on AJV failure of merged `args` per ceiling [HC3-c](../spec.md#hard-ceiling-3). The AJV-on-`args` class is reached only when the envelope is `kind: "ok"`; envelopes with `kind` outside `ok | needs_info | ambiguous` route to V16o's malformed-envelope class instead, never to AJV-on-`args`.
- **Tests.** Hallucinated field shape caught; AJV summary readable; no re-prompt issued on AJV failure; merged `args` containing a depth-6 nested value surfaces as the spec's `argument binding produced invalid args — <ajv-summary>` system note where the summary names `maxDepth` (depth walk fires before AJV at the `params` boundary; see V11i). Per spec edge case, the walk is installed even when the params schema only declares primitives or `array<T>` over primitives — the test constructs an artificially deep merged value against a primitive-typed param schema and asserts the walk still fires (so future widening of `params` types inherits the cap automatically). Cross-linked from V18q — an AJV-validation failure of merged `args` emits exactly one runtime event at the originating binder site.
- **Deps.** V16b, V11i.
- **Ships when.** Hallucinations caught at boundary.
