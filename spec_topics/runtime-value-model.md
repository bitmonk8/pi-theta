# Runtime Value Model

Loom values are represented in the interpreter as native JavaScript values, tagged where needed for type recovery:

| Loom type | JS representation |
|---|---|
| `string` | JS `string` |
| `number`, `integer` | JS `number` (the static type system enforces the distinction; at runtime they are the same value). Division produces IEEE-754 `Infinity` / `NaN` per JS semantics |
| `boolean` | JS `boolean` |
| `null` | JS `null` |
| `array<T>` | JS `Array`, elements following these rules recursively |
| Object schema (named or anonymous) | JS plain object keyed by **loom-side identifiers**, regardless of any wire-name renames declared on the schema. Wire-name translation happens only at the validation boundary |
| Enum variant | JS `string` carrying the variant's wire value, with a non-enumerable brand property `__loomEnum: "<EnumName>"` for cross-enum equality correctness |
| `Result<T, E>` | A tagged JS object: `{ ok: true, value: T }` for `Ok(v)`, `{ ok: false, error: E }` for `Err(e)`. `ok` is the discriminator |

**Equality (`==`).** Structural deep equality:

- Primitives compare via `Object.is` semantics (so `NaN == NaN` is `true` and `+0 != -0` is `false`).
- Arrays compare element-wise at the same indices; same length required.
- Objects compare key set (loom-side identifiers) and per-key value equality; key declaration order is irrelevant.
- Enum variants compare brand and value: `Severity.High == OtherEnum.High` is `false` even when wire values match.
- `Result` compares the `ok` flag and recurses on the payload.

**Wire-name translation** happens in exactly two places:

- *Inbound* (model output → loom value): after AJV validation against the lowered schema, the runtime walks the validated JSON and rebuilds the value with loom-side identifiers using each schema's translation map.
- *Outbound* (loom value → JSON): when constructing tool input, query response payloads, or `invoke` arguments, the runtime walks the loom-side value and produces wire-named JSON before AJV validation.

Loom code never sees wire names; tools, the model, and external JSON Schema consumers never see loom-side names.
