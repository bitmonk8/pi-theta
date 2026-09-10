---
id: PTQ-0185
title: renderScalarValue's two special-case arms (`typeof value === "string"` → value, `value === null` → "null") return exactly what its fall-through `String(value)` returns for the same inputs, so the function is `String(value)` written in three arms
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/frontmatter.ts:537-550
  - src/parser/frontmatter.ts:2091
  - src/parser/frontmatter.ts:2098-2100
sites: 1
fix_scope: localized
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# renderScalarValue's two special-case arms (`typeof value === "string"` → value, `value === null` → "null") return exactly what its fall-through `String(value)` returns for the same inputs, so the function is `String(value)` written in three arms

## Observation
`renderScalarValue(value: unknown): string` has three exits: a string is
returned as-is, `null` becomes the text `"null"`, and anything else goes
through `String(value)`. `String(s)` for a string primitive `s` returns `s`
itself, and `String(null)` returns `"null"`, so the first two arms produce the
same output as the third would for the same inputs. The function is called at
two sites, both rendering `modelRaw` for the `model:` field.

## Evidence
src/parser/frontmatter.ts:537-550 — the function and its doc:

```ts
/**
 * Render a YAML scalar as the unquoted source text the `<value>` placeholder
 * substitutes (`placeholder-rendering-b.md` category 5): a YAML scalar with no
 * enclosing source quoting renders unquoted regardless of identifier shape.
 */
function renderScalarValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null) {
    return "null";
  }
  return String(value);
}
```

src/parser/frontmatter.ts:2091 and :2098-2100 — the two callers:

```ts
      resolvedModel = renderScalarValue(modelRaw);
```
```ts
        message: `theta 'model:' value '${normaliseLiteralValueLineBreaks(
          renderScalarValue(modelRaw),
        )}' resolves to no available model, or is ambiguous across providers`,
```

Mechanical proof (ECMA-262 `String(value)` → `ToString`): for a string
primitive, `ToString` is the identity, so arm 1 and the fall-through agree;
`ToString(null)` is `"null"`, so arm 2 and the fall-through agree. For every
other input only the fall-through runs. There is no input on which removing
arms 1 and 2 changes the return value.

## Why this is a problem
Subsumed branches: two conditionals that select nothing, since each arm's
result equals the default arm's result on the arm's own domain. The function
reads as though strings and `null` need distinct handling from numbers and
booleans, when the whole body is one `String(value)` call; a reader tracing
the `model-unresolved` message rendering has to verify three cases to learn
there is one. Blame: all three arms were authored together in 4843d586 (V6a),
so this is not drift from a removed special case but a shape that was
equivalent to its fall-through from the start. The neighbouring
`renderObserved` (:676-684) is the contrasting case whose arms are not
subsumed (`value === undefined` → `"null"` differs from `String(undefined)`).

## Suggested direction (non-binding, optional)
Collapse the body to the fall-through (keeping the doc), or inline
`String(modelRaw)` at the two callers.

## False-positive check
- Semantics of `String()` on the two special-cased domains: `String("x") === "x"`
  and `String(null) === "null"` per ECMA-262 §7.1.17 (ToString); the arms add
  no coercion, quoting, or escaping.
- `undefined` input: neither version special-cases it (`String(undefined)` is
  `"undefined"` in both), so equivalence holds there too.
- Non-scalar input: `modelRaw` may be a YAML node object (`rawValue` is
  `item.value` when not a scalar, :1826); both versions route it to
  `String(value)` identically.
- Callers: `grep -n "renderScalarValue" src/parser/frontmatter.ts` → :542
  (declaration), :2091, :2099; not exported, so no external or test caller
  and no dynamic access.
- Not a duplicate: PTQ-0102 (jsontypeof-identity-ternary), PTQ-0131, PTQ-0152,
  PTQ-0158 are subsumed-branch findings on other files; PTQ-0149 concerns the
  `renderNonScalar*Kind` helpers in this file (:565-588), not
  `renderScalarValue`.

## Triage
verdict: confirmed — re-verified at 537-550/2091/2098-2100: excerpts byte-match, `renderScalarValue` is unexported with exactly two callers (both `modelRaw`; the two tests/ grep hits are a `//` comment and a string literal, not calls), blame shows all three arms born together in 4843d586 (V6a) and byte-identical since, spec placeholder-rendering-b.md:76 requires only "unquoted regardless of identifier shape" with no distinct null/string rule, and a 20-case node harness (strings incl. breaks, null, undefined, numbers, booleans, arrays, objects, symbol, bigint, boxed String, null-proto object) shows the three-arm body and bare `String(value)` never differ, so both guards provably select nothing — same class as confirmed PTQ-0102/PTQ-0149 but a different function, so not a duplicate (triage: claude-opus-5)
