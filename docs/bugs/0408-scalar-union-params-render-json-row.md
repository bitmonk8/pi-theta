# Bug 0408 — A scalar-union `params:` type (`string | null`, `number | null`) routes a `system:` `${param}` through the JSON-object row: a string value renders JSON-quoted, `NaN` renders as the four bytes `null`, and `1e21` renders in the scientific notation the canonical table forbids — three renderings the query surface and the canonical table both contradict

- **Status:** open.
- **Sev/Diff estimate:** S2/D2 — the mainstream `T | null` optional-param idiom silently ships JSON-quoted strings (and `null` for `NaN`, scientific notation past 1e21) into the child's system prompt, diverging from the query surface with zero diagnostics; fix is the recommended (a)+(c) pair — render-time value routing plus a same-commit QRY-18 table row — within one subsystem.
- **Kind:** defect against
  `docs/spec_topics/frontmatter/frontmatter-fields-b-and-templates.md:46`'s
  same-rendering-regardless-of-surface rule, with a spec-gap component: the
  QRY-18 table (`docs/spec_topics/query/query-escapes-stringification.md:18–28`)
  has no row for a scalar-union static type, and the implementation's chosen
  disposition (treat every top-level union as a discriminated union → compact
  JSON) produces values three of the table's own rows forbid.
- **Related:**
  - [bug 0406](./0406-object-typed-params-misclassified-string.md) and [bug 0407](./0407-system-interp-object-render-skips-wire-translation.md) —
    sibling misclassifications at the same
    construction site; distinct input class (unions of scalars) and distinct
    wrong output (JSON re-encoding of scalar values, not `[object Object]`
    or missing renames).
  - 0299 (fixed 0.331.0) — prior "fabricated `null` text" on this field;
    different mechanism (null-scalar stringification), cited because the
    `NaN → null` face reproduces the same wrong bytes from a new direction.
- **Affected** (verified at c2c25d81, v0.398.0):
  - `src/parser/frontmatter.ts:835–837` — `toSystemParamType`: any
    `typeSource` whose top-level `|` split yields >1 arm returns
    `{ kind: "discriminated-union" }`, scalar arms included.
  - `src/parser/system-interpolation.ts:417–419` — `toInterpolationType` maps
    `discriminated-union` to `{ kind: "object" }` ("it is an object value at
    runtime" — false for scalar unions).
  - `src/render/query-render.ts:415–430` — the object row `JSON.stringify`s
    the scalar: `"hello"` (quoted), `NaN → null`, `1e21 → 1e+21`.
  - Contrast: `src/extension/production-theta-producer.ts:7578–7607`
    (`interpolationTypeOf`) — the query surface derives the row from the
    runtime value, so the same values render `hello`, `NaN`,
    `1000000000000000000000`.
- **Observed at:** v0.398.0 (c2c25d81). Offline, deterministic: `parseDoc` +
  `renderSystemPrompt` (the spawn-site call pair).

## Summary

Nullable params are the ordinary way to make a `system:` slot optional
(`focus: string | null`). `toSystemParamType` classifies every top-level
union as a discriminated union and the renderer serialises the resolved value
as compact JSON. For union-of-scalar params that re-encodes the scalar: the
model sees `Focus: "hello"` where the author's value is `hello`
(quotation marks the string row forbids), sees `null` where a
`number | null` param carries `NaN` (a value the spec explicitly declares
reachable and renderable as `NaN` from this slot), and sees `1e+21` where the
number row pins never-scientific decimal. The identical values interpolated
in a query template render per the scalar rows. The system prompt is fixed at
spawn, so every query in the child runs under the wrong bytes.

## Reproduction

At c2c25d81, offline, one file each through `parseDoc` →
`renderSystemPrompt`:

| params | `system:` | render input | observed | query-surface / table |
|---|---|---|---|---|
| `p: 'string \| null'` | `'Focus: ${p}'` | `{p: "hello"}` | `Focus: "hello"` | `hello` (string row: "no quoting") |
| `p: 'number \| null'` | `'N: ${p}'` | `{p: NaN}` | `N: null` | `NaN` (number row: "`NaN` → `NaN`") |
| `q: 'number \| null'` | `'M: ${q}'` | `{q: 1e21}` | `M: 1e+21` | `1000000000000000000000` (BNDR-5: "never scientific notation") |
| control `p: number` | `'N: ${p}'` | `{p: NaN}` | `N: NaN` | matches |

Template part in each union row: `{"kind":"path","segments":["p"],
"type":{"kind":"object"}}`. All rows load with zero diagnostics.

Reachability of `NaN`: `frontmatter-fields-b-and-templates.md:46`
(*Stringification*): "The `number` row's `NaN` / `±Infinity` cases *are*
reachable from this slot: a `number`-typed param supplied through the
`invoke(...)` or `.theta`-callable argument path can carry a non-finite
IEEE-754 double … and such a value renders per the `number` row of the
canonical table (e.g. `NaN` renders as the literal text `NaN`)."

Caveat: that clause is worded for a `number`-typed param. For `number | null`
no table row or spec sentence names the static type, so the `NaN` face rests
on the spec gap plus the same-table sentence (the control row shows a plain
`number` param already renders `NaN` correctly), not on a row that names
this type.

## Expected behaviour

- `frontmatter-fields-b-and-templates.md:46`: "render the resolved value by
  its static type. The rule is the canonical interpolation-stringification
  table … the same table so that the model sees the same rendering of a given
  value regardless of which surface introduced it." The query surface renders
  these values per the scalar rows (`interpolationTypeOf` is value-driven);
  `system:` renders different bytes for the same value — the sentence is
  violated whichever disposition is right.
- `query-escapes-stringification.md:20` (string row): "the value itself, no
  quoting, no escaping"; `:22` (number row → BNDR-5): shortest round-trip
  decimal, "never scientific notation", `NaN → NaN`.
- Spec-gap component: the table keys on static type and has no
  union-of-scalars row; nothing licenses the object row for them either (the
  `discriminated-union` doc-comment's justification — "it is an object value
  at runtime" — holds only for unions of schemas). The `NaN → null` face is
  additionally a silent wrong VALUE, not just wrong formatting: the author's
  sentinel is replaced by a different literal of a different arm of the
  union.

## Actual behaviour / root cause

`splitTopLevel(s, "|").length > 1 → { kind: "discriminated-union" }`
(`frontmatter.ts:835–837`) conflates "union" with "discriminated union of
object schemas". `toInterpolationType` then hardwires
`discriminated-union → { kind: "object" }`
(`system-interpolation.ts:417–419`), and the object row is native
`JSON.stringify` (`query-render.ts:428–429`): quotes for strings, `null` for
non-finite doubles, exponent form past 1e21.

## Why it matters

- `T | null` is the spec's own idiom for optional params
  (`typeSourceIsNullable`, binder relaxation) — this is a mainstream
  spelling, not a corner: every nullable string param interpolated into a
  system prompt ships stray quotation marks into the model's instructions.
- The `NaN → null` face swaps one author-distinguishable value for another
  with zero diagnostics on a surface with no runtime fallback (the render
  result is `ok: true`).
- Moving text between a query template and `system:` — the refactor the
  shared-table rule exists to make safe — silently changes the prompt.

## Non-goals

- Unions of object schemas (`Cat | Dog`) — the object row is arguably right
  for those; their missing wire-translation is candidate
  system-templates/02.
- `.Ident` descent into unions — correctly refused (un-narrowed union,
  `system-interpolation.test.ts:138`).
- The query surface — conforms (value-driven rows).

## Fix

Options: (a) resolve scalar unions at render time by the runtime value —
route a `discriminated-union`-typed part whose resolved value is a
primitive/`null` through the matching scalar row (mirrors the query
surface's `interpolationTypeOf`; smallest diff, value-faithful); (b) model
union arms in `SystemParamType` (`{ kind: "union", arms: [...] }`) and pick
the arm row at render; (c) spec-side: add a union row to the QRY-18 table
pinning (a)'s behaviour, since the table currently has no row at all. Any
fix must keep `null` rendering as `null`, keep object-schema unions on the
JSON row, and keep the parse-time refusal of `.Ident` into unions. (a)+(c)
recommended together — the table edit is needed for whichever behaviour
wins, and (a) is the only option that also fixes `NaN`. The spec-gap
component is load-bearing for the `NaN` face: the `:46` NaN clause names a
`number`-typed param, not `number | null`, so (c)'s table edit is what turns
that face's expected bytes from an inference (same-table sentence + gap)
into a stated rule.

## Provenance

Fresh find. Probed at c2c25d81 with scratch vitest
`tests/scratch-system-templates.test.ts` (E rows + control; deleted).
Query-surface contrast from code read of `interpolationTypeOf`
(`production-theta-producer.ts:7578–7607`).
