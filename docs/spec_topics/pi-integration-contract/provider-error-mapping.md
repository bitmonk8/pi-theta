# Provider error mapping

<a id="provider-error-mapping"></a>

**Provider error mapping.** The runtime maps recognised provider error responses to `QueryError` variants per the table below. Every other 4xx/5xx response and every network-level failure maps to `TransportError`. The matching rules are version-coupled to `@earendil-works/pi-ai` and MUST be re-validated on each upgrade. *Re-validation gate (loom 1.0.0).* loom 1.0.0 ships without a CI-wired bump-procedure step that re-runs the provider-error fixtures against a candidate `@earendil-works/pi-ai` minor; the fixtures exist in `npm test` and a contributor performing the bump is expected to run them, but [Pi version bump procedure](./version-bump-intro.md#pi-version-bump-procedure) below does not yet enumerate the step. Wiring this re-validation into the bump procedure as a mechanical gate is a recognised post-loom 1.0.0 maintenance follow-up. Reviews SHOULD NOT re-raise the absence of this acceptance criterion as a loom 1.0.0 correctness finding.

<a id="transport-error-retryable"></a>

**`TransportError.retryable` population.** The runtime populates `TransportError.retryable` by transport-error class at the point it constructs the variant: `true` for network-level failures (no HTTP response — TCP/TLS errors, provider-SDK timeouts, end-of-stream truncation), HTTP 5xx, and HTTP 429; `false` for every other (non-429) 4xx. The unsupported-provider typed-query case described under **Provider compatibility for typed queries** above is the one path that pins `retryable: false` independent of HTTP class (the failure is a load-time capability gap, not a provider response); that pinned value is unchanged by this rule.

| Provider | Overflow signature → `ContextOverflowError` |
|---|---|
| `anthropic-messages` | HTTP 400 with `error.type: "invalid_request_error"` and `error.message` matching `/(prompt is too long\|exceeds .* context window\|maximum context length)/i`; `tokens_used` and `tokens_limit` populated from `error.message` digits when present. |
| `openai-completions` | HTTP 400 with `error.code: "context_length_exceeded"` (or HTTP 200 with the same code in the body envelope); `tokens_used` and `tokens_limit` populated from `error.message` digits when present. |
| `mistral` | HTTP 400 with body matching `/context.*length/i`; token counts not surfaced — both fields `null`. |
| `amazon-bedrock` | `ValidationException` with body matching `/(input is too long\|context window)/i`; token counts not surfaced — both fields `null`. |

<a id="provider-seed-field-mapping"></a>

**Provider seed-field mapping.** Whether a binder request payload carries a fixed seed, and under which JSON field name, is governed by the static table below. The mapping is keyed on the resolved binder model's `api` field as reported by `@earendil-works/pi-ai`'s model registry; it is not derived from any pi-ai capability flag. The seed *value* (its derivation from the loom's qualified name) is specified in [Slash-Command Argument Binding — Determinism](../binder/determinism-cancellation-failure.md#determinism). Widening the seed-supporting set is a spec-versioned change. The mapping is version-coupled to `@earendil-works/pi-ai` and MUST be re-validated on each upgrade; the mechanical gate is the build-time `Api`-coverage assertion which enumerates pi-ai's exposed `Api` literal-union values and asserts every value appears as a row key in the seed-field table constant, plus the provider seed-field fixtures rerun as step 6 of [Pi version bump procedure](./version-bump-intro.md#pi-version-bump-procedure) below. A new pi-ai `Api` value lights up the assertion red at the bump commit, exactly parallel to a new SDK capability.

| Provider | Seed field in request payload |
|---|---|
| `openai-completions` | `seed` |
| `mistral` | `random_seed` |
| `anthropic-messages` | omitted |
| `amazon-bedrock` | omitted |

**Conversation drive — subagent mode.** The loom interpreter spawns a fresh in-process `AgentSession` via `createAgentSession`. The `createAgentSession(options: CreateAgentSessionOptions)` function and the `CreateAgentSessionOptions` interface are declared at `dist/core/sdk.d.ts` in `@earendil-works/pi-coding-agent` (the [loom 1.0 Pi-SDK pin](./host-prerequisites.md#pi-sdk-pin) from **Host prerequisites** above); the inline call shape and the no-`signal`-field claim below are pinned to that file and MUST be re-validated against it on each Pi minor bump per [Pi version bump procedure](./version-bump-intro.md#pi-version-bump-procedure) below. The two tool-related fields on `CreateAgentSessionOptions` carry distinct payloads and must both be populated from the same lowered set:

```ts
const customTools: ToolDefinition[] = lowerLoomToolsToPi(loom.tools); // built-in Pi tools resolved by name → their ToolDefinition; loom callees wrapped via defineTool
const loomSystemPrompt: string = renderLoomSystemPrompt(loom.frontmatter.system, params); // resolved-and-interpolated `system:` per Parameters and Frontmatter
const resourceLoader: ResourceLoader = {
  // Loom-owned adapter: getSystemPrompt is the only loom-load-bearing member; the rest return empty/defaults.
  getSystemPrompt: () => loomSystemPrompt,
  getAppendSystemPrompt: () => [],
  getExtensions: () => ({ extensions: [], errors: [] }),
  getSkills: () => ({ skills: [], diagnostics: [] }),
  getPrompts: () => ({ prompts: [], diagnostics: [] }),
  getThemes: () => ({ themes: [], diagnostics: [] }),
  getAgentsFiles: () => ({ agentsFiles: [] }),
  extendResources: () => {},
  reload: async () => {},
};
const { session } = await createAgentSession({
  customTools,
  tools: customTools.map((t) => t.name), // explicit allowlist suppresses Pi's default built-ins
  model,
  sessionManager: SessionManager.inMemory(cwd),
  resourceLoader,
  // ...
});
```

Four rules govern the spawn call:

1. `customTools` carries every `ToolDefinition` the subagent may use — both Pi built-ins (resolved by name from the model registry / extension API to their `ToolDefinition`) and `defineTool`-wrapped `.loom` callables. Each entry uses the same `name` / `label` / `description` / `parameters` / `execute` shape and the same `Type.Unsafe<unknown>(loweredJsonSchema)` `parameters` wrap defined in the **Per-loom registration** section above. `ToolDefinition.label` is required; the lowering step must supply it (basename-derived per the **Per-loom registration** rule).
2. `tools` is **always** passed as an explicit allowlist of those same names, even when the loom's callable set is empty (in which case `tools: []` is passed, matching `tools: []` ≡ absent `tools:` from [Parameters and Frontmatter](../frontmatter.md)). The explicit allowlist is what enforces the "ambient Pi tools NOT inherited" invariant; omitting `tools` would re-enable Pi's default built-in `read` / `bash` / `edit` / `write` tools regardless of what the loom declared.
3. The `tools` allowlist and the `customTools` array are derived from the same lowered set in a single step; the runtime does not let them drift. A `.loom` callable wrapped via `defineTool` has a `name` chosen by the loom runtime (post-`as` rename per the basename rules in [Parameters and Frontmatter](../frontmatter.md)); that same name must appear in the `tools` allowlist.
4. The `resourceLoader` passed to `createAgentSession` is a loom-constructed `ResourceLoader` adapter whose `getSystemPrompt()` returns the resolved-and-interpolated frontmatter `system:` string verbatim and whose `getAppendSystemPrompt()` returns `[]` (the loom's `system:` is the *complete* system prompt, not an append on top of a host base). The remaining `ResourceLoader` members return empty values / defaults (`getExtensions`, `getSkills`, `getPrompts`, `getThemes`, `getAgentsFiles`) or are no-ops (`extendResources`, `reload`); the loom MUST NOT pass the parent session's `DefaultResourceLoader` through unchanged. `CreateAgentSessionOptions` exposes no `systemPrompt` / `system` field in the loom 1.0 Pi SDK pin, so the loader's `getSystemPrompt()` is the only available delivery channel for the loom's `system:` value into the spawned `AgentSession.systemPrompt`. The adapter MAY be expressed as the object literal above or as a `class implements ResourceLoader` declaration; both are conformant. `DefaultResourceLoader`'s `systemPromptOverride: (base) => string | undefined` constructor option is an alternative channel but is **not** the recommended construction: it still runs all of `DefaultResourceLoader`'s discovery side-effects against the parent `cwd` to compute `base`, only to ignore the result, so the custom-adapter form is preferred.
