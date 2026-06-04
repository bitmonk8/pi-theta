# Runtime Value Model

Loom values are represented in the interpreter as native JavaScript values, tagged where needed for type recovery:

| Loom type | JS representation |
|---|---|
| `string` | JS `string` |
| `number`, `integer` | JS `number` (the static type system enforces the distinction; at runtime they are the same value). Division produces IEEE-754 `Infinity` / `NaN` per JS semantics |
| `boolean` | JS `boolean` |
| `null` | JS `null` |
| `array<T>` | JS `Array`, elements following these rules recursively |
| Object schema (named or anonymous) | JS plain object keyed by **loom-side names**, regardless of any wire-name renames declared on the schema. Wire-name translation happens only at the validation boundary |
| Enum variant | An enum value carries the variant's wire string plus an interpreter-private tag identifying the declaring enum. Cross-enum equality compares both: `Severity.High == OtherEnum.High` is `false` even when wire values match. The tag MUST NOT appear in JSON output (`JSON.stringify` of an enum value yields the bare wire string) |
| `Result<T, E>` | Internally tagged with a discriminator distinguishing `Ok` from `Err` and carrying the payload. Loom code observes `Result` only through `Ok` / `Err` constructors, `match` patterns, and `?`; the in-memory shape is not part of the language surface. `Result` values are not directly serialised to provider JSON — they cross the wire only via schema-driven encodings defined by the relevant call site |

**Reference encoding (non-normative).** The reference interpreter implements the enum tag as a non-enumerable `__loomEnum` string property on the JS string wrapper, and represents `Result<T, E>` as `{ ok: true, value: T }` for `Ok(v)` and `{ ok: false, error: E }` for `Err(e)`. These shapes are implementation details — neither is reachable from loom code, neither appears in any wire schema, and either may change without a spec revision. If a future host-interop surface ever exposes a live `Result` or enum value to JS (rather than a JSON-serialised projection), this section MUST be revisited before that surface ships.

**Equality (`==`).** Structural deep equality:

- Primitives compare via `Object.is` semantics (so `NaN == NaN` is `true` and `+0 != -0` is `false`).
- Arrays compare element-wise at the same indices; same length required.
- Objects compare key set (loom-side names) and per-key value equality; key declaration order is irrelevant.
- Enum variants compare the declaring-enum tag and the wire value: `Severity.High == OtherEnum.High` is `false` even when wire values match.
- `Result` compares the `Ok`/`Err` discriminator and recurses on the payload.

**Wire-name translation** happens in exactly two places:

- *Inbound* (model output → loom value): after AJV validation against the lowered schema, the runtime walks the validated JSON and (a) rebuilds the value with loom-side names using each schema's translation map, and (b) at every position the schema annotates as a named enum, reattaches the declaring-enum tag for that position so the resulting value compares equal to a locally constructed variant of the same enum. Anonymous string-literal-union positions (no named enum) receive no tag — equality on those falls back to plain string equality, so cross-form comparisons such as `Severity.Low == "low"` remain `false` per the equality rule above. The walk recurses through arrays, nested object fields, and `Result.Ok` / `Result.Err` payloads; tags are attached at the same depth as the value the schema annotates and are never propagated to enclosing arrays, objects, or `Result` wrappers. Tag attachment happens during this same inbound pass, not lazily on first comparison, so any subsequent `JSON.stringify` of the rebuilt value still yields the bare wire string per the enum row of the representation table. The rule applies uniformly to every inbound boundary — typed query results, tool-call return decoding where typed, `invoke` returns, and binder `args` — and is not restated per call site.
- *Outbound* (loom value → JSON): when constructing tool input, query response payloads, or `invoke` arguments, the runtime walks the loom-side value and produces wire-named JSON before AJV validation.

Frontmatter `params:` defaults bypass the inbound translation pass: defaults are written in the [Loom literal sublanguage](./grammar.md#loom-literal-sublanguage), parsed as ordinary Loom values at frontmatter-parse time, and therefore arrive at the loom body already branded and loom-side-named. `Severity.High` written as a default produces a value indistinguishable from `Severity.High` written in body code; cross-enum equality and `JSON.stringify` behave identically for the two paths.

Loom code never sees wire names; tools, the model, and external JSON Schema consumers never see loom-side names.

<a id="javascript-engine-assumptions"></a>

## JavaScript engine assumptions

**Engine value model (non-checked invariant).** The runtime targets the Node JavaScript engine (per the loom 1.0 host floor in [Pi Integration Contract — Step 0 (a)](./pi-integration-contract/capability-probe.md#entry-capability-probe), which pins `process.versions.node >= 22.19.0`). Every rule on this page is contingent on the engine providing: IEEE-754 `number`s; native `Map` / `Set`; native `JSON.stringify`; and `Object.is` semantics for primitive equality. These assumptions are a **non-checked invariant** — the runtime does not feature-detect, does not polyfill, and emits no diagnostic on violation. Behaviour is undefined if the host violates any of them; violations may manifest as silent value corruption, runtime panics with arbitrary messages, or unhandled host-process exceptions, and no entry of the always-log set is guaranteed to fire on a violation (see [Pi Integration Contract — Runtime event channel](./pi-integration-contract.md) for the always-log carve-out clause).

loom 1.0 targets Node exclusively. Bun, Deno, browser embeds, and other JavaScript hosts are out of loom 1.0 scope; the Step 0 (a) probe is Node-specific (`process.versions.node`) and refuses to load on any host where that property is absent or unparseable as a `semver` version. Adding a non-Node host is a probe re-design and is out of loom 1.0 scope (see [Future Considerations](./future-considerations.md)).

<a id="effects"></a>

## Effects

**No file-writing primitive.** The Loom language itself has no file-writing, network, or process-spawning primitive. Every external effect a loom produces flows through one of three named surfaces, each with its own normative owner: a query against the model ([Query](./query.md)); a tool call ([Tool Calls](./tool-calls.md)); or a child loom invocation ([Invocation](./invocation.md)). The set of tools the model and loom code can reach is bounded by the loom's `tools:` allowlist (the *callable set*; see [Glossary — `callable set`](./glossary.md)), whose lifetime and visibility are pinned in [Pi Integration Contract — Tool-registration lifetime and visibility](./pi-integration-contract.md). Beyond that allowlist, the runtime imposes no additional access channels (sandbox, capability filter, mediated proxy); the trust-boundary contract that owns this disposition lives in PIC. Filesystem reads performed by the runtime itself — discovery walks, `import` resolution, settings-file reads — are not loom-language effects and are unaffected by this rule; they are governed by [Discovery](./discovery.md) and [Imports](./imports.md).
