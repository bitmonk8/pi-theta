<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Messages API and Completions API allow you to describe tools and structured output with JSON Schemas.

Can I use the entire JSON Schema standard for this or a limited subset?

Both the **OpenAI Completions API** and the **Anthropic Messages API** support only a **subset of JSON Schema**, not the full standard. The exact limitations differ between providers and whether you're in "strict" mode.

***

## OpenAI (Completions / Responses API)

OpenAI's Structured Outputs use a constrained subset of JSON Schema. Key **rules that always apply** in strict mode:[^1_1]

- All properties must be listed in `required`
- `additionalProperties` must be `false`
- Nesting is limited to 5 levels deep
- Supported types: `string`, `number`, `boolean`, `integer`, `object`, `array`, `enum`, `anyOf`[^1_2]

The following keywords are **not supported** in strict mode:[^1_3][^1_1]


| Category | Unsupported Keywords |
| :-- | :-- |
| Composition | `allOf`, `not`, `if`/`then`/`else`, `dependentRequired`, `dependentSchemas` |
| Strings | `minLength`, `maxLength`, `pattern`, `format` |
| Numbers | `minimum`, `maximum`, `multipleOf` |
| Objects | `patternProperties`, `unevaluatedProperties`, `propertyNames`, `minProperties`, `maxProperties` |
| Arrays | `unevaluatedItems`, `contains`, `minContains`, `maxContains`, `minItems`, `maxItems`, `uniqueItems` |

Passing an unsupported keyword with `strict: true` returns a validation error rather than silently ignoring it.[^1_1]

***

## Anthropic (Messages API)

Claude's tool `input_schema` must conform to **JSON Schema Draft 2020-12** — notably, older draft versions (like draft-07) are explicitly rejected. When using `strict: true` (grammar-constrained sampling), an additional subset applies, similar in spirit to OpenAI's restrictions.[^1_4][^1_5]

Without strict mode, Claude does its best to respect the schema but doesn't guarantee it — keywords like `minLength`, `minItems`, etc. are accepted but treated as **hints**, not hard constraints. With `strict: true`, conformance is guaranteed for the supported subset.[^1_6]

***

## Practical Takeaways

- **Use `$defs`/`definitions`** for reusable subschemas — both providers support this.
- **Avoid constraint keywords** (`min*`, `max*`, `pattern`, `format`) if you need strict enforcement; they're either ignored or cause errors.
- **Avoid composition keywords** like `allOf`, `not`, `if/then/else` — these are broadly unsupported in strict mode.
- For Anthropic specifically, make sure you're not declaring `"$schema": "http://json-schema.org/draft-07/schema#"` — it must be Draft 2020-12.[^1_5]
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_16][^1_17][^1_18][^1_19][^1_20][^1_21][^1_22][^1_23][^1_24][^1_25][^1_26][^1_27][^1_28][^1_29][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://developers.openai.com/api/docs/guides/structured-outputs?context=with_parse

[^1_2]: https://blog.dragansr.com/2024/09/openai-api-structured-outputs-json.html

[^1_3]: https://learn.microsoft.com/en-au/azure/ai-services/openai/how-to/structured-outputs

[^1_4]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use

[^1_5]: https://github.com/anthropics/claude-code/issues/586

[^1_6]: https://www.reddit.com/r/ClaudeAI/comments/1j4yr9h/why_anthropic_doesnt_respect_json_schema/

[^1_7]: https://json-schema.org/specification

[^1_8]: https://json-schema.org

[^1_9]: https://standardschema.dev/json-schema

[^1_10]: https://json-schema.org/blog/posts/advanced-json-schema-with-slashdb

[^1_11]: https://standards.apievangelist.com/store/json-schema/

[^1_12]: https://developer.mamezou-tech.com/en/blogs/2024/08/10/openai-structured-output-intro/

[^1_13]: https://docs.apidog.com/json-schema-645610m0

[^1_14]: https://community.openai.com/t/limiting-json-structured-output/1355852

[^1_15]: https://apisyouwonthate.com/newsletter/api-specs-schemas-and-standards/

[^1_16]: https://developers.openai.com/api/docs/guides/structured-outputs

[^1_17]: https://json-schema.org/understanding-json-schema/reference

[^1_18]: https://superjson.ai/blog/2025-08-17-json-schema-structured-output-apis-complete-guide/

[^1_19]: https://swagger.io/specification/

[^1_20]: https://ai.google.dev/gemini-api/docs/structured-output

[^1_21]: https://github.com/pollinations/pollinations/issues/5879

[^1_22]: https://www.digitalapplied.com/blog/openai-structured-outputs-complete-guide

[^1_23]: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs

[^1_24]: https://docs.rs/openai-openapi-types/latest/openai_openapi_types/struct.TextResponseFormatJsonSchema.html

[^1_25]: https://www.anthropic.com/engineering/advanced-tool-use

[^1_26]: https://gist.github.com/hamelsmu/07a719dff9a98aea045a9fee8db51bbe

[^1_27]: https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/openai/how-to/structured-outputs.md

[^1_28]: https://github.com/aws-samples/anthropic-on-aws/blob/main/complex-schema-tool-use/README.md

[^1_29]: https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-foundry/openai/how-to/structured-outputs.md


---

# Is strict mode a JSON Schema concept?

**No — "strict mode" is not part of the JSON Schema standard itself.** It is a proprietary concept introduced by individual LLM API providers (OpenAI, Anthropic) and also exists as an optional feature in some JSON Schema validator libraries like Ajv.

## In the JSON Schema Spec

The official JSON Schema specification is intentionally **permissive**: unknown keywords are silently ignored, and there is no concept of a "strict" validation mode baked in. The JSON Schema working group has explicitly rejected proposals to add a strict mode to the spec. This permissiveness is by design — it allows schema evolution without breakage.[^2_1][^2_2][^2_3]

## In Validator Libraries (e.g., Ajv)

Some validators like Ajv add an optional `strict` mode on top of the spec. This does **not** change validation results — it just throws errors for schemas that are likely mistakes (e.g., using `required` on a property not listed in `properties`, or unknown keywords). It's a developer ergonomics feature, not a spec feature.[^2_4][^2_1]

## In LLM APIs (OpenAI / Anthropic)

When OpenAI or Anthropic refer to `strict: true`, they mean something entirely different: **grammar-constrained decoding** — the model's token sampling is constrained at inference time to only produce output that structurally conforms to your schema. This is a **runtime enforcement mechanism**, not a JSON Schema concept at all. The tradeoff is that it only works with the supported subset of JSON Schema keywords, since the constrained grammar engine can't express arbitrary JSON Schema semantics.[^2_5][^2_6]

In short: "strict mode" in LLM APIs is an inference-time guarantee, borrowed neither from JSON Schema the spec nor from any shared ecosystem standard.
<span style="display:none">[^2_10][^2_11][^2_7][^2_8][^2_9]</span>

<div align="center">⁂</div>

[^2_1]: https://ajv.js.org/strict-mode.html

[^2_2]: https://www.oxygenxml.com/forum/feature-request/topic21428.html

[^2_3]: https://github.com/json-schema-org/json-schema-spec/issues/682

[^2_4]: https://ajv.js.org/strict-mode

[^2_5]: https://developers.openai.com/api/docs/guides/structured-outputs?context=with_parse

[^2_6]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use

[^2_7]: https://github.com/ruby-json-schema/json-schema/issues/103

[^2_8]: https://community.openai.com/t/strict-mode-does-not-enforce-the-json-schema/1104630

[^2_9]: https://hal.science/hal-04042629v1/file/mainICFPDeanonymized.pdf

[^2_10]: https://www.firecrawl.dev/blog/using-structured-output-and-json-strict-mode-openai

[^2_11]: https://www.kunalganglani.com/learning-paths/ai-software-developer/aidev-structured-output-json/


---

# Is oneOf not supported by OpenAI API’s?

**Correct — `oneOf` is not supported by the OpenAI API's structured outputs / strict mode.** The supported composition keyword is `anyOf` instead.

## Why `oneOf` Is Unsupported

`oneOf` implements **exclusive OR (XOR)** — a value must match *exactly one* of the subschemas and fail the rest. This is fundamentally difficult to enforce during grammar-constrained token generation, because you'd need to verify that *all other* branches fail, which requires evaluating the full schema intersection — not expressible as a simple context-free grammar.[^3_1][^3_2]

`anyOf`, by contrast, requires matching *at least one* branch, which can be converted into a union grammar and enforced token-by-token during sampling.[^3_3]

## What You Can Use Instead

OpenAI explicitly supports `anyOf` as the union mechanism in strict mode, where each nested schema must itself conform to the supported subset. In practice, `anyOf` is a fine substitute for `oneOf` in most real-world API tool schemas — the semantic difference (exclusive vs. inclusive OR) rarely matters when your branches are structurally disjoint object types with different required properties.[^3_4]

For example, if you want a field to be either a `User` object or an `Address` object, this works fine with `anyOf` since valid JSON can only structurally match one of them anyway.[^3_4]

## Broader Picture

| Keyword | OpenAI Strict | Anthropic Strict | JSON Schema Spec |
| :-- | :-- | :-- | :-- |
| `anyOf` | ✅ Supported | ✅ Supported | ✅ |
| `oneOf` | ❌ Not supported | ⚠️ Partial/hint only | ✅ |
| `allOf` | ❌ Not supported | ❌ Not supported | ✅ |
| `not` | ❌ Not supported | ❌ Not supported | ✅ |

The root cause is the same across providers: these keywords require set-theoretic operations (intersection, complement) on grammars that aren't practical to implement for real-time constrained decoding.[^3_1]
<span style="display:none">[^3_10][^3_5][^3_6][^3_7][^3_8][^3_9]</span>

<div align="center">⁂</div>

[^3_1]: https://github.com/guidance-ai/guidance/issues/888

[^3_2]: https://www.speakeasy.com/blog/openapi-tips-oneof-allof-anyof

[^3_3]: https://community.openai.com/t/oneof-allof-usage-has-problems-with-strict-mode/966047

[^3_4]: https://developers.openai.com/api/docs/guides/structured-outputs

[^3_5]: https://community.openai.com/t/official-documentation-for-supported-schemas-for-response-format-parameter-in-calls-to-client-beta-chats-completions-parse/932422

[^3_6]: https://redocly.com/learn/openapi/any-of-one-of

[^3_7]: https://community.openai.com/t/custom-gpts-action-openapi-3-0-specification-limited-support-oneof-anyof-allof/581015

[^3_8]: https://spec.openapis.org/oas/v3.1.1.html

[^3_9]: https://community.openai.com/t/invalid-schema-when-using-anyof-in-the-response-schema-need-help-with-discriminator-key/1195481

[^3_10]: https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs


---

# What do agents do when they want oneOf?

Do they just pick the first match and assume that is the right one?

No, they don't silently pick the first match. The approaches vary depending on the tool/framework — here's what actually happens:

## Fail at Schema Submission Time

The most common behavior is that the API **rejects the schema outright** with a validation error before any generation even starts. OpenAI's structured outputs endpoint will return a 400 error if you submit a schema containing `oneOf`. You fix it before runtime — it's not a silent failure.[^4_1]

## Framework-Level Fallback to `anyOf`

Constrained generation libraries like **Guidance** take a pragmatic approach: if you pass `oneOf` with multiple branches, they fall back to treating it as `anyOf` and emit a warning. This is explicit and documented — you know the exclusivity guarantee is lost, but generation proceeds.[^4_2]

## The Recommended Workaround: Discriminator Fields

The idiomatic solution for agent schemas is to use `anyOf` with a **`const` discriminator field** on each branch. For example:[^4_3]

```json
{
  "anyOf": [
    { "properties": { "kind": { "const": "tool_call" }, ... } },
    { "properties": { "kind": { "const": "final_answer" }, ... } }
  ]
}
```

The orchestration code reads `kind` first and dispatches to the right handler — no guessing needed. Since the branches are structurally disjoint (different `const` values on the discriminator), `anyOf` is semantically equivalent to `oneOf` in practice. The exclusivity you lose on paper is guaranteed by the schema structure itself.[^4_3]

## Pydantic / SDK Auto-generation

If you're using Pydantic `Union` types or Zod discriminated unions, these libraries often auto-generate `oneOf` internally — which then causes a 400 from the API. The fix is to use `Literal` type hints as discriminators so the library generates `anyOf` instead, or to manually flatten the schema.[^4_1]

The short answer: frameworks never silently pick the first match — that would be a correctness bug. The failure is always explicit, either at submission time or via a logged warning.
<span style="display:none">[^4_10][^4_11][^4_12][^4_13][^4_14][^4_15][^4_4][^4_5][^4_6][^4_7][^4_8][^4_9]</span>

<div align="center">⁂</div>

[^4_1]: https://github.com/openai/openai-agents-python/issues/474

[^4_2]: https://github.com/guidance-ai/guidance/pull/982/files/026a8857a0da14bc8e85af9160139129ea565c11

[^4_3]: https://docs.dottxt.ai/json-schema/agent-output

[^4_4]: https://github.com/guidance-ai/guidance/issues/888

[^4_5]: https://json-schema.org/understanding-json-schema/reference/combining

[^4_6]: https://redocly.com/learn/openapi/any-of-one-of

[^4_7]: https://learn.microsoft.com/en-au/azure/ai-services/openai/how-to/structured-outputs

[^4_8]: https://developers.openai.com/api/docs/guides/structured-outputs

[^4_9]: https://community.openai.com/t/official-documentation-for-supported-schemas-for-response-format-parameter-in-calls-to-client-beta-chats-completions-parse/932422

[^4_10]: https://discuss.ai.google.dev/t/oneof-in-response-schema/55926

[^4_11]: https://www.youtube.com/watch?v=xJEVn0Sdddc

[^4_12]: https://github.com/openai/openai-python/issues/2193

[^4_13]: https://agentic-design.ai/patterns/tool-use/json-schema

[^4_14]: https://community.openai.com/tag/structured-output/691

[^4_15]: https://www.linkedin.com/posts/jainam-parmar-7021162b8_if-your-ai-agents-are-still-hallucinating-activity-7378065272634626048-Gd2E


---

# I the structured output support identical to the tool call schema support, for both APIs?

**Not quite — the schema support is mostly the same, but there are meaningful differences between the two surfaces for both OpenAI and Anthropic.**

## OpenAI

For OpenAI, the same JSON Schema subset applies to both `tools` (function calling with `strict: true`) and `response_format` (structured outputs) — same supported keywords, same restrictions. However, there is one important operational difference: **you cannot combine strict `response_format` with tools in the same request** unless all tool definitions also comply with the strict schema subset. If any tool definition violates the rules, the entire call is rejected before the model runs.[^5_1][^5_2]

## Anthropic

Anthropic is architecturally more asymmetric between the two surfaces:

- **Tool use** (`input_schema`) is the *primary* and most battle-tested path for structured output. In fact, the recommended pattern for getting structured JSON out of Claude is to define a "fake" tool with your desired schema and force it to call it.[^5_3][^5_4]
- **Native structured output** (`output_config` with `json_schema`) is a newer, separate feature. However, it **cannot be combined with tool use or extended thinking** in the same API call  — you have to do them in separate turns.[^5_5][^5_6]

This architectural split means Anthropic's two surfaces are functionally **not interchangeable** depending on your use case.

## Key Differences at a Glance

|  | OpenAI | Anthropic |
| :-- | :-- | :-- |
| Schema subset identical? | ✅ Same rules for both | ⚠️ Mostly, but different maturity |
| Can mix tools + structured output? | ⚠️ Only if all schemas are strict-compliant | ❌ Not in same request |
| Structured output via tool hack? | Not needed (native) | Common pattern [^5_3] |
| Strict enforcement mechanism | Grammar-constrained decoding | Grammar-constrained decoding |

The bottom line: for OpenAI the two surfaces are unified under one schema ruleset, while for Anthropic they are separate features with important interaction constraints.
<span style="display:none">[^5_10][^5_11][^5_12][^5_13][^5_14][^5_15][^5_7][^5_8][^5_9]</span>

<div align="center">⁂</div>

[^5_1]: https://openai.com/index/introducing-structured-outputs-in-the-api/

[^5_2]: https://forum.langchain.com/t/is-there-a-way-to-enable-tool-calling-and-structured-output-in-the-same-agent/2716

[^5_3]: https://www.customclanker.com/structured-output-prompting/

[^5_4]: https://www.youtube.com/watch?v=cVEJaWgiudU

[^5_5]: https://claudecodeguides.com/anthropic-sdk-structured-output-thinking-tool-use-bug/

[^5_6]: https://github.com/vercel/ai/issues/7220

[^5_7]: https://developers.openai.com/api/docs/guides/structured-outputs

[^5_8]: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/structured-outputs?view=foundry-classic

[^5_9]: https://github.com/openai/openai-java/issues/139

[^5_10]: https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms

[^5_11]: https://learn.microsoft.com/en-au/azure/ai-services/openai/how-to/structured-outputs

[^5_12]: https://gist.github.com/hamelsmu/07a719dff9a98aea045a9fee8db51bbe

[^5_13]: https://coldfusion-example.blogspot.com/2026/02/openai-structured-outputs-vs-function.html

[^5_14]: https://docs.ag2.ai/latest/docs/use-cases/notebooks/notebooks/agentchat_anthropic_structured_outputs/

[^5_15]: https://simonwillison.net/2024/Aug/6/openai-structured-outputs/

